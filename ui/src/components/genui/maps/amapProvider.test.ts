import {expect,it,vi} from "vitest";
import {createAmapMap} from "./amapProvider";
it("keeps a single map while updating layers and removes all listeners and instances on disposal",()=>{
  const events=new Map<string,Function>();const destroy=vi.fn(),removed=vi.fn(),pan=vi.fn(),fit=vi.fn();let maps=0,pitch=0,initialOptions:any;
  class MapFake{constructor(_host:unknown,options:unknown){maps++;initialOptions=options}on(k:string,v:Function){events.set(k,v)}off(k:string){events.delete(k)}add(){}remove(){removed()}setFitView=fit;setCenter=pan;getCenter(){return {lng:118,lat:24}}getZoom(){return 12}getPitch(){return pitch}getRotation(){return 0}setZoom(){}setPitch(value:number){pitch=value;events.get('pitchend')?.()}setRotation(){}setMapStyle(){}resize(){}destroy=destroy;}
  class MarkerFake{on=vi.fn();off=vi.fn();setContent=vi.fn();}
  class PolylineFake{setPath=vi.fn();setOptions=vi.fn();}
  const documentStub={createElement:()=>({className:"",textContent:"",append(){},setAttribute(){}})};
  vi.stubGlobal("document",documentStub);
  const p=(id:string,x:number)=>({placeId:id,name:id,coordinates:[x,24] as [number,number],coordinateSystem:"GCJ-02" as const,address:"",source:"mock" as const});
  const changes=vi.fn(),selected=vi.fn();
  let mode="inline";
  const map=createAmapMap({closest:()=>({getAttribute:()=>mode})} as unknown as HTMLElement,{Map:MapFake,Marker:MarkerFake,Polyline:PolylineFake} as any,{onSelect:selected,onView:changes,onError:vi.fn()});
  expect(initialOptions).toMatchObject({viewMode:"3D",pitch:0,pitchEnable:true});
  map.setView({pitch:50});expect(changes).toHaveBeenLastCalledWith(expect.objectContaining({pitch:50}));
  map.setView({pitch:0});expect(changes).toHaveBeenLastCalledWith(expect.objectContaining({pitch:0}));expect(maps).toBe(1);
  map.setData([p("a",118),p("b",119)],[[118,24],[119,24]],false);map.setData([p("b",119),p("a",118)],[[119,24],[118,24]],true);
  expect(fit.mock.calls[0][2][2]).toBeGreaterThanOrEqual(160);
  mode="immersive";map.fit();expect(fit.mock.lastCall?.[2]).toEqual([55,55,55,55]);
  map.select("b",true);map.resize();expect(maps).toBe(1);expect(pan).toHaveBeenCalled();
  events.get("moveend")?.();expect(changes).toHaveBeenCalled();map.destroy();expect(events.size).toBe(0);expect(destroy).toHaveBeenCalledOnce();expect(removed).toHaveBeenCalled();
  vi.unstubAllGlobals();
});
