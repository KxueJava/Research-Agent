-- 补齐 schema.sql 中新增、但线上 MySQL 从未执行的两处结构
-- 背景：DataAgentInitRunner 只在 H2 下执行 schema.sql，MySQL 需要手动应用

-- 1) admin_user.avatar_url（schema.sql 第 30 行已有，线上缺失）
ALTER TABLE admin_user
    ADD COLUMN avatar_url TEXT NULL COMMENT '头像地址或数据地址' AFTER password;

-- 2) admin_auth_session（schema.sql 第 40-53 行）
CREATE TABLE IF NOT EXISTS admin_auth_session
(
    session_id         VARCHAR(64)  NOT NULL COMMENT '令牌会话 ID',
    user_id            VARCHAR(64)  NOT NULL COMMENT '管理员用户 ID',
    refresh_token_hash VARCHAR(128) NOT NULL COMMENT 'Refresh Token 摘要',
    expires_at         DATETIME     NOT NULL COMMENT 'Refresh Token 过期时间',
    revoked_at         DATETIME     NULL COMMENT '撤销时间',
    create_time        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_seen_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ip                 VARCHAR(64)  NULL,
    user_agent         VARCHAR(512) NULL,
    PRIMARY KEY (session_id),
    KEY idx_auth_session_user (user_id, revoked_at),
    KEY idx_auth_session_expire (expires_at)
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_0900_ai_ci COMMENT ='管理员登录会话';
