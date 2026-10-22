package org.wwz.ai.trigger.auth.github;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import javax.sql.DataSource;

@Component
@Profile("!test")
public class GitHubAccountSchema {
    public static final String DDL = "CREATE TABLE IF NOT EXISTS user_oauth_identity ("
            + "id BIGINT AUTO_INCREMENT PRIMARY KEY, provider VARCHAR(32) NOT NULL,"
            + "provider_user_id VARCHAR(64) NOT NULL, user_id VARCHAR(64) NOT NULL,"
            + "provider_login VARCHAR(255) NOT NULL, create_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,"
            + "CONSTRAINT uk_oauth_identity UNIQUE(provider,provider_user_id),"
            + "CONSTRAINT uk_oauth_user UNIQUE(provider,user_id))";
    public GitHubAccountSchema(@Qualifier("mysqlDataSource") DataSource dataSource) {
        // Fail startup if migration cannot run instead of presenting an unusable login button.
        new JdbcTemplate(dataSource).execute(DDL);
    }
}
