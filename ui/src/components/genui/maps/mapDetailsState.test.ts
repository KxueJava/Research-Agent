import {afterEach,expect,it} from "vitest";
import {clearMapDetailsSession,closeMapDetails,mapDetailsSnapshot,openMapDetails} from "./mapDetailsState";
import {placeDetailsSchema} from "./mapTypes";
afterEach(()=>closeMapDetails());
it("keeps one detail pane and does not let another Surface close it",()=>{
  const a={sessionId:"a",surfaceId:"one",nodeId:"map"},b={sessionId:"b",surfaceId:"two",nodeId:"map"};
  openMapDetails(a,"poi-a");openMapDetails(b,"poi-b");closeMapDetails(a);clearMapDetailsSession("a");expect(mapDetailsSnapshot()?.placeId).toBe("poi-b");clearMapDetailsSession("b");expect(mapDetailsSnapshot()).toBeNull();
});
it("rejects active-content links and fabricated ratings in provider details",()=>{
  const detail={place:{placeId:"a",name:"A",coordinates:[118,24],coordinateSystem:"GCJ-02",address:"Road",source:"amap"},photos:[],category:"公园",introduction:"A位于Road。",synthesized:true};
  expect(placeDetailsSchema.safeParse(detail).success).toBe(true);
  for(const website of ["javascript:alert(1)","https://user:password@example.com"]){expect(placeDetailsSchema.safeParse({...detail,website}).success).toBe(false);}
  expect(placeDetailsSchema.safeParse({...detail,rating:6}).success).toBe(false);
});
