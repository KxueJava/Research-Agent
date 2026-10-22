import { getTaskFiles } from "@/utils/taskArtifacts";
import { normalizeFileUrlForBrowser } from "@/utils/fileUrl";

export type HtmlArtifactDocument = {
  kind: "html"; schemaVersion: string; sessionId: string; surfaceId: string;
  messageId: string; revision: number; serverManaged: boolean;
  artifact: { title: string; relativePath: string; previewUrl: string; downloadUrl: string };
};
const record = (value: unknown): value is Record<string, any> => !!value && typeof value === "object" && !Array.isArray(value);
const safeUrl = (value: unknown) => typeof value === "string" && /^(https?:\/\/|\/tool\/)/i.test(value) && !/[\u0000-\u001f]/.test(value);

export function hasManagedHtmlSurface(task: any): boolean {
  let layer = task?.resultMap;
  for (let depth = 0; depth < 5 && record(layer); depth++, layer = layer.resultMap) {
    if (layer.surface?.kind === "html" && layer.surface.schemaVersion === "rui/1") return true;
  }
  return false;
}

export function readHtmlDocument(value: unknown, sessionId: string, surfaceId?: string, revision?: number): HtmlArtifactDocument | null {
  if (!record(value) || value.kind !== "html" || value.schemaVersion !== "rui/1" || value.sessionId !== sessionId
      || typeof value.surfaceId !== "string" || !value.surfaceId || (surfaceId && value.surfaceId !== surfaceId)
      || !Number.isSafeInteger(value.revision) || value.revision < 1 || (revision && value.revision !== revision)
      || !record(value.artifact) || !safeUrl(value.artifact.previewUrl)) return null;
  return { kind: "html", schemaVersion: "rui/1", sessionId, surfaceId: value.surfaceId,
    messageId: String(value.messageId || ""), revision: value.revision, serverManaged: true,
    artifact: { title: String(value.artifact.title || "HTML 画布"), relativePath: String(value.artifact.relativePath || ""),
      previewUrl: normalizeFileUrlForBrowser(value.artifact.previewUrl),
      downloadUrl: safeUrl(value.artifact.downloadUrl) ? normalizeFileUrlForBrowser(value.artifact.downloadUrl) : "" } };
}

export function projectHtmlSurfaces(chats: CHAT.ChatItem[],restoredDocuments:unknown[]=[]): Map<string, HtmlArtifactDocument[]> {
  const latest = new Map<string, { origin: string; doc: HtmlArtifactDocument }>();
  const origins = new Set(chats.map(chat => chat.requestId));
  for (const chat of chats) {
    const visit = (task: any) => {
      let layer = task?.resultMap;
      let managed = false;
      for (let depth = 0; depth < 5 && record(layer); depth++, layer = layer.resultMap) {
        const doc = readHtmlDocument(layer.surface, chat.sessionId || "");
        if (!doc) continue;
        managed = true;
        const key = `${doc.sessionId}:${doc.surfaceId}`;
        const old = latest.get(key);
        if (!old || doc.revision > old.doc.revision) latest.set(key, {
          origin: old?.origin || (origins.has(doc.messageId) ? doc.messageId : chat.requestId), doc,
        });
      }
      if (!managed && task?.messageType === "html" && !record(task?.resultMap?.surface) && !record(task?.resultMap?.resultMap?.surface)) {
        for (const file of getTaskFiles(task)) {
          if (!/\.html?(?:$|[?#])/i.test(file.name || "") || !safeUrl(file.url)) continue;
          const id = `legacy:${chat.requestId}:${file.name}`;
          latest.set(id, { origin: chat.requestId, doc: { kind: "html", schemaVersion: "legacy", sessionId: chat.sessionId || "",
            surfaceId: id, messageId: chat.requestId, revision: 1, serverManaged: false,
            artifact: { title: file.name, relativePath: file.name, previewUrl: file.url, downloadUrl: file.downloadUrl || "" } } });
        }
      }
      for (const child of task?.children || []) visit(child);
    };
    for (const matrix of [chat.tasks, chat.multiAgent?.tasks]) for (const group of matrix || []) for (const task of group) visit(task);
  }
  for(const raw of restoredDocuments){
    if(!record(raw))continue;const origin=chats.find(chat=>chat.sessionId===raw.sessionId&&chat.requestId===raw.messageId);if(!origin)continue;
    const doc=readHtmlDocument(raw,origin.sessionId||'');if(!doc)continue;
    const key=`${doc.sessionId}:${doc.surfaceId}`,old=latest.get(key);
    if(!old||doc.revision>old.doc.revision)latest.set(key,{origin:old?.origin||origin.requestId,doc});
  }
  const byOrigin = new Map<string, HtmlArtifactDocument[]>();
  for (const { origin, doc } of latest.values()) byOrigin.set(origin, [...(byOrigin.get(origin) || []), doc]);
  return byOrigin;
}
