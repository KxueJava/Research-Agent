package org.wwz.ai.trigger.auth;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.Ordered;
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
        String path = request.getRequestURI();
        if ("OPTIONS".equalsIgnoreCase(request.getMethod())) {
            return true;
        }
        return "/web/health".equals(path)
                || path.startsWith("/actuator/")
                || "/api/v1/admin/admin-user/login".equals(path)
                || "/api/v1/admin/admin-user/create".equals(path)
                || "/api/v1/admin/admin-user/refresh".equals(path);
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {
        String path = request.getRequestURI();
        boolean protectedPath = path.startsWith("/api/v1/admin/")
                || path.startsWith("/api/agent/")
                || path.startsWith("/web/api/")
                || path.startsWith("/1/web/api/");
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

        AdminAuthContext.bind(user.userId(), user.username());
        try {
            // 只有令牌校验允许被 catch 成 401。下游过滤器与控制器的异常必须原样抛出：
            // 这里以前把整条链都包在 catch 里，任何服务端故障都会被伪装成"登录已过期"，
            // 前端据此清掉本地会话把用户踢回登录页，真实原因也被完全掩盖（且无任何日志）。
            filterChain.doFilter(request, response);
        } finally {
            AdminAuthContext.clear();
        }
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
