// Uses production components and authenticated APIs; the persisted fixture is seeded separately.
import React,{useEffect,useState} from "react";
import {createRoot} from "react-dom/client";
import GenUiSurface from "../../src/components/genui/GenUiSurface";
import GenUiActionBridge from "../../src/components/genui/GenUiActionBridge";
import {fetchUiSurface} from "../../src/services/uiSurface";
import "../../src/global.css";
const params=new URLSearchParams(location.search),sessionId=params.get("session")!,surfaceId=params.get("surface")!;
function Harness(){
  const [snapshot,setSnapshot]=useState<any>(),[error,setError]=useState(""),[messages,setMessages]=useState<string[]>([]);
  useEffect(()=>{fetchUiSurface(sessionId,surfaceId).then(setSnapshot).catch(e=>setError(e.message));},[]);
  return <main style={{maxWidth:1000,margin:"auto",padding:24}}><h1>阶段 5 真实远程动作验收</h1>
    <GenUiActionBridge sendMessage={message=>setMessages(current=>[...current,message])}/>
    {error&&<div role="alert">{error}</div>}
    {snapshot&&<GenUiSurface surface={{sessionId,surfaceId,originRequestId:snapshot.messageId,tree:snapshot.tree,surfaceRevision:snapshot.revision,serverManaged:true,needsResync:false,patchCount:0} as any}/>}
    <pre data-agent-messages>{JSON.stringify(messages)}</pre>
  </main>;
}
createRoot(document.getElementById("root")!).render(<Harness/>);
