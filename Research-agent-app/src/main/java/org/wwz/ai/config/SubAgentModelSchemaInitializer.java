package org.wwz.ai.config;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;

import javax.sql.DataSource;

/** 为已有数据库补齐子 Agent 模型引用，新库由 schema.sql 初始化。 */
@Configuration
@Profile("!test")
public class SubAgentModelSchemaInitializer {
    private final JdbcTemplate jdbc;

    public SubAgentModelSchemaInitializer(@Qualifier("mysqlDataSource") DataSource dataSource) {
        jdbc = new JdbcTemplate(dataSource);
    }

    @jakarta.annotation.PostConstruct
    public void initialize() {
        ensureColumn("ai_client_model", "supported_reasoning_efforts_json",
                "ALTER TABLE ai_client_model ADD COLUMN supported_reasoning_efforts_json JSON NULL "
                        + "COMMENT '上游确认支持的推理强度等级'");
        Integer tables = jdbc.queryForObject("SELECT COUNT(*) FROM information_schema.tables "
                + "WHERE table_schema = DATABASE() AND table_name = 'ai_agent_sub_agent_definition'", Integer.class);
        if (tables == null || tables == 0) {
            return;
        }
        Integer columns = jdbc.queryForObject("SELECT COUNT(*) FROM information_schema.columns "
                + "WHERE table_schema = DATABASE() AND table_name = 'ai_agent_sub_agent_definition' "
                + "AND column_name = 'model_config_id'", Integer.class);
        if (columns != null && columns == 0) {
            jdbc.execute("ALTER TABLE ai_agent_sub_agent_definition ADD COLUMN model_config_id BIGINT NULL "
                    + "COMMENT '模型配置行ID；NULL继承主Agent'");
        }
        Integer effortColumns = jdbc.queryForObject("SELECT COUNT(*) FROM information_schema.columns "
                + "WHERE table_schema = DATABASE() AND table_name = 'ai_agent_sub_agent_definition' "
                + "AND column_name = 'thinking_effort'", Integer.class);
        if (effortColumns != null && effortColumns == 0) {
            jdbc.execute("ALTER TABLE ai_agent_sub_agent_definition ADD COLUMN thinking_effort VARCHAR(16) NULL "
                    + "COMMENT '独立模型推理强度；NULL使用模型默认'");
        }
    }

    private void ensureColumn(String table, String column, String ddl) {
        Integer tables = jdbc.queryForObject("SELECT COUNT(*) FROM information_schema.tables "
                + "WHERE table_schema = DATABASE() AND table_name = ?", Integer.class, table);
        if (tables == null || tables == 0) return;
        Integer columns = jdbc.queryForObject("SELECT COUNT(*) FROM information_schema.columns "
                + "WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?",
                Integer.class, table, column);
        if (columns != null && columns == 0) jdbc.execute(ddl);
    }
}
