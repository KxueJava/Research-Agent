import React,{useEffect,useMemo,useState} from "react";
import {createRoot} from "react-dom/client";
import GenUiSurface from "../../src/components/genui/GenUiSurface";
import GenUiActionBridge from "../../src/components/genui/GenUiActionBridge";
import {MapRuntimeProvider} from "../../src/components/genui/maps/MapRuntime";
import {fetchUiSurfaceSnapshots} from "../../src/services/uiSurface";
import {clearGenUiSession} from "../../src/components/genui/genUiSessionState";
import {mockSdk} from "./stage6MockSdk";
import "../../src/global.css";
const sessionId="map-fixture-stage6";
function Harness(){const [documents,setDocuments]=useState<any[]>([]),[shown,setShown]=useState(true),[error,setError]=useState(""),[messages,setMessages]=useState<string[]>([]);
  const runtime=useMemo(()=>({configuration:async()=>({jsReady:true,webConfigured:true,travelModes:["walking","driving"] as ("walking"|"driving")[]}),loadSdk:async()=>mockSdk}),[]);
  useEffect(()=>{fetchUiSurfaceSnapshots(sessionId).then(setDocuments).catch(e=>setError(e.message));},[]);
  return <main style={{maxWidth:1300,margin:"auto",padding:24}}><h1>阶段六 · 显式 Mock Provider 交互验收</h1><p>本页仅为测试夹具，非高德真实接口结果。</p><GenUiActionBridge sendMessage={message=>setMessages(v=>[...v,message])}/><button onClick={()=>{setShown(false);clearGenUiSession(sessionId)}}>离开并清理地图会话</button>{error&&<p role="alert">{error}</p>}
  <MapRuntimeProvider value={runtime}>{shown&&documents.map(d=><div key={d.surfaceId} data-fixture-map={d.surfaceId}><GenUiSurface surface={{sessionId,surfaceId:d.surfaceId,originRequestId:d.messageId,tree:d.tree,surfaceRevision:d.revision,patchCount:0,needsResync:new URLSearchParams(location.search).has('resync'),requiredRevision:100,serverManaged:true} as any}/></div>)}</MapRuntimeProvider><pre data-map-messages>{JSON.stringify(messages)}</pre></main>;
}
createRoot(document.getElementById("root")!).render(<Harness/>);
