import {mapScopeKey,type MapScope} from "./mapTypes";
export type OpenMapPlace={scope:MapScope;placeId:string};
let current:OpenMapPlace|null=null;
const listeners=new Set<()=>void>();
export const subscribeMapDetails=(fn:()=>void)=>{listeners.add(fn);return()=>{listeners.delete(fn);};};
export const mapDetailsSnapshot=()=>current;
export function openMapDetails(scope:MapScope,placeId:string){current={scope,placeId};listeners.forEach(fn=>fn());}
export function closeMapDetails(scope?:MapScope){if(!current||(scope&&mapScopeKey(scope)!==mapScopeKey(current.scope)))return;current=null;listeners.forEach(fn=>fn());}
export function clearMapDetailsSession(session:string){if(current?.scope.sessionId===session)closeMapDetails();}
