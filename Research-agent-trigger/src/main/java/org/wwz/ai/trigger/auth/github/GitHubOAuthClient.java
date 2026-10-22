package org.wwz.ai.trigger.auth.github;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Component;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;

/** GitHub tokens remain on the server and are never persisted or logged. */
@Component
public class GitHubOAuthClient {
    private final GitHubOAuthProperties properties;
    private final ObjectMapper mapper;
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10))
            .followRedirects(HttpClient.Redirect.NEVER).build();
    public GitHubOAuthClient(GitHubOAuthProperties properties, ObjectMapper mapper) {
        this.properties = properties; this.mapper = mapper;
    }
    public record Identity(String id, String login) { }

    public String authorizationUrl(GitHubOAuthState.Pending pending) {
        properties.requireConfigured();
        return "https://github.com/login/oauth/authorize?client_id=" + encode(properties.getClientId())
                + "&redirect_uri=" + encode(properties.getRedirectUri()) + "&state=" + encode(pending.state())
                + "&code_challenge=" + encode(pending.challenge()) + "&code_challenge_method=S256&scope=";
    }

    public Identity exchange(String code, String verifier) {
        properties.requireConfigured();
        if (code == null || code.isBlank() || code.length() > 512) throw new IllegalArgumentException("缺少有效的 GitHub 授权码");
        try {
            String body = "client_id=" + encode(properties.getClientId()) + "&client_secret=" + encode(properties.getClientSecret())
                    + "&code=" + encode(code) + "&redirect_uri=" + encode(properties.getRedirectUri())
                    + "&code_verifier=" + encode(verifier);
            JsonNode token = send(HttpRequest.newBuilder(URI.create("https://github.com/login/oauth/access_token"))
                    .header("Content-Type", "application/x-www-form-urlencoded")
                    .POST(HttpRequest.BodyPublishers.ofString(body)));
            if (!token.path("access_token").isTextual() || token.path("access_token").asText().isBlank()) {
                throw new IllegalArgumentException("GitHub 授权码无效或已使用，请重新登录");
            }
            JsonNode user = send(HttpRequest.newBuilder(URI.create("https://api.github.com/user"))
                    .header("Authorization", "Bearer " + token.path("access_token").asText()).GET());
            String id = user.path("id").asText();
            String login = user.path("login").asText();
            if (!id.matches("[1-9][0-9]{0,19}") || !login.matches("[a-zA-Z0-9-]{1,100}")) {
                throw new IllegalArgumentException("GitHub 返回的账号身份无效");
            }
            return new Identity(id, login);
        } catch (IllegalArgumentException e) { throw e; }
        catch (InterruptedException e) { Thread.currentThread().interrupt(); throw new IllegalStateException("GitHub 登录已中断，请重试"); }
        catch (Exception e) { throw new IllegalStateException("暂时无法连接 GitHub，请稍后重试或使用账号密码登录"); }
    }

    private JsonNode send(HttpRequest.Builder request) throws Exception {
        var response = http.send(request.timeout(Duration.ofSeconds(12)).header("Accept", "application/json")
                .header("User-Agent", "Research-Agent-Login").build(), HttpResponse.BodyHandlers.ofString());
        if (response.statusCode() != 200) throw new IllegalStateException("GitHub 请求未完成");
        return mapper.readTree(response.body());
    }
    private static String encode(String value) { return URLEncoder.encode(value, StandardCharsets.UTF_8); }
}
