import {expect,it,vi} from 'vitest';
import {createMapViewWriter} from './mapViewWriter';
import {initializeMap,changeMapView,readMapState,clearMapSession} from './mapStore';
import {parseMapData} from './mapTypes';
it('does not silently overwrite another tab camera and explicitly reloads before further writes',async()=>{
 const scope={sessionId:'camera-conflict',surfaceId:'s',nodeId:'map'};
 const point=(id:string,x:number)=>({placeId:id,name:id,coordinates:[x,24],coordinateSystem:'GCJ-02',source:'mock',address:''});const a=point('a',118),b=point('b',119),geometry=[a.coordinates,b.coordinates],at='2026-10-21T00:00:00Z';
 initializeMap(scope,parseMapData({schemaVersion:'map/1',mapId:'m',surfaceId:'s',revision:1,title:'Mock',origin:a,stops:[b],travelMode:'walking',selectedPlaceId:'a',provider:'mock',fetchedAt:at,routeStatus:'ready',dataStatus:'fresh',route:{revision:1,coordinateSystem:'GCJ-02',provider:'mock',computedAt:at,travelMode:'walking',distanceMeters:1,durationSeconds:1,geometry,legs:[{fromPlaceId:'a',toPlaceId:'b',distanceMeters:1,durationSeconds:1,geometry}]}}));
 const api={save:vi.fn().mockRejectedValueOnce({response:{status:409}}).mockResolvedValue({stateRevision:8,mapRevision:1,state:{zoom:12}}),read:vi.fn().mockResolvedValue({stateRevision:7,mapRevision:1,state:{zoom:5}})};
 const onError=vi.fn(),writer=createMapViewWriter(scope,onError,api);changeMapView(scope,{zoom:15});await writer.save();
 changeMapView(scope,{zoom:16});await writer.save();expect(api.save).toHaveBeenCalledTimes(1);expect(api.read).not.toHaveBeenCalled();
 await writer.reload();expect(readMapState(scope)?.view.zoom).toBe(5);expect(readMapState(scope)?.stateRevision).toBe(7);
 changeMapView(scope,{zoom:12});await writer.save();expect(api.save.mock.calls[1][1]).toBe(7);writer.dispose();clearMapSession(scope.sessionId);
});
