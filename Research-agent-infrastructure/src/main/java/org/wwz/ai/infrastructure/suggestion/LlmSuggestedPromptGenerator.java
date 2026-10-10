package org.wwz.ai.infrastructure.suggestion;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.ai.chat.messages.SystemMessage;
import org.springframework.ai.chat.messages.UserMessage;
import org.springframework.ai.chat.prompt.Prompt;
import org.wwz.ai.domain.agent.runtime.llm.LlmChatModelResolver;
import org.wwz.ai.domain.agent.runtime.llm.LlmModelCatalog;
import org.wwz.ai.domain.agent.suggestion.ISuggestedPromptGenerator;
import org.wwz.ai.domain.agent.suggestion.SuggestedPrompt;

import java.time.Duration;
import java.time.LocalDate;
import java.util.List;

/** Reuses the configured model catalog without exposing keys or invoking any tools. */
public class LlmSuggestedPromptGenerator implements ISuggestedPromptGenerator {
    private static final String INSTRUCTION = """
            为 Research 智能体首页生成今天的5条中文任务推荐。每条 label 是用户可直接执行的完整任务，
            20至100字，明确目标和交付物，简洁具体，主题多样。每个类别恰好一条：
            research（公开信息调研）、data（公开数据分析）、interactive（GenUI交互可视化）、
            creative（图片或3D创意生成）、report（HTML或文档报告交付）。
            支持能力：公开网页检索、公开资料研究、上传文件分析、Python数据清洗/统计/图表、
            交互Canvas、图片/3D可视化、HTML/PDF/Word/PPT报告。
            数据任务须指明真实公开来源，或明确让用户上传数据；不能假定用户已有私人数据。
            此次生成没有联网，不得编造今日新闻、热点或已发生的具体事件。不得推荐付费、交易、
            登录私人账户、自动发帖、无法获得的数据等能力。避免与历史推荐重复或只替换措辞。
            日期和历史推荐仅供选择新主题。只返回JSON数组，不要Markdown或解释：
            [{"label":"具体完整任务","category":"research"}, ...]。
            """;

    private final LlmModelCatalog catalog;
    private final LlmChatModelResolver resolver;
    private final String model;
    private final Duration timeout;

    public LlmSuggestedPromptGenerator(LlmModelCatalog catalog, LlmChatModelResolver resolver, String model, Duration timeout) {
        this.catalog = catalog;
        this.resolver = resolver;
        this.model = model;
        this.timeout = timeout;
    }

    @Override
    public String generate(LocalDate date, List<SuggestedPrompt> history) {
        var settings = catalog.resolve(model).orElseThrow(() -> new IllegalStateException("Suggested prompt model is not configured"));
        String historyJson;
        try { historyJson = new ObjectMapper().writeValueAsString(history); }
        catch (JsonProcessingException e) { throw new IllegalArgumentException("Invalid prompt history", e); }
        var prompt = new Prompt(List.of(new SystemMessage(INSTRUCTION), new UserMessage("日期：" + date + "\n最近7天已展示的推荐：\n" + historyJson)));
        // Reactive timeout cancels the model stream; do not leave an unbounded blocking call holding the lease.
        return resolver.resolve(settings).stream(prompt).collect(StringBuilder::new, (text, chunk) -> {
            if (chunk.getResult() != null && chunk.getResult().getOutput() != null) {
                String content = chunk.getResult().getOutput().getText();
                if (content != null) text.append(content);
                if (text.length() > 16000) throw new IllegalArgumentException("Suggested prompt output is too large");
            }
        }).map(StringBuilder::toString).block(timeout);
    }
}
