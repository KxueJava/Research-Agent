package org.wwz.ai.infrastructure.dao.research;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

/**
 * 会话硬删除 DAO：按 sessionId 物理清理该会话在各表中的全部痕迹。
 * <p>
 * 执行顺序由上层保证：先删只按 run_id 关联的三张表，再删 dialogue_run，
 * 最后删 dialogue_session。库中当前没有外键约束，顺序错了不会报错但会留下孤儿数据。
 * <p>
 * 新增会话域表时必须在此登记，并同步 {@code session_purge_mapper.xml}。
 */
@Mapper
public interface ISessionPurgeDao {

    /** 归属校验：确认 session 属于该 visitor，供删除前把关 */
    int countSessionOwnedByVisitor(@Param("sessionId") String sessionId,
                                   @Param("visitorId") String visitorId);

    int deleteLlmInvocationsBySessionId(@Param("sessionId") String sessionId);

    int deleteToolInvocationsBySessionId(@Param("sessionId") String sessionId);

    int deleteArtifactsBySessionId(@Param("sessionId") String sessionId);

    int deleteToolOutputCanvasPublishBySessionId(@Param("sessionId") String sessionId);

    int deleteToolOutputCodeInterpreterBySessionId(@Param("sessionId") String sessionId);

    int deleteToolOutputDataAnalysisBySessionId(@Param("sessionId") String sessionId);

    int deleteToolOutputDeepSearchBySessionId(@Param("sessionId") String sessionId);

    int deleteToolOutputEmitUiPatchBySessionId(@Param("sessionId") String sessionId);

    int deleteToolOutputEmitUiTreeBySessionId(@Param("sessionId") String sessionId);

    int deleteToolOutputImageGenerationBySessionId(@Param("sessionId") String sessionId);

    int deleteToolOutputMultimodalAgentBySessionId(@Param("sessionId") String sessionId);

    int deleteBackgroundTasksBySessionId(@Param("sessionId") String sessionId);

    int deleteFeaturedConversationsBySessionId(@Param("sessionId") String sessionId);

    int deleteLtmForkExecutionsBySessionId(@Param("sessionId") String sessionId);

    int deletePlanApprovalsBySessionId(@Param("sessionId") String sessionId);

    int deleteSessionCapabilitiesBySessionId(@Param("sessionId") String sessionId);

    int deleteSessionTodosBySessionId(@Param("sessionId") String sessionId);

    int deleteUserQuestionsBySessionId(@Param("sessionId") String sessionId);

    int deleteWorkingMemoryMessagesBySessionId(@Param("sessionId") String sessionId);

    int deleteWorkingMemoryTurnsBySessionId(@Param("sessionId") String sessionId);

    int deleteWorkingMemoryCompactionsBySessionId(@Param("sessionId") String sessionId);

    int deleteDialogueRunsBySessionId(@Param("sessionId") String sessionId);

    int deleteDialogueSessionBySessionIdAndVisitor(@Param("sessionId") String sessionId,
                                                   @Param("visitorId") String visitorId);
}
