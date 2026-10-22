package org.wwz.ai.test.domain.canvas;

import org.junit.Test;
import org.wwz.ai.domain.agent.runtime.tool.common.canvas.maps.*;
import java.util.*;
import static org.junit.Assert.*;

public class MapPlannerTest {
    static MapData.Place place(String id,double lng){return new MapData.Place(id,id,lng,24.45,"test address","mock",null);}
    @Test public void combinesRealProviderLegsInExplicitOrderAndPreservesGcj02(){
        var a=place("a",118.10);var b=place("b",118.12);var c=place("c",118.13);
        List<String> calls=new ArrayList<>();
        var planner=new MapPlanner(new PlacesProvider(){
            public List<MapData.Place> search(String q,String city,int limit){return List.of(a,b,c);}
            public MapData.Place resolve(String id){return Map.of("a",a,"b",b,"c",c).get(id);}
            public List<MapData.Place> geocode(String q,String city){return List.of(a);}
        },(from,to,mode)->{calls.add(from.placeId()+"/"+to.placeId());return new MapData.Leg(from.placeId(),to.placeId(),123,45,List.of(from.coordinates(),to.coordinates()));},"mock");
        var data=planner.plan("m","s",1,"trip",List.of("c","a","b"),"walking");
        assertEquals(List.of("c/a","a/b"),calls);
        assertEquals("GCJ-02",((Map<?,?>)data.toMap().get("origin")).get("coordinateSystem"));
        var route=(Map<?,?>)data.toMap().get("route");assertEquals(246L,route.get("distanceMeters"));assertEquals(90L,route.get("durationSeconds"));
        assertEquals(data.toMap(),MapData.parse(data.toMap()).toMap());
        assertThrows(IllegalArgumentException.class,()->planner.plan("m","s",1,"trip",List.of("a","a"),"walking"));
        assertThrows(IllegalArgumentException.class,()->planner.plan("m","s",1,"trip",List.of("a","b"),"teleport"));
    }
    @Test public void rejectsInvalidCoordinatesBrokenSegmentsAndForgedTotals(){
        assertThrows(IllegalArgumentException.class,()->place("invalid",181));
        var a=place("a",118.10);var b=place("b",118.12);
        assertThrows(IllegalArgumentException.class,()->new MapData.Leg("a","b",-1,2,List.of(a.coordinates(),b.coordinates())));
        var data=new MapData("m","s",1,"trip",List.of(a,b),"walking",List.of(new MapData.Leg("a","b",10,5,List.of(a.coordinates(),b.coordinates()))),"mock",java.time.Instant.now().toString());
        var raw=data.toMap();((Map<String,Object>)raw.get("route")).put("distanceMeters",1000L);
        assertThrows(IllegalArgumentException.class,()->MapData.parse(raw));
        assertThrows(IllegalArgumentException.class,()->new MapData("m","s",1,"trip",List.of(a,b),"walking",List.of(new MapData.Leg("b","a",10,5,List.of(a.coordinates(),b.coordinates()))),"mock",java.time.Instant.now().toString()));
    }
}
