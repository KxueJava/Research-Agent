import {mapPlaces,mapScopeKey,type MapData,type MapPlace,type MapScope,type MapView,type SavedMapView,type TravelMode} from "./mapTypes";
export type MapState={data:MapData;selectedPlaceId:string;view:MapView;stateRevision:number;viewChanges:number;knownPlaces:Map<string,MapPlace>;draftIds?:string[];draftMode?:TravelMode;requestId?:string;status:"ready"|"updating"|"failed";error?:string};
const states=new Map<string,MapState>(),listeners=new Set<()=>void>(),epochs=new Map<string,number>();let revision=0;
const emit=()=>{revision++;listeners.forEach(fn=>fn());};
export const mapSnapshot=()=>revision;
export const subscribeMaps=(fn:()=>void)=>{listeners.add(fn);return()=>{listeners.delete(fn);};};
export const mapSessionEpoch=(session:string)=>epochs.get(session)??0;
export const readMapState=(scope:MapScope)=>states.get(mapScopeKey(scope));
function update(scope:MapScope,change:(old:MapState)=>MapState){const key=mapScopeKey(scope),old=states.get(key);if(!old)return;const next=change(old);if(next===old)return;states.set(key,next);emit();}
export function initializeMap(scope:MapScope,data:MapData){
  if(data.surfaceId!==scope.surfaceId)throw Error("地图与 Surface 身份不一致");
  if(readMapState(scope)){acceptMapData(scope,data);return;}
  states.set(mapScopeKey(scope),{data,selectedPlaceId:data.selectedPlaceId,view:{},viewChanges:0,stateRevision:0,knownPlaces:new Map(mapPlaces(data).map(p=>[p.placeId,p])),status:"ready"});emit();
}
export function acceptMapData(scope:MapScope,data:MapData){
  if(data.surfaceId!==scope.surfaceId)return;
  update(scope,old=>{if(data.mapId!==old.data.mapId||data.revision<=old.data.revision)return old;
    const completed=!old.draftIds||data.requestId===old.requestId;
    const known=new Map(old.knownPlaces);mapPlaces(data).forEach(p=>known.set(p.placeId,p));
    return {...old,data,knownPlaces:known,selectedPlaceId:mapPlaces(data).some(p=>p.placeId===old.selectedPlaceId)?old.selectedPlaceId:data.origin.placeId,...(completed?{draftIds:undefined,draftMode:undefined,status:"ready" as const,error:undefined}:{} )};
  });
}
export function selectMapPlace(scope:MapScope,id:string){update(scope,s=>{if(!(s.draftIds??mapPlaces(s.data).map(p=>p.placeId)).includes(id))return s;return {...s,selectedPlaceId:id,viewChanges:s.viewChanges+1};});}
export function changeMapView(scope:MapScope,patch:MapView){update(scope,s=>({...s,view:{...s.view,...patch},viewChanges:s.viewChanges+1}));}
export function rememberMapPlace(scope:MapScope,place:MapPlace){update(scope,s=>{const known=new Map(s.knownPlaces);known.set(place.placeId,place);return {...s,knownPlaces:known};});}
export function startMapEdit(scope:MapScope,ids:string[],mode:TravelMode,requestId:string){update(scope,s=>({...s,draftIds:[...ids],draftMode:mode,requestId,status:"updating",error:undefined}));}
export function failMapEdit(scope:MapScope,requestId:string,error:string){update(scope,s=>s.requestId!==requestId?s:{...s,status:"failed",error});}
export function restoreMapView(scope:MapScope,saved:SavedMapView){update(scope,s=>{if(saved.stateRevision<s.stateRevision)return s;const patch=s.viewChanges?{}:{view:saved.state,selectedPlaceId:mapPlaces(s.data).some(p=>p.placeId===saved.state.selectedPlaceId)?saved.state.selectedPlaceId!:s.selectedPlaceId};return {...s,...patch,stateRevision:saved.stateRevision};});}
export function acknowledgeMapView(scope:MapScope,saved:SavedMapView){update(scope,s=>saved.stateRevision<s.stateRevision?s:{...s,stateRevision:saved.stateRevision});}
export function replaceMapView(scope:MapScope,saved:SavedMapView){update(scope,s=>saved.stateRevision<s.stateRevision?s:{...s,view:saved.state,stateRevision:saved.stateRevision,viewChanges:0,selectedPlaceId:mapPlaces(s.data).some(p=>p.placeId===saved.state.selectedPlaceId)?saved.state.selectedPlaceId!:s.selectedPlaceId});}
export function clearMapSession(session:string){epochs.set(session,mapSessionEpoch(session)+1);for(const key of states.keys())if(JSON.parse(key)[0]===session)states.delete(key);emit();}
