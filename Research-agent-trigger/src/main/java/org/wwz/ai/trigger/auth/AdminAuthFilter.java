package org.wwz.ai.trigger.auth;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.MediaType;
import org.springframework.util.StringUtils;
import org.springframework.web.filter.OncePerRequestFilter;
import org.wwz.ai.api.response.Response;
import org.wwz.ai.types.auth.AdminAuthContext;
import org.wwz.ai.types.enums.ResponseCode;

import java.io.IOException;

/** 校验工作台和管理接口的 Bearer Access Token。 */
@Slf4j
@RequiredArgsConstructor
public class AdminAuthFilter extends OncePerRequestFilter {

    private final AdminAuthService adminAuthService;
    private final ObjectMapper objectMapper;

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        String path = resolvePath(request);
        if ("OPTIONS".equalsIgnoreCase(request.getMethod())) {
            return true;
        }
        return "/web/health".equals(path)
                || "GET".equals(request.getMethod()) && "/api/agent/ui-features".equals(path)
                || path.startsWith("/actuator/")
                || "/api/v1/admin/admin-user/login".equals(path)
                || "/api/v1/admin/admin-user/register".equals(path)
                || "/api/v1/admin/admin-user/refresh".equals(path)
                || "GET".equals(request.getMethod()) && "/api/v1/admin/github/config".equals(path)
                // The scope classifier has a separate constant-time server credential check.
                || "GET".equals(request.getMethod()) && "/api/agent/file/scope-kind".equals(path)
                || "POST".equals(request.getMethod()) && java.util.Set.of(
                        "/api/v1/admin/github/start", "/api/v1/admin/github/complete").contains(path);
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {
        String path = resolvePath(request);
        boolean protectedPath = path.startsWith("/api/v1/admin/")
                || path.startsWith("/api/agent/")
                || path.startsWith("/web/api/")
                || path.startsWith("/1/web/api/")
                || path.equals("/data") || path.startsWith("/data/");
        if (!protectedPath) {
            filterChain.doFilter(request, response);
            return;
        }

        String authorization = request.getHeader("Authorization");
        String token = authorization != null && authorization.startsWith("Bearer ")
                ? authorization.substring("Bearer ".length()).trim()
                : null;
        if (!StringUtils.hasText(token)) {
            writeUnauthorized(response, "请先登录");
            return;
        }

        AdminAuthService.AuthenticatedUser user;
        try {
            user = adminAuthService.authenticateAccessToken(token);
        } catch (Exception e) {
            log.warn("访问令牌校验失败 path={} reason={}", path, e.getMessage());
            writeUnauthorized(response, "登录已过期，请重新登录");
            return;
        }

        // /admin is a historical route prefix, not a separate product role.
        // Workspace configuration is available to every authenticated user.
        // Legacy cross-account CRUD remains unavailable; self-service uses the token identity.
        if (path.startsWith("/api/v1/admin/admin-user/")
                && !isSelfServiceAccountEndpoint(request.getMethod(), path)) {
            writeDenied(response);
            return;
        }
        AdminAuthContext.bind(user.userId(), user.username());
        // Native iframe/image requests cannot attach a Bearer header. Mirror only the existing
        // short-lived access token in an HttpOnly cookie; Python uses it solely for owned file reads.
        // The backend ownership callback must never mint/rotate this cookie.
        if (!"/api/agent/file/access".equals(path) && !"/api/agent/file/identity".equals(path)) {
            boolean logout="/api/v1/admin/admin-user/logout".equals(path);
            response.addHeader("Set-Cookie",org.springframework.http.ResponseCookie.from("research_file_access",logout?"":token)
                    .httpOnly(true).secure(request.isSecure()).sameSite("Lax").path("/")
                    .maxAge(logout?0:900).build().toString());
        }
        try {
            // 只有令牌校验允许被 catch 成 401。下游过滤器与控制器的异常必须原样抛出：
            // 这里以前把整条链都包在 catch 里，任何服务端故障都会被伪装成"登录已过期"，
            // 前端据此清掉本地会话把用户踢回登录页，真实原因也被完全掩盖（且无任何日志）。
            filterChain.doFilter(request, response);
        } finally {
            AdminAuthContext.clear();
        }
    }

    private static String resolvePath(HttpServletRequest request) {
        String uri = request.getRequestURI();
        String contextPath = request.getContextPath();
        return StringUtils.hasText(contextPath) && uri.startsWith(contextPath)
                ? uri.substring(contextPath.length()) : uri;
    }

    private static boolean isSelfServiceAccountEndpoint(String method, String path) {
        return switch (method) {
            case "GET" -> "/api/v1/admin/admin-user/me".equals(path);
            case "PUT" -> java.util.Set.of(
                    "/api/v1/admin/admin-user/profile", "/api/v1/admin/admin-user/password").contains(path);
            case "POST" -> "/api/v1/admin/admin-user/logout".equals(path);
            default -> false;
        };
    }

    private void writeDenied(HttpServletResponse response) throws IOException {
        response.setStatus(HttpServletResponse.SC_FORBIDDEN);
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setCharacterEncoding("UTF-8");
        response.getWriter().write(objectMapper.writeValueAsString(Response.builder()
                .code(ResponseCode.UN_ERROR.getCode()).info("仅支持操作当前登录账号").data(null).build()));
    }

    private void writeUnauthorized(HttpServletResponse response, String info) throws IOException {
        response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setCharacterEncoding("UTF-8");
        response.getWriter().write(objectMapper.writeValueAsString(Response.builder()
                .code(ResponseCode.LOGIN_FAILED.getCode())
                .info(info)
                .data(null)
                .build()));
    }
}
