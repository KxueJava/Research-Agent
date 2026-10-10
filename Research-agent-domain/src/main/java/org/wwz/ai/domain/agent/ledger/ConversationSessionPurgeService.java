package org.wwz.ai.domain.agent.ledger;

import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 会话硬删除领域服务。
 * <p>
 * 删除是物理清除（不是 {@code deleted} 标记）：先做归属校验，再在一个事务里
 * 按依赖顺序清空各表；任一步失败整体回滚，避免留下半删的会话。
 * <p>
 * 磁盘工作区的清理不在这里——文件系统无法随事务回滚，由调用方在事务提交后
 * 另行调用 {@link ConversationWorkspaceCleaner}。
 */
@Slf4j
@Service
public class ConversationSessionPurgeService {

    private final ConversationSessionPurgePort purgePort;

    public ConversationSessionPurgeService(ConversationSessionPurgePort purgePort) {
        this.purgePort = purgePort;
    }

    /**
     * 物理删除一个会话。
     *
     * @throws IllegalStateException 会话不存在或不属于该 visitor
     */
    @Transactional(rollbackFor = Exception.class)
    public void purgeSession(String sessionId, String visitorId) {
        if (sessionId == null || sessionId.isBlank()) {
            throw new IllegalArgumentException("sessionId 不能为空");
        }
        if (!purgePort.isSessionOwnedByVisitor(sessionId, visitorId)) {
            throw new IllegalStateException("会话不存在或无权删除");
        }
        purgePort.purge(sessionId, visitorId);
        log.info("会话已物理删除 sessionId={} visitorId={}", sessionId, visitorId);
    }
}
