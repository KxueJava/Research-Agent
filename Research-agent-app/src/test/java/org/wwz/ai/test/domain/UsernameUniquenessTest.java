package org.wwz.ai.test.domain;

import org.junit.Test;
import org.junit.Assert;
import org.mockito.Mockito;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.test.util.ReflectionTestUtils;
import org.wwz.ai.trigger.auth.AdminAuthSchemaInitializer;
import org.wwz.ai.trigger.auth.AdminAuthService;
import org.wwz.ai.trigger.http.admin.AdminUserAdminController;
import org.wwz.ai.infrastructure.dao.IAdminUserDao;
import org.wwz.ai.api.dto.AdminUserLoginRequestDTO;
import java.nio.charset.StandardCharsets;
import java.util.UUID;

public class UsernameUniquenessTest {
    private DriverManagerDataSource dataSource() {
        return new DriverManagerDataSource("jdbc:h2:mem:user_" + UUID.randomUUID()
                + ";MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1", "sa", "");
    }
    @Test public void freshSchemaRejectsDuplicateUsernames() throws Exception {
        var jdbc = new JdbcTemplate(dataSource());
        String schema = new String(new ClassPathResource("db/schema.sql").getInputStream().readAllBytes(), StandardCharsets.UTF_8);
        int start = schema.indexOf("CREATE TABLE IF NOT EXISTS admin_user (");
        String table = schema.substring(start, schema.indexOf(") ENGINE=", start) + 1);
        jdbc.execute(table);
        jdbc.update("INSERT INTO admin_user(user_id,username,password) VALUES ('u1','same','hash')");
        jdbc.update("INSERT INTO admin_user(user_id,username,password) VALUES ('other','other','hash')");
        Assert.assertThrows(DataIntegrityViolationException.class, () -> jdbc.update(
                "INSERT INTO admin_user(user_id,username,password) VALUES ('u2','same','hash')"));
        Assert.assertThrows(DataIntegrityViolationException.class, () -> jdbc.update(
                "UPDATE admin_user SET username='same' WHERE user_id='other'"));
    }
    @Test public void legacySchemaGetsAnIdempotentUniqueConstraint() {
        var ds = dataSource();
        var jdbc = Mockito.spy(new JdbcTemplate(ds));
        jdbc.execute("CREATE TABLE admin_user(id BIGINT AUTO_INCREMENT PRIMARY KEY, user_id VARCHAR(64), "
                + "username TEXT NOT NULL, password VARCHAR(128), avatar_url TEXT, role VARCHAR(16))");
        jdbc.update("INSERT INTO admin_user(user_id,username) VALUES ('u1','first')");
        // Existing initializer's MySQL-only role-column query is outside this test.
        Mockito.doReturn(1).when(jdbc).queryForObject(Mockito.contains("column_name = 'role'"), Mockito.eq(Integer.class));
        var initializer = new AdminAuthSchemaInitializer(ds);
        ReflectionTestUtils.setField(initializer, "jdbcTemplate", jdbc);
        initializer.initialize(); initializer.initialize();
        Assert.assertThrows(DataIntegrityViolationException.class, () -> jdbc.update(
                "INSERT INTO admin_user(user_id,username) VALUES ('u2','first')"));
        Assert.assertEquals(1, (int) jdbc.queryForObject("SELECT COUNT(*) FROM admin_user", Integer.class));
    }
    @Test public void legacyDuplicatesAreReportedWithoutChangingAccounts() {
        var ds = dataSource();
        var jdbc = Mockito.spy(new JdbcTemplate(ds));
        jdbc.execute("CREATE TABLE admin_user(id BIGINT AUTO_INCREMENT PRIMARY KEY, user_id VARCHAR(64), "
                + "username TEXT NOT NULL, password VARCHAR(128), avatar_url TEXT, role VARCHAR(16))");
        jdbc.update("INSERT INTO admin_user(user_id,username) VALUES ('u1','same'),('u2','same')");
        Mockito.doReturn(1).when(jdbc).queryForObject(Mockito.contains("column_name = 'role'"), Mockito.eq(Integer.class));
        var initializer = new AdminAuthSchemaInitializer(ds);
        ReflectionTestUtils.setField(initializer, "jdbcTemplate", jdbc);
        var error = Assert.assertThrows(IllegalStateException.class, initializer::initialize);
        Assert.assertTrue(error.getMessage().contains("重复用户名"));
        Assert.assertEquals(2, (int) jdbc.queryForObject("SELECT COUNT(*) FROM admin_user", Integer.class));
    }
    @Test public void registrationRaceReturnsDuplicateNameInsteadOfInternalError() {
        var dao = Mockito.mock(IAdminUserDao.class);
        Mockito.when(dao.insert(Mockito.any())).thenThrow(new DuplicateKeyException("unique username"));
        var controller = new AdminUserAdminController();
        ReflectionTestUtils.setField(controller, "adminUserDao", dao);
        ReflectionTestUtils.setField(controller, "adminAuthService", Mockito.mock(AdminAuthService.class));
        var credentials = new AdminUserLoginRequestDTO();
        credentials.setUsername("same"); credentials.setPassword("password123");
        var response = controller.register(credentials);
        Assert.assertEquals("用户名已存在", response.getInfo());
        Assert.assertEquals(Boolean.FALSE, response.getData());
    }
}
