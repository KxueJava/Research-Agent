package org.wwz.ai.domain.agent.ledger;

/**
 * 会话硬删除端口：物理清理某会话在运行账本与工作记忆中的全部痕迹。
 * <p>
 * 由 infrastructure 提供实现；领域服务负责归属校验与事务边界。
 */
public interface ConversationSessionPurgePort {

    /** 归属校验：确认该会话存在且属于该 visitor */
    boolean isSessionOwnedByVisitor(String sessionId, String visitorId);

    /**
     * 物理删除会话全部数据。调用方必须已完成归属校验。
     * 实现需保证先删只按 run_id 关联的表，再删 run，最后删 session。
     */
    void purge(String sessionId, String visitorId);
}
