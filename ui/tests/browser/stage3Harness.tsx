// Deterministic consumer fixture; the raw upstream producer is tested separately with FluxSink.
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import Dialogue from "../../src/components/Dialogue";
import { projectSessionSurfaces } from "../../src/utils/chat/surfaceProtocol";
import "../../src/global.css";
const startedAt=Date.now();
let firstUsefulAt=0;
const tree=(b=false)=>({schemaVersion:"1",root:{kind:"Card",nodeId:"root",props:{title:"渐进界面"},children:[
  {kind:"Form",nodeId:"form",props:{formId:"f"},children:[{kind:"Input",nodeId:"a",props:{name:"a",value:"A",placeholder:"A 在生成中即可输入"}}]},
  ...(b?[{kind:"Stat",nodeId:"b",props:{label:"完成的 B",value:"B"}}]:[]),
]}});
function Harness(){
  const [events,setEvents]=useState<any[]>([]);
  const [done,setDone]=useState(false);
  const [validSequence,setValidSequence]=useState(0);
  const [log,setLog]=useState<any[]>([]);
  function emit(mode:string){
    const now=Date.now();firstUsefulAt ||= now;
    const sequence=mode==="duplicate"?validSequence:mode==="gap"?validSequence+2:validSequence+1;
    const snapshot:any=tree(mode==="complete");
    if(mode==="invalid")snapshot.root.children.push({kind:"Stat",nodeId:"bad",props:{value:{bad:true}}});
    const status=mode==="cancel"?"cancelled":mode==="complete"?"completed":"committed";
    const event={protocol:"rui-stream/1",sessionId:"fixture-stage3",surfaceId:"progressive-a",messageId:"r1",generationId:"g1",sequence,baseRevision:sequence-1,revision:sequence,status,startedAt,firstUsefulAt,emittedAt:now,snapshot};
    // Invalid/gap events are deliberately added as transport facts; reducer decides whether to commit.
    setEvents([...events,{messageType:"ui_stream",messageId:`g1:${sequence}:${mode}`,resultMap:event}]);
    setLog([...log,{mode,sequence,status,at:now}]);
    if(["a","complete","cancel"].includes(mode))setValidSequence(sequence);
    if(mode==="complete"||mode==="cancel")setDone(true);
  }
  const chat:any={requestId:"r1",sessionId:"fixture-stage3",query:"渐进编译确定性验收",agentType:"react",loading:!done,tasks:[events]};
  return <div style={{maxWidth:900,margin:"auto",padding:24}}>
    <h1>阶段 3 渐进编译验收</h1>
    <div role="status" data-upstream-done={done}>上游{done?"已结束":"尚未结束"}</div>
    {[['a','提交完整 A'],['invalid','发送非法 B'],['duplicate','发送重复事件'],['gap','发送乱序事件'],['cancel','取消生成'],['complete','完成生成']].map(([mode,label])=><button style={{margin:8}} key={mode} onClick={()=>emit(mode)}>{label}</button>)}
    <Dialogue chat={chat} deepThink={false} sessionSurfaces={projectSessionSurfaces([chat]).get("r1")} />
    <pre data-event-log>{JSON.stringify(log,null,2)}</pre>
  </div>;
}
createRoot(document.getElementById("root")!).render(<Harness/>);
