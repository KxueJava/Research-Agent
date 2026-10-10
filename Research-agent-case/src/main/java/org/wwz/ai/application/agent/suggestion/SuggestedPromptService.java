package org.wwz.ai.application.agent.suggestion;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.wwz.ai.domain.agent.suggestion.*;

import java.time.Clock;
import java.time.Duration;
import java.time.LocalDate;
import java.util.UUID;

/** Daily generation is isolated from public reads and protected by a database lease. */
public class SuggestedPromptService {
    private static final Logger log = LoggerFactory.getLogger(SuggestedPromptService.class);
    private final ISuggestedPromptRepository repository;
    private final ISuggestedPromptGenerator generator;
    private final Clock clock;
    private final boolean enabled;
    private final Duration lease;

    public SuggestedPromptService(ISuggestedPromptRepository repository, ISuggestedPromptGenerator generator,
                                  Clock clock, boolean enabled, Duration lease) {
        this.repository = repository;
        this.generator = generator;
        this.clock = clock;
        this.enabled = enabled;
        this.lease = lease;
    }

    public SuggestedPromptBatch latest(String productType) {
        if (!enabled || !"task".equals(productType)) return SuggestedPromptBatch.empty();
        try {
            SuggestedPromptBatch batch = repository.latest(LocalDate.now(clock));
            return batch == null ? SuggestedPromptBatch.empty() : batch;
        } catch (Exception e) {
            log.warn("Suggested prompts unavailable, returning static fallback: {}", e.getClass().getSimpleName());
            return SuggestedPromptBatch.empty();
        }
    }

    public void generateToday() {
        if (!enabled) return;
        LocalDate date = LocalDate.now(clock);
        String owner = UUID.randomUUID().toString();
        boolean claimed = false;
        try {
            claimed = repository.claim(date, owner, clock.instant(), 3, lease);
            if (!claimed) return;
            var history = repository.history(date.minusDays(7), date);
            var batch = SuggestedPromptBatch.parse(date, generator.generate(date, history), history);
            if (repository.publish(batch, owner)) {
                log.info("Published daily suggested prompts: date={}, count={}", date, batch.items().size());
            } else {
                log.warn("Discarded suggested prompt batch after lease ownership changed: date={}", date);
            }
        } catch (Exception e) {
            log.warn("Daily suggested prompt generation failed: date={}, reason={}", date, e.getClass().getSimpleName());
            if (claimed) {
                try { repository.fail(date, owner); }
                catch (Exception releaseError) { log.warn("Could not release suggested prompt lease: date={}", date); }
            }
        }
    }
}
