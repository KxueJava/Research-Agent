import {useState} from "react";
import {MapPin} from "lucide-react";
import type {MapPlace} from "./mapTypes";
import {useMapPhotos} from "./MapPhotos";

/** Never substitute unrelated stock photography for a provider's missing photo. */
export default function MapPlacePhoto({place}:{place:MapPlace}){
  const [failed,setFailed]=useState<string>();
  const photos=useMapPhotos(),url=place.photoUrl||photos.urls[place.placeId];
  return <span className="map-place-photo">
    {url&&failed!==url?<img src={url} alt={`${place.name}实景`} loading="lazy" referrerPolicy="no-referrer" onError={()=>setFailed(url)}/>:<span className="map-photo-placeholder" aria-label={photos.loading?"正在加载地点照片":"暂无地点照片"}><MapPin size={24} strokeWidth={1.3}/><span>{photos.loading?"照片加载中…":"暂无地点照片"}</span></span>}
  </span>;
}
