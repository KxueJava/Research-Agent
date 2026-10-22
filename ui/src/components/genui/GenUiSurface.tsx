import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { SessionSurface } from "@/utils/chat/surfaceProtocol";
import { fetchUiSurface } from "@/services/uiSurface";
import { restoreUiStream } from "@/utils/chat/uiStreamReducer";
import {subscribeUiActions,surfaceUiActions,uiActionSnapshot} from "./uiActionState";
import UiActionPanel from "./UiActionPanel";
import {getResource,putResource} from "./resources/resourceStore";
import GenUiInline from "./GenUiInline";
import { applyUiPatches } from "./applyUiPatch";
import { genUiLocalScopeKey, getGenUiLocalSnapshot, getLocalUiPatches, subscribeGenUiLocalTree,getNodeUiState,recoverNodeUiState } from "./genUiLocalTreeStore";
import {createInteractionRecovery,type RecoveryStatus} from './interactionRecovery';
import {recoverableNodes,safeRecoveryValue,recoveryDefaults} from './recoveryPolicy';
import RecoveryNotice from './RecoveryNotice';
import {clearGenUiSession} from './genUiSessionState';

/** One mounted controller per Surface: recovery and local state never target its siblings. */
export default function GenUiSurface({ surface }: { surface: SessionSurface }) {
  const [recovered, setRecovered] = useState<any>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const request = useRef<AbortController | null>(null);
  useSyncExternalStore(subscribeGenUiLocalTree, getGenUiLocalSnapshot, getGenUiLocalSnapshot);
  const actionRevision=useSyncExternalStore(subscribeUiActions,uiActionSnapshot,uiActionSnapshot);
  useEffect(()=>{
    const completed=surfaceUiActions(surface.sessionId,surface.surfaceId).filter(e=>e.status==="completed"&&e.result?.surface?.sessionId===surface.sessionId&&e.result.surface.surfaceId===surface.surfaceId).sort((a,b)=>b.result!.surface.revision-a.result!.surface.revision)[0];
    if(completed)setRecovered((current:any)=>current?.revision>=completed.result!.surface.revision?current:completed.result!.surface);
  },[actionRevision,surface.sessionId,surface.surfaceId]);
  useEffect(()=>{
    if(recovered?.sessionId!==surface.sessionId||recovered?.surfaceId!==surface.surfaceId||!Array.isArray(recovered.resources))return;
    for(const resource of recovered.resources){if((getResource(surface,resource.id)?.version??0)<resource.version){const result=putResource(surface,resource,true);if(!result.ok)setError("数据资源同步失败："+result.error.message);}}
  },[recovered,surface.sessionId,surface.surfaceId]);
  const sync = async () => {
    request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    setBusy(true); setError("");
    try {
      const snapshot = await fetchUiSurface(surface.sessionId, surface.surfaceId, controller.signal);
      if (!controller.signal.aborted) setRecovered((current:any)=>current?.sessionId===snapshot.sessionId&&current?.surfaceId===snapshot.surfaceId&&current.revision>snapshot.revision?current:snapshot);
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "界面同步失败");
    } finally { if (!controller.signal.aborted) setBusy(false); }
  };
  useEffect(() => {
    setRecovered(null); setError(""); setBusy(false);
    return () => request.current?.abort();
    // Fetch once per identity; the stream supplies subsequent revisions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [surface.sessionId, surface.surfaceId, surface.serverManaged]);
  const accepted = recovered?.sessionId === surface.sessionId && recovered?.surfaceId === surface.surfaceId
    && recovered.revision >= surface.surfaceRevision;
  const patches = getLocalUiPatches(genUiLocalScopeKey(surface.sessionId, surface.originRequestId, surface.surfaceId));
  const baseTree = accepted ? recovered.tree : surface.tree;
  const tree = patches.length ? applyUiPatches(baseTree, patches) : baseTree;
  const needsResync = surface.needsResync && (!accepted || recovered.revision < (surface.requiredRevision || surface.surfaceRevision));
  const stream = accepted ? restoreUiStream(recovered, surface.sessionId) : surface.stream;
  const mapOnly=(tree?.root?.kind??tree?.kind)==="MapWidget";
  const [recoveryStatus,setRecoveryStatus]=useState<RecoveryStatus>({phase:'loading',message:''});
  const recovery=useRef<ReturnType<typeof createInteractionRecovery>|null>(null);
  const current=useRef({tree:baseTree,revision:accepted?recovered.revision:surface.surfaceRevision});current.current={tree:baseTree,revision:accepted?recovered.revision:surface.surfaceRevision};
  useEffect(()=>{
    if(!surface.serverManaged)return;
    const scopeKey=genUiLocalScopeKey(surface.sessionId,surface.originRequestId,surface.surfaceId);
    const controller=createInteractionRecovery(surface,{
      revision:()=>current.current.revision,
      read:()=>({nodes:Object.fromEntries([...recoverableNodes(current.current.tree)].map(id=>[id,getNodeUiState(scopeKey,id)]).filter(([,value])=>value!==undefined&&safeRecoveryValue(value)))}),
      apply:(state,doc)=>{const allowed=recoverableNodes(doc.tree),raw=state.nodes&&typeof state.nodes==='object'?state.nodes:{};recoverNodeUiState(scopeKey,allowed,{...recoveryDefaults(doc.tree),...Object.fromEntries(Object.entries(raw).filter(([id,value])=>allowed.has(id)&&safeRecoveryValue(value)))})},
      document:doc=>setRecovered((old:any)=>old?.revision>doc.revision?old:doc),deleted:()=>{request.current?.abort();clearGenUiSession(surface.sessionId)}
    },setRecoveryStatus);recovery.current=controller;
    const unsubscribe=subscribeGenUiLocalTree(controller.changed);void controller.start();
    const poll=setInterval(()=>{if(!document.hidden)void controller.poll()},5000);
    return()=>{unsubscribe();clearInterval(poll);controller.stop();if(recovery.current===controller)recovery.current=null};
  },[surface.sessionId,surface.surfaceId,surface.serverManaged]);
  const surfaceSync=mapOnly&&(needsResync||error)?{message:error||surface.error||"界面需要重新同步",busy,retry:()=>void sync()}:undefined;
  if(recoveryStatus.phase==='deleted')return <RecoveryNotice status={recoveryStatus} reload={()=>{}} retry={()=>{}}/>;
  return <div data-genui-surface={surface.surfaceId} data-generation-id={stream?.generationId} data-first-useful-ms={stream?.firstUsefulLatencyMs}>
    {error&&!needsResync&&!mapOnly&&<div role="alert">{error}</div>}
    {stream?.status === "committed" && <div role="status" className="text-xs text-[var(--chat-text-soft)]">正在生成界面，可先使用已完成部分</div>}
    {(stream?.status === "failed" || stream?.status === "cancelled") && <div role="status" className="text-xs text-[var(--chat-text-soft)]">界面生成已停止，已保留完成内容</div>}
    {needsResync && !mapOnly && <div role="status" className="mb-2 text-sm text-[var(--chat-text-soft)]">
      {error || surface.error || "界面需要重新同步"}
      <button type="button" className="ml-2 underline" disabled={busy} onClick={() => void sync()}>{busy ? "正在同步…" : "重新同步"}</button>
    </div>}
    <GenUiInline tree={tree} patchCount={surface.patchCount + patches.length} surfaceSync={surfaceSync}
      recoveryNotice={surface.serverManaged&&<RecoveryNotice status={recoveryStatus} reload={()=>void recovery.current?.reload()} retry={()=>void recovery.current?.retry()}/>}
      sessionId={surface.sessionId} requestId={surface.originRequestId} messageId={surface.originRequestId}
      surfaceId={surface.surfaceId} baseRevision={accepted?recovered.revision:surface.surfaceRevision} className="w-full max-w-none" />
    {surface.serverManaged&&!mapOnly&&<UiActionPanel sessionId={surface.sessionId} surfaceId={surface.surfaceId} baseRevision={accepted?recovered.revision:surface.surfaceRevision}/>}
  </div>;
}
