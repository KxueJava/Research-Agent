package org.wwz.ai.trigger.auth.github;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.web.bind.annotation.*;
import org.wwz.ai.api.dto.AdminAuthResponseDTO;
import org.wwz.ai.api.response.Response;
import org.wwz.ai.trigger.auth.AdminAuthService;
import org.wwz.ai.types.auth.AdminAuthContext;

@RestController
@lombok.extern.slf4j.Slf4j
@RequestMapping("/api/v1/admin/github")
public class GitHubOAuthController {
    private final GitHubOAuthProperties properties;
    private final GitHubOAuthState states;
    private final GitHubOAuthClient client;
    private final GitHubAccountStore accounts;
    private final AdminAuthService auth;
    public GitHubOAuthController(GitHubOAuthProperties properties, GitHubOAuthState states,
                                 GitHubOAuthClient client, GitHubAccountStore accounts, AdminAuthService auth) {
        this.properties = properties; this.states = states; this.client = client; this.accounts = accounts; this.auth = auth;
    }
    public record Availability(boolean enabled) { }
    public record Start(String authorizationUrl, String state, String callbackOrigin) { }
    public record Callback(String code, String state, String error) { }
    public record Completed(String action, AdminAuthResponseDTO auth) { }

    @ModelAttribute public void noCache(HttpServletResponse response) { response.setHeader("Cache-Control", "no-store"); }
    @GetMapping("/config") public Response<Availability> config() { return ok(new Availability(properties.isEnabled())); }
    @PostMapping("/start") public Response<Start> start(HttpServletRequest request) { return ok(begin(request, null)); }
    @PostMapping("/bind/start") public Response<Start> bind(HttpServletRequest request) {
        String userId = currentUserId();
        auth.activeUser(userId);
        return ok(begin(request, userId));
    }
    @GetMapping("/binding") public Response<GitHubAccountStore.Status> binding() {
        return ok(accounts.status(currentUserId()));
    }
    private Start begin(HttpServletRequest request, String userId) {
        properties.requireConfigured();
        var pending = states.create(request.getSession(true), userId);
        request.getSession().setMaxInactiveInterval(600);
        var uri = java.net.URI.create(properties.getRedirectUri());
        return new Start(client.authorizationUrl(pending), pending.state(), uri.getScheme() + "://" + uri.getRawAuthority());
    }
    @PostMapping("/complete") public Response<Completed> complete(@RequestBody Callback callback, HttpServletRequest request) {
        properties.requireConfigured();
        var pending = states.consume(request.getSession(false), callback.state());
        if (callback.error() != null && !callback.error().isBlank()) throw new IllegalArgumentException("已取消 GitHub 授权，可重新登录");
        if (pending.bindUserId() != null) {
            String header = request.getHeader("Authorization");
            if (header == null || !header.startsWith("Bearer ") || !pending.bindUserId().equals(
                    auth.authenticateAccessToken(header.substring(7)).userId())) {
                throw new IllegalArgumentException("绑定账号的登录状态已改变，请登录原账号后重新绑定");
            }
        }
        var identity = client.exchange(callback.code(), pending.verifier());
        String userId = accounts.resolve(identity, pending.bindUserId());
        var user = auth.activeUser(userId);
        if (pending.bindUserId() != null) return ok(new Completed("bind", null));
        request.changeSessionId();
        return ok(new Completed("login", auth.issueLogin(user, request.getRemoteAddr(), bounded(request.getHeader("User-Agent"), 512))));
    }
    @ExceptionHandler(IllegalArgumentException.class)
    public Response<Void> invalid(IllegalArgumentException error) { return Response.<Void>builder().code("0001").info(error.getMessage()).build(); }
    @ExceptionHandler(Exception.class)
    public Response<Void> failed(Exception error) {
        // Never return upstream errors, credentials, SQL, or authorization codes.
        log.warn("GitHub OAuth request failed type={}", error.getClass().getSimpleName());
        return Response.<Void>builder().code("0001").info("GitHub 登录未完成，请重新尝试或使用账号密码登录").build();
    }
    private static String currentUserId() {
        String id = AdminAuthContext.currentUserId();
        if (id == null) throw new IllegalArgumentException("请先登录");
        return id;
    }
    private static String bounded(String value, int length) { return value == null ? null : value.substring(0, Math.min(length, value.length())); }
    private static <T> Response<T> ok(T value) { return Response.<T>builder().code("0000").info("成功").data(value).build(); }
}
