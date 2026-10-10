package org.wwz.ai.infrastructure.dao.po;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/** 服务端可撤销的 Refresh Token 会话。 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AdminAuthSession {
    private String sessionId;
    private String userId;
    private String refreshTokenHash;
    private LocalDateTime expiresAt;
    private LocalDateTime revokedAt;
    private LocalDateTime createTime;
    private LocalDateTime lastSeenAt;
    private String ip;
    private String userAgent;
}
