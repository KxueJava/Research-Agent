package org.wwz.ai.test.domain.canvas;
import org.junit.Test;
import org.wwz.ai.domain.agent.runtime.tool.common.canvas.*;
import java.util.*;
import java.util.concurrent.atomic.*;
import static org.junit.Assert.*;
import static org.mockito.Mockito.*;

public class UiActionServiceTest {
  @Test public void cancellationDiscardsReadOnlyResultsButNeverClaimsExternalWriteRolledBack(){
    var read=new Fixture(false,false);var r=read.submit("r",Map.of());read.onExecute=e->read.service.cancel("s","owner",e.id());read.queue.removeFirst().run();
    assertEquals("cancelled",read.service.get("s","owner",r.id()).status());assertEquals("not_applied",read.service.get("s","owner",r.id()).data().get("effectState"));
    var write=new Fixture(false,true);var w=write.submit("w",Map.of());var effects=new AtomicInteger();
    write.onExecute=e->{effects.incrementAndGet();write.service.cancel("s","owner",e.id());};write.queue.removeFirst().run();
    assertEquals(1,effects.get());assertEquals("completed",write.service.get("s","owner",w.id()).status());assertEquals("applied",write.service.get("s","owner",w.id()).data().get("effectState"));
  }
  @Test public void rejectsStaleQueuedVersionAndForgedComponentActionWithoutRunningTool(){
    var f=new Fixture(false,false);var e=f.submit("q",Map.of());f.document.put("revision",2L);f.queue.removeFirst().run();
    assertEquals("failed",f.service.get("s","owner",e.id()).status());assertEquals(0,f.calls.get());
    assertThrows(IllegalArgumentException.class,()->f.service.submit("s","owner",new UiActionService.Request("a","button","client-tool",2,"new",Map.of())));
  }
  @Test public void actualSalesToolDerivesResourceFromCsvAndRejectsArbitraryToolInputs()throws Exception{
    var data=new LinkedHashMap<String,Object>();data.put("sessionId","s");data.put("binding",Map.of("sourceFile","sales.csv","targetPath","/root/children"));data.put("payload",Map.of("month","2026-02"));
    var execution=new UiActionExecution(data);var csv=java.nio.file.Files.readString(org.wwz.ai.domain.agent.runtime.tool.workspace.WorkspacePaths.resolveRepoRoot().resolve("docs/intelligent-ui/stage-0/fixtures/sales.csv"));
    var output=UiSalesAnalysisTool.analyze(execution,csv);assertTrue(output.summary().contains("1800.00"));assertEquals(2,((List<?>)output.resources().getFirst().get("rows")).size());
    var files=mock(org.wwz.ai.domain.agent.adapter.port.FileArtifactPort.class);data.put("payload",Map.of("tool","shell","permissions","all"));
    assertThrows(IllegalArgumentException.class,()->new UiSalesAnalysisTool(files,"http://localhost:1601").execute(new UiActionExecution(data)));verifyNoInteractions(files);
  }
  @Test public void bindsIdentityVersionAndCapabilityAndDeduplicates() {
    var fixture=new Fixture(false,false);
    var first=fixture.submit("key",Map.of());
    assertEquals("accepted",first.status());assertEquals(1,fixture.queue.size());
    assertEquals(first.id(),fixture.submit("key",Map.of()).id());assertEquals(1,fixture.queue.size());
    assertThrows(IllegalStateException.class,()->fixture.submit("key",Map.of("month","2026-02")));
    fixture.queue.removeFirst().run();assertEquals("completed",fixture.service.get("s","owner",first.id()).status());assertEquals(1,fixture.calls.get());
    assertThrows(SecurityException.class,()->fixture.service.get("s","foreign",first.id()));
    assertThrows(IllegalStateException.class,()->fixture.service.submit("s","owner",new UiActionService.Request("a","button","run",9,"other",Map.of())));
  }
  @Test public void recoversLostAcceptedDispatchAfterLeaseWithoutReplayingRunningOrLateRunnables(){
    var f=new Fixture(false,false);var e=f.submit("lost",Map.of());var late=f.queue.removeFirst();
    assertEquals("accepted",f.service.get("s","owner",e.id()).status());assertTrue(f.queue.isEmpty());
    f.clock.addAndGet(30001);f.service.get("s","owner",e.id());assertEquals(1,f.queue.size());
    f.onExecute=running->{f.clock.addAndGet(30001);assertEquals("running",f.service.get("s","owner",e.id()).status());assertEquals(1,f.queue.size());};
    late.run();f.queue.removeFirst().run();assertEquals(1,f.calls.get());assertEquals("completed",f.service.get("s","owner",e.id()).status());
  }
  @Test public void rejectsApprovalAndExpiryWithoutToolExecutionAndCancelsQueuedWork() {
    var f=new Fixture(true,false);var first=f.submit("1",Map.of());assertEquals("approval_required",first.status());
    assertEquals("failed",f.service.decide("s","owner",first.id(),false).status());assertEquals(0,f.calls.get());
    var expired=f.submit("2",Map.of());f.clock.addAndGet(301000);
    assertEquals("APPROVAL_EXPIRED",f.service.decide("s","owner",expired.id(),true).data().get("errorCode"));
    var third=f.submit("3",Map.of());f.service.decide("s","owner",third.id(),true);f.service.decide("s","owner",third.id(),true);
    assertEquals(1,f.queue.size());assertEquals("cancelled",f.service.cancel("s","owner",third.id()).status());f.queue.removeFirst().run();assertEquals(0,f.calls.get());
  }
  @Test public void recoveryQueriesNeverReplayCompletedWorkAndExpireApproval(){
    var completed=new Fixture(false,false);var action=completed.submit("restore",Map.of());completed.queue.removeFirst().run();
    for(int i=0;i<3;i++)assertEquals("completed",completed.service.list("s","owner","a").getFirst().status());
    var revision=((Number)completed.service.get("s","owner",action.id()).data().get("executionRevision")).longValue();assertTrue(revision>=4);
    assertEquals(revision,((Number)completed.service.list("s","owner","a").getFirst().data().get("executionRevision")).longValue());
    assertEquals(1,completed.calls.get());assertTrue(completed.queue.isEmpty());
    var approval=new Fixture(true,false);approval.submit("expiry",Map.of());approval.clock.addAndGet(301000);
    assertEquals("APPROVAL_EXPIRED",approval.service.list("s","owner","a").getFirst().data().get("errorCode"));assertEquals(0,approval.calls.get());assertTrue(approval.queue.isEmpty());
  }
  static class Fixture {
    AtomicLong clock=new AtomicLong(1000);AtomicInteger calls=new AtomicInteger();List<Runnable> queue=new ArrayList<>();
    UiActionService service;
    Map<String,Object> document;java.util.function.Consumer<UiActionExecution> onExecute=e->{};
    Fixture(boolean approval,boolean writes){
      var docs=new HashMap<String,UiActionExecution>();var surfaces=mock(UiSurfaceStore.class);
      var tree=Map.of("root",Map.of("kind","Card","nodeId","root","props",Map.of(),"children",List.of(Map.of("kind","Button","nodeId","button","props",Map.of("remoteAction",Map.of("id","run","capability","sales"))))));
      document=UiSurfaceDocument.create("s","owner","r","a","create",tree);
      when(surfaces.read("s","owner","a")).thenReturn(document);
      when(surfaces.applyAction(anyString(),anyString(),anyString(),anyLong(),anyList(),anyList())).thenReturn(document);
      UiActionStore store=new UiActionStore(){
        public synchronized UiActionExecution create(UiActionExecution value){var old=docs.get(value.id());if(old!=null){if(!old.fingerprint().equals(value.fingerprint()))throw new IllegalStateException("idempotency conflict");return old;}docs.put(value.id(),value);return value;}
        public synchronized UiActionExecution update(String s,String owner,String id,java.util.function.UnaryOperator<UiActionExecution> op){var old=read(s,owner,id);var next=op.apply(old);docs.put(id,next);return next;}
        public UiActionExecution read(String s,String owner,String id){var e=docs.get(id);if(e==null||!e.sessionId().equals(s)||!e.ownerId().equals(owner))throw new SecurityException("unavailable");return e;}
        public List<UiActionExecution> list(String s,String owner,String surface){return docs.values().stream().filter(e->e.sessionId().equals(s)&&e.ownerId().equals(owner)&&e.surfaceId().equals(surface)).toList();}
      };
      service=new UiActionService(store,surfaces,Map.of("sales",new UiActionService.Capability(approval,writes,e->{calls.incrementAndGet();onExecute.accept(e);return new UiActionService.Output(List.of(),List.of(),"analysis");})),queue::add,clock::get);
    }
    UiActionExecution submit(String key,Map<String,Object> payload){return service.submit("s","owner",new UiActionService.Request("a","button","run",1,key,payload));}
  }
}
