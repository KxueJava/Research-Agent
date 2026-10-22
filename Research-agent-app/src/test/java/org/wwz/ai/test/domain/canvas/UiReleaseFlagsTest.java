package org.wwz.ai.test.domain.canvas;
import org.junit.Test;
import org.wwz.ai.domain.agent.runtime.tool.common.canvas.*;
import org.wwz.ai.domain.agent.runtime.tool.common.canvas.maps.*;
import org.wwz.ai.domain.agent.runtime.agent.AgentContext;
import org.wwz.ai.domain.agent.runtime.ResearchRuntimeDependencies;
import org.wwz.ai.domain.agent.research.config.ResearchConfig;
import org.wwz.ai.domain.agent.runtime.tool.ToolCollection;
import org.wwz.ai.domain.agent.runtime.tool.common.canvas.planner.UiPresentationRuntime;
import org.springframework.test.util.ReflectionTestUtils;
import java.util.*;
import java.util.concurrent.atomic.AtomicBoolean;
import static org.junit.Assert.*;
import static org.mockito.Mockito.*;
public class UiReleaseFlagsTest {
 @Test public void disabledActionsDoNotSubmitOrRecoverAcceptedWorkButCanReadAndCancel(){
  var actions=mock(UiActionStore.class);var surfaces=mock(UiSurfaceStore.class);var queue=mock(java.util.concurrent.Executor.class);
  var enabled=new AtomicBoolean(false);var service=new UiActionService(actions,surfaces,Map.of(),queue,()->1000,enabled::get);
  var accepted=new UiActionExecution(new LinkedHashMap<>(Map.of("id","a","sessionId","s","ownerId","u","surfaceId","surface","status","accepted")));
  when(actions.read("s","u","a")).thenReturn(accepted);
  assertEquals("accepted",service.get("s","u","a").status());verifyNoInteractions(queue);
  assertThrows(IllegalStateException.class,()->service.submit("s","u",new UiActionService.Request("surface","node","action",1,"key",Map.of())));
  verifyNoInteractions(surfaces);verify(actions,never()).create(any());
  service.cancel("s","u","a");verify(actions).update(eq("s"),eq("u"),eq("a"),any());
  assertThrows(IllegalStateException.class,()->service.decide("s","u","a",true));
 }
 @Test public void disabledMapBlocksProviderButLeavesExistingViewReadable(){
  var planner=mock(MapPlanner.class);var surfaces=mock(UiSurfaceStore.class);var service=new MapService(planner,surfaces,()->false);
  assertThrows(MapProviderException.class,service::planner);
  assertThrows(MapProviderException.class,()->service.readDetails("s","u","map","node","p"));
  assertThrows(MapProviderException.class,()->service.readPhotos("s","u","map","node"));verifyNoInteractions(planner,surfaces);
 }
 @Test public void plannerFlagRetainsLegacyPublicationWithoutItsNewGate(){
  var config=new ResearchConfig();ReflectionTestUtils.setField(config,"uiPlannerEnabled",false);
  var context=AgentContext.builder().query("普通问答").toolCollection(new ToolCollection()).runtimeDependencies(ResearchRuntimeDependencies.builder().researchConfig(config).build()).build();
  assertFalse(UiPresentationRuntime.enabled(context));assertEquals("",UiPresentationRuntime.userGuidance(context));
  assertNull(UiPresentationRuntime.checkTree(context,Map.of("kind","Card"),false,null));
 }
}
