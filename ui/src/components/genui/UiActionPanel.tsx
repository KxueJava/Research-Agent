import {useEffect,useState,useSyncExternalStore} from "react";
import {cancelUiAction,decideUiAction,listUiActions,restartUiAction,uiActionRequestKey,isUiActionUncertainError,type UiActionExecution} from "@/services/uiAction";
import {receiveUiAction,subscribeUiActions,surfaceUiActions,uiActionSnapshot,hasUncertainUiAction,uiActionSessionEpoch,markUncertainUiAction} from "./uiActionState";
import {fireGenUiControl} from "./genUiActionBus";
import {useUiFeatures} from "./UiFeatures";
const labels:Record<string,string>={accepted:"任务已受理",running:"任务执行中",approval_required:"等待审批",completed:"任务已完成",failed:"任务失败",cancelled:"任务已取消"};
export default function UiActionPanel({sessionId,surfaceId,baseRevision,compact=false,readOnly=false}:{sessionId:string;surfaceId:string;baseRevision:number;compact?:boolean;readOnly?:boolean}){
  const features=useUiFeatures(),canStart=features.actions&&!readOnly;
  useSyncExternalStore(subscribeUiActions,uiActionSnapshot,uiActionSnapshot);
  const records=surfaceUiActions(sessionId,surfaceId);const uncertain=hasUncertainUiAction(sessionId,surfaceId);const pending=uncertain||records.some(e=>!["completed","failed","cancelled"].includes(e.status));
  const [query,setQuery]=useState(0);
  const [error,setError]=useState("");const [busy,setBusy]=useState<string|null>(null);const [continued,setContinued]=useState<string[]>([]);
  useEffect(()=>{
    let active=true;const epoch=uiActionSessionEpoch(sessionId);const load=async()=>{try{const list=await listUiActions(sessionId,surfaceId);if(active&&epoch===uiActionSessionEpoch(sessionId)){list.forEach(receiveUiAction);setError("");}}catch{if(active)setError("动作状态暂时无法同步，请重新查询");}};
    void load();const timer=pending?setInterval(()=>void load(),1500):undefined;
    return()=>{active=false;if(timer)clearInterval(timer);};
  },[sessionId,surfaceId,pending,query]);
  const change=async(e:UiActionExecution,op:"approve"|"reject"|"cancel")=>{if(op==="approve"&&!canStart){setError("远程动作已关闭，已有结果仍可查询、拒绝或取消");return;}setBusy(e.id);const epoch=uiActionSessionEpoch(sessionId);try{const updated=op==="cancel"?await cancelUiAction(sessionId,e.id):await decideUiAction(sessionId,e.id,op==="approve");if(epoch===uiActionSessionEpoch(sessionId))receiveUiAction(updated);setError("");}catch{setError("操作结果尚未确认，请查询状态后再决定是否重试");}finally{setBusy(null);}};
  const content=<div className="space-y-2 text-sm" data-ui-actions>
    {error&&<div role="alert">{error}</div>}
    {!canStart&&<p role="status">远程动作已关闭，已有结果仍可查询、拒绝或取消。</p>}
    {uncertain&&<div role="status">提交结果尚未确认，正在查询原执行记录。</div>}
    <button type="button" onClick={()=>setQuery(n=>n+1)}>查询动作状态</button>
    {records.map(e=><div key={e.id} data-execution-id={e.id} data-action-status={e.status} className="rounded border border-[var(--chat-border)] p-3">
      <div role="status">{labels[e.status]}{e.cancelRequested&&e.status==="running"?"，取消请求已登记，等待结果确认":""}</div>
      {e.error&&<div role="alert">{e.error}</div>}
      {e.effectState==="unknown"&&<div>外部结果尚未确认，请勿重复执行。</div>}
      {["failed","cancelled"].includes(e.status)&&!["unknown","pending_reconciliation"].includes(e.effectState??"")&&<button disabled={!canStart||busy===e.id} onClick={async()=>{
        if(!canStart)return;
        const epoch=uiActionSessionEpoch(sessionId);setBusy(e.id);
        const value={surfaceId,componentId:e.componentId,actionId:e.actionId,baseRevision,payload:(e.payload??{}) as Record<string,unknown>};
        try{const updated=await restartUiAction(sessionId,value);if(epoch===uiActionSessionEpoch(sessionId))receiveUiAction(updated);setError("");}
        catch(error){const key=uiActionRequestKey(sessionId,value);if(key&&isUiActionUncertainError(error)&&epoch===uiActionSessionEpoch(sessionId))markUncertainUiAction(sessionId,surfaceId,key);setError(isUiActionUncertainError(error)?"新执行结果未确认，正在查询":"新执行被拒绝，请同步界面版本后重试");}finally{setBusy(null);}
      }}>重新发起</button>}
      {e.result?.summary&&<p>{e.result.summary}</p>}
      {e.status==="approval_required"&&<><button disabled={!canStart||busy===e.id} onClick={()=>void change(e,"approve")}>批准执行</button><button className="ml-3" disabled={busy===e.id} onClick={()=>void change(e,"reject")}>拒绝</button></>}
      {!["completed","failed","cancelled"].includes(e.status)&&<button className="ml-3" disabled={busy===e.id} onClick={()=>void change(e,"cancel")}>取消任务</button>}
      {e.status==="completed"&&e.result?.summary&&<button disabled={continued.includes(e.id)} onClick={async()=>{
        const result=await fireGenUiControl({action:{type:"send_message",payload:{content:`继续分析已完成动作 ${e.id} 的结果：${e.result!.summary}`}}},{sessionId,surfaceId});if(result.ok)setContinued([...continued,e.id]);else setError("Agent 当前无法接手，请稍后重试");
      }}>交给 Agent 继续分析</button>}
    </div>)}
  </div>;
  return compact?<details className="map-action-log" open={pending||Boolean(error)}><summary>路线操作记录{pending?" · 正在处理":""}</summary>{content}</details>:content;
}
