import {cancelUiAction,submitUiAction,type UiActionRequest,type UiActionExecution} from "@/services/uiAction";
import {getMapSurface,mapError} from "@/services/maps";
import {receiveUiAction} from "../uiActionState";
import {startMapEdit,failMapEdit,mapSessionEpoch,readMapState} from "./mapStore";
import {mapScopeKey,type MapScope,type TravelMode} from "./mapTypes";
type Transport={surface:(session:string,surface:string)=>Promise<{revision:number}>;submit:(session:string,value:UiActionRequest)=>Promise<UiActionExecution>;cancel:(session:string,id:string)=>Promise<UiActionExecution>};
const live:Transport={surface:getMapSurface,submit:submitUiAction,cancel:cancelUiAction};
type Pending={requestId:string;request?:UiActionRequest;promise:Promise<UiActionExecution|undefined>};
const active=new Map<string,Pending>();
export function clearMapActionSession(session:string){for(const key of active.keys())if(JSON.parse(key)[0]===session)active.delete(key);}
export async function runMapEdit(scope:MapScope,actionId:string,ids:string[],mode:TravelMode,transport:Transport=live){
  const key=mapScopeKey(scope),previous=active.get(key),requestId=crypto.randomUUID(),epoch=mapSessionEpoch(scope.sessionId);
  startMapEdit(scope,ids,mode,requestId);
  const current=()=>mapSessionEpoch(scope.sessionId)===epoch&&readMapState(scope)?.requestId===requestId;
  const next:Pending={requestId,promise:Promise.resolve(undefined)};
  next.promise=(async()=>{
    if(previous){
      let old=await previous.promise;
      // A lost response may still mean accepted. Retry the same original request/key before proceeding.
      if(!old&&previous.request)old=await transport.submit(scope.sessionId,previous.request);
      if(!current())return;
      if(old&&!["completed","failed","cancelled"].includes(old.status)){
        const cancelled=await transport.cancel(scope.sessionId,old.id);if(current())receiveUiAction(cancelled);
        if(cancelled.status==="running"&&!cancelled.cancelRequested)throw Error("上一条路线的取消结果尚未确认");
      }
    }
    if(!current())return;
    const surface=await transport.surface(scope.sessionId,scope.surfaceId);if(!current())return;
    next.request={surfaceId:scope.surfaceId,componentId:scope.nodeId,actionId,baseRevision:surface.revision,payload:{placeIds:ids,travelMode:mode,requestId}};
    const execution=await transport.submit(scope.sessionId,next.request);
    if(current()){
      receiveUiAction(execution);
      if(["failed","cancelled"].includes(execution.status))failMapEdit(scope,requestId,execution.error||"路线未能更新，保留上一条有效路线");
    }return execution;
  })().catch(error=>{if(current())failMapEdit(scope,requestId,mapError(error));return undefined;});
  active.set(key,next);return next.promise;
}
