import {useEffect,useRef} from "react";
import {ArrowDown,ArrowUp,ArrowLeftRight,Trash2} from "lucide-react";
import type {MapPlace,MapData} from "./mapTypes";
import MapPlacePhoto from "./MapPlacePhoto";
type Props={places:MapPlace[];selected:string;data:MapData;stale:boolean;disabled:boolean;select:(id:string)=>void;edit:(ids:string[])=>void;replace:(id:string)=>void};
export function mapLegLabel(data:MapData,places:MapPlace[],index:number,stale:boolean){
  if(index===0)return "从这里开始";
  const leg=!stale?data.route.legs.find(l=>l.toPlaceId===places[index].placeId&&l.fromPlaceId===places[index-1]?.placeId):undefined;
  return leg?`${data.travelMode==="walking"?"步行":"驾车"}约 ${Math.ceil(leg.durationSeconds/60)} 分钟 · ${(leg.distanceMeters/1000).toFixed(1)} 公里`:"路段待更新";
}
export default function ItinerarySidebar({places,selected,data,stale,disabled,select,edit,replace}:Props){
  const list=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    // Never jump the conversation when selection changes; only scroll the bounded expanded list.
    const host=list.current;if(!host||host.scrollHeight<=host.clientHeight)return;
    const element=[...host.querySelectorAll<HTMLElement>("[data-place-id]")].find(n=>n.dataset.placeId===selected);if(!element)return;
    const area=host.getBoundingClientRect(),card=element.getBoundingClientRect();let top=host.scrollTop;
    if(card.top<area.top)top+=card.top-area.top;else if(card.bottom>area.bottom)top+=card.bottom-area.bottom;
    host.scrollTo({top,behavior:matchMedia("(prefers-reduced-motion:reduce)").matches?"instant":"smooth"});
  },[selected]);
  const ids=places.map(p=>p.placeId);
  const move=(index:number,step:number)=>{const next=[...ids];[next[index],next[index+step]]=[next[index+step],next[index]];edit(next);};
  return <div ref={list} className="map-itinerary" aria-label="行程地点">
    {places.map((place,index)=><article key={place.placeId} data-place-id={place.placeId} className={selected===place.placeId?"selected":""}>
      {index>0&&<div className="map-leg-divider"><span>{mapLegLabel(data,places,index,stale)}</span></div>}
      <div className="map-stop-label">{index===0?"从这里开始":index===places.length-1?"目的地":`第 ${index+1} 站`}</div>
      <button type="button" className="map-place-select" aria-pressed={selected===place.placeId} onClick={()=>select(place.placeId)}>
        <MapPlacePhoto place={place}/>
        <span className="map-place-copy"><span className="map-place-heading"><span className="map-place-number">{index+1}</span><strong>{place.name}</strong></span>
          <span className="map-place-address">{place.address||"供应商未提供地址"}</span>
          <span className="map-place-leg">{mapLegLabel(data,places,index,stale)}</span>
        </span>
      </button>
      <div className="map-place-actions" aria-label={`${place.name}行程操作`}>
        <button type="button" disabled={disabled||index===0} aria-label={`上移${place.name}`} onClick={()=>move(index,-1)}><ArrowUp size={14}/><span>上移</span></button>
        <button type="button" disabled={disabled||index===places.length-1} aria-label={`下移${place.name}`} onClick={()=>move(index,1)}><ArrowDown size={14}/><span>下移</span></button>
        <button type="button" disabled={disabled} onClick={()=>replace(place.placeId)}><ArrowLeftRight size={14}/>替换</button>
        <button type="button" disabled={disabled||places.length<=2} aria-label={`删除${place.name}`} onClick={()=>edit(ids.filter(id=>id!==place.placeId))}><Trash2 size={14}/><span>删除</span></button>
      </div>
    </article>)}
  </div>;
}
