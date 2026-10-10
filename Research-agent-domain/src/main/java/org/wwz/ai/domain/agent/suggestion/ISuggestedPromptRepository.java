package org.wwz.ai.domain.agent.suggestion;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

public interface ISuggestedPromptRepository {
    SuggestedPromptBatch latest(LocalDate date);
    List<SuggestedPrompt> history(LocalDate fromInclusive, LocalDate toExclusive);
    boolean claim(LocalDate date, String owner, Instant now, int maxAttempts, Duration lease);
    boolean publish(SuggestedPromptBatch batch, String owner);
    void fail(LocalDate date, String owner);
}
