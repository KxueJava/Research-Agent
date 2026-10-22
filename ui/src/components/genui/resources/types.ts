export type Result<T> = {ok:true;value:T;error?:never} | {ok:false;value?:never;error:{code:string;message:string}};
export const ok=<T>(value:T):Result<T>=>({ok:true,value});
export const fail=(code:string,message:string):Result<never>=>({ok:false,error:{code,message}});
export type Scope={sessionId:string;surfaceId:string};
export type Cell=string|number|boolean|null;
export type Row=Readonly<Record<string,Cell>>;
export type Resource={id:string;version:number;source:{type:"upload"|"inline";name:string;resourceKey?:string};collectedAt:string;columns:readonly string[];rows:readonly Row[]};
export const safeKey=(s:unknown):s is string=>typeof s==="string" && !!s.trim() && s.length<=128 && !["__proto__","prototype","constructor"].includes(s);
export const scopeKey=(s:Scope)=>JSON.stringify([s.sessionId,s.surfaceId]);
