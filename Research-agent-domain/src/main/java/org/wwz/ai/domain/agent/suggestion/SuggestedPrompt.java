package org.wwz.ai.domain.agent.suggestion;

/** The label is also the complete task inserted into the existing welcome input. */
public record SuggestedPrompt(String label, String category) { }
