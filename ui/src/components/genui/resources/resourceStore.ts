import { fail, ok, safeKey, scopeKey, type Resource, type Result, type Scope } from "./types";
const resources=new Map<string,Map<string,Map<number,Resource>>>();
const listeners=new Set<()=>void>();
let revision=0;
const sessionEpochs=new Map<string,number>();
export const resourceSessionEpoch=(sessionId:string)=>sessionEpochs.get(sessionId)??0;
export const resourceSnapshot=()=>revision;
export function subscribeResources(listener:()=>void){listeners.add(listener);return ()=>{listeners.delete(listener);};}
function changed(){revision++;listeners.forEach(fn=>fn());}
export function getResource(scope:Scope,id:string,version?:number):Resource|undefined {
  const versions=resources.get(scopeKey(scope))?.get(id);
  return versions?.get(version??Math.max(...versions.keys()));
}
export function putResource(scope:Scope,input:Resource,authoritative=false):Result<Resource>{
  if(!safeKey(scope.sessionId)||!safeKey(scope.surfaceId)||!safeKey(input.id)||!Number.isSafeInteger(input.version)||input.version<1
    ||!["upload","inline"].includes(input.source?.type)||!input.source?.name||!Number.isFinite(Date.parse(input.collectedAt))
    ||!Array.isArray(input.columns)||input.columns.length<1||input.columns.length>50||input.columns.some(c=>!safeKey(c))||new Set(input.columns).size!==input.columns.length
    ||!Array.isArray(input.rows)||input.rows.length>10000)return fail("INVALID_RESOURCE","数据资源格式无效");
  if(input.rows.some(row=>!row||Array.isArray(row)||Object.keys(row).length!==input.columns.length||input.columns.some(c=>!Object.prototype.hasOwnProperty.call(row,c)||!validCell(row[c]))))return fail("INVALID_ROW","数据行包含无效列或数值");
  let copy:Resource;
  try {const serialized=JSON.stringify(input);if(serialized.length>2_097_152)return fail("LIMIT","数据超过 2 MiB 限制");copy=JSON.parse(serialized);} catch{return fail("INVALID_RESOURCE","数据无法序列化");}
  const key=scopeKey(scope);const group=resources.get(key)??new Map<string,Map<number,Resource>>();
  const versions=group.get(input.id)??new Map<number,Resource>();
  const current=Math.max(0,...versions.keys());
  if(input.version<current&&!authoritative)return fail("STALE_VERSION","拒绝旧数据版本");
  if(versions.has(input.version))return JSON.stringify(versions.get(input.version))===JSON.stringify(copy)?ok(versions.get(input.version)!):fail("VERSION_CONFLICT","同一版本的数据不能改写");
  if(!authoritative&&input.version!==current+1)return fail("VERSION_GAP","数据版本不连续");
  if(!authoritative&&versions.size>=10||!group.has(input.id)&&group.size>=20)return fail("LIMIT","本画布数据版本数量已达上限");
  // Server snapshots must remain recoverable after long sessions; retain at most ten cached versions.
  if(authoritative&&versions.size>=10)versions.delete(Math.min(...versions.keys()));
  copy.rows.forEach(Object.freeze);Object.freeze(copy.rows);Object.freeze(copy.columns);Object.freeze(copy.source);Object.freeze(copy);
  versions.set(copy.version,copy);group.set(copy.id,versions);resources.set(key,group);changed();return ok(copy);
}
function validCell(value:unknown){return value===null||typeof value==="boolean"||typeof value==="string"&&value.length<=65536||typeof value==="number"&&Number.isFinite(value);}
export function clearResourceSession(sessionId:string){
  sessionEpochs.set(sessionId,resourceSessionEpoch(sessionId)+1);
  let found=false;for(const key of resources.keys())if(JSON.parse(key)[0]===sessionId){resources.delete(key);found=true;}
  if(found)changed();
}
