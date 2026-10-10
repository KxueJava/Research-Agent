package org.wwz.ai.test.domain.llm;

import org.junit.Assert;
import org.junit.Test;
import org.springframework.ai.openai.OpenAiChatOptions;
import org.wwz.ai.domain.agent.runtime.llm.LLMSettings;
import org.wwz.ai.domain.agent.runtime.llm.OpenAiChatOptionsFactory;

import java.lang.reflect.Field;

public class OpenAiChatOptionsFactoryReasoningEffortTest {

    @Test
    public void forwardsAllSupportedUiLevelsWithoutNormalization() throws Exception {
        OpenAiChatOptionsFactory factory = new OpenAiChatOptionsFactory();
        Field callbacks = OpenAiChatOptionsFactory.class.getDeclaredField("toolCallbackProvider");
        callbacks.setAccessible(true);
        callbacks.set(factory, null);

        for (String effort : new String[]{"low", "medium", "high", "max", "ultra"}) {
            LLMSettings settings = LLMSettings.builder()
                    .model("test-model")
                    .reasoningEffort(effort)
                    .build();

            OpenAiChatOptions options = factory.buildTextOptions(settings, null);

            Assert.assertEquals("reasoning_effort must be forwarded unchanged for " + effort,
                    effort, options.getReasoningEffort());
        }
    }
}
