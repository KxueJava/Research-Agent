package org.wwz.ai.trigger.auth;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

import javax.sql.DataSource;
import org.springframework.jdbc.core.ConnectionCallback;
import java.sql.ResultSet;
import java.util.HashMap;
import java.util.Map;

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
                    + "username VARCHAR(255) NOT NULL UNIQUE,"
                    + "password VARCHAR(128) NOT NULL,"
                    + "avatar_url TEXT NULL,"
                    + "role VARCHAR(16) NOT NULL DEFAULT 'USER',"
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
        Integer roleColumn = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() "
                        + "AND table_name = 'admin_user' AND column_name = 'role'", Integer.class);
        if (roleColumn != null && roleColumn == 0) {
            // Do not elevate accounts previously created by the public registration API.
            jdbcTemplate.execute("ALTER TABLE admin_user ADD COLUMN role VARCHAR(16) NOT NULL DEFAULT 'USER'");
        }
        ensureUniqueUsername();
    }

    private boolean hasUsernameUniqueIndex() {
        return Boolean.TRUE.equals(jdbcTemplate.execute((ConnectionCallback<Boolean>) connection -> {
            Map<String, java.util.List<String>> columns = new HashMap<>();
            try (ResultSet indexes = connection.getMetaData().getIndexInfo(connection.getCatalog(), null, "admin_user", true, false)) {
                while (indexes.next()) {
                    String index = indexes.getString("INDEX_NAME");
                    String column = indexes.getString("COLUMN_NAME");
                    if (index != null && column != null) columns.computeIfAbsent(index, key -> new java.util.ArrayList<>()).add(column);
                }
            }
            return columns.values().stream().anyMatch(value -> value.size() == 1 && "username".equalsIgnoreCase(value.get(0)));
        }));
    }

    private void ensureUniqueUsername() {
        if (hasUsernameUniqueIndex()) return;
        Integer invalid = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM admin_user WHERE username IS NULL OR CHAR_LENGTH(username) > 255", Integer.class);
        if (invalid != null && invalid > 0) {
            throw new IllegalStateException("admin_user 存在空值或超长用户名，请人工修正后重新启动；未修改账号数据");
        }
        Integer duplicates = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM (SELECT username FROM admin_user GROUP BY username HAVING COUNT(*) > 1) duplicate_names", Integer.class);
        if (duplicates != null && duplicates > 0) {
            throw new IllegalStateException("admin_user 存在重复用户名，请人工处理后重新启动；未删除或改名任何账号");
        }
        try {
            jdbcTemplate.execute("ALTER TABLE admin_user MODIFY COLUMN username VARCHAR(255) NOT NULL");
            jdbcTemplate.execute("ALTER TABLE admin_user ADD CONSTRAINT uk_admin_username UNIQUE (username)");
        } catch (org.springframework.dao.DataAccessException error) {
            // Another application instance may have installed the same constraint.
            if (!hasUsernameUniqueIndex()) {
                throw new IllegalStateException("无法建立用户名唯一约束，请检查存量数据和数据库 DDL 权限", error);
            }
        }
    }
}
