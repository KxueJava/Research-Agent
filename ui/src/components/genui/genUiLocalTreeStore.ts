/**
 * Client-side GenUI patches for in-UI interaction (patch_ui / form local state).
 * Server emit_ui_patch still flows through multiAgent tasks; this store only
 * holds patches applied by clicking GenUI controls without starting a chat turn.
 */

export type LocalUiPatch = {
  op: string;
  path: string;
  value?: unknown;
};

type ScopeState = {
  patches: LocalUiPatch[];
  version: number;
};

const scopes = new Map<string, ScopeState>();
const listeners = new Set<() => void>();
const nodes = new Map<string,Map<string,unknown>>();
let snapshot=0;

function emit() {
  snapshot++;
  listeners.forEach((l) => l());
}

export function genUiLocalScopeKey(
  sessionId?: string,
  messageId?: string,
  surfaceId?: string
): string {
  if (surfaceId) return JSON.stringify([sessionId || "session", surfaceId]);
  return `${sessionId || "session"}::${messageId || "message"}`;
}

export function subscribeGenUiLocalTree(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getGenUiLocalSnapshot(): number {
  return snapshot;
}

export const getNodeUiState=(scopeKey:string,nodeId:string):unknown=>nodes.get(scopeKey)?.get(nodeId);
export const hasNodeUiState=(scopeKey:string,nodeId:string)=>nodes.get(scopeKey)?.has(nodeId)??false;
export function recoverNodeUiState(scopeKey:string,allowed:Set<string>,saved:Record<string,unknown>){
  const state=nodes.get(scopeKey)??new Map<string,unknown>();for(const id of allowed)state.set(id,Object.prototype.hasOwnProperty.call(saved,id)?saved[id]:undefined);nodes.set(scopeKey,state);emit();
}
export function setNodeUiState(scopeKey:string,nodeId:string,value:unknown){
  if(!scopeKey||!nodeId||["__proto__","constructor","prototype"].includes(nodeId))return;
  const state=nodes.get(scopeKey)??new Map<string,unknown>();
  if(Object.is(state.get(nodeId),value)&&state.has(nodeId))return;
  state.set(nodeId,value);nodes.set(scopeKey,state);emit();
}
export function belongsToGenUiSession(key:string,sessionId:string):boolean {
  try{return JSON.parse(key)[0]===sessionId;}catch{return key.startsWith(`${sessionId}::`);}
}
export function clearLocalUiSession(sessionId:string){
  for(const map of [scopes,nodes])for(const key of map.keys())if(belongsToGenUiSession(key,sessionId))map.delete(key);
  emit();
}

export function getLocalUiPatches(scopeKey: string): LocalUiPatch[] {
  return scopes.get(scopeKey)?.patches ?? [];
}

export function getLocalUiVersion(scopeKey: string): number {
  return scopes.get(scopeKey)?.version ?? 0;
}

export function applyLocalUiPatches(
  scopeKey: string,
  patches: LocalUiPatch[]
): number {
  if (!scopeKey || !Array.isArray(patches) || !patches.length) {
    return getLocalUiVersion(scopeKey);
  }
  const prev = scopes.get(scopeKey);
  const nextPatches = [...(prev?.patches ?? []), ...patches];
  const version = (prev?.version ?? 0) + 1;
  scopes.set(scopeKey, { patches: nextPatches, version });
  emit();
  return version;
}

export function clearLocalUiPatches(scopeKey: string): void {
  if (!scopes.has(scopeKey)) return;
  scopes.delete(scopeKey);
  emit();
}
