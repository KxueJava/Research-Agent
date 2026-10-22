package org.wwz.ai.test.domain.canvas;
import org.junit.Test;
import org.wwz.ai.domain.agent.runtime.tool.common.canvas.*;
import org.wwz.ai.domain.agent.runtime.tool.common.canvas.maps.*;
import java.util.*;
import static org.junit.Assert.*;
import static org.mockito.Mockito.*;

public class MapServiceTest {
    @Test public void detailsAreRestrictedToOwnedPersistedPlacesAndDoNotReviseTheItinerary(){
        var a=new MapData.Place("a","A",118.1,24.4,"Road","amap",null);var b=new MapData.Place("b","B",118.2,24.4,"","amap",null);
        var data=new MapData("m","s",1,"trip",List.of(a,b),"walking",List.of(new MapData.Leg("a","b",500,300,List.of(a.coordinates(),b.coordinates()))),"amap","2026-10-20T00:00:00Z");
        var document=Map.<String,Object>of("revision",3L,"tree",Map.of("root",Map.of("kind","MapWidget","nodeId","map","props",Map.of("mapData",data.toMap()))));
        var store=mock(UiSurfaceStore.class);when(store.read("session","owner","s")).thenReturn(document);
        var places=mock(PlacesProvider.class);when(places.details("a")).thenReturn(PlaceDetails.basic(a));var service=new MapService(new MapPlanner(places,mock(RouteProvider.class),"amap"),store);
        var result=service.readDetails("session","owner","s","map","a");assertEquals("a",result.get("placeId"));assertEquals(1L,result.get("mapRevision"));
        service.readDetails("session","owner","s","map","a");verify(places,times(1)).details("a");assertThrows(IllegalArgumentException.class,()->service.readDetails("session","owner","s","map","foreign-poi"));
        when(store.read("session","foreign","s")).thenThrow(new SecurityException());assertThrows(SecurityException.class,()->service.readDetails("session","foreign","s","map","a"));assertEquals(data.toMap(),MapService.map(document,"map").toMap());
    }
    @Test public void hydratesOldSnapshotPhotosWithoutRevisingOrTrustingClientPlaceIds(){
        var a=new MapData.Place("a","A",118.1,24.4,"","amap",null);var b=new MapData.Place("b","B",118.2,24.4,"","amap",null);
        var data=new MapData("m","s",1,"trip",List.of(a,b),"walking",List.of(new MapData.Leg("a","b",500,300,List.of(a.coordinates(),b.coordinates()))),"amap","2026-10-20T00:00:00Z");
        var document=Map.<String,Object>of("revision",3L,"tree",Map.of("root",Map.of("kind","MapWidget","nodeId","map","props",Map.of("mapData",data.toMap()))));
        var store=mock(UiSurfaceStore.class);when(store.read("session","owner","s")).thenReturn(document);
        var places=mock(PlacesProvider.class);when(places.resolve("a")).thenReturn(new MapData.Place("a","A",118.1,24.4,"","amap","https://store.is.autonavi.com/a.jpg"));when(places.resolve("b")).thenThrow(new MapProviderException("MAP_REQUEST_FAILED","unavailable"));
        var service=new MapService(new MapPlanner(places,mock(RouteProvider.class),"amap"),store);
        var result=service.readPhotos("session","owner","s","map");assertEquals(1L,result.get("mapRevision"));assertEquals(Map.of("a","https://store.is.autonavi.com/a.jpg"),result.get("photos"));assertEquals(List.of("b"),result.get("failedPlaceIds"));
        service.readPhotos("session","owner","s","map");verify(places,times(1)).resolve("a");assertNull(MapService.map(document,"map").places().getFirst().photoUrl());verify(store,times(2)).read("session","owner","s");verifyNoMoreInteractions(store);
        when(store.read("session","foreign","s")).thenThrow(new SecurityException());assertThrows(SecurityException.class,()->service.readPhotos("session","foreign","s","map"));
    }
    @Test public void recalculatesSavedGeocodedPlacesAfterProviderCacheIsLost(){
        var geo=new MapData.Place("geo-saved","Saved address",118.1,24.4,"Saved address","mock",null);
        var b=MapPlannerTest.place("b",118.2);var places=mock(PlacesProvider.class);
        when(places.resolve("geo-saved")).thenThrow(new MapProviderException("PLACE_EXPIRED","Cache lost"));when(places.resolve("b")).thenReturn(b);
        var data=new MapData("m","s",1,"trip",List.of(geo,b),"walking",List.of(new MapData.Leg(geo.placeId(),b.placeId(),500,300,List.of(geo.coordinates(),b.coordinates()))),"mock","2026-10-20T00:00:00Z");
        var store=mock(UiSurfaceStore.class);when(store.read("session","owner","s")).thenReturn(Map.of("revision",1L,"tree",Map.of("root",Map.of("kind","MapWidget","nodeId","map","props",Map.of("mapData",data.toMap())))));
        var planner=new MapPlanner(places,(from,to,mode)->new MapData.Leg(from.placeId(),to.placeId(),600,400,List.of(from.coordinates(),to.coordinates())),"mock");
        var result=new MapService(planner,store).modify("session","owner","s","map",1,List.of("b","geo-saved"),"walking");
        assertEquals("geo-saved",MapData.parse(result.patches().getFirst().get("value")).places().getLast().placeId());
        assertThrows(MapProviderException.class,()->new MapService(planner,store).modify("session","owner","s","map",1,List.of("b","geo-unknown"),"walking"));
    }
    @Test public void editsOnlyPersistedMapAndNeverTrustsClientCoordinates(){
        var a=MapPlannerTest.place("a",118.1);var b=MapPlannerTest.place("b",118.2);var c=MapPlannerTest.place("c",118.3);
        PlacesProvider places=mock(PlacesProvider.class);when(places.resolve("a")).thenReturn(a);when(places.resolve("b")).thenReturn(b);when(places.resolve("c")).thenReturn(c);
        var planner=new MapPlanner(places,(from,to,mode)->new MapData.Leg(from.placeId(),to.placeId(),500,300,List.of(from.coordinates(),to.coordinates())),"mock");
        var original=planner.plan("m","s",1,"trip",List.of("a","b"),"walking");
        var surfaces=mock(UiSurfaceStore.class);when(surfaces.read("session","owner","s")).thenReturn(Map.of("revision",3L,"tree",Map.of("root",Map.of("kind","MapWidget","nodeId","map","props",Map.of("mapData",original.toMap())))));
        var service=new MapService(planner,surfaces);
        var e=new UiActionExecution(Map.of("sessionId","session","ownerId","owner","surfaceId","s","componentId","map","baseRevision",3L,"payload",Map.of("placeIds",List.of("a","c"),"travelMode","walking","requestId","change-1")));
        var output=service.execute(e);assertEquals("/root/props/mapData",output.patches().getFirst().get("path"));
        var next=MapData.parse(output.patches().getFirst().get("value"));assertEquals(2,next.revision());assertEquals("c",next.places().getLast().placeId());
        var forged=new LinkedHashMap<>(e.data());forged.put("payload",Map.of("coordinates",List.of(1,2),"tool","shell"));
        assertThrows(IllegalArgumentException.class,()->service.execute(new UiActionExecution(forged)));
        when(surfaces.read("session","foreign","s")).thenThrow(new SecurityException());assertThrows(SecurityException.class,()->service.modify("session","foreign","s","map",3,List.of("a","b"),"walking"));
        assertThrows(IllegalStateException.class,()->service.modify("session","owner","s","map",1,List.of("a","b"),"walking"));
    }
}
