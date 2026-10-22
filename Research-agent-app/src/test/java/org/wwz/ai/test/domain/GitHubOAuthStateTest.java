package org.wwz.ai.test.domain;

import org.junit.Test;
import org.springframework.mock.web.MockHttpSession;
import org.wwz.ai.trigger.auth.github.GitHubOAuthState;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import static org.junit.Assert.*;

public class GitHubOAuthStateTest {
    private final Instant now = Instant.parse("2026-10-18T00:00:00Z");
    @Test public void stateIsSessionBoundSingleUseAndCarriesPkce() {
        GitHubOAuthState states = new GitHubOAuthState(Clock.fixed(now, ZoneOffset.UTC));
        MockHttpSession session = new MockHttpSession();
        var pending = states.create(session, null);
        assertEquals(43, pending.verifier().length());
        assertEquals(43, pending.challenge().length());
        assertNotEquals(pending.verifier(), pending.challenge());
        assertThrows(IllegalArgumentException.class, () -> states.consume(new MockHttpSession(), pending.state()));
        assertThrows(IllegalArgumentException.class, () -> states.consume(session, "wrong-state"));
        assertEquals(pending, states.consume(session, pending.state()));
        assertThrows(IllegalArgumentException.class, () -> states.consume(session, pending.state()));
    }
    @Test public void expiredStateCannotCompleteAndSeparateTabsCanComplete() {
        GitHubOAuthState states = new GitHubOAuthState(Clock.fixed(now, ZoneOffset.UTC));
        MockHttpSession session = new MockHttpSession();
        var first = states.create(session, "local-user");
        var second = states.create(session, null);
        assertEquals("local-user", states.consume(session, first.state()).bindUserId());
        assertNull(states.consume(session, second.state()).bindUserId());
        var expired = states.create(session, null);
        var later = new GitHubOAuthState(Clock.fixed(now.plusSeconds(601), ZoneOffset.UTC));
        assertThrows(IllegalArgumentException.class, () -> later.consume(session, expired.state()));
    }
}
