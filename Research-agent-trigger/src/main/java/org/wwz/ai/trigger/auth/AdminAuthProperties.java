package org.wwz.ai.trigger.auth;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;

@Data
@ConfigurationProperties(prefix = "research.auth")
public class AdminAuthProperties {
    /** 开发环境默认值仅用于本地启动，生产环境必须覆盖。 */
    private String jwtSecret = "research-local-secret-change-me-2026";
    private String issuer = "research";
    private long accessTokenSeconds = 900;
    private long refreshTokenSeconds = 2_592_000;
}
