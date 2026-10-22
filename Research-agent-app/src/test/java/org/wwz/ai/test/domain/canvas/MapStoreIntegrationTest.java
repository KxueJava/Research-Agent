package org.wwz.ai.test.domain.canvas;
import org.junit.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.wwz.ai.infrastructure.tooloutput.*;
import org.wwz.ai.domain.agent.runtime.tool.common.canvas.*;
import org.wwz.ai.domain.agent.runtime.tool.common.canvas.maps.*;
import java.util.*;
import java.util.concurrent.*;
import static org.junit.Assert.*;

public class MapStoreIntegrationTest {
    JdbcTemplate jdbc;JdbcUiSurfaceStore surfaces;JdbcUiActionStore actions;MapService service;String session;
    @Before public void setup(){Assume.assumeTrue("true".equals(System.getenv("RESEARCH_UI_DB_TEST")));
        var source=IsolatedUiDatabase.source();
        jdbc=new JdbcTemplate(source);surfaces=new JdbcUiSurfaceStore(source);actions=new JdbcUiActionStore(source);session="map-test-"+UUID.randomUUID();
        jdbc.update("INSERT INTO ai_agent_dialogue_session(session_id,visitor_id,title,deleted) VALUES(?,?,?,0)",session,"map-owner","Disposable map test");
        PlacesProvider places=new PlacesProvider(){public List<MapData.Place> search(String q,String city,int limit){return List.of(resolve("alpha"),resolve("beta"));}public MapData.Place resolve(String id){return new MapData.Place(id,id,id.equals("alpha")?118.1:118.2,24.4,"synthetic","mock",null);}public List<MapData.Place> geocode(String q,String city){return List.of(resolve("alpha"));}};
        var planner=new MapPlanner(places,(a,b,mode)->new MapData.Leg(a.placeId(),b.placeId(),700,500,List.of(a.coordinates(),b.coordinates())),"mock");service=new MapService(planner,surfaces);
        var data=planner.plan("map","surface",1,"Synthetic map",List.of("alpha","beta"),"walking");
        surfaces.publish(session,"message","surface","create",Map.of("kind","MapWidget","nodeId","map-node","props",Map.of("mapData",data.toMap(),"remoteAction",Map.of("id","modify","capability","map_itinerary"))));
    }
    @After public void cleanup(){if(jdbc==null)return;for(String table:List.of("ai_agent_ui_map_proof","ai_agent_ui_action","ai_agent_ui_surface_event","ai_agent_ui_surface","ai_agent_dialogue_session"))jdbc.update("DELETE FROM "+table+" WHERE session_id=?",session);}
    @Test public void restoresNonStreamingMapSnapshotsWithOwnership(){
        var restarted=new JdbcUiSurfaceStore(jdbc.getDataSource());
        var snapshots=restarted.list(session,"map-owner");assertEquals(1,snapshots.size());
        assertEquals("surface",snapshots.getFirst().get("surfaceId"));
        assertEquals("map",MapService.map(snapshots.getFirst(),"map-node").mapId());
        assertTrue(restarted.list(session,"foreign").isEmpty());
    }
    @Test public void refusesForgedProviderGeometryAndBindsTrustedProofToSurface(){
        var original=MapService.map(surfaces.read(session,"map-owner","surface"),"map-node");
        var places=original.places().stream().map(p->new MapData.Place(p.placeId(),p.name(),p.longitude(),p.latitude(),p.address(),"amap",null)).toList();
        var trusted=new MapData("trusted","trusted",1,"Provider contract fixture",places,original.travelMode(),original.legs(),"amap",original.fetchedAt()).toMap();
        var tree=Map.of("kind","MapWidget","nodeId","trusted-node","props",Map.of("mapData",trusted));
        assertThrows(SecurityException.class,()->surfaces.publish(session,"m","trusted","untrusted",tree));
        surfaces.registerMapData(session,trusted);
        surfaces.publish(session,"m","trusted","trusted",tree);
        assertThrows(SecurityException.class,()->surfaces.publish(session,"m","other","replay-other-surface",tree));
        var tampered=new LinkedHashMap<>(trusted);tampered.put("title","Unregistered data");
        assertThrows(SecurityException.class,()->surfaces.patch(session,"trusted","tampered",1L,List.of(Map.of("op","replace","path","/root/props/mapData","value",tampered))));
        assertEquals(1L,((Number)surfaces.read(session,"map-owner","trusted").get("revision")).longValue());
    }
    @Test public void savesViewsWithCasAndOwnershipWithoutIncreasingContentRevision()throws Exception{
        var pool=Executors.newFixedThreadPool(2);try{
            Callable<Boolean> task=()->{try{service.saveView(session,"map-owner","surface","map-node",0,1,Map.of("selectedPlaceId","beta","center",List.of(118.2,24.4),"zoom",14));return true;}catch(IllegalStateException conflict){return false;}};
            var results=pool.invokeAll(List.of(task,task));assertEquals(1,results.stream().filter(f->{try{return f.get();}catch(Exception e){throw new RuntimeException(e);}}).count());
            assertEquals(1L,((Number)service.readView(session,"map-owner","surface","map-node").get("stateRevision")).longValue());
            assertEquals(1L,((Number)surfaces.read(session,"map-owner","surface").get("revision")).longValue());
            assertThrows(SecurityException.class,()->service.saveView(session,"foreign","surface","map-node",1,1,Map.of()));
            assertThrows(IllegalArgumentException.class,()->service.saveView(session,"map-owner","surface","map-node",1,1,Map.of("selectedPlaceId","unknown")));
        }finally{pool.shutdownNow();}
    }
    @Test public void actualActionPipelineAtomicallyUpdatesSameMapAndRejectsStaleViewWrites(){
        var engine=new UiActionService(actions,surfaces,Map.of("map_itinerary",new UiActionService.Capability(false,false,service)),Runnable::run,System::currentTimeMillis);
        var request=new UiActionService.Request("surface","map-node","modify",1,"idempotent",Map.of("placeIds",List.of("beta","alpha"),"travelMode","driving","requestId","change"));
        var execution=engine.submit(session,"map-owner",request);assertEquals("completed",execution.status());
        assertEquals(execution.id(),engine.submit(session,"map-owner",request).id());
        var document=surfaces.read(session,"map-owner","surface");assertEquals(2L,((Number)document.get("revision")).longValue());
        var data=MapService.map(document,"map-node");assertEquals("beta",data.places().getFirst().placeId());assertEquals("driving",data.travelMode());assertEquals(2,data.revision());
        assertThrows(IllegalStateException.class,()->service.saveView(session,"map-owner","surface","map-node",0,1,Map.of("zoom",14)));
        assertThrows(SecurityException.class,()->engine.get(session,"foreign",execution.id()));
    }
}
