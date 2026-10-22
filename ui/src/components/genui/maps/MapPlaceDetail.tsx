import {useEffect,useId,useRef,useState} from "react";
import {ChevronLeft,ChevronRight,Clock3,ExternalLink,MapPin,Navigation,Phone,Star,X} from "lucide-react";
import {getMapPlaceDetails,mapError} from "@/services/maps";
import {mapScopeKey,type MapPlace,type MapPlaceDetails,type MapScope} from "./mapTypes";
import {useMapPhotos} from "./MapPhotos";
import MapPlaceIntroduction from "./MapPlaceIntroduction";

type Props={scope:MapScope;place:MapPlace;revision:number;mode:string;theme:string;onClose:()=>void;onLocate:()=>void};
export default function MapPlaceDetail({scope,place,revision,mode,theme,onClose,onLocate}:Props){
  const panel=useRef<HTMLElement>(null),closeButton=useRef<HTMLButtonElement>(null),returnFocus=useRef<HTMLElement|null>(null);
  const titleId=useId(),key=`${mapScopeKey(scope)}:${revision}:${place.placeId}`,photos=useMapPhotos();
  const [result,setResult]=useState<{key:string;details?:MapPlaceDetails;error?:string}>(),[retry,setRetry]=useState(0),[imageIndex,setImageIndex]=useState(0),[broken,setBroken]=useState<string[]>([]);
  useEffect(()=>{returnFocus.current=document.activeElement instanceof HTMLElement?document.activeElement:null;return()=>{const previous=returnFocus.current;if(previous?.isConnected)previous.focus({preventScroll:true});};},[]);
  useEffect(()=>{
    const element=panel.current;if(!element)return;
    // Re-order the top layer after expanding the map, without moving the SDK host.
    if(element.matches(":popover-open"))element.hidePopover();element.showPopover();
    closeButton.current?.focus({preventScroll:true});
    return()=>{if(element.matches(":popover-open"))element.hidePopover();};
  },[mode]);
  useEffect(()=>{const escape=(event:KeyboardEvent)=>{if(event.key==="Escape"&&!document.querySelector("dialog[open]")){event.preventDefault();event.stopImmediatePropagation();onClose();}};document.addEventListener("keydown",escape,true);return()=>document.removeEventListener("keydown",escape,true);},[onClose]);
  useEffect(()=>{
    const controller=new AbortController();setResult({key});setImageIndex(0);setBroken([]);panel.current?.scrollTo({top:0});
    void getMapPlaceDetails(scope,place.placeId,controller.signal).then(value=>{
      if(controller.signal.aborted)return;
      if(value.mapRevision!==revision||value.placeId!==place.placeId||value.details.place.placeId!==place.placeId)throw Error("景点资料已变化，请重试读取");
      setResult({key,details:value.details});
    }).catch(error=>{if(!controller.signal.aborted)setResult({key,error:mapError(error)});});
    return()=>controller.abort();
  },[key,retry]);
  const current=result?.key===key?result:undefined,details=current?.details;
  const fallback=place.photoUrl||photos.urls[place.placeId];
  const images=[...new Set([...(details?.photos??[]),...(fallback?[fallback]:[])])].filter(url=>!broken.includes(url));
  const index=images.length?Math.min(imageIndex,images.length-1):0,photo=images[index];
  const phone=details?.phone?.split(/[;；]/)[0].replace(/[^\d+]/g,"");
  return <aside ref={panel} popover="manual" className="map-place-detail" data-map-theme={theme} aria-labelledby={titleId}>
    <div className="map-detail-hero">
      {photo?<img src={photo} alt={`${place.name} · 照片 ${index+1}`} referrerPolicy="no-referrer" decoding="async" onError={()=>setBroken(value=>[...value,photo])}/>:<div className="map-detail-no-photo"><MapPin size={36} strokeWidth={1.2}/><span>暂无地点照片</span></div>}
      <button ref={closeButton} type="button" className="map-detail-close" aria-label="关闭景点详情" onClick={onClose}><X size={21}/></button>
      {images.length>1&&<><button type="button" className="map-detail-prev" aria-label="上一张景点照片" onClick={()=>setImageIndex((index+images.length-1)%images.length)}><ChevronLeft size={22}/></button><button type="button" className="map-detail-next" aria-label="下一张景点照片" onClick={()=>setImageIndex((index+1)%images.length)}><ChevronRight size={22}/></button><div className="map-detail-dots" aria-label="景点照片">{images.map((url,i)=><button type="button" key={url} aria-label={`查看第 ${i+1} 张照片`} aria-pressed={index===i} onClick={()=>setImageIndex(i)}/>)}</div></>}
    </div>
    <div className="map-detail-body">
      <h2 id={titleId}>{place.name}</h2>
      {details&&(details.category||details.rating)&&<div className="map-detail-meta">{details.rating&&<span><Star size={16} fill="currentColor"/>{details.rating.toFixed(1)}</span>}{details.category&&<span>{details.category}</span>}</div>}
      <div className="map-detail-actions"><button type="button" onClick={onLocate}><Navigation size={16}/>在地图上查看</button>{details?.website&&<a href={details.website} target="_blank" rel="noopener noreferrer"><ExternalLink size={16}/>官网</a>}{phone&&/^\+?\d{5,20}$/.test(phone)&&<a href={`tel:${phone}`}><Phone size={16}/>拨打电话</a>}</div>
      <div className="map-detail-address"><MapPin size={21}/><span>{details?.place.address||place.address||"暂未提供详细地址"}</span></div>
      {!current?.details&&!current?.error&&<div className="map-detail-loading" role="status">正在读取景点资料…</div>}
      {current?.error&&<div className="map-detail-error" role="alert"><p>景点资料暂时无法加载。</p><p>{current.error}</p><button type="button" onClick={()=>setRetry(value=>value+1)}>重试景点资料</button></div>}
      {details&&<><MapPlaceIntroduction scope={scope} placeId={place.placeId} revision={revision}/>{details.openingHours&&<section className="map-detail-hours"><h3><Clock3 size={17}/>开放时间</h3><p>{details.openingHours}</p></section>}{details.phone&&<section><h3>联系电话</h3><p>{details.phone}</p></section>}<p className="map-detail-source">地点资料来源：{place.source==="amap"?"高德地图":"测试数据"}</p></>}
    </div>
  </aside>;
}
