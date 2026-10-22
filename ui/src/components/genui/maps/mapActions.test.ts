import {expect,it,vi} from "vitest";
import {runMapEdit,clearMapActionSession} from "./mapActions";
import {initializeMap,clearMapSession,readMapState} from "./mapStore";
import {parseMapData} from "./mapTypes";
const fixture=()=>({schemaVersion:"map/1",mapId:"m",surfaceId:"s",revision:1,title:"Mock",origin:{placeId:"a",name:"A",coordinates:[118,24],coordinateSystem:"GCJ-02",address:"",source:"mock"},stops:[{placeId:"b",name:"B",coordinates:[119,25],coordinateSystem:"GCJ-02",address:"",source:"mock"}],travelMode:"walking",selectedPlaceId:"a",provider:"mock",fetchedAt:"2026-10-20T00:00:00Z",routeStatus:"ready",dataStatus:"fresh",route:{revision:1,coordinateSystem:"GCJ-02",provider:"mock",computedAt:"2026-10-20T00:00:00Z",travelMode:"walking",distanceMeters:10,durationSeconds:5,geometry:[[118,24],[119,25]],legs:[{fromPlaceId:"a",toPlaceId:"b",distanceMeters:10,durationSeconds:5,geometry:[[118,24],[119,25]]}]}});
it("cancels the prior read-only action before resolving a fresh Surface revision",async()=>{
  const scope={sessionId:"map-actions",surfaceId:"s",nodeId:"map"};clearMapSession(scope.sessionId);clearMapActionSession(scope.sessionId);initializeMap(scope,parseMapData(fixture()));
  const calls:string[]=[];let version=1,count=0;
  const transport={surface:vi.fn(async()=>{calls.push("read:"+version);return {revision:version};}),submit:vi.fn(async(_session:string,value:any)=>{calls.push("submit:"+value.baseRevision);return {id:"e"+(++count),sessionId:scope.sessionId,surfaceId:"s",componentId:"map",actionId:"modify",baseRevision:value.baseRevision,status:"running" as const,payload:value.payload};}),cancel:vi.fn(async()=>{calls.push("cancel");version=2;return {id:"e1",sessionId:scope.sessionId,surfaceId:"s",componentId:"map",actionId:"modify",baseRevision:1,status:"completed" as const};})};
  await runMapEdit(scope,"modify",["b","a"],"walking",transport);
  await runMapEdit(scope,"modify",["a","b"],"driving",transport);
  expect(calls).toEqual(["read:1","submit:1","cancel","read:2","submit:2"]);expect(readMapState(scope)?.draftMode).toBe("driving");
  clearMapSession(scope.sessionId);clearMapActionSession(scope.sessionId);
});
