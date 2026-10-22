import type {AmapSdk} from "./amapLoader";
import type {MapPlace,MapView} from "./mapTypes";
export type MapAdapter={getView:()=>MapView;setData:(places:MapPlace[],geometry:[number,number][],stale:boolean)=>void;select:(id:string,pan:boolean)=>void;setView:(view:MapView)=>void;theme:(theme:"light"|"dark")=>void;zoom:(direction:number)=>void;fit:()=>void;resize:()=>void;destroy:()=>void};
export type MapCallbacks={onSelect:(id:string)=>void;onView:(view:MapView)=>void;onError:(message:string)=>void};
/** Only this module knows AMap instance APIs. Data, permissions and itinerary calculation are external. */
export function createAmapMap(container:HTMLElement,sdk:AmapSdk,callbacks:MapCallbacks):MapAdapter{
  // Keep one 3D-capable engine; pitch 0 provides the initial top-down 2D view.
  const map=new sdk.Map(container,{viewMode:"3D",pitch:0,rotateEnable:true,pitchEnable:true,resizeEnable:true,zoom:13});
  let markers:{id:string;place:MapPlace;marker:any;content:HTMLElement;handler:()=>void}[]=[],line:any,first=true,destroyed=false;
  const view=()=>{if(destroyed)return;const c=map.getCenter();callbacks.onView({center:[c.lng,c.lat],zoom:map.getZoom(),pitch:map.getPitch?.()??0,rotation:map.getRotation?.()??0});};
  const error=()=>callbacks.onError("地图加载异常，请检查高德权限与网络；已有行程列表仍可查看");
  const events=["moveend","zoomend","rotateend","pitchend"];
  events.forEach(event=>map.on(event,view));map.on("error",error);
  const clear=()=>{markers.forEach(m=>{m.marker.off("click",m.handler);m.content.onkeydown=null;});if(markers.length)map.remove(markers.map(m=>m.marker));markers=[];};
  const fit=()=>{if(line)map.setFitView([line,...markers.map(m=>m.marker)],false,container.closest(".intelligent-map")?.getAttribute("data-mode")==="inline"?[55,55,180,55]:[55,55,55,55]);};
  return {
    getView(){const c=map.getCenter();return {center:[c.lng,c.lat],zoom:map.getZoom(),pitch:map.getPitch?.()??0,rotation:map.getRotation?.()??0}},
    setData(places,geometry,stale){
      if(destroyed)return;clear();
      markers=places.map((place,index)=>{const content=document.createElement("div");content.className="map-number-marker";content.setAttribute("aria-label",`地点 ${index+1} ${place.name}`);
        const number=document.createElement("span");number.textContent=String(index+1);const label=document.createElement("strong");label.textContent=place.name;content.append(number,label);
        const marker=new sdk.Marker({position:place.coordinates,content,anchor:"center",title:place.name});
        content.tabIndex=0;content.setAttribute("role","button");content.onkeydown=e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();callbacks.onSelect(place.placeId);}};
        const handler=()=>callbacks.onSelect(place.placeId);marker.on("click",handler);return {id:place.placeId,place,marker,content,handler};});
      map.add(markers.map(m=>m.marker));
      if(!line){line=new sdk.Polyline({path:geometry,strokeColor:"#3e9bd9",strokeWeight:5,outlineColor:"#fff",isOutline:true,borderWeight:2,showDir:true,lineJoin:"round"});map.add(line);}
      else line.setPath(geometry);
      line.setOptions({strokeStyle:stale?"dashed":"solid",strokeOpacity:stale?.5:1});
      if(first){fit();first=false;}
    },
    select(id,pan){for(const m of markers){m.content.className="map-number-marker"+(m.id===id?" selected":"");m.content.setAttribute("aria-pressed",m.id===id?"true":"false");if(m.id===id&&pan)map.setCenter(m.place.coordinates);}},
    setView(state){if(state.center)map.setCenter(state.center);if(state.zoom!==undefined)map.setZoom(state.zoom);if(state.pitch!==undefined)map.setPitch(state.pitch);if(state.rotation!==undefined)map.setRotation(state.rotation);},
    theme(theme){map.setMapStyle(theme==="dark"?"amap://styles/darkblue":"amap://styles/normal");},
    zoom(direction){map.setZoom(Math.min(20,Math.max(2,map.getZoom()+direction)));},
    fit,
    resize(){map.resize?.();},
    destroy(){if(destroyed)return;destroyed=true;clear();if(line)map.remove(line);events.forEach(event=>map.off(event,view));map.off("error",error);map.destroy();},
  };
}
