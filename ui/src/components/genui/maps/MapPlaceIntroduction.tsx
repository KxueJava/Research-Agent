import {useEffect,useRef,useState} from "react";
import {streamMapPlaceIntroduction} from "@/services/maps";
import {mapScopeKey,type MapScope} from "./mapTypes";
import {applyIntroductionEvent,createIntroductionStream,type IntroductionState} from "./placeIntroductionStream";

export default function MapPlaceIntroduction({scope,placeId,revision}:{scope:MapScope;placeId:string;revision:number}){
  const key=`${mapScopeKey(scope)}:${placeId}:${revision}`;
  const [attempt,setAttempt]=useState(0),[result,setResult]=useState<{key:string;state:IntroductionState}>();
  const active=useRef<{controller:AbortController;state:IntroductionState}|null>(null);
  useEffect(()=>{
    const controller=new AbortController(),generationId=crypto.randomUUID();
    const request={controller,state:createIntroductionStream(generationId,placeId,revision)};active.current=request;
    const publish=()=>{if(active.current===request)setResult({key,state:request.state});};publish();
    streamMapPlaceIntroduction(scope,placeId,revision,generationId,controller.signal,{
      message:raw=>{if(controller.signal.aborted||active.current!==request)return;request.state=applyIntroductionEvent(request.state,raw);publish();if(["completed","failed"].includes(request.state.status))controller.abort();},
      error:error=>{if(controller.signal.aborted||active.current!==request)return;request.state={...request.state,status:"failed",error:error.message||"AI 简介生成失败，请重试"};publish();},
      close:()=>{if(controller.signal.aborted||active.current!==request||request.state.status==="completed")return;request.state={...request.state,status:"failed",error:"生成连接已中断，已保留收到的内容"};publish();}
    });
    return()=>{controller.abort();if(active.current===request)active.current=null;};
  },[key,attempt]);
  const state=result?.key===key?result.state:undefined;
  const status=state?.status??"waiting",busy=status==="waiting"||status==="streaming";
  return <section className="map-detail-intro" data-ai-introduction data-intro-status={status} data-intro-cached={state?.cached??false}>
    <h3>景点简介<span className="map-intro-ai-label" aria-hidden="true">AI</span></h3>
    <p className="map-intro-text">{state?.text||(busy?"正在生成景点简介…":status==="cancelled"?"简介生成已停止。":"暂无已生成内容。")}</p>
    <div className="map-intro-status" role="status" aria-live="polite">{busy?<><span>正在生成…</span><button type="button" onClick={()=>{const request=active.current;if(!request)return;request.controller.abort();request.state={...request.state,status:"cancelled"};setResult({key,state:request.state});}}>停止生成</button></>:status==="completed"?<span>简介由 AI 生成，供行程参考。</span>:<><span>{state?.error||"已停止生成，保留当前内容。"}</span><button type="button" onClick={()=>setAttempt(value=>value+1)}>{status==="cancelled"?"重新生成":"重试 AI 简介"}</button></>}</div>
  </section>;
}
