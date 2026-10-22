import {useEffect,useRef,useState} from "react";
import {searchMapPlaces,mapError} from "@/services/maps";
import type {MapPlace} from "./mapTypes";
export default function PlaceSearchDialog({sessionId,used,replacing,onChoose,onClose}:{sessionId:string;used:string[];replacing?:string;onChoose:(place:MapPlace)=>void;onClose:()=>void}){
  const dialog=useRef<HTMLDialogElement>(null),request=useRef<AbortController|null>(null);
  const [query,setQuery]=useState(""),[city,setCity]=useState(""),[places,setPlaces]=useState<MapPlace[]>([]),[error,setError]=useState(""),[busy,setBusy]=useState(false);
  useEffect(()=>{dialog.current?.showModal();return()=>{request.current?.abort();dialog.current?.close();};},[]);
  const search=async()=>{request.current?.abort();const controller=new AbortController();request.current=controller;setBusy(true);setError("");try{const candidates=await searchMapPlaces(sessionId,query,city,controller.signal);if(!controller.signal.aborted)setPlaces(candidates);}catch(error){if(!controller.signal.aborted)setError(mapError(error));}finally{if(!controller.signal.aborted)setBusy(false);}};
  return <dialog ref={dialog} className="map-place-dialog" aria-labelledby="map-search-title" onCancel={onClose} onClick={e=>{if(e.target===dialog.current)onClose();}}>
    <h3 id="map-search-title">{replacing?"替换地点":"添加地点"}</h3><p>搜索真实地点并选择候选结果；不会推断你的当前位置。</p>
    <form onSubmit={e=>{e.preventDefault();void search();}}><input aria-label="地点名称" autoFocus placeholder="地点名称或完整地址" value={query} maxLength={120} onChange={e=>setQuery(e.target.value)}/><input aria-label="搜索城市" placeholder="城市（可选，用于消歧）" value={city} maxLength={80} onChange={e=>setCity(e.target.value)}/><button disabled={busy||!query.trim()}>{busy?"搜索中…":"搜索地点"}</button></form>
    {error&&<p role="alert">{error}</p>}
    <div className="map-search-results">{places.map(place=><button type="button" disabled={used.includes(place.placeId)} key={place.placeId} onClick={()=>onChoose(place)}><strong>{place.name}</strong><span>{place.address}</span>{used.includes(place.placeId)&&<small>已在行程中</small>}</button>)}{!busy&&!error&&places.length===0&&<p>输入地名搜索。无匹配时可补充城市或更完整的地址。</p>}</div>
    <button type="button" onClick={onClose}>取消</button>
  </dialog>;
}
