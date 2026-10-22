package org.wwz.ai.trigger.auth;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import javax.sql.DataSource;

/** Adds owner storage to existing databases without assigning historical images. */
@Component
@Profile("!test")
public class WorkspaceImageSchemaInitializer {
    private final JdbcTemplate jdbc;
    public WorkspaceImageSchemaInitializer(@Qualifier("mysqlDataSource") DataSource dataSource) {
        jdbc = new JdbcTemplate(dataSource);
    }
    @jakarta.annotation.PostConstruct public void initialize() {
        Integer tables = jdbc.queryForObject("SELECT COUNT(*) FROM information_schema.tables "
                + "WHERE table_schema = DATABASE() AND table_name = 'ai_agent_tool_output_image_generation'", Integer.class);
        if (tables == null || tables == 0) return; // New databases use schema.sql.
        Integer columns = jdbc.queryForObject("SELECT COUNT(*) FROM information_schema.columns "
                + "WHERE table_schema = DATABASE() AND table_name = 'ai_agent_tool_output_image_generation' "
                + "AND column_name = 'owner_user_id'", Integer.class);
        if (columns != null && columns == 0) {
            jdbc.execute("ALTER TABLE ai_agent_tool_output_image_generation ADD COLUMN owner_user_id VARCHAR(64) NULL, "
                    + "ADD INDEX idx_owner_source_created (owner_user_id, request_source, created_at)");
        }
    }
}
