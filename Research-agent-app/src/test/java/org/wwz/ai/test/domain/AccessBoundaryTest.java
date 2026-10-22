package org.wwz.ai.test.domain;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.*;
import org.mockito.Mockito;
import org.springframework.mock.web.*;
import org.wwz.ai.trigger.auth.*;
import java.util.concurrent.atomic.AtomicBoolean;

public class AccessBoundaryTest {
    private AdminAuthService auth;
    private AdminAuthFilter filter;
    @Before public void setUp() {
        auth = Mockito.mock(AdminAuthService.class);
        Mockito.when(auth.authenticateAccessToken("valid")).thenReturn(
                new AdminAuthService.AuthenticatedUser("user-b", "b", "sid"));
        filter = new AdminAuthFilter(auth, new ObjectMapper());
    }
    private void assertDenied(String method, String path, String token, String contextPath, int status) throws Exception {
        var request = new MockHttpServletRequest(method, contextPath + path);
        request.setContextPath(contextPath);
        if (token != null) request.addHeader("Authorization", "Bearer " + token);
        var response = new MockHttpServletResponse();
        var reached = new AtomicBoolean();
        filter.doFilter(request, response, (req, res) -> reached.set(true));
        Assert.assertFalse("protected controller must not run", reached.get());
        Assert.assertEquals(status, response.getStatus());
    }
    @Test public void anonymousCannotCreateAdmin() throws Exception {
        assertDenied("POST", "/api/v1/admin/admin-user/create", null, "", 401);
    }
    @Test public void ordinaryUserCannotDeleteAnotherUser() throws Exception {
        assertDenied("DELETE", "/api/v1/admin/admin-user/delete-by-user-id/a", "valid", "", 403);
    }
    @Test public void anonymousCannotPreviewDatabase() throws Exception {
        assertDenied("GET", "/data/previewData", null, "", 401);
    }
    @Test public void contextPathCannotBypassAuthentication() throws Exception {
        assertDenied("GET", "/data/allModels", null, "/research", 401);
    }
    @Test public void ordinaryUserCanAccessOwnWorkspace() throws Exception {
        var request = new MockHttpServletRequest("GET", "/api/agent/conversation/sessions");
        request.addHeader("Authorization", "Bearer valid");
        var reached = new AtomicBoolean();
        filter.doFilter(request, new MockHttpServletResponse(), (req, res) -> reached.set(true));
        Assert.assertTrue(reached.get());
    }
    @Test public void accountsCannotUseLegacyCrossAccountManagement() throws Exception {
        assertDenied("DELETE", "/api/v1/admin/admin-user/delete-by-user-id/a", "valid", "", 403);
        assertDenied("GET", "/api/v1/admin/admin-user/query-all", "valid", "", 403);
    }
    @Test public void catalogAndSelfServiceEndpointsRemainAvailable() throws Exception {
        for (String path : java.util.List.of("/api/v1/admin/ai-client-model/query-enabled-grouped", "/api/v1/admin/admin-user/me")) {
            var request = new MockHttpServletRequest("GET", path);
            request.addHeader("Authorization", "Bearer valid");
            var reached = new AtomicBoolean();
            filter.doFilter(request, new MockHttpServletResponse(), (req, res) -> reached.set(true));
            Assert.assertTrue(reached.get());
        }
    }
    @Test public void signedInUsersCanManageWorkspaceConfigurationWithoutARole() throws Exception {
        for (String context : java.util.List.of("", "/research")) {
            for (String method : java.util.List.of("GET", "POST", "PUT", "DELETE")) {
                for (String resource : java.util.List.of("ai-client-api", "ai-client-model", "sub-agent-definitions", "skills", "ai-client-tool-mcp")) {
                    var request = new MockHttpServletRequest(method, context + "/api/v1/admin/" + resource + "/fixture");
                    request.setContextPath(context);
                    request.addHeader("Authorization", "Bearer valid");
                    var reached = new AtomicBoolean();
                    filter.doFilter(request, new MockHttpServletResponse(), (req, res) -> {
                        Assert.assertEquals("user-b", org.wwz.ai.types.auth.AdminAuthContext.current().userId());
                        reached.set(true);
                    });
                    Assert.assertTrue(method + " " + resource, reached.get());
                    Assert.assertNull(org.wwz.ai.types.auth.AdminAuthContext.current());
                }
            }
        }
    }
    @Test public void configurationStillRequiresAValidLogin() throws Exception {
        assertDenied("GET", "/api/v1/admin/ai-client-model/query-all", null, "", 401);
        Mockito.when(auth.authenticateAccessToken("expired")).thenThrow(new IllegalArgumentException("expired"));
        assertDenied("POST", "/api/v1/admin/sub-agent-definitions/create", "expired", "", 401);
    }
}
