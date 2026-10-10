package org.wwz.ai.trigger.auth;

import com.auth0.jwt.JWT;
import com.auth0.jwt.algorithms.Algorithm;
import com.auth0.jwt.interfaces.DecodedJWT;
import lombok.RequiredArgsConstructor;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.wwz.ai.api.dto.AdminAuthResponseDTO;
import org.wwz.ai.api.dto.AdminUserResponseDTO;
import org.wwz.ai.infrastructure.dao.IAdminAuthSessionDao;
import org.wwz.ai.infrastructure.dao.IAdminUserDao;
import org.wwz.ai.infrastructure.dao.po.AdminAuthSession;
import org.wwz.ai.infrastructure.dao.po.AdminUser;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.Date;
import java.util.UUID;

/** 认证、令牌签发和服务端会话撤销。 */
@Service
@RequiredArgsConstructor
public class AdminAuthService {

    private final IAdminUserDao adminUserDao;
    private final IAdminAuthSessionDao authSessionDao;
    private final PasswordEncoder passwordEncoder;
    private final AdminAuthProperties properties;

    public AdminUser authenticateCredentials(String username, String password) {
        if (!StringUtils.hasText(username) || !StringUtils.hasText(password)) {
            return null;
        }
        AdminUser user = adminUserDao.queryByUsername(username.trim());
        if (user == null || !Integer.valueOf(1).equals(user.getStatus())) {
            return null;
        }

        boolean valid = isBcrypt(user.getPassword())
                ? passwordEncoder.matches(password, user.getPassword())
                : password.equals(user.getPassword());
        if (!valid) {
            return null;
        }
        // 兼容历史明文账号：首次成功登录时立即升级，后续只保留 BCrypt 摘要。
        if (!isBcrypt(user.getPassword())) {
            String encoded = passwordEncoder.encode(password);
            adminUserDao.updatePasswordByUserId(user.getUserId(), encoded);
            user.setPassword(encoded);
        }
        return user;
    }

    public String encodePassword(String rawPassword) {
        return passwordEncoder.encode(rawPassword);
    }

    public boolean matchesPassword(String rawPassword, String storedPassword) {
        if (!StringUtils.hasText(rawPassword) || !StringUtils.hasText(storedPassword)) {
            return false;
        }
        return isBcrypt(storedPassword)
                ? passwordEncoder.matches(rawPassword, storedPassword)
                : rawPassword.equals(storedPassword);
    }

    public AdminAuthResponseDTO issueLogin(AdminUser user, String ip, String userAgent) {
        String sessionId = UUID.randomUUID().toString().replace("-", "");
        Instant now = Instant.now();
        Instant refreshExpiresAt = now.plusSeconds(properties.getRefreshTokenSeconds());
        String refreshToken = sign(user, sessionId, "refresh", refreshExpiresAt);
        LocalDateTime nowLocal = LocalDateTime.ofInstant(now, ZoneOffset.UTC);
        authSessionDao.insert(AdminAuthSession.builder()
                .sessionId(sessionId)
                .userId(user.getUserId())
                .refreshTokenHash(hash(refreshToken))
                .expiresAt(LocalDateTime.ofInstant(refreshExpiresAt, ZoneOffset.UTC))
                .createTime(nowLocal)
                .lastSeenAt(nowLocal)
                .ip(ip)
                .userAgent(userAgent)
                .build());
        String accessToken = sign(user, sessionId, "access", now.plusSeconds(properties.getAccessTokenSeconds()));
        return AdminAuthResponseDTO.builder()
                .user(toResponse(user))
                .accessToken(accessToken)
                .refreshToken(refreshToken)
                .accessTokenExpiresIn(properties.getAccessTokenSeconds())
                .build();
    }

    public AdminAuthResponseDTO refresh(String refreshToken) {
        DecodedJWT jwt = verify(refreshToken, "refresh");
        String sessionId = jwt.getClaim("sid").asString();
        AdminAuthSession session = authSessionDao.queryActiveById(sessionId);
        if (session == null || !MessageDigest.isEqual(
                hash(refreshToken).getBytes(StandardCharsets.UTF_8),
                session.getRefreshTokenHash().getBytes(StandardCharsets.UTF_8))) {
            throw new IllegalArgumentException("Refresh Token 已失效");
        }
        AdminUser user = activeUser(session.getUserId());
        Instant now = Instant.now();
        Instant refreshExpiresAt = now.plusSeconds(properties.getRefreshTokenSeconds());
        String nextRefreshToken = sign(user, sessionId, "refresh", refreshExpiresAt);
        authSessionDao.rotate(sessionId, hash(nextRefreshToken),
                LocalDateTime.ofInstant(now, ZoneOffset.UTC),
                LocalDateTime.ofInstant(refreshExpiresAt, ZoneOffset.UTC));
        return AdminAuthResponseDTO.builder()
                .user(toResponse(user))
                .accessToken(sign(user, sessionId, "access", now.plusSeconds(properties.getAccessTokenSeconds())))
                .refreshToken(nextRefreshToken)
                .accessTokenExpiresIn(properties.getAccessTokenSeconds())
                .build();
    }

    public AuthenticatedUser authenticateAccessToken(String accessToken) {
        DecodedJWT jwt = verify(accessToken, "access");
        String sessionId = jwt.getClaim("sid").asString();
        String userId = jwt.getSubject();
        AdminAuthSession session = authSessionDao.queryActiveById(sessionId);
        if (session == null || !userId.equals(session.getUserId())) {
            throw new IllegalArgumentException("登录会话已失效");
        }
        AdminUser user = activeUser(userId);
        return new AuthenticatedUser(user.getUserId(), user.getUsername(), sessionId);
    }

    public void logout(String token) {
        if (!StringUtils.hasText(token)) {
            return;
        }
        try {
            DecodedJWT jwt = verify(token, null);
            String sessionId = jwt.getClaim("sid").asString();
            if (StringUtils.hasText(sessionId)) {
                authSessionDao.revokeById(sessionId, LocalDateTime.now(ZoneOffset.UTC));
            }
        } catch (Exception ignored) {
            // 退出接口幂等：客户端令牌已损坏或过期时也应完成本地退出。
        }
    }

    public void logoutAll(String userId) {
        authSessionDao.revokeByUserId(userId, LocalDateTime.now(ZoneOffset.UTC));
    }

    public AdminUser activeUser(String userId) {
        AdminUser user = adminUserDao.queryByUserId(userId);
        if (user == null || !Integer.valueOf(1).equals(user.getStatus())) {
            throw new IllegalArgumentException("用户不存在或已被禁用");
        }
        return user;
    }

    public AdminUserResponseDTO toResponse(AdminUser user) {
        return AdminUserResponseDTO.builder()
                .id(user.getId())
                .userId(user.getUserId())
                .username(user.getUsername())
                .avatarUrl(user.getAvatarUrl())
                .status(user.getStatus())
                .createTime(user.getCreateTime())
                .updateTime(user.getUpdateTime())
                .build();
    }

    private DecodedJWT verify(String token, String expectedType) {
        if (!StringUtils.hasText(token)) {
            throw new IllegalArgumentException("缺少认证令牌");
        }
        DecodedJWT jwt = JWT.require(Algorithm.HMAC256(properties.getJwtSecret()))
                .withIssuer(properties.getIssuer())
                .build()
                .verify(token);
        String type = jwt.getClaim("typ").asString();
        if (expectedType != null && !expectedType.equals(type)) {
            throw new IllegalArgumentException("令牌类型错误");
        }
        return jwt;
    }

    private String sign(AdminUser user, String sessionId, String type, Instant expiresAt) {
        return JWT.create()
                .withIssuer(properties.getIssuer())
                .withSubject(user.getUserId())
                // Refresh rotation can happen within one second; include a nonce so
                // the replacement token is never byte-for-byte identical to its predecessor.
                .withClaim("jti", UUID.randomUUID().toString())
                .withClaim("username", user.getUsername())
                .withClaim("sid", sessionId)
                .withClaim("typ", type)
                .withIssuedAt(Date.from(Instant.now()))
                .withExpiresAt(Date.from(expiresAt))
                .sign(Algorithm.HMAC256(properties.getJwtSecret()));
    }

    private String hash(String value) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256")
                    .digest(value.getBytes(StandardCharsets.UTF_8));
            StringBuilder result = new StringBuilder(digest.length * 2);
            for (byte item : digest) {
                result.append(String.format("%02x", item));
            }
            return result.toString();
        } catch (Exception e) {
            throw new IllegalStateException("无法生成令牌摘要", e);
        }
    }

    private boolean isBcrypt(String value) {
        return value != null && value.matches("^\\$2[aby]\\$\\d{2}\\$.*");
    }

    public record AuthenticatedUser(String userId, String username, String sessionId) {
    }
}
