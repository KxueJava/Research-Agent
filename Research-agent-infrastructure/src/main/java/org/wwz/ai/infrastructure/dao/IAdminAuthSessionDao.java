package org.wwz.ai.infrastructure.dao;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.wwz.ai.infrastructure.dao.po.AdminAuthSession;

import java.time.LocalDateTime;

@Mapper
public interface IAdminAuthSessionDao {
    int insert(AdminAuthSession session);
    AdminAuthSession queryActiveById(@Param("sessionId") String sessionId);
    int rotate(@Param("sessionId") String sessionId,
               @Param("refreshTokenHash") String refreshTokenHash,
               @Param("lastSeenAt") LocalDateTime lastSeenAt,
               @Param("expiresAt") LocalDateTime expiresAt);
    int revokeById(@Param("sessionId") String sessionId, @Param("revokedAt") LocalDateTime revokedAt);
    int revokeByUserId(@Param("userId") String userId, @Param("revokedAt") LocalDateTime revokedAt);
}
