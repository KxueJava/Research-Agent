import { applyUiPatches } from "@/components/genui/applyUiPatch";
import { collectFromTaskMatrix, getGenUiPatchesFromTask, getGenUiTreeFromTask, getUiStreamFromTask, type FeaturedGenUi } from "./genuiState";
import { isUiStreamTree, reduceUiStream, restoreUiStream, type UiStreamState } from "./uiStreamReducer";

export type SessionSurface = FeaturedGenUi & {
  surfaceId: string;
  sessionId: string;
  originRequestId: string;
  surfaceRevision: number;
  requiredRevision?: number;
  needsResync: boolean;
  serverManaged: boolean;
  error?: string;
  stream?: UiStreamState;
  recoveryDocument?:unknown;
};
type EventTask = CHAT.Task | MESSAGE.Task;
function payload(task: EventTask): any {
  const rm: any=task.resultMap || {};
  return rm.resultMap && typeof rm.resultMap==="object" ? rm.resultMap : rm;
}
function events(matrix: EventTask[][] | null | undefined): EventTask[] {
  return collectFromTaskMatrix(matrix).filter(t=>["ui_tree","ui_patch","ui_stream"].includes(t.messageType));
}

/** Read-only projection across rounds. Protocol identity, never patch content, deduplicates events. */
export function projectSessionSurfaces(chats: CHAT.ChatItem[], restoredDocuments: unknown[] = []): Map<string,SessionSurface[]> {
  const surfaces=new Map<string,SessionSurface>();
  const seen=new Set<string>();
  for(const chat of chats) {
    const facts=events(chat.multiAgent?.tasks);
    const stream=facts.length?facts:events(chat.tasks);
    for(let index=0;index<stream.length;index++) {
      const task=stream[index],rm=payload(task);
      if (task.messageType === "ui_stream") {
        const raw: any = getUiStreamFromTask(task);
        if (!raw || raw.sessionId !== chat.sessionId || raw.messageId !== chat.requestId) continue;
        const key = JSON.stringify([chat.sessionId, raw.surfaceId]);
        const previous = surfaces.get(key);
        const accepted = reduceUiStream(previous?.stream, raw, chat.sessionId || "");
        if (!accepted || accepted === previous?.stream) {
          if (previous?.stream && raw.generationId === previous.stream.generationId && raw.sequence > previous.stream.sequence + 1) {
            previous.needsResync = true; previous.requiredRevision = Math.max(previous.requiredRevision || 0, Number(raw.revision) || 0);
          }
          continue;
        }
        surfaces.set(key, { task: previous?.task || task as CHAT.Task, tree: accepted.tree, patchCount: previous?.patchCount || 0,
          revision: String(accepted.revision), surfaceId: accepted.surfaceId, sessionId: accepted.sessionId, originRequestId: accepted.messageId,
          surfaceRevision: accepted.revision, needsResync: accepted.revision < (previous?.requiredRevision || 0), requiredRevision: previous?.requiredRevision,
          serverManaged: true, stream: accepted });
        continue;
      }
      const rawTree=rm.originalTree||getGenUiTreeFromTask(task);
      const meta=task.messageType==="ui_tree"
        ? rm.originalSurface||rawTree?._surface||rm.surface : rm.surface;
      if(meta?.sessionId && meta.sessionId!==chat.sessionId)continue;
      const explicit=meta?.surfaceId||rm.canvas_id||rm.canvasId;
      const id=String(explicit||`${chat.requestId}:${task.messageId||task.id||index}`);
      const surfaceKey=JSON.stringify([chat.sessionId||"",id]);
      const eventKey=meta?.eventId ? `${chat.sessionId}:${meta.eventId}`
        : `${chat.requestId}:${task.messageId||task.id||index}:${task.messageType}`;
      if(seen.has(eventKey))continue;
      seen.add(eventKey);
      if(task.messageType==="ui_tree" && rawTree) {
        const revision=Number(meta?.revision||1),previous=surfaces.get(surfaceKey);
        if(previous && revision<=previous.surfaceRevision)continue;
        surfaces.set(surfaceKey,{
          task: (previous?.task||task) as CHAT.Task,tree:rawTree,patchCount:previous?.patchCount||0,
          revision:String(revision),surfaceId:id,sessionId:chat.sessionId||"",
          originRequestId:previous?.originRequestId||chat.requestId,
          surfaceRevision:revision,needsResync:false,serverManaged:Boolean(meta),
          stream: meta?.stream ? restoreUiStream({ ...meta, tree: rawTree }, chat.sessionId || "") : undefined,
        });
        continue;
      }
      if(task.messageType!=="ui_patch")continue;
      // Untargeted legacy updates are safe only with one candidate; never guess among surfaces.
      const candidates=[...surfaces.values()].filter(s=>s.sessionId===(chat.sessionId||""));
      const target=explicit?surfaces.get(surfaceKey)
        : candidates.length===1?candidates[0]:undefined;
      if(!target)continue;
      const revision=meta?Number(meta.revision):target.surfaceRevision+1;
      if(meta && revision<=target.surfaceRevision)continue;
      const patches=getGenUiPatchesFromTask(task);
      if(meta && !rm.snapshot && Number(meta.baseRevision)!==target.surfaceRevision) {
        target.needsResync=true;target.requiredRevision=Math.max(target.requiredRevision||0,revision);
        target.error="界面版本不连续，请重新同步";continue;
      }
      // Every accepted server patch includes an authoritative snapshot: gaps can recover without guessing.
      target.tree=rm.snapshot||applyUiPatches(target.tree,patches);
      target.patchCount+=patches.length;
      target.surfaceRevision=revision;target.revision=String(revision);
      target.stream=undefined;
      target.needsResync=revision<(target.requiredRevision||0);
      if(!target.needsResync){target.error=undefined;target.requiredRevision=undefined;}
    }
  }
  for (const raw of restoredDocuments) {
    const document: any = raw;
    const origin = chats.find(chat => chat.sessionId === document?.sessionId && chat.requestId === document?.messageId);
    if (!origin) continue;
    const recoveryKey=JSON.stringify([document.sessionId,document.surfaceId]),existing=surfaces.get(recoveryKey);
    if(existing&&document.schemaVersion==='rui/1'&&document.revision===existing.surfaceRevision)existing.recoveryDocument=document;
    if(document.stream===undefined){
      if(document.schemaVersion!=="rui/1"||typeof document.surfaceId!=="string"||!document.surfaceId||document.surfaceId.length>128||!Number.isSafeInteger(document.revision)||document.revision<1||!isUiStreamTree(document.tree,true))continue;
      const key=JSON.stringify([document.sessionId,document.surfaceId]),previous=surfaces.get(key);
      if(previous&&previous.surfaceRevision>=document.revision)continue;
      surfaces.set(key,{task:previous?.task||{messageType:"ui_tree",messageId:document.eventId,resultMap:{tree:document.tree,surface:document}} as any,
        tree:document.tree,patchCount:previous?.patchCount||0,revision:String(document.revision),surfaceId:document.surfaceId,sessionId:document.sessionId,
        originRequestId:document.messageId,surfaceRevision:document.revision,needsResync:document.revision<(previous?.requiredRevision||0),requiredRevision:previous?.requiredRevision,serverManaged:true,recoveryDocument:document});
      continue;
    }
    const restored = restoreUiStream(document, origin.sessionId || ""); if (!restored) continue;
    const key = JSON.stringify([restored.sessionId, restored.surfaceId]); const previous = surfaces.get(key);
    if (previous && previous.surfaceRevision >= restored.revision) continue;
    surfaces.set(key, { task: previous?.task || { messageType: "ui_stream", messageId: restored.generationId, resultMap: restored } as any,
      tree: restored.tree, patchCount: previous?.patchCount || 0, revision: String(restored.revision), surfaceId: restored.surfaceId,
      sessionId: restored.sessionId, originRequestId: restored.messageId, surfaceRevision: restored.revision,
      needsResync: restored.revision < (previous?.requiredRevision || 0), requiredRevision: previous?.requiredRevision, serverManaged: true, stream: restored });
  }
  const byOrigin=new Map<string,SessionSurface[]>();
  for(const surface of surfaces.values())byOrigin.set(surface.originRequestId,[...(byOrigin.get(surface.originRequestId)||[]),surface]);
  return byOrigin;
}
