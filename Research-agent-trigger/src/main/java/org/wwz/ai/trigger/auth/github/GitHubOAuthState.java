package org.wwz.ai.trigger.auth.github;

import jakarta.servlet.http.HttpSession;
import org.springframework.stereotype.Component;
import java.io.Serializable;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Clock;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.Map;

/** Short-lived, single-use, browser-session-bound authorization transactions. */
@Component
public class GitHubOAuthState {
    private static final String KEY = GitHubOAuthState.class.getName();
    private final Clock clock;
    private final SecureRandom random = new SecureRandom();
    public GitHubOAuthState() { this(Clock.systemUTC()); }
    public GitHubOAuthState(Clock clock) { this.clock = clock; }

    public record Pending(String state, String verifier, String challenge,
                          String bindUserId, long expiresAt) implements Serializable { }

    public Pending create(HttpSession session, String bindUserId) {
        synchronized (session) {
            Map<String, Pending> pending = transactions(session);
            pending.values().removeIf(item -> item.expiresAt() <= clock.instant().getEpochSecond());
            while (pending.size() >= 5) pending.remove(pending.keySet().iterator().next());
            String verifier = nonce();
            Pending item = new Pending(nonce(), verifier, challenge(verifier), bindUserId,
                    clock.instant().getEpochSecond() + 600);
            pending.put(item.state(), item);
            session.setAttribute(KEY, pending);
            return item;
        }
    }

    public Pending consume(HttpSession session, String state) {
        if (session == null || state == null || state.length() > 100) throw invalid();
        synchronized (session) {
            Map<String, Pending> pending = transactions(session);
            Pending item = pending.remove(state);
            session.setAttribute(KEY, pending);
            if (item == null || item.expiresAt() <= clock.instant().getEpochSecond()) throw invalid();
            return item;
        }
    }

    @SuppressWarnings("unchecked")
    private Map<String, Pending> transactions(HttpSession session) {
        Object value = session.getAttribute(KEY);
        return value instanceof Map ? new LinkedHashMap<>((Map<String, Pending>) value) : new LinkedHashMap<>();
    }
    private IllegalArgumentException invalid() { return new IllegalArgumentException("GitHub 授权已过期或无效，请重新发起登录"); }
    private String nonce() {
        byte[] bytes = new byte[32]; random.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }
    private String challenge(String verifier) {
        try { return Base64.getUrlEncoder().withoutPadding().encodeToString(
                MessageDigest.getInstance("SHA-256").digest(verifier.getBytes(StandardCharsets.US_ASCII))); }
        catch (Exception e) { throw new IllegalStateException("PKCE 初始化失败", e); }
    }
}
