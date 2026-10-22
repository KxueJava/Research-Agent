import type {UiActionExecution} from "@/services/uiAction";
const actions=new Map<string,UiActionExecution>(),listeners=new Set<()=>void>();let revision=0;
const epochs=new Map<string,number>(),uncertain=new Map<string,Set<string>>();
const scope=(sessionId:string,surfaceId:string)=>JSON.stringify([sessionId,surfaceId]);
const changed=()=>{revision++;listeners.forEach(fn=>fn());};
export const uiActionSessionEpoch=(sessionId:string)=>epochs.get(sessionId)??0;
export const hasUncertainUiAction=(sessionId:string,surfaceId:string)=>Boolean(uncertain.get(scope(sessionId,surfaceId))?.size);
export function markUncertainUiAction(sessionId:string,surfaceId:string,key:string){const id=scope(sessionId,surfaceId);const keys=uncertain.get(id)??new Set<string>();keys.add(key);uncertain.set(id,keys);changed();}
export const uiActionSnapshot=()=>revision;
export function subscribeUiActions(listener:()=>void){listeners.add(listener);return()=>{listeners.delete(listener);};}
export function receiveUiAction(execution:UiActionExecution){
  const keys=uncertain.get(scope(execution.sessionId,execution.surfaceId));
  if(typeof execution.idempotencyKey==="string"&&keys?.delete(execution.idempotencyKey))changed();
  const old=actions.get(execution.id);
  const version=Number(execution.executionRevision??0),previous=Number(old?.executionRevision??0);
  if(old&&(previous>version||previous===version&&Number(old.updatedAt??0)>Number(execution.updatedAt??0)))return;
  if(old&&["completed","failed","cancelled"].includes(old.status)&&old.status!==execution.status)return;
  if(old&&JSON.stringify(old)===JSON.stringify(execution))return;
  actions.set(execution.id,execution);revision++;listeners.forEach(fn=>fn());
}
export const surfaceUiActions=(sessionId:string,surfaceId:string)=>[...actions.values()].filter(e=>e.sessionId===sessionId&&e.surfaceId===surfaceId);
export function clearUiActionSession(sessionId:string){epochs.set(sessionId,uiActionSessionEpoch(sessionId)+1);for(const [id,e] of actions)if(e.sessionId===sessionId)actions.delete(id);for(const key of uncertain.keys())if(JSON.parse(key)[0]===sessionId)uncertain.delete(key);changed();}
