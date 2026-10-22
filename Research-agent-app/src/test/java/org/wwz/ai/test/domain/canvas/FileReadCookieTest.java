package org.wwz.ai.test.domain.canvas;
import org.junit.Test;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.mock.web.*;
import org.wwz.ai.trigger.auth.*;
import static org.junit.Assert.*;
import static org.mockito.Mockito.*;
public class FileReadCookieTest {
    @Test public void classifierIsServerOnlyAndDoesNotRevealScopeWithoutCredential() {
        var service=mock(org.wwz.ai.application.agent.file.ConversationFileAccessService.class);
        var controller=new org.wwz.ai.trigger.http.agent.AgentFileAccessController(service);
        assertEquals(403,controller.scopeKind("s","forged").getStatusCode().value());verifyNoInteractions(service);
        org.springframework.test.util.ReflectionTestUtils.setField(controller,"serviceToken","server-secret");
        when(service.isKnownScope("deleted")).thenReturn(true);
        assertEquals(java.util.Map.of("kind","conversation"),controller.scopeKind("deleted","server-secret").getBody());
    }
    @Test public void mirrorsOnlyExistingAccessTokenAndNeverIssuesCookieInCallback() throws Exception {
        var auth=mock(AdminAuthService.class);
        when(auth.authenticateAccessToken("existing")).thenReturn(new AdminAuthService.AuthenticatedUser("u","name","auth-session"));
        var filter=new AdminAuthFilter(auth,new ObjectMapper());
        var request=new MockHttpServletRequest("GET","/api/agent/conversation/sessions");request.addHeader("Authorization","Bearer existing");
        var response=new MockHttpServletResponse();filter.doFilter(request,response,(req,res)->{});
        String cookie=response.getHeader("Set-Cookie");
        assertTrue(cookie.contains("research_file_access=existing"));assertTrue(cookie.contains("HttpOnly"));assertTrue(cookie.contains("SameSite=Lax"));
        var callback=new MockHttpServletRequest("GET","/api/agent/file/access");callback.addHeader("Authorization","Bearer existing");
        var noCookie=new MockHttpServletResponse();filter.doFilter(callback,noCookie,(req,res)->{});
        assertNull(noCookie.getHeader("Set-Cookie"));
    }
}
