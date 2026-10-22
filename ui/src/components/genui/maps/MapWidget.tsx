import {useEffect,useLayoutEffect,useMemo,useRef,useState,useSyncExternalStore} from "react";
import {Clock3,Footprints,Map as MapIcon,Maximize2,Minus,Plus,RotateCcw,Route,X,LocateFixed,MessageSquare,RefreshCw,Car} from "lucide-react";
import {useGenUiRenderContext} from "../GenUiRenderContext";
import {useSurfaceMode} from "../../artifacts/useSurfaceMode";
import {subscribeUiActions,surfaceUiActions,uiActionSnapshot} from "../uiActionState";
import {fireGenUiControl} from "../genUiActionBus";
import {getMapView,mapError} from "@/services/maps";
import {mapDataSchema,mapPlaces,mapScopeKey,mapViewport,type MapData,type MapPlace,type MapScope,type TravelMode} from "./mapTypes";
import {acceptMapData,changeMapView,failMapEdit,initializeMap,mapSessionEpoch,mapSnapshot,readMapState,rememberMapPlace,restoreMapView,selectMapPlace,startMapEdit,subscribeMaps} from "./mapStore";
import {runMapEdit} from "./mapActions";
import {createMapViewWriter} from "./mapViewWriter";
import {createAmapMap,type MapAdapter} from "./amapProvider";
import {useMapRuntime} from "./MapRuntime";
import ItinerarySidebar,{mapLegLabel} from "./ItinerarySidebar";
import MapPlacePhoto from "./MapPlacePhoto";
import UiActionPanel from "../UiActionPanel";
import {MapPhotosProvider,MapPhotoNotice} from "./MapPhotos";
import MapPlaceDetail from "./MapPlaceDetail";
import {openMapDetails,closeMapDetails,mapDetailsSnapshot,subscribeMapDetails} from "./mapDetailsState";
import PlaceSearchDialog from "./PlaceSearchDialog";
import {createMapFollowup} from "./mapFollowup";
import "./maps.css";
import {useUiFeatures} from "../UiFeatures";

type Props={mapData:unknown;remoteAction?:{id?:string}};
export default function MapWidget(props:Props){
  const features=useUiFeatures();
  const context=useGenUiRenderContext();const parsed=useMemo(()=>mapDataSchema.safeParse(props.mapData),[props.mapData]);
  if(!parsed.success)return <div role="alert">地图数据无效：坐标、版本或道路分段未通过校验。</div>;
  if(!context.sessionId||!context.surfaceId||!context.nodeId||context.surfaceId!==parsed.data.surfaceId)return <div role="alert">地图缺少有效的会话和 Surface 身份。</div>;
  if(!features.maps)return <section aria-label="历史行程" className="rounded-xl border p-4"><p role="status">地图功能已关闭，历史行程仍可阅读。</p><h3>{parsed.data.title}</h3><ol>{mapPlaces(parsed.data).map(place=><li key={place.placeId}>{place.name}{place.address?` · ${place.address}`:""}</li>)}</ol><UiActionPanel sessionId={context.sessionId} surfaceId={context.surfaceId} baseRevision={context.baseRevision??parsed.data.revision} compact readOnly/></section>;
  return <MapReady data={parsed.data} actionId={props.remoteAction?.id} scope={{sessionId:context.sessionId,surfaceId:context.surfaceId,nodeId:context.nodeId}}/>;
}
function MapReady({data,actionId:registeredActionId,scope:input}:{data:MapData;actionId?:string;scope:MapScope}){
  const features=useUiFeatures(),actionId=features.actions?registeredActionId:undefined;
  const renderContext=useGenUiRenderContext();
  const activeDetails=useSyncExternalStore(subscribeMapDetails,mapDetailsSnapshot,mapDetailsSnapshot);
  const scope=useMemo(()=>input,[input.sessionId,input.surfaceId,input.nodeId]),key=mapScopeKey(scope),runtime=useMapRuntime();
  const {host,mode,setMode}=useSurfaceMode(),container=useRef<HTMLDivElement>(null),adapter=useRef<MapAdapter|null>(null),strip=useRef<HTMLDivElement>(null);
  const cameraMode=useRef('inline');
  const [sdkError,setSdkError]=useState(""),[sdkReady,setSdkReady]=useState(0),[sdkRetry,setSdkRetry]=useState(0),[viewLoaded,setViewLoaded]=useState(false),[viewError,setViewError]=useState("");
  const [search,setSearch]=useState<{replace?:string}|null>(null),[followup,setFollowup]=useState("");
  const [showFollowup,setShowFollowup]=useState(false);
  const [appTheme,setAppTheme]=useState<"dark"|"light">(()=>document.documentElement.classList.contains("dark")?"dark":"light");
  useEffect(()=>{const root=document.documentElement;const observer=new MutationObserver(()=>setAppTheme(root.classList.contains("dark")?"dark":"light"));observer.observe(root,{attributes:true,attributeFilter:["class"]});return()=>observer.disconnect();},[]);
  const [followupBusy,setFollowupBusy]=useState(false),[followupError,setFollowupError]=useState("");
  const writer=useRef<ReturnType<typeof createMapViewWriter>|null>(null),viewLoad=useRef<Promise<unknown>>(Promise.resolve());
  useSyncExternalStore(subscribeMaps,mapSnapshot,mapSnapshot);
  const actionRevision=useSyncExternalStore(subscribeUiActions,uiActionSnapshot,uiActionSnapshot),state=readMapState(scope);
  useEffect(()=>{initializeMap(scope,data);},[key,data]);
  useEffect(()=>()=>closeMapDetails(scope),[key]);
  useEffect(()=>{writer.current=createMapViewWriter(scope,setViewError);return()=>{writer.current?.dispose();writer.current=null;};},[key]);
  useEffect(()=>{
    let alive=true;const epoch=mapSessionEpoch(scope.sessionId);setViewLoaded(false);setViewError("");
    viewLoad.current=getMapView(scope).then(saved=>{if(!alive||epoch!==mapSessionEpoch(scope.sessionId))return;const untouched=!readMapState(scope)?.viewChanges;restoreMapView(scope,saved);if(untouched)adapter.current?.setView(mapViewport(saved.state,cameraMode.current));setViewLoaded(true);}).catch(()=>{if(alive)setViewError("视口暂时无法恢复；当前地图仍可使用，重新打开会话可重试。")});
    return()=>{alive=false;};
  },[key]);
  useEffect(()=>{
    let alive=true;const epoch=mapSessionEpoch(scope.sessionId);setSdkError("");
    void runtime.configuration(scope.sessionId).then(config=>{if(!alive)return;if(!config.jsReady)throw Error("高德地图尚未配置 JS API Key 与安全配置，已有行程列表可继续查看。使用独立 Web 服务 Key 才能搜索和计算路线。");return runtime.loadSdk(config);}).then(async sdk=>{
      await viewLoad.current;
      if(!alive||!sdk||epoch!==mapSessionEpoch(scope.sessionId)||!container.current)return;
      const instance=createAmapMap(container.current,sdk,{onSelect:id=>{selectMapPlace(scope,id);adapter.current?.select(id,true);openMapDetails(scope,id);},onView:view=>{const current=readMapState(scope);changeMapView(scope,{...view,viewports:{...current?.view.viewports,[cameraMode.current==='inline'?'inline':'expanded']:view}})},onError:setSdkError});
      adapter.current=instance;setSdkReady(v=>v+1);
    }).catch(error=>{if(alive)setSdkError(mapError(error));});
    const observer=typeof ResizeObserver!=="undefined"?new ResizeObserver(()=>adapter.current?.resize()):undefined;if(container.current)observer?.observe(container.current);
    return()=>{alive=false;observer?.disconnect();adapter.current?.destroy();adapter.current=null;};
  },[key,runtime,sdkRetry]);
  const places=useMemo(()=>state?(state.draftIds??mapPlaces(state.data).map(p=>p.placeId)).map(id=>state.knownPlaces.get(id)).filter((p):p is MapPlace=>Boolean(p)):[],[state?.data,state?.draftIds,state?.knownPlaces]);
  const stale=Boolean(state?.draftIds),travelMode=state?.draftMode??state?.data.travelMode??"walking";
  const detailPlace=activeDetails&&mapScopeKey(activeDetails.scope)===key?places.find(p=>p.placeId===activeDetails.placeId):undefined;
  useEffect(()=>{if(activeDetails&&mapScopeKey(activeDetails.scope)===key&&!detailPlace)closeMapDetails(scope);},[activeDetails,detailPlace,key]);
  useEffect(()=>{if(!state||!adapter.current)return;adapter.current.setData(places,state.data.route.geometry,stale);adapter.current.select(state.selectedPlaceId,false);if(Object.keys(state.view).length)adapter.current.setView(mapViewport(state.view,cameraMode.current));},[sdkReady,state?.data,places,stale]);
  useLayoutEffect(()=>{
    const instance=adapter.current,current=readMapState(scope),oldMode=cameraMode.current;
    if(oldMode===mode)return;cameraMode.current=mode;if(!instance||!current)return;
    const previous=instance.getView(),next=mapViewport(current.view,mode);
    changeMapView(scope,{...next,viewports:{...current.view.viewports,[oldMode==='inline'?'inline':'expanded']:previous}});
    instance.setView(next);
  },[mode,sdkReady,key]);
  useEffect(()=>{if(state)adapter.current?.select(state.selectedPlaceId,false);},[state?.selectedPlaceId,sdkReady]);
  useEffect(()=>{const list=strip.current,card=list?.querySelector<HTMLElement>('[data-selected="true"]');if(!list||!card||mode!=="inline")return;const a=list.getBoundingClientRect(),b=card.getBoundingClientRect();if(b.left<a.left+16||b.right>a.right-16)list.scrollTo({left:list.scrollLeft+b.left-a.left-16,behavior:matchMedia("(prefers-reduced-motion:reduce)").matches?"instant":"smooth"});},[state?.selectedPlaceId,mode]);
  // Legacy saved view themes must not override the application's global theme.
  const theme=appTheme;
  const is3D=(state?.view.pitch??0)>0;
  useEffect(()=>{adapter.current?.theme(theme);},[theme,sdkReady]);
  useEffect(()=>{
    if(!state?.viewChanges||!viewLoaded)return;
    const timer=setTimeout(()=>{void writer.current?.save();},500);
    return()=>clearTimeout(timer);
  },[key,state?.viewChanges,state?.data.revision,viewLoaded]);
  useEffect(()=>{
    const current=readMapState(scope);if(!current)return;
    const executions=surfaceUiActions(scope.sessionId,scope.surfaceId).filter(e=>e.componentId===scope.nodeId).sort((a,b)=>Number(b.createdAt??0)-Number(a.createdAt??0));
    const matching=executions.find(e=>(e.payload as any)?.requestId===current.requestId);
    if(matching){
      if(["failed","cancelled"].includes(matching.status))failMapEdit(scope,current.requestId!,matching.error||"路线更新已取消，保留上一条有效路线");
      if(matching.status==="completed"){
        const find=(node:any):any=>node?.nodeId===scope.nodeId?node:Array.isArray(node?.children)?node.children.map(find).find(Boolean):undefined;
        const raw=find(matching.result?.surface?.tree?.root)?.props?.mapData,parsed=mapDataSchema.safeParse(raw);if(parsed.success)acceptMapData(scope,parsed.data);
      }
    }else if(current.status==="ready"){
      const pending=executions.find(e=>["accepted","running","approval_required"].includes(e.status)&&(e.payload as any)?.requestId&&Array.isArray((e.payload as any)?.placeIds));
      if(pending){const p=pending.payload as any;startMapEdit(scope,p.placeIds,p.travelMode,p.requestId);}
    }
  },[actionRevision,key]);
  if(!state)return <div role="status">正在恢复地图行程…</div>;
  const edit=(ids:string[],mode:TravelMode=travelMode)=>{if(!actionId){setSdkError("当前地图没有可用的远程行程操作");return}if(ids.length<2||ids.length>10||new Set(ids).size!==ids.length){setFollowupError("请保留 2–10 个不同的路线节点。");return}void runMapEdit(scope,actionId,ids,mode);};
  const choose=(place:MapPlace)=>{rememberMapPlace(scope,place);const ids=state.draftIds??mapPlaces(state.data).map(p=>p.placeId);edit(search?.replace?ids.map(id=>id===search.replace?place.placeId:id):[...ids,place.placeId]);setSearch(null);};
  const select=(id:string)=>{selectMapPlace(scope,id);adapter.current?.select(id,true);openMapDetails(scope,id);};
  const summary=stale?"路线待更新":`${Math.ceil(state.data.route.durationSeconds/60)} 分钟行进 · ${(state.data.route.distanceMeters/1000).toFixed(1)} 公里`;
  return <MapPhotosProvider scope={scope} data={state.data}><div className="map-widget-slot"><div ref={host} popover={mode==="inline"?undefined:"manual"} className="artifact-surface intelligent-map" data-mode={mode} data-map-theme={theme} data-map-id={data.mapId} data-map-revision={state.data.revision} data-place-details-open={Boolean(detailPlace)}>
    <header className="map-header"><h2>{state.data.title}</h2><div className="map-summary"><span className="map-travel-badge">{travelMode==="walking"?<Footprints size={14}/>:<Car size={14}/>}全程{travelMode==="walking"?"步行":"驾车"}</span><span><Clock3 size={14}/>{summary}</span><span>{places.length} 个地点</span></div></header>
    <div className="map-content"><div className="map-visual"><h3 className="map-section-title"><MapIcon size={21}/>互动地图与{travelMode==="walking"?"步行":"驾车"}路线</h3><div className="map-viewport"><div ref={container} className="amap-host" aria-label="高德地图" data-map-host/>
      {sdkError&&<div className="map-load-error" role="alert"><MapIcon size={30}/><strong>地图暂不可用</strong><p>{sdkError}</p><button type="button" onClick={()=>setSdkRetry(v=>v+1)}>重试加载地图</button></div>}
      {!sdkError&&!sdkReady&&<div className="map-loading" role="status"><MapIcon size={28}/>正在加载地图…</div>}
      <div className="map-view-controls">
        {mode!=="inline"&&<button type="button" aria-label="返回对话" title="关闭展开地图" onClick={()=>setMode("inline")}><X size={20}/></button>}
        <button type="button" aria-label="查看完整路线" title="查看完整路线" onClick={()=>adapter.current?.fit()}><LocateFixed size={20}/></button>
        <div className="map-zoom-controls"><button type="button" aria-label="放大地图" title="放大地图" onClick={()=>adapter.current?.zoom(1)}><Plus size={20}/></button><button type="button" aria-label="缩小地图" title="缩小地图" onClick={()=>adapter.current?.zoom(-1)}><Minus size={20}/></button></div>
        <button type="button" aria-label="旋转地图" title="旋转地图" onClick={()=>{const rotation=((state.view.rotation??0)+30)%360;adapter.current?.setView({rotation});changeMapView(scope,{rotation});}}><RotateCcw size={18}/></button>
        <button type="button" aria-label={is3D?"切换到2D地图":"切换到3D地图"} title={is3D?"切换到2D地图":"切换到3D地图"} aria-pressed={is3D} disabled={!sdkReady} onClick={()=>{const pitch=is3D?0:50;adapter.current?.setView({pitch});changeMapView(scope,{pitch});}}><strong>{is3D?"2D":"3D"}</strong></button>
      </div>
      {mode==="inline"&&<button type="button" className="map-expand" aria-label="展开地图" title="展开地图" onClick={()=>setMode("immersive")}><Maximize2 size={21}/></button>}
      <div ref={strip} className="map-place-strip" aria-label="地图地点卡片">{places.map((place,index)=><button key={place.placeId} type="button" className="map-overlay-card" data-selected={state.selectedPlaceId===place.placeId} aria-pressed={state.selectedPlaceId===place.placeId} onClick={()=>select(place.placeId)}><MapPlacePhoto place={place}/><span className="map-overlay-copy"><span className="map-overlay-caption">{index===0?"从这里开始":mapLegLabel(state.data,places,index,stale)}</span><strong>{place.name}</strong><span className="map-overlay-address">{place.address||"供应商未提供地址"}</span></span></button>)}</div>
      <div className="map-source">{state.data.provider==="mock"?"测试数据 · 非真实导航":"高德地图"}</div>
    </div><p className="map-route-note">地图按{travelMode==="walking"?"步行":"驾车"}方式串联各地点。实际通行情况可能临时调整，请以现场指示为准。</p></div>
    <section className="map-route-panel" aria-label="路线与地点"><div className="map-panel-heading"><span>{places.length} 个地点</span><h3>{state.data.title}</h3><p className="map-summary">{summary}</p></div><h3 className="map-itinerary-heading">行程地点</h3>
      {renderContext.surfaceSync&&<div className="map-view-warning" data-map-sync role="status">{renderContext.surfaceSync.message}<button type="button" disabled={renderContext.surfaceSync.busy} onClick={renderContext.surfaceSync.retry}>{renderContext.surfaceSync.busy?"正在同步…":"重新同步"}</button></div>}
      <ItinerarySidebar places={places} selected={state.selectedPlaceId} data={state.data} stale={stale} disabled={!actionId} select={select} edit={edit} replace={id=>setSearch({replace:id})}/>
      <footer className="map-footer"><div role="status" className={state.status==="failed"?"map-status-error":""}>{state.status==="updating"?"正在更新路线 · 虚线为上一条有效路线":state.status==="failed"?state.error+"；虚线与旧距离不代表新行程结果":"路线已同步"}{Date.now()-Date.parse(state.data.fetchedAt)>86400000&&" · 数据超过一天，可重新查询"}</div>
        <div className="map-footer-actions"><label className="map-mode-select"><Route size={15}/><select aria-label="地图交通方式" value={travelMode} disabled={!actionId} onChange={e=>edit(state.draftIds??places.map(p=>p.placeId),e.target.value as TravelMode)}><option value="walking">步行</option><option value="driving">驾车</option></select></label><button type="button" disabled={!actionId||places.length>=10} onClick={()=>setSearch({})}><Plus size={15}/>添加地点</button><button type="button" disabled={!actionId} onClick={()=>edit(state.draftIds??places.map(p=>p.placeId))}><RefreshCw size={15}/>{state.status==="failed"?"重试更新":"重新规划"}</button><button type="button" onClick={()=>setShowFollowup(true)}><MessageSquare size={15}/>修改行程</button></div>
        <time className="map-updated" dateTime={state.data.fetchedAt}>数据更新于 {new Date(state.data.fetchedAt).toLocaleString()}</time>
      </footer>
      {viewError&&<div className="map-view-warning" role="status">{viewError}<button type="button" onClick={async()=>{const saved=await writer.current?.reload();if(saved)adapter.current?.setView(mapViewport(saved.state,mode));}}>载入服务器视口</button><button type="button" onClick={()=>void writer.current?.retry()}>保留本页视口并重试</button></div>}
      <MapPhotoNotice/>
      {followupError&&<div className="map-view-warning" role="alert">{followupError}</div>}
      {registeredActionId&&<UiActionPanel sessionId={scope.sessionId} surfaceId={scope.surfaceId} baseRevision={renderContext.baseRevision??state.data.revision} compact/>}
    </section></div>
    {detailPlace&&<MapPlaceDetail scope={scope} place={detailPlace} revision={state.data.revision} mode={mode} theme={theme} onClose={()=>closeMapDetails(scope)} onLocate={()=>{adapter.current?.select(detailPlace.placeId,true);}}/>}
  </div>{search&&<PlaceSearchDialog sessionId={scope.sessionId} used={state.draftIds??places.map(p=>p.placeId)} replacing={search.replace} onChoose={choose} onClose={()=>setSearch(null)}/>}
  {showFollowup&&<MapFollowupDialog value={followup} onChange={setFollowup} busy={followupBusy} disabled={state.status==="updating"} error={followupError} onClose={()=>setShowFollowup(false)} onSubmit={async()=>{if(!followup.trim()||followupBusy||state.status==="updating")return;const epoch=mapSessionEpoch(scope.sessionId);setFollowupBusy(true);setFollowupError("");try{const content=await createMapFollowup(scope,followup);if(epoch!==mapSessionEpoch(scope.sessionId))return;const result=await fireGenUiControl({action:{type:"send_message",payload:{content}}},scope);if(!result.ok)throw Error("未能交给 Agent，请重试");setFollowup("");setShowFollowup(false);}catch(error){if(epoch===mapSessionEpoch(scope.sessionId))setFollowupError(mapError(error));}finally{setFollowupBusy(false);}}}/>}</div></MapPhotosProvider>;
}
function MapFollowupDialog({value,onChange,busy,disabled,error,onClose,onSubmit}:{value:string;onChange:(value:string)=>void;busy:boolean;disabled:boolean;error:string;onClose:()=>void;onSubmit:()=>Promise<void>}){
  const dialog=useRef<HTMLDialogElement>(null);
  useEffect(()=>{const element=dialog.current;const previous=document.activeElement; element?.showModal();return()=>{element?.close();if(previous instanceof HTMLElement&&previous.isConnected)previous.focus({preventScroll:true});};},[]);
  return <dialog ref={dialog} className="map-place-dialog" aria-label="修改地图行程" onCancel={onClose}>
    <h3>修改行程</h3><p>描述你想调整的地点或路线，Agent 会结合当前行程继续规划。</p>
    <form onSubmit={e=>{e.preventDefault();void onSubmit();}}><textarea autoFocus aria-label="继续修改地图行程" value={value} maxLength={4000} onChange={e=>onChange(e.target.value)} placeholder="例如：把最后一站换成一个适合看日落的地方" rows={4}/>{error&&<p role="alert">{error}</p>}<div className="map-dialog-actions"><button type="button" onClick={onClose}>取消</button><button type="submit" disabled={!value.trim()||busy||disabled}>{busy?"正在读取当前地图…":"交给 Agent"}</button></div></form>
  </dialog>;
}
