import {createContext,useContext,useEffect,useState,type ReactNode} from "react";
import {getMapPhotos} from "@/services/maps";
import {mapPlaces,mapScopeKey,type MapData,type MapScope} from "./mapTypes";

type Photos={urls:Record<string,string>;loading:boolean;error:boolean;retry:()=>void};
const empty:Photos={urls:{},loading:false,error:false,retry:()=>{}};
const Context=createContext<Photos>(empty);
export const useMapPhotos=()=>useContext(Context);

/** Sidecar enrichment: never publishes a Surface revision or changes route / map layers. */
export function MapPhotosProvider({scope,data,children}:{scope:MapScope;data:MapData;children:ReactNode}){
  const key=`${mapScopeKey(scope)}:${data.revision}`;
  const [retry,setRetry]=useState(0),[result,setResult]=useState<{key:string;urls:Record<string,string>;loading:boolean;error:boolean}>();
  const needsPhotos=data.provider==="amap"&&mapPlaces(data).some(p=>!p.photoUrl&&!p.placeId.startsWith("geo-"));
  useEffect(()=>{
    if(!needsPhotos)return;
    const controller=new AbortController();setResult({key,urls:{},loading:true,error:false});
    void getMapPhotos(scope,controller.signal).then(value=>{
      if(controller.signal.aborted)return;
      const valid=value.mapRevision===data.revision,ids=new Set(mapPlaces(data).map(p=>p.placeId));
      const urls=Object.fromEntries(Object.entries(value.photos).filter(([id])=>ids.has(id)));
      setResult({key,urls:valid?urls:{},loading:false,error:!valid||value.failedPlaceIds.length>0});
    }).catch(()=>{if(!controller.signal.aborted)setResult({key,urls:{},loading:false,error:true});});
    return()=>controller.abort();
  },[key,needsPhotos,retry]);
  const current=needsPhotos&&result?.key===key?result:empty;
  return <Context.Provider value={{urls:current.urls,loading:current.loading,error:current.error,retry:()=>setRetry(v=>v+1)}}>{children}</Context.Provider>;
}
export function MapPhotoNotice(){
  const photos=useMapPhotos();
  return photos.error?<div className="map-view-warning" role="status">部分地点照片暂时无法加载。<button type="button" onClick={photos.retry}>重试照片</button></div>:null;
}
