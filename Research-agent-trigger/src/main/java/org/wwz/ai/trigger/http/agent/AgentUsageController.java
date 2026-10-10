package org.wwz.ai.trigger.http.agent;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.wwz.ai.api.response.Response;
import org.wwz.ai.domain.agent.ledger.ExecutionLedgerQueryService;
import org.wwz.ai.domain.agent.ledger.model.DialogueRunView;
import org.wwz.ai.domain.agent.ledger.model.DialogueSessionView;
import org.wwz.ai.types.agent.visitor.VisitorRequestContext;
import org.wwz.ai.types.enums.ResponseCode;

import javax.annotation.Resource;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** 访客范围内的 token 用量统计。只读取 execution ledger，不创建展示数据。 */
@RestController
@RequestMapping("/api/agent/usage")
public class AgentUsageController {

    @Resource
    private ExecutionLedgerQueryService executionLedgerQueryService;

    @GetMapping
    public Response<UsageStatsRespVO> usage(@RequestParam(name = "range", defaultValue = "today") String range) {
        String normalizedRange = normalizeRange(range);
        LocalDateTime from = resolveFrom(normalizedRange);
        String visitorId = VisitorRequestContext.requireVisitorId();
        List<UsageRequestRespVO> requests = new ArrayList<>();

        List<DialogueSessionView> sessions = executionLedgerQueryService.queryRecentSessions(visitorId, 100);
        for (DialogueSessionView session : sessions) {
            if (session == null || session.getSessionId() == null) {
                continue;
            }
            for (DialogueRunView run : executionLedgerQueryService.querySessionRuns(session.getSessionId())) {
                if (run == null || run.getStartedAt() == null || run.getStartedAt().isBefore(from)) {
                    continue;
                }
                requests.add(UsageRequestRespVO.from(run));
            }
        }
        requests.sort(Comparator.comparing(UsageRequestRespVO::getTimestamp,
                Comparator.nullsLast(Comparator.reverseOrder())));

        UsageTotalsRespVO totals = UsageTotalsRespVO.from(requests);
        return Response.<UsageStatsRespVO>builder()
                .code(ResponseCode.SUCCESS.getCode())
                .info(ResponseCode.SUCCESS.getInfo())
                .data(UsageStatsRespVO.builder()
                        .range(normalizedRange)
                        .totals(totals)
                        .trend(buildTrend(requests, normalizedRange))
                        .requests(requests.stream().limit(100).toList())
                        .build())
                .build();
    }

    private List<UsageTrendRespVO> buildTrend(List<UsageRequestRespVO> requests, String range) {
        Map<String, UsageTrendRespVO> buckets = new LinkedHashMap<>();
        for (UsageRequestRespVO request : requests) {
            LocalDateTime timestamp = request.getTimestamp();
            if (timestamp == null) continue;
            String bucket = "today".equals(range)
                    ? timestamp.truncatedTo(ChronoUnit.HOURS).toString()
                    : timestamp.toLocalDate().toString();
            UsageTrendRespVO trend = buckets.computeIfAbsent(bucket, key -> UsageTrendRespVO.builder().bucket(key).build());
            trend.add(request);
        }
        return buckets.values().stream()
                .sorted(Comparator.comparing(UsageTrendRespVO::getBucket))
                .toList();
    }

    private LocalDateTime resolveFrom(String range) {
        LocalDateTime now = LocalDateTime.now();
        return switch (range) {
            case "53w" -> LocalDate.now().with(java.time.DayOfWeek.MONDAY).minusWeeks(52).atStartOfDay();
            case "7d" -> now.minusDays(7);
            case "30d" -> now.minusDays(30);
            default -> LocalDate.now().atStartOfDay();
        };
    }

    private String normalizeRange(String range) {
        return "7d".equalsIgnoreCase(range) || "30d".equalsIgnoreCase(range) || "53w".equalsIgnoreCase(range)
                ? range.toLowerCase() : "today";
    }

    public record UsageStatsRespVO(String range, UsageTotalsRespVO totals,
                                   List<UsageTrendRespVO> trend,
                                   List<UsageRequestRespVO> requests) {
        static Builder builder() { return new Builder(); }
        static class Builder {
            private String range; private UsageTotalsRespVO totals;
            private List<UsageTrendRespVO> trend = List.of(); private List<UsageRequestRespVO> requests = List.of();
            Builder range(String value) { range = value; return this; }
            Builder totals(UsageTotalsRespVO value) { totals = value; return this; }
            Builder trend(List<UsageTrendRespVO> value) { trend = value; return this; }
            Builder requests(List<UsageRequestRespVO> value) { requests = value; return this; }
            UsageStatsRespVO build() { return new UsageStatsRespVO(range, totals, trend, requests); }
        }
    }

    public static class UsageTotalsRespVO {
        public long totalTokens, inputTokens, outputTokens, requestCount;
        static UsageTotalsRespVO from(List<UsageRequestRespVO> requests) {
            UsageTotalsRespVO result = new UsageTotalsRespVO();
            result.requestCount = requests.size();
            for (UsageRequestRespVO request : requests) {
                result.inputTokens += request.getInputTokens();
                result.outputTokens += request.getOutputTokens();
                result.totalTokens += request.getTotalTokens();
            }
            return result;
        }
    }

    public static class UsageTrendRespVO {
        public String bucket; public long totalTokens, inputTokens, outputTokens, requestCount;
        static UsageTrendRespVO.Builder builder() { return new Builder(); }
        void add(UsageRequestRespVO request) { inputTokens += request.getInputTokens(); outputTokens += request.getOutputTokens(); totalTokens += request.getTotalTokens(); requestCount++; }
        public String getBucket() { return bucket; }
        static class Builder { private final UsageTrendRespVO value = new UsageTrendRespVO(); Builder bucket(String bucket) { value.bucket = bucket; return this; } UsageTrendRespVO build() { return value; } }
    }

    public static class UsageRequestRespVO {
        private LocalDateTime timestamp; private String requestId; private long inputTokens, outputTokens, totalTokens, durationMs; private String status, source;
        static UsageRequestRespVO from(DialogueRunView run) { UsageRequestRespVO value = new UsageRequestRespVO(); value.timestamp = run.getStartedAt(); value.requestId = run.getRequestId(); value.inputTokens = n(run.getPromptTokensTotal()); value.outputTokens = n(run.getCompletionTokensTotal()); value.totalTokens = n(run.getTotalTokensTotal()); value.durationMs = n(run.getDurationMs()); value.status = status(run.getStatus()); value.source = run.getEntryAgent(); return value; }
        private static long n(Number value) { return value == null ? 0 : value.longValue(); }
        private static String status(Integer value) { return switch (value == null ? 0 : value) { case 1 -> "SUCCESS"; case 2 -> "FAILED"; case 3 -> "TIMEOUT"; case 4 -> "STOPPED"; case 5 -> "WAITING_INPUT"; default -> "RUNNING"; }; }
        public LocalDateTime getTimestamp() { return timestamp; } public String getRequestId() { return requestId; } public long getInputTokens() { return inputTokens; } public long getOutputTokens() { return outputTokens; } public long getTotalTokens() { return totalTokens; } public long getDurationMs() { return durationMs; } public String getStatus() { return status; } public String getSource() { return source; }
    }
}
