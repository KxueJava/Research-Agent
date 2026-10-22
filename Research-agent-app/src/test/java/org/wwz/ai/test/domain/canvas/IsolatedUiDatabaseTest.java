package org.wwz.ai.test.domain.canvas;

import org.junit.Test;
import static org.junit.Assert.*;

public class IsolatedUiDatabaseTest {
    @Test public void rejectsMissingBusinessRemoteAndRedirectedDatabaseUrls() {
        for (String url : new String[]{null, "", "jdbc:mysql://127.0.0.1:3306/ai-agent-station",
                "jdbc:mysql://example.com:3306/rui_stage9_test_" + "a".repeat(32),
                "jdbc:mysql://127.0.0.1:3306/rui_stage9_test_" + "a".repeat(32) + "/other"}) {
            assertThrows(IllegalArgumentException.class, () -> IsolatedUiDatabase.requireIsolatedUrl(url));
        }
    }
    @Test public void acceptsExplicitDisposableLocalDatabase() {
        String url = "jdbc:mysql://127.0.0.1:3306/rui_stage9_test_" + "a".repeat(32) + "?serverTimezone=Asia/Shanghai";
        assertEquals(url, IsolatedUiDatabase.requireIsolatedUrl(url));
    }
}
