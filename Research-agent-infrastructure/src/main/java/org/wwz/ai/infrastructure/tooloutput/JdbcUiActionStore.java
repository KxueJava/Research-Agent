package org.wwz.ai.infrastructure.tooloutput;
import com.alibaba.fastjson.JSON;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Repository;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.wwz.ai.domain.agent.runtime.tool.common.canvas.*;
import javax.sql.DataSource;
import java.util.*;
import java.util.function.UnaryOperator;

@Repository
@org.springframework.boot.autoconfigure.condition.ConditionalOnProperty(name="research.ui.surfaces.enabled",havingValue="true",matchIfMissing=true)
public class JdbcUiActionStore implements UiActionStore {
  private final JdbcTemplate jdbc;private final TransactionTemplate tx;
  public JdbcUiActionStore(@Qualifier("mysqlDataSource") DataSource source){jdbc=new JdbcTemplate(source);tx=new TransactionTemplate(new DataSourceTransactionManager(source));
    jdbc.execute("CREATE TABLE IF NOT EXISTS ai_agent_ui_action (execution_id VARCHAR(128) NOT NULL PRIMARY KEY,session_id VARCHAR(128) NOT NULL,owner_id VARCHAR(128) NOT NULL,surface_id VARCHAR(128) NOT NULL,document_json LONGTEXT NOT NULL,KEY ix_action_session_owner(session_id,owner_id,surface_id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
  }
  private void lock(String session,String owner){var owners=jdbc.queryForList("SELECT visitor_id FROM ai_agent_dialogue_session WHERE session_id=? AND deleted=0 FOR UPDATE",String.class,session);if(owners.size()!=1||!owner.equals(owners.getFirst()))throw new SecurityException("Action unavailable");}
  public UiActionExecution create(UiActionExecution execution){return tx.execute(status->{lock(execution.sessionId(),execution.ownerId());
    var existing=jdbc.queryForList("SELECT document_json FROM ai_agent_ui_action WHERE execution_id=?",String.class,execution.id());
    if(!existing.isEmpty()){var previous=decode(existing.getFirst());if(!previous.ownerId().equals(execution.ownerId())||!previous.sessionId().equals(execution.sessionId()))throw new SecurityException("Action unavailable");if(!previous.fingerprint().equals(execution.fingerprint()))throw new IllegalStateException("Idempotency key conflicts with original request");return previous;}
    jdbc.update("INSERT INTO ai_agent_ui_action(execution_id,session_id,owner_id,surface_id,document_json) VALUES(?,?,?,?,?)",execution.id(),execution.sessionId(),execution.ownerId(),execution.surfaceId(),JSON.toJSONString(execution.data()));return execution;
  });}
  public UiActionExecution read(String session,String owner,String id){var found=jdbc.queryForList("SELECT a.document_json FROM ai_agent_ui_action a JOIN ai_agent_dialogue_session s ON s.session_id=a.session_id WHERE a.execution_id=? AND a.session_id=? AND a.owner_id=? AND s.visitor_id=? AND s.deleted=0",String.class,id,session,owner,owner);if(found.size()!=1)throw new SecurityException("Action unavailable");return decode(found.getFirst());}
  public List<UiActionExecution> list(String session,String owner,String surface){return jdbc.queryForList("SELECT a.document_json FROM ai_agent_ui_action a JOIN ai_agent_dialogue_session s ON s.session_id=a.session_id WHERE a.session_id=? AND a.owner_id=? AND a.surface_id=? AND s.visitor_id=? AND s.deleted=0 ORDER BY JSON_EXTRACT(a.document_json,'$.createdAt') DESC LIMIT 100",String.class,session,owner,surface,owner).stream().map(JdbcUiActionStore::decode).toList();}
  public UiActionExecution update(String session,String owner,String id,UnaryOperator<UiActionExecution> op){return tx.execute(status->{lock(session,owner);var previous=read(session,owner,id);var next=op.apply(previous);
    if(!next.id().equals(previous.id())||!next.ownerId().equals(owner)||!next.sessionId().equals(session))throw new IllegalStateException("Execution identity changed");
    jdbc.update("UPDATE ai_agent_ui_action SET document_json=? WHERE execution_id=?",JSON.toJSONString(next.data()),id);return next;
  });}
  private static UiActionExecution decode(String json){return new UiActionExecution(JSON.parseObject(json));}
}

