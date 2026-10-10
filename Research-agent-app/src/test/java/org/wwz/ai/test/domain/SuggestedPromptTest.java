package org.wwz.ai.test.domain;

import org.junit.Test;
import org.wwz.ai.domain.agent.suggestion.SuggestedPrompt;
import org.wwz.ai.domain.agent.suggestion.SuggestedPromptBatch;

import java.time.LocalDate;
import java.util.List;

import static org.junit.Assert.*;

public class SuggestedPromptTest {
    private static final LocalDate DAY = LocalDate.of(2026, 10, 10);

    @Test
    public void parsesStrictJsonAndNormalizesLabels() {
        SuggestedPromptBatch batch = SuggestedPromptBatch.parse(DAY, json(), List.of());
        assertEquals(5, batch.items().size());
        assertEquals("调研公开的开源工具并输出一份对比报告", batch.items().get(0).label());
        assertEquals(DAY, batch.date());
    }

    @Test
    public void rejectsMissingCategoryAndDuplicateLabels() {
        expectInvalid(
                () -> SuggestedPromptBatch.parse(DAY, json().replace("data", "research"), List.of()));
        expectInvalid(
                () -> SuggestedPromptBatch.parse(DAY, json().replace("研究公开的新能源数据并绘制趋势图", "调研公开的开源工具并输出一份对比报告"), List.of()));
    }

    @Test
    public void rejectsInvalidSizeBlankOversizedAndHistoricalRepeat() {
        expectInvalid(() -> SuggestedPromptBatch.parse(DAY, "[]", List.of()));
        expectInvalid(
                () -> SuggestedPromptBatch.parse(DAY, json().replace("调研公开的开源工具并输出一份对比报告", " "), List.of()));
        expectInvalid(
                () -> SuggestedPromptBatch.parse(DAY, json().replace("调研公开的开源工具并输出一份对比报告", "长".repeat(121)), List.of()));
        expectInvalid(
                () -> SuggestedPromptBatch.parse(DAY, json(), List.of(new SuggestedPrompt("调研公开的开源工具并输出一份对比报告", "research"))));
    }

    @Test
    public void rejectsMalformedJsonAndNonStringFields() {
        expectInvalid(() -> SuggestedPromptBatch.parse(DAY, "not-json", List.of()));
        expectInvalid(() -> SuggestedPromptBatch.parse(DAY, "null", List.of()));
        expectInvalid(() -> SuggestedPromptBatch.parse(DAY, json().replace("\"category\":\"research\"", "\"category\":123"), List.of()));
        expectInvalid(() -> SuggestedPromptBatch.parse(DAY, json().replace("\"research\"", "\"unsupported\""), List.of()));
        expectInvalid(() -> SuggestedPromptBatch.parse(DAY, json() + "[]", List.of()));
    }

    private static void expectInvalid(Runnable action) {
        try { action.run(); fail("invalid batch should be rejected"); }
        catch (IllegalArgumentException expected) { }
    }

    public static String json() {
        return """
                [
                  {"label":" 调研公开的开源工具并输出一份对比报告 ","category":"research"},
                  {"label":"研究公开的新能源数据并绘制趋势图","category":"data"},
                  {"label":"用交互画布演示太阳系公转","category":"interactive"},
                  {"label":"制作一份城市夜景的创意海报","category":"creative"},
                  {"label":"整理公开的绿色建筑案例并输出HTML报告","category":"report"}
                ]
                """;
    }
}
