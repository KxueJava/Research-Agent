import {expect,it} from "vitest";
import {createMapFollowup} from "./mapFollowup";
it("uses current server revision and ordered IDs after a local action, not an old chat version",async()=>{
  const point=(placeId:string,name:string)=>({placeId,name});
  const scope={sessionId:"session",surfaceId:"surface",nodeId:"map"};
  const read=async()=>({sessionId:"session",surfaceId:"surface",revision:4,tree:{root:{kind:"MapWidget",nodeId:"map",props:{mapData:{revision:3,travelMode:"walking",origin:point("b","B"),stops:[point("a","A")]}}}}});
  const content=await createMapFollowup(scope,"删除 A",read);
  expect(content).toContain('baseRevision=4');expect(content).toContain('"placeId":"b"');expect(content.indexOf('"placeId":"b"')).toBeLessThan(content.indexOf('"placeId":"a"'));
});
it("does not send an inferred version when the current Surface cannot be read",async()=>{
  await expect(createMapFollowup({sessionId:"session",surfaceId:"surface",nodeId:"map"},"删除 A",async()=>{throw Error("offline")})).rejects.toThrow("offline");
});
