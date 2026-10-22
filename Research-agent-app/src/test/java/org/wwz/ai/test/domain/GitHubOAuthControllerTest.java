package org.wwz.ai.test.domain;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.Test;
import org.springframework.mock.web.*;
import org.wwz.ai.infrastructure.dao.IAdminUserDao;
import org.wwz.ai.infrastructure.dao.IAdminAuthSessionDao;
import org.wwz.ai.infrastructure.dao.po.AdminUser;
import org.wwz.ai.trigger.auth.*;
import org.wwz.ai.trigger.auth.github.*;
import org.springframework.security.crypto.password.PasswordEncoder;
import static org.junit.Assert.*;
import static org.mockito.Mockito.*;

public class GitHubOAuthControllerTest {
    @Test public void publicRoutesAreNarrowAndBindingRequiresAuthentication() throws Exception {
        for (String path : new String[]{"config", "start", "complete", "binding", "bind/start"}) {
            var request = new MockHttpServletRequest(path.equals("config") || path.equals("binding") ? "GET" : "POST", "/api/v1/admin/github/" + path);
            var response = new MockHttpServletResponse();
            new AdminAuthFilter(mock(AdminAuthService.class), new ObjectMapper()).doFilter(request, response, (req,res) -> ((jakarta.servlet.http.HttpServletResponse)res).setStatus(204));
            assertEquals(path, path.equals("binding") || path.equals("bind/start") ? 401 : 204, response.getStatus());
        }
    }
    @Test public void oauthOnlyAccountCannotUseSentinelAsPassword() {
        var users = mock(IAdminUserDao.class);
        when(users.queryByUsername("github_user")).thenReturn(AdminUser.builder().userId("id").username("github_user").status(1).password("!oauth:known-value").build());
        var auth = new AdminAuthService(users, mock(IAdminAuthSessionDao.class), mock(PasswordEncoder.class), new AdminAuthProperties());
        assertNull(auth.authenticateCredentials("github_user", "!oauth:known-value"));
        assertFalse(auth.matchesPassword("!oauth:known-value", "!oauth:known-value"));
    }
    @Test public void callbackChecksStateBeforeContactingGithubAndBindChecksCurrentAccount() {
        var properties = new GitHubOAuthProperties(); properties.setClientId("test"); properties.setClientSecret("test");
        var states = new GitHubOAuthState(); var client = mock(GitHubOAuthClient.class);
        var accounts = mock(GitHubAccountStore.class); var auth = mock(AdminAuthService.class);
        var controller = new GitHubOAuthController(properties, states, client, accounts, auth);
        var request = new MockHttpServletRequest(); var session = new MockHttpSession(); request.setSession(session);
        assertThrows(IllegalArgumentException.class, () -> controller.complete(new GitHubOAuthController.Callback("code", "bad-state", null), request));
        var pending = states.create(session, "owner");
        assertThrows(IllegalArgumentException.class, () -> controller.complete(new GitHubOAuthController.Callback("code", pending.state(), null), request));
        verifyNoInteractions(client, accounts);
    }
    @Test public void successfulLoginIssuesExistingTokensAndReplayCannotIssueTwice() {
        var properties = new GitHubOAuthProperties(); properties.setClientId("test"); properties.setClientSecret("test");
        var states = new GitHubOAuthState(); var client = mock(GitHubOAuthClient.class);
        var accounts = mock(GitHubAccountStore.class); var auth = mock(AdminAuthService.class);
        var controller = new GitHubOAuthController(properties, states, client, accounts, auth);
        var request = new MockHttpServletRequest(); var session = new MockHttpSession(); request.setSession(session);
        var pending = states.create(session, null); var identity = new GitHubOAuthClient.Identity("123", "one");
        var user = AdminUser.builder().userId("local").status(1).build();
        when(client.exchange("code", pending.verifier())).thenReturn(identity);
        when(accounts.resolve(identity, null)).thenReturn("local"); when(auth.activeUser("local")).thenReturn(user);
        var callback = new GitHubOAuthController.Callback("code", pending.state(), null);
        assertEquals("login", controller.complete(callback, request).getData().action());
        verify(auth).issueLogin(eq(user), anyString(), nullable(String.class));
        assertThrows(IllegalArgumentException.class, () -> controller.complete(callback, request));
        verify(client, times(1)).exchange(anyString(), anyString());
    }
    @Test public void authorizationIncludesPkceWithoutRequestingRepositories() {
        var properties = new GitHubOAuthProperties(); properties.setClientId("test"); properties.setClientSecret("secret");
        var client = new GitHubOAuthClient(properties, new ObjectMapper());
        var url = client.authorizationUrl(new GitHubOAuthState().create(new MockHttpSession(), null));
        assertTrue(url.contains("code_challenge_method=S256")); assertTrue(url.endsWith("scope="));
        assertFalse(url.contains("secret")); assertFalse(url.contains("repo"));
    }
}
