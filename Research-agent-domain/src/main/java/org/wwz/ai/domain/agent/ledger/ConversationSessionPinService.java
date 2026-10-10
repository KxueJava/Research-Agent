package org.wwz.ai.domain.agent.ledger;

import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 会话置顶领域服务。
 *
 * <p>置顶的 UPDATE 语句本身就带 {@code visitor_id} 条件，归属校验与写入一次完成，
 * 因此不需要像硬删除那样"先校验再操作"——也就不存在校验通过但写入失败的半成功状态。</p>
 *
 * <p>{@code upsertSession} 的 {@code ON DUPLICATE KEY UPDATE} 没有列 {@code pinned}，
 * 所以后续每一轮对话的 upsert 都不会把用户设置的置顶冲掉。</p>
 */
@Slf4j
@Service
public class ConversationSessionPinService {

    private final IExecutionLedgerWriteRepository executionLedgerWriteRepository;

    public ConversationSessionPinService(IExecutionLedgerWriteRepository executionLedgerWriteRepository) {
        this.executionLedgerWriteRepository = executionLedgerWriteRepository;
    }

    /**
     * 设置或取消置顶。
     *
     * @throws IllegalArgumentException 参数为空
     * @throws IllegalStateException    会话不存在，或不属于该访客
     */
    @Transactional(rollbackFor = Exception.class)
    public void setPinned(String sessionId, String visitorId, boolean pinned) {
        if (sessionId == null || sessionId.isBlank()) {
            throw new IllegalArgumentException("sessionId 不能为空");
        }
        if (visitorId == null || visitorId.isBlank()) {
            throw new IllegalArgumentException("visitorId 不能为空");
        }
        int affected = executionLedgerWriteRepository.updateSessionPinned(sessionId, visitorId, pinned);
        if (affected == 0) {
            // "不存在"与"不属于当前访客"返回同一结果，不向调用方泄露会话是否存在
            throw new IllegalStateException("会话不存在或无权操作");
        }
        log.info("会话置顶状态已更新 sessionId={} pinned={}", sessionId, pinned);
    }
}
