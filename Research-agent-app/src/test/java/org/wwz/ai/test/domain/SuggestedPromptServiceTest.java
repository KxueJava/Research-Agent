package org.wwz.ai.test.domain;

import org.junit.Before;
import org.junit.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.wwz.ai.application.agent.suggestion.SuggestedPromptService;
import org.wwz.ai.domain.agent.suggestion.SuggestedPromptBatch;
import org.wwz.ai.infrastructure.adapter.repository.SuggestedPromptRepository;
import org.wwz.ai.config.SuggestedPromptProperties;
import org.springframework.boot.context.properties.bind.Binder;
import org.springframework.boot.context.properties.bind.Bindable;
import org.springframework.core.env.StandardEnvironment;
import org.springframework.core.env.SystemEnvironmentPropertySource;

import java.time.*;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.Assert.*;

public class SuggestedPromptServiceTest {
    private static final Clock CLOCK = Clock.fixed(Instant.parse("2026-10-09T16:00:01Z"), ZoneId.of("Asia/Shanghai"));
    private static final LocalDate DAY = LocalDate.now(CLOCK);
    private SuggestedPromptRepository repository;
    private JdbcTemplate jdbc;

    @Before
    public void setUp() {
        var source = new DriverManagerDataSource("jdbc:h2:mem:suggested-" + UUID.randomUUID() + ";MODE=MySQL;DB_CLOSE_DELAY=-1", "sa", "");
        repository = new SuggestedPromptRepository(source);
        repository.initialize();
        jdbc = new JdbcTemplate(source);
    }

    @Test
    public void generatesOncePerShanghaiDayAndReadsNeverCallTheModel() {
        var calls = new AtomicInteger();
        var service = service((date, history) -> { calls.incrementAndGet(); return SuggestedPromptTest.json(); });
        assertTrue(service.latest("task").items().isEmpty());
        assertEquals(0, calls.get());
        service.generateToday();
        service.generateToday();
        assertEquals(1, calls.get());
        assertEquals(DAY, service.latest("task").date());
        assertEquals(5, service.latest("task").items().size());
        assertTrue(service.latest("dataAgent").items().isEmpty());
        assertEquals(1, calls.get());
    }

    @Test
    public void failuresKeepPreviousBatchAndStopAfterThreeAttempts() {
        seedPrevious();
        var calls = new AtomicInteger();
        var service = service((date, history) -> { calls.incrementAndGet(); throw new IllegalStateException("offline"); });
        for (int i = 0; i < 5; i++) service.generateToday();
        assertEquals(3, calls.get());
        assertEquals(DAY.minusDays(1), service.latest("task").date());
        assertEquals(5, service.latest("task").items().size());
    }

    @Test
    public void invalidOutputIsNotPublishedAndHistoryIsPassedToTheGenerator() {
        seedPrevious();
        var service = service((date, history) -> { assertEquals(5, history.size()); return "[]"; });
        service.generateToday();
        assertEquals(DAY.minusDays(1), service.latest("task").date());
        assertEquals("failed", jdbc.queryForObject("SELECT status FROM suggested_prompt_batch WHERE batch_date=?", String.class, DAY));
    }

    @Test
    public void disabledServiceDoesNotReadStorageOrGenerate() {
        var service = new SuggestedPromptService(null, (date, history) -> { fail("disabled"); return null; }, CLOCK, false, Duration.ofSeconds(150));
        service.generateToday();
        assertTrue(service.latest("task").items().isEmpty());
    }

    @Test
    public void documentedEnvironmentVariablesBindGenerationSettings() {
        var environment = new StandardEnvironment();
        environment.getPropertySources().addFirst(new SystemEnvironmentPropertySource("systemEnvironment", java.util.Map.of(
                "RESEARCH_SUGGESTED_PROMPTS_ENABLED", "false",
                "RESEARCH_SUGGESTED_PROMPTS_MODEL", "chosen-model",
                "RESEARCH_SUGGESTED_PROMPTS_TIMEOUT_SECONDS", "45")));
        var properties = Binder.get(environment).bind("research.suggested-prompts", Bindable.of(SuggestedPromptProperties.class))
                .orElse(new SuggestedPromptProperties());
        assertFalse(properties.isEnabled());
        assertEquals("chosen-model", properties.getModel());
        assertEquals(45, properties.getTimeoutSeconds());
    }

    @Test
    public void leasePreventsConcurrentCallsAndOldOwnerCannotPublishOrReleaseNewLease() {
        Instant now = CLOCK.instant();
        assertTrue(repository.claim(DAY, "first", now, 3, Duration.ofSeconds(150)));
        assertFalse(repository.claim(DAY, "second", now, 3, Duration.ofSeconds(150)));
        assertTrue(repository.claim(DAY, "second", now.plusSeconds(151), 3, Duration.ofSeconds(150)));
        var batch = SuggestedPromptBatch.parse(DAY, SuggestedPromptTest.json(), java.util.List.of());
        assertFalse(repository.publish(batch, "first"));
        repository.fail(DAY, "first");
        assertEquals("second", jdbc.queryForObject("SELECT lease_owner FROM suggested_prompt_batch WHERE batch_date=?", String.class, DAY));
        assertTrue(repository.publish(batch, "second"));
        assertFalse(repository.claim(DAY, "third", now.plusSeconds(400), 3, Duration.ofSeconds(150)));
    }

    @Test
    public void nextDayCreatesNewBatchAndExpiredHistoricalItemsLeaveTheWindow() {
        seedPrevious();
        assertEquals(5, repository.history(DAY.minusDays(7), DAY).size());
        assertTrue(repository.history(DAY.plusDays(7), DAY.plusDays(8)).isEmpty());
        var tomorrow = new SuggestedPromptService(repository, (date, history) -> SuggestedPromptTest.json()
                .replace("开源工具", "旅行背包").replace("新能源", "人口").replace("太阳系公转", "潮汐原理")
                .replace("城市夜景", "山野露营").replace("绿色建筑", "节水技术"),
                Clock.offset(CLOCK, Duration.ofDays(1)), true, Duration.ofSeconds(150));
        tomorrow.generateToday();
        assertEquals(DAY.plusDays(1), tomorrow.latest("task").date());
    }

    private SuggestedPromptService service(org.wwz.ai.domain.agent.suggestion.ISuggestedPromptGenerator generator) {
        return new SuggestedPromptService(repository, generator, CLOCK, true, Duration.ofSeconds(150));
    }

    private void seedPrevious() {
        LocalDate previous = DAY.minusDays(1);
        repository.claim(previous, "seed", CLOCK.instant(), 3, Duration.ofSeconds(150));
        repository.publish(SuggestedPromptBatch.parse(previous, SuggestedPromptTest.json(), java.util.List.of()), "seed");
    }
}
