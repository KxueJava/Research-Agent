package org.wwz.ai.infrastructure.adapter.repository;

import org.springframework.stereotype.Repository;
import org.wwz.ai.domain.agent.ledger.ConversationSessionPurgePort;
import org.wwz.ai.infrastructure.dao.research.ISessionPurgeDao;

/**
 * 会话硬删除适配器：把领域端口映射到 {@link ISessionPurgeDao}。
 * <p>
 * 删除顺序在这里固化：先删只按 run_id 关联的表，再删 dialogue_run，最后删 dialogue_session。
 * 库中当前没有外键约束，顺序错了不会报错，只会留下查不到的孤儿行。
 */
@Repository
public class ConversationSessionPurgeAdapter implements ConversationSessionPurgePort {

    private final ISessionPurgeDao sessionPurgeDao;

    public ConversationSessionPurgeAdapter(ISessionPurgeDao sessionPurgeDao) {
        this.sessionPurgeDao = sessionPurgeDao;
    }

    @Override
    public boolean isSessionOwnedByVisitor(String sessionId, String visitorId) {
        return sessionPurgeDao.countSessionOwnedByVisitor(sessionId, visitorId) > 0;
    }

    @Override
    public void purge(String sessionId, String visitorId) {
        // 1) 仅按 run_id 关联：必须最先删
        sessionPurgeDao.deleteLlmInvocationsBySessionId(sessionId);
        sessionPurgeDao.deleteToolInvocationsBySessionId(sessionId);
        sessionPurgeDao.deleteArtifactsBySessionId(sessionId);

        // 2) 分工具结构化输出
        sessionPurgeDao.deleteToolOutputCanvasPublishBySessionId(sessionId);
        sessionPurgeDao.deleteToolOutputCodeInterpreterBySessionId(sessionId);
        sessionPurgeDao.deleteToolOutputDataAnalysisBySessionId(sessionId);
        sessionPurgeDao.deleteToolOutputDeepSearchBySessionId(sessionId);
        sessionPurgeDao.deleteToolOutputEmitUiPatchBySessionId(sessionId);
        sessionPurgeDao.deleteToolOutputEmitUiTreeBySessionId(sessionId);
        sessionPurgeDao.deleteToolOutputImageGenerationBySessionId(sessionId);
        sessionPurgeDao.deleteToolOutputMultimodalAgentBySessionId(sessionId);

        // 3) 会话级附属数据
        sessionPurgeDao.deleteBackgroundTasksBySessionId(sessionId);
        sessionPurgeDao.deleteFeaturedConversationsBySessionId(sessionId);
        sessionPurgeDao.deleteLtmForkExecutionsBySessionId(sessionId);
        sessionPurgeDao.deletePlanApprovalsBySessionId(sessionId);
        sessionPurgeDao.deleteSessionCapabilitiesBySessionId(sessionId);
        sessionPurgeDao.deleteSessionTodosBySessionId(sessionId);
        sessionPurgeDao.deleteUserQuestionsBySessionId(sessionId);

        // 4) 工作记忆投影
        sessionPurgeDao.deleteWorkingMemoryMessagesBySessionId(sessionId);
        sessionPurgeDao.deleteWorkingMemoryTurnsBySessionId(sessionId);
        sessionPurgeDao.deleteWorkingMemoryCompactionsBySessionId(sessionId);

        // 5) 账本主干
        sessionPurgeDao.deleteDialogueRunsBySessionId(sessionId);
        sessionPurgeDao.deleteDialogueSessionBySessionIdAndVisitor(sessionId, visitorId);
    }
}
