package org.wwz.ai.test.domain;

import org.junit.Test;
import org.junit.Assert;
import org.mockito.Mockito;
import org.springframework.core.io.ClassPathResource;
import org.apache.ibatis.builder.xml.XMLMapperBuilder;
import org.apache.ibatis.session.Configuration;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.wwz.ai.infrastructure.dao.IAdminAuthSessionDao;
import org.wwz.ai.infrastructure.dao.IAdminUserDao;
import org.wwz.ai.infrastructure.dao.po.AdminUser;
import org.wwz.ai.trigger.auth.AdminAuthService;
import org.wwz.ai.trigger.auth.AdminAuthProperties;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.apache.ibatis.mapping.BoundSql;
import java.util.*;
import java.util.concurrent.*;
import java.time.LocalDateTime;

public class AuthRefreshRotationTest {
    @Test public void competingRotationsHaveExactlyOneWinner() throws Exception {
        var jdbc = new JdbcTemplate(new DriverManagerDataSource(
                "jdbc:h2:mem:refresh_" + UUID.randomUUID() + ";MODE=MySQL;DB_CLOSE_DELAY=-1", "sa", ""));
        jdbc.execute("CREATE TABLE admin_auth_session(session_id VARCHAR(64) PRIMARY KEY, refresh_token_hash VARCHAR(128), "
                + "last_seen_at TIMESTAMP, expires_at TIMESTAMP, revoked_at TIMESTAMP)");
        jdbc.update("INSERT INTO admin_auth_session(session_id, refresh_token_hash, expires_at) VALUES ('s', 'old', DATEADD('DAY', 1, CURRENT_TIMESTAMP))");
        var config = new Configuration();
        var resource = new ClassPathResource("mybatis/mapper/admin_auth_session_mapper.xml");
        try (var in = resource.getInputStream()) {
            new XMLMapperBuilder(in, config, resource.getPath(), config.getSqlFragments()).parse();
        }
        var pool = Executors.newFixedThreadPool(2);
        var start = new CountDownLatch(1);
        try {
            List<Future<Integer>> attempts = new ArrayList<>();
            for (String next : List.of("next-a", "next-b")) attempts.add(pool.submit(() -> {
                start.await();
                var params = Map.<String,Object>of("sessionId", "s", "expectedRefreshTokenHash", "old",
                        "refreshTokenHash", next, "lastSeenAt", LocalDateTime.now(), "expiresAt", LocalDateTime.now().plusDays(1));
                BoundSql sql = config.getMappedStatement(IAdminAuthSessionDao.class.getName() + ".rotate").getBoundSql(params);
                Object[] args = sql.getParameterMappings().stream().map(p -> params.get(p.getProperty())).toArray();
                return jdbc.update(sql.getSql(), args);
            }));
            start.countDown();
            Assert.assertEquals(1, attempts.get(0).get(5, TimeUnit.SECONDS) + attempts.get(1).get(5, TimeUnit.SECONDS));
        } finally { pool.shutdownNow(); }
        jdbc.update("UPDATE admin_auth_session SET expires_at = DATEADD('DAY', -1, CURRENT_TIMESTAMP)");
        var params = Map.<String,Object>of("sessionId", "s", "expectedRefreshTokenHash",
                jdbc.queryForObject("SELECT refresh_token_hash FROM admin_auth_session", String.class),
                "refreshTokenHash", "late", "lastSeenAt", LocalDateTime.now(), "expiresAt", LocalDateTime.now().plusDays(1));
        var sql = config.getMappedStatement(IAdminAuthSessionDao.class.getName() + ".rotate").getBoundSql(params);
        Assert.assertEquals(0, jdbc.update(sql.getSql(), sql.getParameterMappings().stream().map(p -> params.get(p.getProperty())).toArray()));
    }

    @Test public void lostRotationDoesNotIssueUsableTokens() {
        var users = Mockito.mock(IAdminUserDao.class);
        var sessions = Mockito.mock(IAdminAuthSessionDao.class);
        var user = AdminUser.builder().userId("u").username("name").status(1).build();
        Mockito.when(users.queryByUserId("u")).thenReturn(user);
        Mockito.when(sessions.insert(Mockito.any())).thenAnswer(call -> {
            Mockito.when(sessions.queryActiveById(Mockito.anyString())).thenReturn(call.getArgument(0));
            return 1;
        });
        var service = new AdminAuthService(users, sessions, new BCryptPasswordEncoder(), new AdminAuthProperties());
        var login = service.issueLogin(user, "", "");
        Assert.assertThrows(IllegalArgumentException.class, () -> service.refresh(login.getRefreshToken()));
    }
}
