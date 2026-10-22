import request from "@/utils/request";
import {z} from "zod";
const schema=z.object({id:z.string().min(1),sessionId:z.string().min(1),surfaceId:z.string().min(1),componentId:z.string().min(1),actionId:z.string().min(1),baseRevision:z.number().int().positive(),executionRevision:z.number().int().positive().optional(),status:z.enum(["accepted","running","completed","failed","approval_required","cancelled"]),cancelRequested:z.boolean().optional(),effectState:z.string().optional(),error:z.string().optional(),result:z.object({surface:z.any(),resources:z.array(z.any()),summary:z.string()}).optional()}).passthrough();
export type UiActionExecution=z.infer<typeof schema>;
export type UiActionRequest={surfaceId:string;componentId:string;actionId:string;baseRevision:number;payload:Record<string,unknown>};
export const parseUiActionExecution=(raw:unknown)=>schema.parse(raw);
export function isUiActionUncertainError(error:unknown){const status=(error as {response?:{status?:number}}|null)?.response?.status;return !status||status===408||status>=500;}
const keys=new Map<string,string>(),pending=new Map<string,Promise<UiActionExecution>>();
function canonical(value:unknown):unknown{if(Array.isArray(value))return value.map(canonical);if(value&&typeof value==="object")return Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,canonical(v)]));return value;}
const base=(sessionId:string)=>`/api/agent/conversation/sessions/${encodeURIComponent(sessionId)}/ui-actions`;
export function clearUiActionRequests(){keys.clear();pending.clear();}
export function uiActionRequestKey(sessionId:string,value:UiActionRequest){return keys.get(JSON.stringify([sessionId,canonical(value)]));}
/** Only an explicit new attempt may rotate a terminal request's key. Transport retries never do. */
export function restartUiAction(sessionId:string,value:UiActionRequest){
  const signature=JSON.stringify([sessionId,canonical(value)]);
  if(pending.has(signature))return pending.get(signature)!;
  keys.delete(signature);try{sessionStorage.removeItem(`research.ui-action.${signature}`);}catch{/* Optional storage */}
  return submitUiAction(sessionId,value);
}
export function submitUiAction(sessionId:string,value:UiActionRequest):Promise<UiActionExecution>{
  const signature=JSON.stringify([sessionId,canonical(value)]);const cached=pending.get(signature);if(cached)return cached;
  const storageKey=`research.ui-action.${signature}`;
  let key=keys.get(signature);
  if(!key){try{key=sessionStorage.getItem(storageKey)||undefined;}catch{/* Browser storage optional */}key ||= crypto.randomUUID();keys.set(signature,key);try{sessionStorage.setItem(storageKey,key);}catch{/* Same-tab memory still preserves retries. */}}
  const promise=(request.post(base(sessionId),{...value,idempotencyKey:key}) as unknown as Promise<unknown>).then(raw=>{
    const result=parseUiActionExecution(raw);if(result.sessionId!==sessionId||result.surfaceId!==value.surfaceId||result.componentId!==value.componentId||result.actionId!==value.actionId)throw Error("动作响应身份不匹配");return result;
  }).finally(()=>pending.delete(signature));pending.set(signature,promise);return promise;
}
export async function listUiActions(sessionId:string,surfaceId:string):Promise<UiActionExecution[]>{
  const data:unknown=await request.get(base(sessionId),{params:{surfaceId}});if(!Array.isArray(data)||data.length>100)throw Error("动作列表无效");
  return data.map(parseUiActionExecution).filter(e=>e.sessionId===sessionId&&e.surfaceId===surfaceId);
}
export async function getUiAction(sessionId:string,id:string){const value=parseUiActionExecution(await request.get(`${base(sessionId)}/${encodeURIComponent(id)}`));if(value.sessionId!==sessionId||value.id!==id)throw Error("动作身份不匹配");return value;}
function checked(raw:unknown,sessionId:string,id:string){const value=parseUiActionExecution(raw);if(value.sessionId!==sessionId||value.id!==id)throw Error("动作身份不匹配");return value;}
export async function decideUiAction(sessionId:string,id:string,approved:boolean){return checked(await request.post(`${base(sessionId)}/${encodeURIComponent(id)}/decision`,{approved}),sessionId,id);}
export async function cancelUiAction(sessionId:string,id:string){return checked(await request.post(`${base(sessionId)}/${encodeURIComponent(id)}/cancel`),sessionId,id);}
