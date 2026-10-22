package org.wwz.ai.test;

import org.junit.Test;
import org.springframework.boot.SpringBootConfiguration;
import org.springframework.boot.WebApplicationType;
import org.springframework.boot.autoconfigure.EnableAutoConfiguration;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.context.annotation.Import;
import org.springframework.util.Assert;
import org.wwz.ai.config.DataSourceConfig;

/**
 * 数据源配置 profile 回归。
 * test profile 明确禁用数据库链路时，不应再强制解析 mysql 相关占位符。
 */
public class DataSourceConfigProfileTest {

    @Test
    public void shouldNotCreateDatasourceBeansUnderTestProfile() {
        try (ConfigurableApplicationContext ignored = new SpringApplicationBuilder(DataSourceProfileProbeApplication.class)
                .web(WebApplicationType.NONE)
                .run(
                        "--spring.main.banner-mode=off",
                        "--spring.profiles.active=test"
                )) {
            Assert.isTrue(!ignored.containsBean("mysqlDataSource"), "test profile 必须排除业务数据源");
        }
    }

    @Test
    public void shouldNotCreateProductionDatasourceWhenMysqlPropertiesAreMissing() {
        try (ConfigurableApplicationContext context = new SpringApplicationBuilder(DataSourceProfileProbeApplication.class)
                .web(WebApplicationType.NONE)
                .run(
                        "--spring.main.banner-mode=off",
                        "--spring.profiles.active=prod",
                        "--spring.config.location=optional:classpath:/application-test.yml",
                        "--spring.datasource.mysql.driver-class-name=",
                        "--spring.datasource.mysql.url=",
                        "--spring.datasource.mysql.username=",
                        "--spring.datasource.url=jdbc:h2:mem:stage9-profile-probe",
                        "--spring.datasource.driver-class-name=org.h2.Driver",
                        "--spring.sql.init.mode=never"
                )) {
            Assert.isTrue(!context.containsBean("mysqlDataSource"), "mysqlDataSource 不应在缺失 mysql 配置时创建");
        }
    }

    @SpringBootConfiguration
    @Import(DataSourceConfig.class)
    static class DataSourceProfileProbeApplication {
    }
}
