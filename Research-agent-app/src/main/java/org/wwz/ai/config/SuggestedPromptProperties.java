package org.wwz.ai.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;

@Data
@ConfigurationProperties(prefix = "research.suggested-prompts")
public class SuggestedPromptProperties {
    private boolean enabled = true;
    private String model = "default";
    private long timeoutSeconds = 90;
}
