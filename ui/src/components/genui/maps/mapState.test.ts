import {beforeEach,expect,it} from "vitest";
import {parseMapData} from "./mapTypes";
import {clearMapSession,initializeMap,readMapState,selectMapPlace,startMapEdit,failMapEdit,acceptMapData,restoreMapView,acknowledgeMapView,changeMapView} from "./mapStore";
const point=(id:string,x:number)=>({placeId:id,name:id,coordinates:[x,24.4],coordinateSystem:"GCJ-02",address:"test",source:"mock"});
export const fixture=(surfaceId="surface",revision=1)=>{
  const a=point("a",118.1),b=point("b",118.2),geometry=[a.coordinates,b.coordinates];
  return {schemaVersion:"map/1",mapId:"map",surfaceId,revision,title:"Mock itinerary",origin:a,stops:[b],travelMode:"walking",selectedPlaceId:"a",provider:"mock",fetchedAt:"2026-10-20T00:00:00Z",routeStatus:"ready",dataStatus:"fresh",route:{revision,coordinateSystem:"GCJ-02",provider:"mock",computedAt:"2026-10-20T00:00:00Z",travelMode:"walking",distanceMeters:600,durationSeconds:400,geometry,legs:[{fromPlaceId:"a",toPlaceId:"b",distanceMeters:600,durationSeconds:400,geometry}]}};
};
const scope={sessionId:"map-test",surfaceId:"surface",nodeId:"node"};
beforeEach(()=>clearMapSession(scope.sessionId));
it('ignores late viewport snapshots older than the acknowledged state version',()=>{
 initializeMap(scope,parseMapData(fixture()));changeMapView(scope,{zoom:16});acknowledgeMapView(scope,{stateRevision:3,mapRevision:1,state:{zoom:16}});
 restoreMapView(scope,{stateRevision:2,mapRevision:1,state:{zoom:10}});expect(readMapState(scope)?.stateRevision).toBe(3);expect(readMapState(scope)?.view.zoom).toBe(16);
});
it("rejects coordinate mixing, forged totals and missing geometry",()=>{
  expect(parseMapData(fixture()).route.distanceMeters).toBe(600);
  const raw=fixture();raw.origin.coordinateSystem="WGS-84";expect(()=>parseMapData(raw)).toThrow();
  const totals=fixture();totals.route.distanceMeters=1;expect(()=>parseMapData(totals)).toThrow();
  const empty=fixture();empty.route.geometry=[];expect(()=>parseMapData(empty)).toThrow();
});
it("isolates maps and rejects stale async errors without discarding the last valid route",()=>{
  initializeMap(scope,parseMapData(fixture()));initializeMap({...scope,nodeId:"sibling"},parseMapData(fixture()));
  selectMapPlace(scope,"b");expect(readMapState({...scope,nodeId:"sibling"})!.selectedPlaceId).toBe("a");
  startMapEdit(scope,["b","a"],"driving","old");startMapEdit(scope,["a","b"],"walking","new");
  failMapEdit(scope,"old","old failure");expect(readMapState(scope)!.status).toBe("updating");
  failMapEdit(scope,"new","provider unavailable");expect(readMapState(scope)!.data.route.distanceMeters).toBe(600);expect(readMapState(scope)!.status).toBe("failed");
  const updated={...fixture("surface",2),requestId:"new"};acceptMapData(scope,parseMapData(updated));
  expect(readMapState(scope)!.status).toBe("ready");expect(readMapState(scope)!.data.revision).toBe(2);
  acceptMapData(scope,parseMapData(fixture()));expect(readMapState(scope)!.data.revision).toBe(2);
  clearMapSession(scope.sessionId);expect(readMapState(scope)).toBeUndefined();
});
