package org.wwz.ai.test.domain.canvas;
import org.junit.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.wwz.ai.infrastructure.tooloutput.*;
import org.wwz.ai.domain.agent.runtime.tool.common.canvas.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;
import static org.junit.Assert.*;
public class UiActionStoreIntegrationTest {
  JdbcTemplate jdbc;JdbcUiActionStore actions;JdbcUiSurfaceStore surfaces;String session;
  @Before public void setup(){Assume.assumeTrue("true".equals(System.getenv("RESEARCH_UI_DB_TEST")));
    var source=IsolatedUiDatabase.source();
    jdbc=new JdbcTemplate(source);actions=new JdbcUiActionStore(source);surfaces=new JdbcUiSurfaceStore(source);session="uia-test-"+UUID.randomUUID();
    jdbc.update("INSERT INTO ai_agent_dialogue_session(session_id,visitor_id,title,deleted) VALUES(?,?,?,0)",session,"uia-owner","Disposable Action test");
    surfaces.publish(session,"r","a","create",Map.of("kind","Card","nodeId","root","props",Map.of(),"children",List.of(Map.of("kind","Button","nodeId","button","props",Map.of("remoteAction",Map.of("id","run","capability","test"))))));
  }
  @After public void cleanup(){if(jdbc==null)return;for(String table:List.of("ai_agent_ui_action","ai_agent_ui_surface_event","ai_agent_ui_surface","ai_agent_dialogue_session"))jdbc.update("DELETE FROM "+table+" WHERE session_id=?",session);}
  UiActionService.Request request(String key){return new UiActionService.Request("a","button","run",1,key,Map.of());}
  @Test public void concurrentIdenticalRequestsHaveOneExecutionAndAtomicSurfaceResult()throws Exception{
    var count=new AtomicInteger();var queue=new java.util.concurrent.CopyOnWriteArrayList<Runnable>();
    var service=new UiActionService(actions,surfaces,Map.of("test",new UiActionService.Capability(false,false,e->{count.incrementAndGet();return new UiActionService.Output(List.of(Map.of("op","add","path","/root/props/title","value","Done")),List.of(),"done");})),queue::add,System::currentTimeMillis);
    var executor=Executors.newFixedThreadPool(2);try{var results=executor.invokeAll(List.of(()->service.submit(session,"uia-owner",request("same")),()->service.submit(session,"uia-owner",request("same"))));assertEquals(1,queue.size());queue.getFirst().run();
      var id=((UiActionExecution)results.getFirst().get()).id();var restored=new JdbcUiActionStore(jdbc.getDataSource()).read(session,"uia-owner",id);assertEquals("completed",restored.status());assertEquals(1,count.get());assertEquals(2L,((Number)surfaces.read(session,"uia-owner","a").get("revision")).longValue());
      assertEquals(id,service.submit(session,"uia-owner",request("same")).id());assertThrows(SecurityException.class,()->actions.read(session,"foreign",id));
    }finally{executor.shutdownNow();}
  }
  @Test public void surfaceAndExecutionRollbackTogetherOnCommitFailure(){
    var execution=new UiActionExecution(Map.of("id","rollback","sessionId",session,"ownerId","uia-owner","surfaceId","a","fingerprint","f","status","running"));actions.create(execution);
    assertThrows(IllegalStateException.class,()->actions.update(session,"uia-owner",execution.id(),e->{surfaces.applyAction(session,"a","atomic",1,List.of(Map.of("op","add","path","/root/props/title","value","Must rollback")),List.of());throw new IllegalStateException("injected commit error");}));
    assertEquals(1L,((Number)surfaces.read(session,"uia-owner","a").get("revision")).longValue());assertEquals("running",actions.read(session,"uia-owner",execution.id()).status());
  }
}
