package org.wwz.ai.config;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.wwz.ai.application.agent.suggestion.SuggestedPromptService;
import org.wwz.ai.domain.agent.runtime.llm.LlmChatModelResolver;
import org.wwz.ai.domain.agent.runtime.llm.LlmModelCatalog;
import org.wwz.ai.domain.agent.suggestion.ISuggestedPromptGenerator;
import org.wwz.ai.domain.agent.suggestion.ISuggestedPromptRepository;
import org.wwz.ai.infrastructure.suggestion.LlmSuggestedPromptGenerator;

import java.time.Clock;
import java.time.Duration;
import java.time.ZoneId;

@Configuration
@Profile("!test")
@EnableScheduling
@EnableConfigurationProperties(SuggestedPromptProperties.class)
public class SuggestedPromptConfiguration {
    @Bean
    public ISuggestedPromptGenerator suggestedPromptGenerator(LlmModelCatalog catalog, LlmChatModelResolver resolver,
                                                              SuggestedPromptProperties properties) {
        if (properties.getTimeoutSeconds() < 1 || properties.getTimeoutSeconds() > 300) {
            throw new IllegalArgumentException("research.suggested-prompts.timeout-seconds must be between 1 and 300");
        }
        return new LlmSuggestedPromptGenerator(catalog, resolver, properties.getModel(), Duration.ofSeconds(properties.getTimeoutSeconds()));
    }

    @Bean
    public SuggestedPromptService suggestedPromptService(ISuggestedPromptRepository repository, ISuggestedPromptGenerator generator,
                                                         SuggestedPromptProperties properties) {
        return new SuggestedPromptService(repository, generator, Clock.system(ZoneId.of("Asia/Shanghai")),
                properties.isEnabled(), Duration.ofSeconds(properties.getTimeoutSeconds() + 60));
    }
}
