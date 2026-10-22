import {getMapSurface} from "@/services/maps";
import type {MapScope} from "./mapTypes";

/** Snapshot the server version after UI actions; chat history can contain an older map. */
export async function createMapFollowup(scope:MapScope,instruction:string,read:typeof getMapSurface=getMapSurface){
  const surface=await read(scope.sessionId,scope.surfaceId);
  const find=(node:any):any=>node?.nodeId===scope.nodeId?node:Array.isArray(node?.children)?node.children.map(find).find(Boolean):undefined;
  const node=find(surface.tree?.root),data=node?.props?.mapData;
  if(surface.sessionId!==scope.sessionId||surface.surfaceId!==scope.surfaceId||!Number.isSafeInteger(surface.revision)||node?.kind!=="MapWidget"||!data)throw Error("当前地图快照无效，请刷新后重试");
  const places=[data.origin,...data.stops].map(({placeId,name}:{placeId:string;name:string})=>({placeId,name}));
  return `请继续修改当前地图行程。surfaceId=${scope.surfaceId}, nodeId=${scope.nodeId}, baseRevision=${surface.revision}, mapRevision=${data.revision}, travelMode=${data.travelMode}。当前服务端地点顺序：${JSON.stringify(places)}。用户要求：${instruction}。通过 modify_itinerary 更新同一个 Surface；不新建地图。如版本冲突，先用 get_map 读取最新版本与地点顺序，再按用户意图修改，不重放旧完整行程。`;
}
