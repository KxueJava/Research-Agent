import {useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import GenUiSurface from '../../src/components/genui/GenUiSurface';
import GenUiActionBridge from '../../src/components/genui/GenUiActionBridge';
import HtmlArtifact from '../../src/components/artifacts/HtmlArtifact';
import {readHtmlDocument} from '../../src/utils/chat/htmlSurfaces';
import {fetchUiSurfaceSnapshots} from '../../src/services/uiSurface';
import {clearGenUiSession} from '../../src/components/genui/genUiSessionState';
import '../../src/global.css';
const sessionId=new URLSearchParams(location.search).get('session')||'recovery-fixture';
function Harness(){const [documents,setDocuments]=useState<any[]>([]),[error,setError]=useState(''),[shown,setShown]=useState(true),[messages,setMessages]=useState<string[]>([]);
  useEffect(()=>{fetchUiSurfaceSnapshots(sessionId).then(setDocuments).catch(e=>setError(e.message));return()=>clearGenUiSession(sessionId)},[]);
  return <main style={{padding:24,maxWidth:1100,margin:'auto'}}><h1>阶段7 · 恢复协议测试夹具</h1><p>此页用于确定性验收，不代表真实业务数据。</p>
    <GenUiActionBridge sendMessage={text=>setMessages(v=>[...v,text])}/><button onClick={()=>{setShown(false);clearGenUiSession(sessionId)}}>离开并清理会话</button>{error&&<p role="alert">{error}</p>}
    {shown&&documents.map(doc=>{const html=readHtmlDocument(doc,sessionId);return <div data-recovery-surface={doc.surfaceId} key={doc.surfaceId}>{html?<HtmlArtifact document={html}/>:<GenUiSurface surface={{sessionId,surfaceId:doc.surfaceId,originRequestId:doc.messageId,tree:doc.tree,surfaceRevision:doc.revision,patchCount:0,needsResync:false,serverManaged:true} as any}/>}</div>})}<pre data-recovery-messages>{JSON.stringify(messages)}</pre>
  </main>;
}
createRoot(document.getElementById('root')!).render(<Harness/>);
