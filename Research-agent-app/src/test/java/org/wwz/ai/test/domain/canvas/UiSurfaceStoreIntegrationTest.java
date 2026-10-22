package org.wwz.ai.test.domain.canvas;

import org.junit.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.wwz.ai.infrastructure.tooloutput.JdbcUiSurfaceStore;
import java.util.*;
import java.util.concurrent.*;
import static org.junit.Assert.*;

/** Opt-in, local MySQL only. Creates and removes only this test's UUID session. */
public class UiSurfaceStoreIntegrationTest {
    private JdbcTemplate jdbc;
    private JdbcUiSurfaceStore store;
    private String session;
    @Before public void setup() {
        Assume.assumeTrue("true".equals(System.getenv("RESEARCH_UI_DB_TEST")));
        DriverManagerDataSource source=IsolatedUiDatabase.source();
        jdbc=new JdbcTemplate(source);store=new JdbcUiSurfaceStore(source);
        session="rui-test-"+UUID.randomUUID();
        jdbc.update("INSERT INTO ai_agent_dialogue_session(session_id,visitor_id,title,deleted) VALUES(?,?,?,0)",session,"rui-test-owner","Disposable Surface test");
    }
    @After public void cleanup() {
        if(jdbc==null||session==null)return;
        jdbc.update("DELETE FROM ai_agent_ui_surface_event WHERE session_id=?",session);
        jdbc.update("DELETE FROM ai_agent_ui_surface WHERE session_id=?",session);
        jdbc.update("DELETE FROM ai_agent_dialogue_session WHERE session_id=?",session);
        jdbc.update("DELETE FROM ai_agent_file_scope_tombstone WHERE scope_id=?",session);
    }
    private Object tree() {return Map.of("kind","Card","props",Map.of("title","A"),"children",List.of());}
    @Test public void plannerSnapshotsDeriveOwnerAndExcludeDeletedSessions(){
        store.publish(session,"request","own-surface","create",tree());
        jdbc.update("INSERT INTO ai_agent_ui_surface(session_id,surface_id,owner_id,document_json) VALUES(?,?,?,?)",session,"foreign-surface","foreign-owner","{}");
        var docs=store.planningSnapshots(session);assertEquals(1,docs.size());assertEquals("own-surface",docs.getFirst().get("surfaceId"));
        assertTrue(store.list(session,"foreign-owner").isEmpty());
        jdbc.update("UPDATE ai_agent_dialogue_session SET deleted=1 WHERE session_id=?",session);
        assertThrows(SecurityException.class,()->store.planningSnapshots(session));
    }
    @Test public void recoverySidecarsUseIndependentCasAndRejectDeletedSessions(){
        store.publish(session,"r1","recover","create",UiRecoveryPolicyTest.tree());
        var first=store.saveInteraction(session,"rui-test-owner","recover",0,1,Map.of("nodes",Map.of("month","Jan")));
        assertEquals(1L,first.get("stateRevision"));
        assertThrows(IllegalStateException.class,()->store.saveInteraction(session,"rui-test-owner","recover",0,1,Map.of("nodes",Map.of("month","Feb"))));
        store.saveResource(session,"rui-test-owner","recover",0,UiRecoveryPolicyTest.resource(1));store.saveResource(session,"rui-test-owner","recover",1,UiRecoveryPolicyTest.resource(2));
        assertThrows(IllegalStateException.class,()->store.saveResource(session,"rui-test-owner","recover",0,UiRecoveryPolicyTest.resource(1)));
        var doc=store.read(session,"rui-test-owner","recover");assertEquals(1L,((Number)doc.get("revision")).longValue());assertEquals(1,((List<?>)doc.get("resourceHistory")).size());
        store.patch(session,"recover","rename",1L,List.of(Map.of("op","replace","path","/root/props/title","value","New")));
        var restored=(Map<?,?>)store.read(session,"rui-test-owner","recover").get("interaction");assertEquals(1L,((Number)restored.get("stateRevision")).longValue());assertEquals(first.get("updatedAt"),restored.get("updatedAt"));
        assertThrows(IllegalStateException.class,()->store.saveInteraction(session,"rui-test-owner","recover",1,1,Map.of("nodes",Map.of())));
        assertThrows(SecurityException.class,()->store.saveInteraction(session,"foreign","recover",1,2,Map.of("nodes",Map.of())));
        jdbc.update("UPDATE ai_agent_dialogue_session SET deleted=1 WHERE session_id=?",session);
        assertThrows(SecurityException.class,()->store.saveInteraction(session,"rui-test-owner","recover",1,2,Map.of("nodes",Map.of())));
        assertThrows(SecurityException.class,()->store.saveResource(session,"rui-test-owner","recover",2,UiRecoveryPolicyTest.resource(3)));
    }
    @Test public void twoTabsHaveOneStateWinnerAndHtmlSelectionSurvivesNewPublication()throws Exception{
        var artifact=Map.<String,Object>of("surfaceId","history","relativePath","game.html","sha256","a".repeat(64),"previewUrl","/tool/game.html");
        store.publishArtifact(session,"r1","h1",artifact);store.publishArtifact(session,"r2","h2",artifact);
        var executor=Executors.newFixedThreadPool(2);try{
            Callable<Boolean> write=()->{try{store.saveInteraction(session,"rui-test-owner","history",0,2,Map.of("artifactRevision",1));return true;}catch(IllegalStateException e){return false;}};
            var results=executor.invokeAll(List.of(write,write));assertNotEquals(results.get(0).get(),results.get(1).get());
        }finally{executor.shutdownNow();}
        store.publishArtifact(session,"r3","h3",artifact);var latest=store.read(session,"rui-test-owner","history");
        assertEquals(3L,((Number)latest.get("revision")).longValue());assertNotNull(latest.get("interaction"));assertEquals(1,store.list(session,"rui-test-owner").size());
    }
    private Map<String,Object> stream(int sequence,String status) {
        var e=new LinkedHashMap<String,Object>();e.putAll(Map.of("protocol","rui-stream/1","sessionId",session,"surfaceId","stream-a","messageId","r1","generationId","g1","sequence",sequence,"baseRevision",sequence-1,"revision",sequence,"status",status));
        e.put("startedAt",1000);e.put("firstUsefulAt",1201);e.put("emittedAt",1200+sequence);return e;
    }
    @Test public void interruptedGenerationRestoresWithIdempotencyAndOwnerIsolation() {
        var a=store.commitStream(session,"r1",stream(1,"committed"),tree());
        assertEquals(a,store.commitStream(session,"r1",stream(1,"committed"),tree()));
        assertThrows(IllegalStateException.class,()->store.commitStream(session,"r1",stream(3,"committed"),tree()));
        assertThrows(IllegalStateException.class,()->store.patch(session,"stream-a","ordinary",1L,patch("B")));
        var cancelled=store.commitStream(session,"r1",stream(2,"cancelled"),null);
        assertEquals(a.get("tree"),cancelled.get("tree"));assertEquals(List.of(cancelled),store.list(session,"rui-test-owner"));
        assertTrue(store.list(session,"foreign").isEmpty());
        assertThrows(IllegalStateException.class,()->store.commitStream(session,"r1",stream(3,"completed"),tree()));
        assertEquals(a,store.readVersion(session,"rui-test-owner","stream-a",1));
        assertEquals(3L,((Number)store.patch(session,"stream-a","after",2L,patch("B")).get("revision")).longValue());
        assertEquals(1,store.list(session,"rui-test-owner").size());
    }
    private List<Map<String,Object>> patch(String title) {return List.of(Map.of("op","replace","path","/root/props/title","value",title));}
    @Test public void persistsAndIsIdempotentAcrossStoreReads() {
        Map<String,Object> first=store.publish(session,"round-1","a","create",tree());
        assertEquals(first,store.publish(session,"round-1","a","create",tree()));
        Map<String,Object> updated=store.patch(session,"a","change",1L,patch("B"));
        assertEquals(updated,store.patch(session,"a","change",1L,patch("B")));
        assertEquals(2L,((Number)store.read(session,"rui-test-owner","a").get("revision")).longValue());
        assertThrows(IllegalStateException.class,()->store.patch(session,"a","change",1L,patch("C")));
        assertThrows(IllegalStateException.class,()->store.patch(session,"a","stale",1L,patch("C")));
    }
    @Test public void isolatesTargetsOwnersAndDeletedSessions() {
        store.publish(session,"r1","a","c1",tree());store.publish(session,"r2","b","c2",tree());
        assertThrows(IllegalStateException.class,()->store.patch(session,null,"p",null,patch("B")));
        assertThrows(SecurityException.class,()->store.read(session,"another-owner","a"));
        assertThrows(IllegalStateException.class,()->store.patch(session,"missing","m",1L,patch("B")));
        jdbc.update("UPDATE ai_agent_dialogue_session SET deleted=1 WHERE session_id=?",session);
        assertThrows(SecurityException.class,()->store.read(session,"rui-test-owner","a"));
        assertThrows(SecurityException.class,()->store.patch(session,"a","deleted",1L,patch("B")));
    }
    @Test public void concurrentPatchesWithSameBaseHaveOneWinner() throws Exception {
        store.publish(session,"r1","a","c1",tree());
        ExecutorService executor=Executors.newFixedThreadPool(2);
        try {
            Callable<Boolean> a=()->{try{store.patch(session,"a","p1",1L,patch("B"));return true;}catch(IllegalStateException e){return false;}};
            Callable<Boolean> b=()->{try{store.patch(session,"a","p2",1L,patch("C"));return true;}catch(IllegalStateException e){return false;}};
            var results=executor.invokeAll(List.of(a,b));
            assertNotEquals(results.get(0).get(),results.get(1).get());
            assertEquals(2L,((Number)store.read(session,"rui-test-owner","a").get("revision")).longValue());
        } finally {executor.shutdownNow();}
    }
    @Test public void versionsHtmlWithoutChangingItsOriginalMessageOrAllowingGenUiPatches() {
        Map<String,Object> a=Map.of("surfaceId","html-demo","relativePath","game.html","sha256","a".repeat(64),"previewUrl","/v1/file_tool/preview/one");
        Map<String,Object> b=new HashMap<>(a);b.put("sha256","b".repeat(64));b.put("previewUrl","/v1/file_tool/preview/two");
        var first=store.publishArtifact(session,"r1","h1",a);
        assertEquals(first,store.publishArtifact(session,"r1","h1",a));
        var second=store.publishArtifact(session,"r2","h2",b);
        assertEquals("html",second.get("kind"));assertEquals("r1",second.get("messageId"));
        assertEquals(2L,((Number)second.get("revision")).longValue());
        assertEquals(first,store.readVersion(session,"rui-test-owner","html-demo",1));
        assertThrows(SecurityException.class,()->store.readVersion(session,"foreign","html-demo",1));
        assertThrows(IllegalStateException.class,()->store.patch(session,"html-demo","no",2L,patch("No")));
        store.publish(session,"r3","genui","g1",tree());
        assertEquals("genui",store.patch(session,null,"g2",1L,patch("B")).get("surfaceId"));
        jdbc.update("UPDATE ai_agent_dialogue_session SET deleted=1 WHERE session_id=?",session);
        assertThrows(SecurityException.class,()->store.readVersion(session,"rui-test-owner","html-demo",1));
    }
    @Test public void realPurgeMapperRetainsScopeClassificationAfterHardDeletion() throws Exception {
        var configuration=new org.apache.ibatis.session.Configuration(new org.apache.ibatis.mapping.Environment(
            "file-scope-test",new org.apache.ibatis.transaction.jdbc.JdbcTransactionFactory(),jdbc.getDataSource()));
        for(String path:List.of("mybatis/mapper/session_purge_mapper.xml","mybatis/mapper/dialogue_session_ledger_mapper.xml")) {
            try(var resource=getClass().getClassLoader().getResourceAsStream(path)) {
                assertNotNull(path,resource);
                new org.apache.ibatis.builder.xml.XMLMapperBuilder(resource,configuration,path,configuration.getSqlFragments()).parse();
            }
        }
        var factory=new org.apache.ibatis.session.SqlSessionFactoryBuilder().build(configuration);
        try(var sql=factory.openSession(true)) {
            var purge=sql.getMapper(org.wwz.ai.infrastructure.dao.research.ISessionPurgeDao.class);
            purge.rememberFileScopesBySessionId(session);
            jdbc.update("DELETE FROM ai_agent_dialogue_session WHERE session_id=?",session);
            var sessions=sql.getMapper(org.wwz.ai.infrastructure.dao.research.IDialogueSessionLedgerDao.class);
            assertEquals(1,sessions.countKnownFileScope(session));
            assertEquals(0,sessions.countKnownFileScope("unknown-"+UUID.randomUUID()));
        }
    }
}
