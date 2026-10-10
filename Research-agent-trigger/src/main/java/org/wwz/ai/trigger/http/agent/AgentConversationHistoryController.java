package org.wwz.ai.trigger.http.agent;

import lombok.extern.slf4j.Slf4j;
import org.apache.commons.collections4.CollectionUtils;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.wwz.ai.api.response.Response;
import org.wwz.ai.application.agent.visitor.ConversationSessionOwnershipApplicationService;
import org.wwz.ai.domain.agent.ledger.ConversationSessionPinService;
import org.wwz.ai.domain.agent.ledger.ConversationSessionPurgeService;
import org.wwz.ai.domain.agent.ledger.ConversationWorkspaceCleaner;
import org.wwz.ai.domain.agent.ledger.model.ConversationHistoryDetail;
import org.wwz.ai.domain.agent.ledger.model.DialogueSessionView;
import org.wwz.ai.domain.agent.ledger.model.ExecutionLedgerConstants;
import org.wwz.ai.domain.agent.ledger.ExecutionLedgerQueryService;
import org.wwz.ai.domain.agent.ledger.replay.ConversationHistoryReplayService;
import org.wwz.ai.trigger.http.agent.vo.ConversationHistoryDetailRespVO;
import org.wwz.ai.trigger.http.agent.vo.ConversationSessionRespVO;
import org.wwz.ai.types.agent.visitor.VisitorRequestContext;
import org.wwz.ai.types.enums.ResponseCode;

import javax.annotation.Resource;
import java.util.List;
import java.util.stream.Collectors;

/**
 * 会话历史恢复接口。
 */
@Slf4j
@RestController
@RequestMapping("/api/agent/conversation/sessions")
public class AgentConversationHistoryController {

    @Resource
    private ExecutionLedgerQueryService executionLedgerQueryService;

    @Resource
    private ConversationHistoryReplayService conversationHistoryReplayService;

    @Resource
    private ConversationSessionOwnershipApplicationService conversationSessionOwnershipApplicationService;

    @Resource
    private ConversationSessionPurgeService conversationSessionPurgeService;

    @Resource
    private ConversationSessionPinService conversationSessionPinService;

    @Resource
    private ConversationWorkspaceCleaner conversationWorkspaceCleaner;

    @GetMapping
    public Response<List<ConversationSessionRespVO>> list(
            @RequestParam(name = "limit", defaultValue = "20") Integer limit) {
        String visitorId = VisitorRequestContext.requireVisitorId();
        List<ConversationSessionRespVO> sessions = executionLedgerQueryService.queryRecentSessions(visitorId, limit == null ? 20 : limit)
                .stream()
                .map(this::toSessionRespVO)
                .collect(Collectors.toList());

        return Response.<List<ConversationSessionRespVO>>builder()
                .code(ResponseCode.SUCCESS.getCode())
                .info(ResponseCode.SUCCESS.getInfo())
                .data(sessions)
                .build();
    }

    @GetMapping("/{sessionId}")
    public Response<ConversationHistoryDetailRespVO> detail(@PathVariable("sessionId") String sessionId) {
        try {
            // 历史详情先校验 visitor 对 session 的所有权，再读取 ledger 并执行 replay；
            // replay 只生成展示视图，不把历史事件重新写回运行账本。
            conversationSessionOwnershipApplicationService.ensureExistingSessionAccessible(
                    VisitorRequestContext.requireVisitorId(),
                    sessionId
            );
        } catch (Exception e) {
            return Response.<ConversationHistoryDetailRespVO>builder()
                    .code(ResponseCode.UN_ERROR.getCode())
                    .info(e.getMessage())
                    .build();
        }
        ConversationHistoryDetail detail = conversationHistoryReplayService.queryConversationHistory(sessionId);
        return Response.<ConversationHistoryDetailRespVO>builder()
                .code(ResponseCode.SUCCESS.getCode())
                .info(ResponseCode.SUCCESS.getInfo())
                .data(toDetailRespVO(detail))
                .build();
    }

    /**
     * 物理删除一个会话：清空它在运行账本、工作记忆中的全部数据，并删除磁盘工作区。
     * <p>
     * 数据库删除在一个事务内完成；磁盘清理放在其后——文件系统无法随事务回滚，
     * 且账号里已经不存在的会话不应因为目录删不掉而复活。
     */
    @DeleteMapping("/{sessionId}")
    public Response<Boolean> delete(@PathVariable("sessionId") String sessionId) {
        try {
            String visitorId = VisitorRequestContext.requireVisitorId();
            conversationSessionPurgeService.purgeSession(sessionId, visitorId);
            conversationWorkspaceCleaner.deleteSessionWorkspace(sessionId);
            return Response.<Boolean>builder()
                    .code(ResponseCode.SUCCESS.getCode())
                    .info(ResponseCode.SUCCESS.getInfo())
                    .data(true)
                    .build();
        } catch (Exception e) {
            log.warn("删除会话失败 sessionId={}", sessionId, e);
            return Response.<Boolean>builder()
                    .code(ResponseCode.UN_ERROR.getCode())
                    .info(e.getMessage() == null ? "删除会话失败" : e.getMessage())
                    .data(false)
                    .build();
        }
    }

    /**
     * 置顶 / 取消置顶。
     * <p>
     * 归属校验写在 UPDATE 的 WHERE 条件里（同时匹配 visitor_id），因此不存在
     * "校验通过但写入失败"的半成功状态；返回 0 行即表示会话不存在或不属于当前访客。
     */
    @PutMapping("/{sessionId}/pin")
    public Response<Boolean> pin(@PathVariable("sessionId") String sessionId,
                                 @RequestBody(required = false) PinBody body) {
        if (body == null || body.pinned() == null) {
            return Response.<Boolean>builder()
                    .code(ResponseCode.ILLEGAL_PARAMETER.getCode())
                    .info("缺少 pinned 参数")
                    .data(false)
                    .build();
        }
        try {
            conversationSessionPinService.setPinned(
                    sessionId,
                    VisitorRequestContext.requireVisitorId(),
                    Boolean.TRUE.equals(body.pinned()));
            return Response.<Boolean>builder()
                    .code(ResponseCode.SUCCESS.getCode())
                    .info(ResponseCode.SUCCESS.getInfo())
                    .data(true)
                    .build();
        } catch (Exception e) {
            log.warn("会话置顶失败 sessionId={}", sessionId, e);
            return Response.<Boolean>builder()
                    .code(ResponseCode.UN_ERROR.getCode())
                    .info(e.getMessage() == null ? "置顶失败" : e.getMessage())
                    .data(false)
                    .build();
        }
    }

    /** 置顶请求体。必须显式传 pinned，避免把"漏传"误当成某种默认语义。 */
    public record PinBody(Boolean pinned) {
    }

    private ConversationSessionRespVO toSessionRespVO(DialogueSessionView session) {
        if (session == null) {
            return null;
        }
        return ConversationSessionRespVO.builder()
                .sessionId(session.getSessionId())
                .title(session.getTitle())
                .status(resolveStatusLabel(session.getStatus()))
                .latestQueryText(session.getLatestQueryText())
                .runCount(session.getRunCount())
                .finishedRunCount(session.getFinishedRunCount())
                .failedRunCount(session.getFailedRunCount())
                .startedAt(session.getStartedAt())
                .lastActiveAt(session.getLastActiveAt())
                .pinned(Integer.valueOf(1).equals(session.getPinned()))
                .build();
    }

    private ConversationHistoryDetailRespVO toDetailRespVO(ConversationHistoryDetail detail) {
        if (detail == null) {
            return null;
        }
        List<ConversationHistoryDetailRespVO.RunDetailRespVO> runs = CollectionUtils.isEmpty(detail.getRuns())
                ? List.of()
                : detail.getRuns().stream()
                .map(run -> ConversationHistoryDetailRespVO.RunDetailRespVO.builder()
                        .requestId(run.getRequestId())
                        .status(resolveStatusLabel(run.getStatus()))
                        .queryText(run.getQueryText())
                        .finalSummaryText(run.getFinalSummaryText())
                        .startedAt(run.getStartedAt())
                        .finishedAt(run.getFinishedAt())
                        .contextUsage(run.getContextUsage())
                        .replayFrames(run.getReplayFrames() == null ? List.of() : run.getReplayFrames())
                        .build())
                .collect(Collectors.toList());

        return ConversationHistoryDetailRespVO.builder()
                .sessionId(detail.getSessionId())
                .title(detail.getTitle())
                .status(resolveStatusLabel(detail.getStatus()))
                .deepThink(detail.getDeepThink())
                .runCount(detail.getRunCount())
                .finishedRunCount(detail.getFinishedRunCount())
                .failedRunCount(detail.getFailedRunCount())
                .startedAt(detail.getStartedAt())
                .lastActiveAt(detail.getLastActiveAt())
                .runs(runs)
                .build();
    }

    /**
     * 对外接口统一返回可读终态，避免前端和调试工具重复维护状态枚举映射。
     */
    private String resolveStatusLabel(Integer status) {
        int normalized = status == null ? ExecutionLedgerConstants.STATUS_RUNNING : status;
        return switch (normalized) {
            case ExecutionLedgerConstants.STATUS_SUCCESS -> "SUCCESS";
            case ExecutionLedgerConstants.STATUS_FAILED -> "FAILED";
            case ExecutionLedgerConstants.STATUS_TIMEOUT -> "TIMEOUT";
            case ExecutionLedgerConstants.STATUS_STOPPED -> "STOPPED";
            case ExecutionLedgerConstants.STATUS_WAITING_INPUT -> "WAITING_INPUT";
            default -> "RUNNING";
        };
    }
}
