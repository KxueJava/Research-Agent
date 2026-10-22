package org.wwz.ai.trigger.auth.github;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;
import javax.sql.DataSource;
import java.util.UUID;

/** Identity binding is unique in both directions; user creation and binding commit atomically. */
@Component
public class GitHubAccountStore {
    private final JdbcTemplate jdbc;
    private final TransactionTemplate transactions;
    public GitHubAccountStore(@Qualifier("mysqlDataSource") DataSource dataSource) {
        jdbc = new JdbcTemplate(dataSource);
        transactions = new TransactionTemplate(new DataSourceTransactionManager(dataSource));
    }
    public record Binding(String userId, String login) { }
    public record Status(boolean bound, String login, boolean passwordLoginAvailable) { }

    public Binding find(String githubId) {
        return jdbc.query("SELECT user_id, provider_login FROM user_oauth_identity WHERE provider='github' AND provider_user_id=?",
                (rs, row) -> new Binding(rs.getString(1), rs.getString(2)), githubId).stream().findFirst().orElse(null);
    }

    public String resolve(GitHubOAuthClient.Identity identity, String bindUserId) {
        try {
            return transactions.execute(status -> {
                Binding existing = find(identity.id());
                if (existing != null) {
                    if (bindUserId != null && !bindUserId.equals(existing.userId())) throw new IllegalArgumentException("此 GitHub 已绑定其他账号");
                    jdbc.update("UPDATE user_oauth_identity SET provider_login=? WHERE provider='github' AND provider_user_id=?", identity.login(), identity.id());
                    return existing.userId();
                }
                String userId = bindUserId;
                if (userId == null) {
                    userId = UUID.randomUUID().toString().replace("-", "");
                    String username = "github_" + identity.login() + "_" + userId.substring(0, 8);
                    // This sentinel cannot authenticate through the password login flow.
                    jdbc.update("INSERT INTO admin_user(user_id,username,password,avatar_url,role,status,create_time,update_time) VALUES(?,?,?,?, 'USER',1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)",
                            userId, username, "!oauth:" + UUID.randomUUID(), "https://avatars.githubusercontent.com/u/" + identity.id());
                } else {
                    // Serialize concurrent binding attempts for a local account and check active status.
                    var active = jdbc.queryForList("SELECT user_id FROM admin_user WHERE user_id=? AND status=1 FOR UPDATE", String.class, userId);
                    if (active.isEmpty()) throw new IllegalArgumentException("当前账号不可用，请重新登录");
                    if (status(userId).bound()) throw new IllegalArgumentException("当前账号已绑定 GitHub，请勿重复绑定其他账号");
                }
                jdbc.update("INSERT INTO user_oauth_identity(provider,provider_user_id,user_id,provider_login) VALUES('github',?,?,?)", identity.id(), userId, identity.login());
                return userId;
            });
        } catch (DuplicateKeyException e) {
            Binding winner = find(identity.id());
            if (winner != null && (bindUserId == null || bindUserId.equals(winner.userId()))) return winner.userId();
            throw new IllegalArgumentException("账号绑定发生冲突，请刷新后重试");
        }
    }

    public Status status(String userId) {
        var names = jdbc.queryForList("SELECT provider_login FROM user_oauth_identity WHERE provider='github' AND user_id=?", String.class, userId);
        String password = jdbc.queryForObject("SELECT password FROM admin_user WHERE user_id=?", String.class, userId);
        return new Status(!names.isEmpty(), names.isEmpty() ? null : names.get(0), password != null && !password.startsWith("!oauth:"));
    }
}
