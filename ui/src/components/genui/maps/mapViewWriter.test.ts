import {expect,it,vi} from "vitest";
import {createMapViewWriter} from "./mapViewWriter";
import {initializeMap,clearMapSession,changeMapView,readMapState} from "./mapStore";
import {parseMapData,mapViewport} from "./mapTypes";
it("saves final viewport B after A succeeds, even when B arrives while A is in flight",async()=>{
  const scope={sessionId:"view-writer",surfaceId:"s",nodeId:"n"};clearMapSession(scope.sessionId);
  const p=(id:string,x:number)=>({placeId:id,name:id,coordinates:[x,24],coordinateSystem:"GCJ-02",address:"",source:"mock"});const a=p("a",118),b=p("b",119),geometry=[a.coordinates,b.coordinates],at="2026-10-20T00:00:00Z";
  initializeMap(scope,parseMapData({schemaVersion:"map/1",mapId:"m",surfaceId:"s",revision:1,title:"Mock",origin:a,stops:[b],travelMode:"walking",selectedPlaceId:"a",provider:"mock",fetchedAt:at,routeStatus:"ready",dataStatus:"fresh",route:{revision:1,coordinateSystem:"GCJ-02",provider:"mock",computedAt:at,travelMode:"walking",distanceMeters:1,durationSeconds:1,geometry,legs:[{fromPlaceId:"a",toPlaceId:"b",distanceMeters:1,durationSeconds:1,geometry}]}}));
  let finishA!:(saved:any)=>void;const calls:any[]=[];
  const api={save:vi.fn(async(_s:any,version:number,mapRevision:number,state:any)=>{calls.push({version,state});if(calls.length===1)return await new Promise<any>(resolve=>{finishA=resolve});return {stateRevision:version+1,mapRevision,state};}),read:vi.fn()};
  const writer=createMapViewWriter(scope,()=>{},api);
  changeMapView(scope,{zoom:12});const first=writer.save();await vi.waitFor(()=>expect(calls).toHaveLength(1));
  changeMapView(scope,{zoom:16});const second=writer.save();finishA({stateRevision:1,mapRevision:1,state:{zoom:12}});await Promise.all([first,second]);
  expect(calls[1]).toMatchObject({version:1,state:{zoom:16}});expect(readMapState(scope)?.stateRevision).toBe(2);writer.dispose();clearMapSession(scope.sessionId);
});
it('selects independent inline/expanded cameras and retains legacy flat fallback',()=>{
  const view={zoom:10,pitch:0,viewports:{inline:{zoom:12,pitch:0},expanded:{zoom:17,pitch:50}}};
  expect(mapViewport(view,'inline')).toMatchObject({zoom:12,pitch:0});expect(mapViewport(view,'immersive')).toMatchObject({zoom:17,pitch:50});
  expect(mapViewport({zoom:10,pitch:30},'immersive')).toMatchObject({zoom:10,pitch:30});
});
