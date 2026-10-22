// Production components and upload API, synthetic data chosen by the browser test.
import React,{useState,useSyncExternalStore} from "react";
import {createRoot} from "react-dom/client";
import GenUiInline from "../../src/components/genui/GenUiInline";
import GenUiActionBridge from "../../src/components/genui/GenUiActionBridge";
import {getResource,resourceSnapshot,subscribeResources} from "../../src/components/genui/resources/resourceStore";
import {clearGenUiSession} from "../../src/components/genui/genUiSessionState";
import "../../src/global.css";
import salesFixture from './stage9-sales.csv?raw';
const sessionId=new URLSearchParams(location.search).get("session")||"stage4-upload-fixture";
const node=(kind:string,nodeId:string,props:any,children?:any[])=>({kind,nodeId,props,...(children?{children}:{})});
const ref={id:"sales",column:"revenue",groupBy:"product",aggregate:"sum",money:true,selectionNodeId:"selected",filters:[{column:"month",op:"eq",value:{fromNode:"month"}}],sort:{fromNode:"sort"}};
const tree={root:node("Card","root",{title:"销售分析与分账"},[
  node("FileInput","csv",{resourceId:"sales",numericColumns:["quantity","unit_price","revenue"],label:"上传销售 CSV"}),
  node("Form","filters",{formId:"shared-name"},[
    node("Select","month",{name:"month",label:"月份",value:"",options:[{label:"全部月份",value:""},"2026-01","2026-02","2026-03","无数据"]}),
    node("Select","sort",{name:"sort",label:"排序",value:"revenue:desc",options:[{label:"金额降序",value:"revenue:desc"},{label:"金额升序",value:"revenue:asc"}]}),
    node("Button","reset",{label:"清除月份筛选",action:{type:"set_state",payload:{nodeId:"month",value:""}}}),
  ]),
  node("Stat","total",{label:"当前销售额",dataRef:ref}),
  node("Chart","chart",{chart:"bar",dataRef:ref}),node("Table","table",{dataRef:ref}),
  node("Stat","selected-total",{label:"已选销售额",dataRef:{...ref,selectedOnly:true}}),
  node("Form","split-form",{formId:"split"},[
    node("NumberInput","amount",{name:"amount",label:"账单金额",value:100}),
    node("NumberInput","people",{name:"people",label:"人数",value:3,integer:true}),
    node("Stat","split-result",{label:"每人金额",computation:{op:"split",amount:{fromNode:"amount"},people:{fromNode:"people"}}}),
  ]),
])};
function Harness(){
  useSyncExternalStore(subscribeResources,resourceSnapshot,resourceSnapshot);
  const [mounted,setMounted]=useState(true);
  return <main style={{maxWidth:1200,margin:"auto",padding:24}}>
    <h1>阶段 4 数据资源验收</h1><GenUiActionBridge sendMessage={()=>{throw Error("Local interaction must not start an Agent");}}/>
    <button onClick={()=>{
      // Synthetic fixture bytes only. Exercise the original production FileInput
      // change handler and real upload service without extension filesystem access.
      const input=document.querySelector<HTMLInputElement>('[data-fixture-surface="A"] input[type="file"]');
      if(!input)return;
      const transfer=new DataTransfer();transfer.items.add(new File([salesFixture],'sales.csv',{type:'text/csv'}));
      input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));
    }}>上传内置合成 CSV（真实服务）</button>
    <button onClick={()=>{setMounted(false);clearGenUiSession(sessionId);}}>离开并清理会话</button>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>{mounted&&["A","B"].map(id=><div data-fixture-surface={id} key={id}>
      <h2>画布 {id}</h2><GenUiInline tree={tree} sessionId={sessionId} messageId="stage4" surfaceId={`stage4-${id}`}/>
    </div>)}</div>
    <pre data-resource-probe>{JSON.stringify(["A","B"].map(id=>getResource({sessionId,surfaceId:`stage4-${id}`},"sales")??null))}</pre>
  </main>;
}
createRoot(document.getElementById("root")!).render(<Harness/>);
