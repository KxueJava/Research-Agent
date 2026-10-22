import {getMapView,saveMapView} from "@/services/maps";
import {acknowledgeMapView,mapSessionEpoch,readMapState,replaceMapView} from "./mapStore";
import {mapPlaces,type MapScope} from "./mapTypes";
type ViewApi={save:typeof saveMapView;read:typeof getMapView};
/** Serializes writes over the lifetime of the map, independent of individual debounce effects. */
export function createMapViewWriter(scope:MapScope,onError:(message:string)=>void,api:ViewApi={save:saveMapView,read:getMapView}){
  const epoch=mapSessionEpoch(scope.sessionId);let alive=true,conflicted=false,queue:Promise<unknown>=Promise.resolve();
  const valid=()=>alive&&epoch===mapSessionEpoch(scope.sessionId);
  async function write():Promise<void>{
    const current=readMapState(scope);if(!valid()||!current||conflicted)return;
    const selected=mapPlaces(current.data).some(p=>p.placeId===current.selectedPlaceId)?current.selectedPlaceId:current.data.origin.placeId;
    try{const saved=await api.save(scope,current.stateRevision,current.data.revision,{...current.view,selectedPlaceId:selected});if(valid()){acknowledgeMapView(scope,saved);onError("");}}
    catch(error){
      if(!valid())return;
      if((error as {response?:{status?:number}})?.response?.status===409){conflicted=true;onError("另一标签页已更新地图视口，本页视口尚未保存。请选择恢复方式。");return;}
      if(valid())onError("视口保存未确认，下一次操作可重试。");
    }
  }
  const recover=async(discard:boolean)=>{const changes=readMapState(scope)?.viewChanges;try{const saved=await api.read(scope);if(!valid())return;if(discard&&changes!==readMapState(scope)?.viewChanges){onError("读取期间视口已变化，已保留最新本页操作。");return;}if(saved.mapRevision!==readMapState(scope)?.data.revision)throw Error('Map updated');if(discard)replaceMapView(scope,saved);else acknowledgeMapView(scope,saved);conflicted=false;onError('');if(!discard)await write();return saved;}catch{if(valid())onError('视口同步失败，请重新同步界面后重试。')}};
  return {save:()=>{queue=queue.catch(()=>{}).then(()=>write());return queue;},reload:()=>recover(true),retry:()=>recover(false),dispose:()=>{alive=false;}};
}
