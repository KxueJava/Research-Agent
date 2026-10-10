package org.wwz.ai.domain.agent.suggestion;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.DeserializationFeature;

import java.time.LocalDate;
import java.util.List;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.Set;

public record SuggestedPromptBatch(LocalDate date, List<SuggestedPrompt> items) {
    private static final ObjectMapper JSON = new ObjectMapper().enable(DeserializationFeature.FAIL_ON_TRAILING_TOKENS);
    private static final Set<String> CATEGORIES = Set.of("research", "data", "interactive", "creative", "report");

    public SuggestedPromptBatch {
        items = List.copyOf(items);
    }

    public static SuggestedPromptBatch parse(LocalDate date, String json, List<SuggestedPrompt> history) {
        if (date == null || json == null || json.length() > 16000) {
            throw new IllegalArgumentException("Invalid suggested prompt batch");
        }
        try {
            JsonNode root = JSON.readTree(json);
            if (root == null || !root.isArray() || root.size() != 5) {
                throw new IllegalArgumentException("Expected exactly five suggested prompts");
            }
            Set<String> labels = new HashSet<>();
            Set<String> categories = new HashSet<>();
            Set<String> previous = new HashSet<>();
            history.forEach(item -> previous.add(normalize(item.label())));
            List<SuggestedPrompt> items = new ArrayList<>();
            for (JsonNode item : root) {
                if (!item.path("label").isTextual() || !item.path("category").isTextual()) {
                    throw new IllegalArgumentException("Prompt label and category must be strings");
                }
                String label = normalize(item.get("label").textValue());
                String category = item.get("category").textValue().trim();
                if (label.length() < 8 || label.length() > 120 || !labels.add(label)
                        || previous.contains(label) || !CATEGORIES.contains(category) || !categories.add(category)) {
                    throw new IllegalArgumentException("Prompt is invalid, duplicated or missing a category");
                }
                items.add(new SuggestedPrompt(label, category));
            }
            return new SuggestedPromptBatch(date, items);
        } catch (java.io.IOException e) {
            throw new IllegalArgumentException("Model did not return valid JSON", e);
        }
    }

    private static String normalize(String label) {
        return label == null ? "" : label.strip().replaceAll("\\s+", " ");
    }

    public static SuggestedPromptBatch empty() {
        return new SuggestedPromptBatch(null, List.of());
    }
}
