package org.wwz.ai.test.domain;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.wwz.ai.infrastructure.dao.IAdminUserDao;
import org.wwz.ai.infrastructure.dao.po.AdminUser;
import org.wwz.ai.trigger.auth.AdminAuthFilter;
import org.wwz.ai.trigger.auth.AdminAuthService;
import org.wwz.ai.trigger.http.admin.AdminUserAdminController;

import java.util.concurrent.atomic.AtomicBoolean;
import org.mockito.ArgumentCaptor;
import static org.junit.Assert.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

public class AdminAccessBoundaryTest {
    private final ObjectMapper mapper = new ObjectMapper();

    @Test public void anonymousDataRequestsRequireLoginIncludingContextPath() throws Exception {
        for (String context : new String[]{"", "/research"}) {
            MockHttpServletRequest request = new MockHttpServletRequest("GET", context + "/data/previewData");
            request.setContextPath(context);
            MockHttpServletResponse response = new MockHttpServletResponse();
            AtomicBoolean invoked = new AtomicBoolean();
            new AdminAuthFilter(mock(AdminAuthService.class), mapper).doFilter(request, response,
                    (req, res) -> invoked.set(true));
            assertEquals(401, response.getStatus());
            assertFalse(invoked.get());
        }
    }

    @Test public void anonymousManagementCreateRequiresLogin() throws Exception {
        MockHttpServletResponse response = filter("POST", "/api/v1/admin/admin-user/create", false);
        assertEquals(401, response.getStatus());
    }

    @Test public void accountsCannotManageOtherAccounts() throws Exception {
        for (String path : new String[]{"admin-user/query-all", "admin-user/create"}) {
            assertEquals(path, 403, filter("POST", "/api/v1/admin/" + path, true).getStatus());
        }
    }

    @Test public void signedInUsersCanConfigureModelsAgentsAndCapabilities() throws Exception {
        for (String path : new String[]{"ai-client-model/create", "ai-client-api/query-enabled", "skills/upload",
                "featured-conversations/query-list", "ai-client-tool-mcp/query-all", "sub-agent-definitions/reload"}) {
            assertEquals(path, 204, filter("POST", "/api/v1/admin/" + path, true).getStatus());
        }
    }

    @Test public void ordinaryUsersCanReadWorkspaceCatalogsAndOwnProfile() throws Exception {
        for (String path : new String[]{"ai-client-model/query-enabled", "ai-client-model/query-enabled-grouped",
                "skills/list", "admin-user/me"}) {
            assertEquals(path, 204, filter("GET", "/api/v1/admin/" + path, true).getStatus());
        }
        assertEquals(204, filter("GET", "/data/allModels", true).getStatus());
    }

    @Test public void publicRegistrationIgnoresRequestedIdentityAndStatusAndPersistsUserRole() throws Exception {
        IAdminUserDao dao = mock(IAdminUserDao.class);
        AdminAuthService service = mock(AdminAuthService.class);
        when(dao.insert(any())).thenReturn(1);
        when(service.encodePassword(anyString())).thenReturn("encoded");
        AdminUserAdminController controller = new AdminUserAdminController();
        ReflectionTestUtils.setField(controller, "adminUserDao", dao);
        ReflectionTestUtils.setField(controller, "adminAuthService", service);
        MockMvc mvc = MockMvcBuilders.standaloneSetup(controller).build();
        mvc.perform(post("/api/v1/admin/admin-user/register").contentType("application/json")
                .content("{\"username\":\"new-user\",\"password\":\"strong-password\",\"userId\":\"victim\",\"status\":0,\"role\":\"ADMIN\"}"))
                .andExpect(status().isOk());
        ArgumentCaptor<AdminUser> inserted = ArgumentCaptor.forClass(AdminUser.class);
        verify(dao).insert(inserted.capture());
        assertNotEquals("victim", inserted.getValue().getUserId());
        assertEquals(Integer.valueOf(1), inserted.getValue().getStatus());
        assertEquals("USER", inserted.getValue().getRole());
    }

    private MockHttpServletResponse filter(String method, String path, boolean loggedIn) throws Exception {
        AdminAuthService service = mock(AdminAuthService.class);
        when(service.authenticateAccessToken("valid")).thenReturn(new AdminAuthService.AuthenticatedUser("ordinary", "name", "session"));
        MockHttpServletRequest request = new MockHttpServletRequest(method, path);
        if (loggedIn) request.addHeader("Authorization", "Bearer valid");
        MockHttpServletResponse response = new MockHttpServletResponse();
        new AdminAuthFilter(service, mapper).doFilter(request, response, (req, res) -> ((MockHttpServletResponse) res).setStatus(204));
        return response;
    }
}
