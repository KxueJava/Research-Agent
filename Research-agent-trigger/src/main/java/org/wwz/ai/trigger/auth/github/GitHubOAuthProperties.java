package org.wwz.ai.trigger.auth.github;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import java.net.URI;

@Data
@Component
@ConfigurationProperties(prefix = "research.auth.github")
public class GitHubOAuthProperties {
    private String clientId = "";
    @lombok.ToString.Exclude
    private String clientSecret = "";
    private String redirectUri = "http://localhost:3001/login/github/callback";
    public boolean isEnabled() { return StringUtils.hasText(clientId) && StringUtils.hasText(clientSecret); }
    public void requireConfigured() {
        if (!isEnabled()) throw new IllegalArgumentException("GitHub 登录尚未配置，请使用账号密码登录");
        URI uri = URI.create(redirectUri);
        boolean local = "localhost".equals(uri.getHost()) || "127.0.0.1".equals(uri.getHost());
        if (uri.getHost() == null || uri.getUserInfo() != null || uri.getQuery() != null || uri.getFragment() != null
                || !"/login/github/callback".equals(uri.getPath())
                || !("https".equals(uri.getScheme()) || local && "http".equals(uri.getScheme()))) {
            throw new IllegalArgumentException("GitHub 回调地址配置无效，线上必须使用 HTTPS");
        }
    }
}
