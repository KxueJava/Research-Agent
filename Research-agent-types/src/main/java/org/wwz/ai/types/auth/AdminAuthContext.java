package org.wwz.ai.types.auth;

/** 当前请求的管理员身份。由认证过滤器绑定，业务层不直接读取 Servlet 请求。 */
public final class AdminAuthContext {
    private static final ThreadLocal<Principal> HOLDER = new ThreadLocal<>();

    private AdminAuthContext() {
    }

    public static void bind(String userId, String username) {
        HOLDER.set(new Principal(userId, username));
    }

    public static Principal current() {
        return HOLDER.get();
    }

    public static String currentUserId() {
        Principal principal = HOLDER.get();
        return principal == null ? null : principal.userId();
    }

    public static void clear() {
        HOLDER.remove();
    }

    public record Principal(String userId, String username) {
    }
}
