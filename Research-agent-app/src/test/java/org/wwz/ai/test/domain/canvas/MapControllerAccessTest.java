package org.wwz.ai.test.domain.canvas;
import org.junit.Test;
import org.springframework.mock.env.MockEnvironment;
import org.wwz.ai.application.agent.visitor.*;
import org.wwz.ai.domain.agent.runtime.tool.common.canvas.maps.*;
import org.wwz.ai.trigger.http.agent.AgentMapsController;
import org.wwz.ai.types.agent.visitor.VisitorRequestContext;
import static org.junit.Assert.*;
import static org.mockito.Mockito.*;

public class MapControllerAccessTest {
    @Test public void deniesUnownedSessionsBeforeAccessingProviderOrConfig(){
        var service=mock(MapService.class);var ownership=mock(ConversationSessionOwnershipApplicationService.class);
        doThrow(new SessionOwnershipDeniedException("denied")).when(ownership).ensureExistingSessionAccessible("foreign","s");
        VisitorRequestContext.bind("foreign");try{var c=new AgentMapsController(service,ownership,new MockEnvironment());
            assertEquals(404,c.config("s").getStatusCode().value());assertEquals(404,c.search("s","q","",5).getStatusCode().value());assertEquals(404,c.view("s","surface","node").getStatusCode().value());assertEquals(404,c.photos("s","surface","node").getStatusCode().value());assertEquals(404,c.details("s","surface","node","place").getStatusCode().value());verifyNoInteractions(service);
        }finally{VisitorRequestContext.clear();}
    }
    @Test public void frontendConfigurationNeverReturnsWebServiceKey(){
        var env=new MockEnvironment().withProperty("AMAP_WEB_KEY","never-browser").withProperty("AMAP_JS_KEY","js-public").withProperty("AMAP_SECURITY_JSCODE","security-test");
        var service=mock(MapService.class);when(service.enabled()).thenReturn(true);
        VisitorRequestContext.bind("owner");try{var body=new AgentMapsController(service,mock(ConversationSessionOwnershipApplicationService.class),env).config("s").getBody();
            assertFalse(body.toString().contains("never-browser"));assertTrue(body.toString().contains("js-public"));
        }finally{VisitorRequestContext.clear();}
    }
    @Test public void disabledMapConfigurationExposesNoKeys(){
        var env=new MockEnvironment().withProperty("AMAP_WEB_KEY","never-browser").withProperty("AMAP_JS_KEY","disabled-js").withProperty("AMAP_SECURITY_JSCODE","disabled-security");
        VisitorRequestContext.bind("owner");try{var body=new AgentMapsController(mock(MapService.class),mock(ConversationSessionOwnershipApplicationService.class),env).config("s").getBody();
            assertFalse(body.toString().contains("never-browser"));assertFalse(body.toString().contains("disabled-js"));assertFalse(body.toString().contains("disabled-security"));assertTrue(body.toString().contains("disabled=true"));
        }finally{VisitorRequestContext.clear();}
    }
}
