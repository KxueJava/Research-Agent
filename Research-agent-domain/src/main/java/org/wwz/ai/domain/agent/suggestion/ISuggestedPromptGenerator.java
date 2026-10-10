package org.wwz.ai.domain.agent.suggestion;

import java.time.LocalDate;
import java.util.List;

/** Generates candidates only; validation and publication belong to the application flow. */
@FunctionalInterface
public interface ISuggestedPromptGenerator {
    String generate(LocalDate date, List<SuggestedPrompt> history);
}
