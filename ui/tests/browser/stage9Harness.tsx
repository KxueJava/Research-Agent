// Deterministic acceptance only. Uses production components; no app route imports this entry.
import React,{useState,useMemo,useEffect} from "react";
import {createRoot} from "react-dom/client";
import GenUiInline from "../../src/components/genui/GenUiInline";
import GenUiSurface from "../../src/components/genui/GenUiSurface";
import GenUiActionBridge from "../../src/components/genui/GenUiActionBridge";
import HtmlArtifact from "../../src/components/artifacts/HtmlArtifact";
import {UiFeaturesProvider,UiFeaturesContextProvider,legacyUiFeatures,disabledUiFeatures} from "../../src/components/genui/UiFeatures";
import {MapRuntimeProvider} from "../../src/components/genui/maps/MapRuntime";
import {mockSdk} from "./stage6MockSdk";
import {loadAmapSdk} from "../../src/components/genui/maps/amapLoader";
import {getMapConfiguration} from "../../src/services/maps";
import "../../src/global.css";
const node=(kind:string,nodeId:string,props:any,children:any[]=[])=>({kind,nodeId,props,children});
const report=(version:number)=>({root:node("Card","report",{title:`研究报告 V${version}`},[node("QuoteCard","source-a",{quote:"2026-01-10，Atlas 支持 CSV 导出；离线模式仍在计划中。",author:"fixture:A"}),node("TimelineCard","timeline",{title:"研究过程",items:[{time:"2026-01-10",title:"CSV 导出",description:"fixture:A"},{time:"2026-01-12",title:"大文件等待较久",description:"fixture:B；具体耗时未知"},{time:"2026-01-15",title:"导出队列改进",description:"fixture:C；提升百分比未知"}]}),node("AlertCard","unknown",{title:"未知事项",message:version===1?"离线模式是否上线、具体等待时间与性能提升幅度尚未确认":"已追加边界：不得虚构等待耗时或提升百分比"}),node("Button","expand",{label:"查看研究结论",action:{type:"patch_ui",payload:{patches:[{op:"replace",path:"/root/children/2/props/message",value:"研究结论已展开"}]}}})])});
const split={root:node("Card","split",{title:"分账器"},[node("NumberInput","amount",{label:"金额",value:300,persistState:true}),node("NumberInput","people",{label:"人数",value:3,persistState:true}),node("NumberInput","tip",{label:"小费比例",value:0,persistState:true}),node("Stat","tip-value",{label:"小费金额",computation:{op:"split",amount:{fromNode:"amount"},people:{fromNode:"people"},tipPercent:{fromNode:"tip"},result:"tip"}}),node("Stat","total-value",{label:"含小费总额",computation:{op:"split",amount:{fromNode:"amount"},people:{fromNode:"people"},tipPercent:{fromNode:"tip"},result:"total"}}),node("Stat","shares",{label:"每人金额",computation:{op:"split",amount:{fromNode:"amount"},people:{fromNode:"people"},tipPercent:{fromNode:"tip"}}})])};
(window as any).stage9SplitTree=split;
function Harness(){const [version,setVersion]=useState(Number(sessionStorage.getItem("stage9.report"))||1),[resync,setResync]=useState(false),[shown,setShown]=useState(true),[game,setGame]=useState(true),[flags,setFlags]=useState(legacyUiFeatures),[map,setMap]=useState<any>();
 const runtime=useMemo(()=>new URLSearchParams(location.search).get('sdk')==='real'?{configuration:getMapConfiguration,loadSdk:async(config:any)=>{
  const sdk=await loadAmapSdk(config),probe=(window as any).stage6Probe;
  const Map=function(this:any,...args:any[]){const instance=new (sdk.Map as any)(...args);probe.created++;const destroy=instance.destroy.bind(instance);instance.destroy=()=>{probe.destroyed++;return destroy()};return instance;};
  return {...sdk,Map} as any;
 }}:({configuration:async()=>({jsReady:true,webConfigured:true,travelModes:["walking"] as "walking"[]}),loadSdk:async()=>mockSdk}),[]);
 useEffect(()=>{fetch("/tests/browser/stage9-map.json").then(r=>r.json()).then(setMap)},[]);
 const doc:any={kind:"html",schemaVersion:"rui/1",sessionId:"stage9",surfaceId:"game",messageId:"r",revision:1,serverManaged:false,artifact:{title:"生命周期游戏",relativePath:"game.html",previewUrl:"/tool/v1/file_tool/preview/stage9/game.html",downloadUrl:""}};
 return <main style={{width:"100%",maxWidth:1040,margin:"auto",padding:16,boxSizing:"border-box"}}><h1>阶段 9 固定数据验收</h1><p>模拟数据与 SDK，仅用于可重复的界面与性能测试。</p>
  <button onClick={()=>{const next=version+1;setVersion(next);sessionStorage.setItem("stage9.report",String(next))}}>修改原研究报告</button>
  <button onClick={()=>setFlags(flags.maps?disabledUiFeatures:legacyUiFeatures)}>切换独立开关</button>
  <button onClick={()=>setResync(true)}>模拟研究版本断线</button>
  <button onClick={()=>setShown(v=>!v)}>装卸地图</button><button onClick={()=>setGame(v=>!v)}>装卸游戏</button>
  <UiFeaturesContextProvider value={flags}><GenUiActionBridge/>
   <section data-case="research"><GenUiSurface surface={{sessionId:"stage9",surfaceId:"report",originRequestId:"research",tree:report(version),surfaceRevision:version,patchCount:0,needsResync:resync,requiredRevision:version+1,serverManaged:false} as any}/></section>
   <section data-case="split"><GenUiSurface surface={{sessionId:"stage9",surfaceId:"split",originRequestId:"split",tree:split,surfaceRevision:1,patchCount:0,needsResync:false,serverManaged:true} as any}/></section>
   <section data-case="map"><MapRuntimeProvider value={runtime}>{shown&&map&&<GenUiInline tree={{root:node("MapWidget","map",{mapData:map})}} sessionId="stage9" messageId="map" surfaceId={map.surfaceId}/>}</MapRuntimeProvider></section>
   <section data-case="game">{game&&<HtmlArtifact document={doc}/>}</section>
  </UiFeaturesContextProvider>
  <UiFeaturesProvider><span data-live-flags>服务端开关由生产 Provider 读取</span></UiFeaturesProvider>
 </main>;
}
createRoot(document.getElementById("root")!).render(<Harness/>);




