import { useSyncExternalStore } from "react";
import { genUiIdentity,useGenUiRenderContext } from "../GenUiRenderContext";
import { getGenUiLocalSnapshot,getNodeUiState,genUiLocalScopeKey,setNodeUiState,subscribeGenUiLocalTree } from "../genUiLocalTreeStore";
import { computeBoundValue } from "../bindProps";
import { resourceSnapshot,subscribeResources } from "./resourceStore";
import { resolveResourceBinding,type BoundResource } from "./binding";
export function useResourceNode(props:Record<string,any>,kind:string){
  const context=useGenUiRenderContext();const scope=genUiIdentity(context);
  useSyncExternalStore(subscribeResources,resourceSnapshot,resourceSnapshot);
  useSyncExternalStore(subscribeGenUiLocalTree,getGenUiLocalSnapshot,getGenUiLocalSnapshot);
  const key=genUiLocalScopeKey(context.sessionId,context.messageId,context.surfaceId);
  const read=(id:string)=>getNodeUiState(key,id);
  let next=props,error:string|undefined,bound:BoundResource|undefined;
  if(props.dataRef){
    if(!scope)error="此界面缺少数据资源身份";
    else{const result=resolveResourceBinding(scope,props,kind,read);if(result.ok){bound=result.value;next=bound.props;}else error=result.error.message;}
  }
  if(props.computation){const result=computeBoundValue(props.computation,read);if(result.ok)next={...next,value:result.value};else error=result.error.message;}
  const select=(ids:string[])=>{
    if(!bound?.selectionNodeId)return;
    const current=bound.selectedIds;const allSelected=ids.every(id=>current.includes(id));
    setNodeUiState(key,bound.selectionNodeId,allSelected?current.filter(id=>!ids.includes(id)):[...new Set([...current,...ids])]);
  };
  return {props:next,bound,error,select};
}
