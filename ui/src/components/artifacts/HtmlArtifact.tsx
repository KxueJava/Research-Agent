import { useEffect, useMemo, useRef, useState } from "react";
import { Code2, Download, Maximize2, PanelRight, Play, RotateCcw, X } from "lucide-react";
import HTMLRenderer from "../ActionPanel/HTMLRenderer";
import { readHtmlSource } from "../ActionPanel/prepareHtmlPreview";
import { fetchHtmlSurface } from "@/services/htmlSurface";
import type { HtmlArtifactDocument } from "@/utils/chat/htmlSurfaces";
import { artifactFrameKey, artifactRevisionOptions, acceptArtifactResponse } from "./artifactView";
import type { RuntimeMessage } from "./runtimeBridge";
import { useSurfaceMode } from "./useSurfaceMode";
import "./artifact.css";
import {createInteractionRecovery,type RecoveryStatus} from '../genui/interactionRecovery';
import RecoveryNotice from '../genui/RecoveryNotice';
import {readHtmlDocument} from '@/utils/chat/htmlSurfaces';
import {clearGenUiSession} from '../genui/genUiSessionState';

export default function HtmlArtifact({ document: original }: { document: HtmlArtifactDocument }) {
  const [latest, setLatest] = useState(original);
  const [historical, setHistorical] = useState<HtmlArtifactDocument | null>(null);
  const { mode, setMode, host } = useSurfaceMode();
  const [source, setSource] = useState(false);
  const [sourceText, setSourceText] = useState("");
  const [run, setRun] = useState(0);
  const [paused, setPaused] = useState(false);
  const [runtimeState, setRuntimeState] = useState("正在加载");
  const [runtimeError, setRuntimeError] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const selection = useRef(0);
  const versionAbort = useRef<AbortController | null>(null);
  const recovery=useRef<ReturnType<typeof createInteractionRecovery>|null>(null);
  const artifactState=useRef({artifactRevision:0,sourceVisible:false});
  const [recoveryStatus,setRecoveryStatus]=useState<RecoveryStatus>({phase:'loading',message:''});
  const current = historical || (original.revision > latest.revision ? original : latest);
  const newest = original.revision > latest.revision ? original : latest;
  const newestRef=useRef(newest);newestRef.current=newest;
  const frameKey = artifactFrameKey(current, run);
  const runtimeId = useMemo(() => typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`, [frameKey]);
  useEffect(() => { setRuntimeState("正在加载"); setRuntimeError(""); }, [frameKey]);

  useEffect(() => {
    if (!original.serverManaged) return;
    const controller=createInteractionRecovery(original,{
      revision:()=>newestRef.current.revision,read:()=>({...artifactState.current}),
      document:raw=>{const doc=readHtmlDocument(raw,original.sessionId,original.surfaceId);if(doc&&doc.revision>=newestRef.current.revision){newestRef.current=doc;setLatest(old=>doc.revision>old.revision?doc:old)}},
      apply:(state,doc)=>{
        const revision=Number.isSafeInteger(state.artifactRevision)&&Number(state.artifactRevision)>=0&&Number(state.artifactRevision)<=doc.revision?Number(state.artifactRevision):0;
        const sourceVisible=state.sourceVisible===true;const previous=artifactState.current;
        artifactState.current={artifactRevision:revision,sourceVisible};setSource(sourceVisible);
        if(previous.artifactRevision!==revision)void chooseVersion(revision||doc.revision,false);
      },deleted:()=>{selection.current++;versionAbort.current?.abort();clearGenUiSession(original.sessionId)}
    },setRecoveryStatus);recovery.current=controller;void controller.start();
    const poll=setInterval(()=>{if(!document.hidden)void controller.poll()},5000);
    return()=>{clearInterval(poll);controller.stop();if(recovery.current===controller)recovery.current=null};
  }, [original.sessionId, original.surfaceId,original.serverManaged]);
  useEffect(() => () => { selection.current++; versionAbort.current?.abort(); }, []);

  useEffect(() => {
    if (!source) return;
    const controller = new AbortController();
    setSourceText("正在读取源码…");
    void readHtmlSource(current.artifact.previewUrl, controller.signal).then(text => {
      if (!controller.signal.aborted) setSourceText(text);
    }).catch(() => { if (!controller.signal.aborted) setSourceText("源码读取失败，请切回预览后重试。"); });
    return () => controller.abort();
  }, [source, current.artifact.previewUrl]);

  const chooseVersion = async (revision: number,persist=true) => {
    const request = ++selection.current;
    versionAbort.current?.abort(); setError("");
    if(persist){artifactState.current={...artifactState.current,artifactRevision:revision===newestRef.current.revision?0:revision};recovery.current?.changed()}
    if (revision === newestRef.current.revision) { setHistorical(null); setBusy(false); return; }
    const controller = new AbortController(); versionAbort.current = controller; setBusy(true);
    try {
      const doc = await fetchHtmlSurface(original.sessionId, original.surfaceId, revision, controller.signal);
      if (!controller.signal.aborted && acceptArtifactResponse(request, selection.current, doc.revision, revision)) setHistorical(doc);
    } catch (cause) { if (!controller.signal.aborted && selection.current === request) setError(cause instanceof Error ? cause.message : "版本读取失败"); }
    finally { if (selection.current === request) setBusy(false); }
  };
  const receive = (message: RuntimeMessage) => {
    if (message.type === "error") { setRuntimeError(message.message || "页面脚本执行出错"); setRuntimeState("运行出错"); }
    else setRuntimeState(message.type === "paused" ? "已暂停" : "运行中");
  };
  if(recoveryStatus.phase==='deleted')return <RecoveryNotice status={recoveryStatus} reload={()=>{}} retry={()=>{}}/>;
  return <section className="artifact-slot" aria-label={`${newest.artifact.title} HTML 画布`}>
    <div ref={host} popover={mode === "inline" ? undefined : "manual"} className="artifact-surface" data-mode={mode} data-surface-id={original.surfaceId}>
      <header className="artifact-toolbar">
        <div className="artifact-title"><Code2 size={16} /><strong title={newest.artifact.relativePath}>{newest.artifact.title}</strong><span>HTML · v{current.revision}</span></div>
        <div className="artifact-actions">
          <button type="button" aria-label="切换源码" aria-pressed={source} onClick={() => {artifactState.current={...artifactState.current,sourceVisible:!source};setSource(!source);recovery.current?.changed()}}><Code2 size={15} />源码</button>
          <button type="button" title="重新运行会重置当前页面进度" onClick={() => { setRun(value => value + 1); setPaused(false); }}><RotateCcw size={15} />重新运行</button>
          {newest.serverManaged && newest.revision > 1 ? <select aria-label="产物版本" value={current.revision} onChange={event => void chooseVersion(Number(event.target.value))}>{artifactRevisionOptions(newest.revision, current.revision).map(revision => <option key={revision} value={revision}>v{revision}{revision === newest.revision ? " · 最新" : " · 历史预览"}</option>)}</select> : null}
          {current.artifact.downloadUrl ? <a href={current.artifact.downloadUrl} download title="下载当前版本 HTML" aria-label="下载 HTML"><Download size={15} /></a> : null}
          <button type="button" aria-label={mode === "sidebar" ? "返回聊天" : "侧栏展示"} onClick={() => setMode(mode === "sidebar" ? "inline" : "sidebar")}><PanelRight size={15} /></button>
          <button type="button" aria-label={mode === "immersive" ? "退出沉浸" : "沉浸展示"} onClick={() => setMode(mode === "immersive" ? "inline" : "immersive")}><Maximize2 size={15} /></button>
          {mode !== "inline" ? <button type="button" aria-label="关闭扩展画布" onClick={() => setMode("inline")}><X size={16} /></button> : null}
        </div>
      </header>
      <div className="artifact-status" role="status"><span>{busy ? "读取版本中…" : runtimeState}</span>{historical ? <span>历史版本预览，不覆盖源码 <button type="button" onClick={() => void chooseVersion(newest.revision)}>回到最新</button></span> : null}<button type="button" aria-pressed={paused} onClick={() => setPaused(value => !value)}><Play size={12} />{paused ? "继续" : "暂停"}</button></div>
      {error || runtimeError ? <div className="artifact-error" role="alert">{error || runtimeError}</div> : null}
      {original.serverManaged&&<RecoveryNotice status={recoveryStatus} reload={()=>void recovery.current?.reload()} retry={()=>void recovery.current?.retry()}/>}
      <div className="artifact-body">
        <div className="artifact-frame" aria-hidden={source} inert={source} style={{ display: "flex", visibility: source ? "hidden" : "visible" }}>
          <HTMLRenderer key={frameKey} htmlUrl={current.artifact.previewUrl} runtime={{ id: runtimeId, paused: paused || source, onMessage: receive }} />
        </div>
        {source ? <pre className="artifact-source" tabIndex={0}>{sourceText}</pre> : null}
      </div>
    </div>
  </section>;
}
