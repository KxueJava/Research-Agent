package org.wwz.ai.test.dao;

import org.junit.BeforeClass;
import org.junit.Assume;
import org.mybatis.spring.annotation.MapperScan;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.test.context.ContextConfiguration;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.annotation.Transactional;
import org.wwz.ai.config.DataSourceConfig;
import org.wwz.ai.test.domain.canvas.IsolatedUiDatabase;

import javax.sql.DataSource;

/** Real mapper/XML wiring, without application runners, models, MCP or persistent fallback DBs. */
@ContextConfiguration(classes=IsolatedDaoSupport.MapperConfiguration.class)
@Transactional
public abstract class IsolatedDaoSupport {
    @BeforeClass public static void requireExplicitOptIn() {
        Assume.assumeTrue("Run with scripts/stage9-java-isolated.py", "true".equals(System.getenv("RESEARCH_UI_DB_TEST")));
    }

    @DynamicPropertySource static void database(DynamicPropertyRegistry properties) {
        var source = IsolatedUiDatabase.source();
        properties.add("spring.datasource.mysql.url", source::getUrl);
        properties.add("spring.datasource.mysql.username", source::getUsername);
        properties.add("spring.datasource.mysql.password", source::getPassword);
        properties.add("spring.datasource.mysql.driver-class-name", () -> "com.mysql.cj.jdbc.Driver");
    }

    @Configuration
    @Import(DataSourceConfig.class)
    @MapperScan("org.wwz.ai.infrastructure.dao")
    static class MapperConfiguration {
        @Bean DataSourceTransactionManager transactionManager(DataSource source) {
            return new DataSourceTransactionManager(source);
        }
    }
}
