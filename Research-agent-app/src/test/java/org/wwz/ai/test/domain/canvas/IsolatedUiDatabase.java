package org.wwz.ai.test.domain.canvas;

import org.springframework.jdbc.datasource.DriverManagerDataSource;

/** Fail closed: integration tests may never fall back to the workstation business database. */
public final class IsolatedUiDatabase {
    private IsolatedUiDatabase() {}

    static String requireIsolatedUrl(String url) {
        if (url == null || !url.matches("jdbc:mysql://(?:127\\.0\\.0\\.1|localhost):3306/rui_stage9_test_[a-f0-9]{32}(?:\\?[^#]*)?")) {
            throw new IllegalArgumentException("RESEARCH_UI_DB_URL must name a disposable local rui_stage9_test_<UUID> database");
        }
        return url;
    }

    public static DriverManagerDataSource source() {
        String url = requireIsolatedUrl(System.getenv("RESEARCH_UI_DB_URL"));
        String user = System.getenv("RESEARCH_UI_DB_USER");
        String password = System.getenv("RESEARCH_UI_DB_PASSWORD");
        if (user == null || user.isBlank() || password == null) {
            throw new IllegalStateException("Explicit isolated database credentials are required");
        }
        return new DriverManagerDataSource(url, user, password);
    }
}
