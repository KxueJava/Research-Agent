package org.wwz.ai.test.domain.canvas;
import org.junit.Test;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.mock.web.MockHttpServletRequest;
import org.wwz.ai.domain.agent.research.config.ResearchConfig;
import org.wwz.ai.trigger.http.agent.AgentUiFeaturesController;
import org.wwz.ai.trigger.auth.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.Map;
import static org.junit.Assert.*;
import static org.mockito.Mockito.*;
public class UiFeaturesHttpTest {
 @Test public void independentPublicMetadataHasNoKeysAndOnlyGetSkipsAuthentication(){
  var config=new ResearchConfig();ReflectionTestUtils.setField(config,"uiActionsEnabled",false);ReflectionTestUtils.setField(config,"uiMapsEnabled",false);
  var response=new AgentUiFeaturesController(config).features();var flags=(Map<?,?>)response.getBody();
  assertEquals(4,flags.size());assertEquals(true,flags.get("streaming"));assertEquals(false,flags.get("actions"));assertEquals(false,flags.get("maps"));assertEquals(true,flags.get("planner"));
  var filter=new AdminAuthFilter(mock(AdminAuthService.class),new ObjectMapper());
  assertEquals(true,ReflectionTestUtils.invokeMethod(filter,"shouldNotFilter",new MockHttpServletRequest("GET","/api/agent/ui-features")));
  assertEquals(false,ReflectionTestUtils.invokeMethod(filter,"shouldNotFilter",new MockHttpServletRequest("POST","/api/agent/ui-features")));
  assertEquals(false,ReflectionTestUtils.invokeMethod(filter,"shouldNotFilter",new MockHttpServletRequest("GET","/api/agent/ui-features/private")));
 }
}
