package org.wwz.ai.trigger.auth;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

import javax.sql.DataSource;

/** 为已有本地数据库补齐认证表和头像列；新库仍由 schema.sql 完整初始化。 */
@Slf4j
@Component
@Profile("!test")
public class AdminAuthSchemaInitializer {

    private final JdbcTemplate jdbcTemplate;

    public AdminAuthSchemaInitializer(@Qualifier("mysqlDataSource") DataSource dataSource) {
        this.jdbcTemplate = new JdbcTemplate(dataSource);
    }

    @jakarta.annotation.PostConstruct
    public void initialize() {
        log.info("Initializing authentication schema against mysqlDataSource");
        try {
            jdbcTemplate.execute("CREATE TABLE IF NOT EXISTS admin_user ("
                    + "id BIGINT AUTO_INCREMENT PRIMARY KEY,"
                    + "user_id VARCHAR(64) NOT NULL UNIQUE,"
                    + "username VARCHAR(255) NOT NULL,"
                    + "password VARCHAR(128) NOT NULL,"
                    + "avatar_url TEXT NULL,"
                    + "status TINYINT DEFAULT 1,"
                    + "create_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,"
                    + "update_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP"
                    + ")");
        } catch (Exception e) {
            log.error("初始化 admin_user 失败，注册功能不可用", e);
        }
        try {
            jdbcTemplate.execute("CREATE TABLE IF NOT EXISTS admin_auth_session ("
                    + "session_id VARCHAR(64) NOT NULL PRIMARY KEY,"
                    + "user_id VARCHAR(64) NOT NULL,"
                    + "refresh_token_hash VARCHAR(128) NOT NULL,"
                    + "expires_at TIMESTAMP NOT NULL,"
                    + "revoked_at TIMESTAMP NULL,"
                    + "create_time TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,"
                    + "last_seen_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,"
                    + "ip VARCHAR(64) NULL,"
                    + "user_agent VARCHAR(512) NULL"
                    + ")");
        } catch (Exception e) {
            log.error("初始化 admin_auth_session 失败，登录会话可能不可用", e);
        }
        try {
            jdbcTemplate.execute("ALTER TABLE admin_user ADD COLUMN avatar_url TEXT NULL");
        } catch (Exception e) {
            // 已存在时数据库会报重复列，忽略该情况；其他异常会记录供部署检查。
            if (e.getMessage() != null && !e.getMessage().toLowerCase().contains("duplicate")) {
                log.warn("补齐 admin_user.avatar_url 失败: {}", e.getMessage());
            }
        }
    }
}
