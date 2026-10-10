package org.wwz.ai.infrastructure.dao.research;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.wwz.ai.domain.agent.ledger.entity.DialogueSession;
import org.wwz.ai.domain.agent.ledger.model.DialogueSessionUpsertRecord;
import org.wwz.ai.domain.agent.ledger.model.DialogueSessionView;

import java.util.List;

/**
 * 会话主表 DAO。
 */
@Mapper
public interface IDialogueSessionLedgerDao {

    int upsertSession(DialogueSessionUpsertRecord record);

    DialogueSession queryBySessionId(@Param("sessionId") String sessionId);

    DialogueSessionView querySessionView(@Param("sessionId") String sessionId);

    List<DialogueSessionView> queryRecentSessions(@Param("limit") int limit);

    DialogueSessionView querySessionViewByVisitor(@Param("visitorId") String visitorId,
                                                  @Param("sessionId") String sessionId);

    List<DialogueSessionView> queryRecentSessionsByVisitor(@Param("visitorId") String visitorId,
                                                           @Param("limit") int limit);

    /**
     * 设置会话置顶状态。
     *
     * <p>WHERE 同时带 visitor_id，归属校验与写入一次完成——不需要先查再写，
     * 也就不会出现"校验通过但写入失败"的半成功状态。返回受影响行数：0 表示
     * 会话不存在或不属于该访客。</p>
     */
    int updatePinned(@Param("sessionId") String sessionId,
                     @Param("visitorId") String visitorId,
                     @Param("pinned") int pinned);
}
