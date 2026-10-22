package org.wwz.ai.test.domain.canvas;

import org.junit.Test;
import org.wwz.ai.domain.agent.runtime.ResearchRuntimeDependencies;
import org.wwz.ai.domain.agent.runtime.agent.AgentContext;
import org.wwz.ai.domain.agent.runtime.tool.ToolResultPayload;
import org.wwz.ai.domain.agent.runtime.tool.common.canvas.UiSurfaceStore;
import org.wwz.ai.domain.agent.runtime.tool.common.canvas.maps.*;
import java.util.*;
import static org.junit.Assert.*;
import static org.mockito.Mockito.*;

public class MapAgentToolTest {
    @Test public void readsCurrentOwnedRevisionWithoutRecalculatingRoutes(){
        var places=mock(PlacesProvider.class);var routes=mock(RouteProvider.class);
        var a=MapPlannerTest.place("a",118.1);var b=MapPlannerTest.place("b",118.2);
        var data=new MapData("m","s",2,"trip",List.of(b,a),"walking",List.of(new MapData.Leg("b","a",500,300,List.of(b.coordinates(),a.coordinates()))),"mock","2026-10-20T00:00:00Z");
        var store=mock(UiSurfaceStore.class);
        when(store.read("session","owner","s")).thenReturn(Map.of("revision",4L,"tree",Map.of("root",Map.of("kind","MapWidget","nodeId","map","props",Map.of("mapData",data.toMap())))));
        when(store.read("session","foreign","s")).thenThrow(new SecurityException());
        var service=new MapService(new MapPlanner(places,routes,"mock"),store);
        var context=AgentContext.builder().sessionId("session").runtimeDependencies(ResearchRuntimeDependencies.builder().mapService(service).uiSurfaceStore(store).build()).build();
        var result=(ToolResultPayload)new MapAgentTool("get_map",context,"owner").execute(Map.of("surfaceId","s","nodeId","map"));
        assertFalse(result.getFailed());var payload=MapData.object(result.getLlmData());
        assertEquals(4L,payload.get("baseRevision"));assertEquals(2L,payload.get("mapRevision"));
        assertEquals("b",MapData.object(MapData.list(payload.get("places")).getFirst()).get("placeId"));
        var denied=(ToolResultPayload)new MapAgentTool("get_map",context,"foreign").execute(Map.of("surfaceId","s","nodeId","map"));assertTrue(denied.getFailed());
        verifyNoInteractions(places,routes);
    }
}
