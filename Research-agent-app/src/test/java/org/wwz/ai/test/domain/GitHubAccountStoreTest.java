package org.wwz.ai.test.domain;

import org.h2.jdbcx.JdbcDataSource;
import org.junit.Before;
import org.junit.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.wwz.ai.trigger.auth.github.*;
import java.util.UUID;
import static org.junit.Assert.*;

public class GitHubAccountStoreTest {
    private JdbcTemplate jdbc;
    private GitHubAccountStore accounts;
    @Before public void setup() {
        JdbcDataSource ds = new JdbcDataSource();
        ds.setURL("jdbc:h2:mem:github_" + UUID.randomUUID() + ";MODE=MySQL;DB_CLOSE_DELAY=-1");
        jdbc = new JdbcTemplate(ds);
        jdbc.execute("CREATE TABLE admin_user(id BIGINT AUTO_INCREMENT PRIMARY KEY, user_id VARCHAR(64) UNIQUE, username VARCHAR(255) UNIQUE, password VARCHAR(128), avatar_url TEXT, role VARCHAR(16), status INT, create_time TIMESTAMP, update_time TIMESTAMP)");
        jdbc.execute(GitHubAccountSchema.DDL);
        accounts = new GitHubAccountStore(ds);
    }
    private void local(String id, int status) { jdbc.update("INSERT INTO admin_user(user_id,username,password,status) VALUES(?,?,?,?)", id, id, "existing-hash", status); }

    @Test public void createsOneAccountAndUsesImmutableProviderIdAfterRename() {
        var identity = new GitHubOAuthClient.Identity("123", "researcher");
        String userId = accounts.resolve(identity, null);
        assertEquals(userId, accounts.resolve(new GitHubOAuthClient.Identity("123", "renamed"), null));
        assertEquals(Integer.valueOf(1), jdbc.queryForObject("SELECT COUNT(*) FROM admin_user", Integer.class));
        assertTrue(accounts.status(userId).bound());
        assertFalse(accounts.status(userId).passwordLoginAvailable());
        assertEquals("renamed", accounts.status(userId).login());
        assertTrue(jdbc.queryForObject("SELECT password FROM admin_user WHERE user_id=?", String.class, userId).startsWith("!oauth:"));
    }
    @Test public void bindsExistingAccountWithoutReplacingItsCredentialsOrData() {
        local("local", 1);
        assertEquals("local", accounts.resolve(new GitHubOAuthClient.Identity("321", "researcher"), "local"));
        assertTrue(accounts.status("local").passwordLoginAvailable());
        assertEquals("existing-hash", jdbc.queryForObject("SELECT password FROM admin_user WHERE user_id='local'", String.class));
        assertEquals("local", accounts.resolve(new GitHubOAuthClient.Identity("321", "researcher"), null));
    }
    @Test public void cannotBindOneGithubToTwoAccountsOrReplaceAnotherBinding() {
        local("first", 1); local("second", 1);
        accounts.resolve(new GitHubOAuthClient.Identity("123", "one"), "first");
        assertThrows(IllegalArgumentException.class, () -> accounts.resolve(new GitHubOAuthClient.Identity("123", "one"), "second"));
        assertThrows(IllegalArgumentException.class, () -> accounts.resolve(new GitHubOAuthClient.Identity("456", "two"), "first"));
        assertEquals(Integer.valueOf(1), jdbc.queryForObject("SELECT COUNT(*) FROM user_oauth_identity", Integer.class));
    }
    @Test public void disabledOrMissingAccountCannotBeBound() {
        local("disabled", 0);
        assertThrows(IllegalArgumentException.class, () -> accounts.resolve(new GitHubOAuthClient.Identity("123", "one"), "disabled"));
        assertThrows(IllegalArgumentException.class, () -> accounts.resolve(new GitHubOAuthClient.Identity("123", "one"), "missing"));
        assertNull(accounts.find("123"));
    }
    @Test public void signupRollsBackIfBindingInsertFails() {
        jdbc.execute("ALTER TABLE user_oauth_identity ADD CONSTRAINT reject_test CHECK(provider_user_id <> '999')");
        assertThrows(org.springframework.dao.DataAccessException.class, () -> accounts.resolve(new GitHubOAuthClient.Identity("999", "test"), null));
        assertEquals(Integer.valueOf(0), jdbc.queryForObject("SELECT COUNT(*) FROM admin_user", Integer.class));
    }
}
