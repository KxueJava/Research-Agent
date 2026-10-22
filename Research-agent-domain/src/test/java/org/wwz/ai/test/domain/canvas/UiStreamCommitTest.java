package org.wwz.ai.test.domain.canvas;

import org.junit.Test;
import org.wwz.ai.domain.agent.runtime.tool.common.canvas.*;
import java.util.*;
import static org.junit.Assert.*;

public class UiStreamCommitTest {
    @Test public void completeResourceAndCalculationBindingsAreAllowedButNotUnresolvedPreviews() {
        for(String prop:List.of("dataRef","computation")) {
            var node=Map.of("kind","Stat","props",Map.of(prop,Map.of("id","sales","op","split","amount",100,"people",3)));
            assertNotNull(UiStreamCommit.normalize(node,true));
            assertThrows(IllegalArgumentException.class,()->UiStreamCommit.normalize(node,false));
        }
    }
    @Test public void stopBeforeFirstCommitCannotBeReopenedByLateOffer() {
        var h=new Harness();h.generation.stop("cancelled");h.offer(1,false);
        assertNull(h.persisted.get());assertThrows(IllegalStateException.class,()->h.generation.complete(tree()));
    }
    private static class Harness {
        final java.util.concurrent.atomic.AtomicReference<Map<String,Object>> persisted=new java.util.concurrent.atomic.AtomicReference<>();
        final java.util.concurrent.atomic.AtomicLong clock=new java.util.concurrent.atomic.AtomicLong(1000);
        final org.wwz.ai.domain.agent.runtime.agent.AgentContext context;
        final UiStreamGeneration generation;
        Harness() {
            UiSurfaceStore store=org.mockito.Mockito.mock(UiSurfaceStore.class);
            org.mockito.Mockito.when(store.commitStream(org.mockito.ArgumentMatchers.eq("s"),org.mockito.ArgumentMatchers.eq("r1"),org.mockito.ArgumentMatchers.anyMap(),org.mockito.ArgumentMatchers.any())).thenAnswer(inv->{
                var doc=UiStreamCommit.apply(persisted.get(),"s","owner","r1",inv.getArgument(2),inv.getArgument(3));persisted.set(doc);return doc;
            });
            context=org.wwz.ai.domain.agent.runtime.agent.AgentContext.builder().sessionId("s").requestId("r1")
                .runtimeDependencies(org.wwz.ai.domain.agent.runtime.ResearchRuntimeDependencies.builder().uiSurfaceStore(store).build()).build();
            generation=new UiStreamGeneration(context,clock::get);context.getUiStreamGenerations().put("call",generation);
        }
        void offer(int value,boolean force){generation.offer("{\"tree\":{\"kind\":\"Stat\",\"props\":{\"value\":\""+value+"\"}}}",force);}
    }
    @Test public void enforcesCommitIntervalAndCountWithoutBlockingFinalPublication() {
        var h=new Harness();h.offer(1,false);h.clock.addAndGet(99);h.offer(2,true);
        assertEquals(1L,((Number)h.persisted.get().get("revision")).longValue());
        for(int i=2;i<=70;i++){h.clock.addAndGet(100);h.offer(i,false);}
        assertEquals(64L,((Number)h.persisted.get().get("revision")).longValue());
        var finalDoc=h.generation.complete(tree());assertEquals(65L,((Number)finalDoc.get("revision")).longValue());
        assertEquals("completed",((Map<?,?>)finalDoc.get("stream")).get("status"));
    }
    @Test public void finalToolPublishesSameSurfaceAndGenerationMetadataForHistory() {
        var h=new Harness();h.offer(1,false);var first=h.persisted.get();
        var tool=new EmitUiTreeTool();tool.setAgentContext(h.context);
        h.context.bindCurrentToolArtifactSource(org.wwz.ai.domain.agent.runtime.artifact.ToolArtifactSource.builder().toolCallId("call").toolName("emit_ui_tree").build());
        var result=(org.wwz.ai.domain.agent.runtime.tool.ToolResultPayload)tool.execute(Map.of("tree",tree(),"canvas_id","model-ignored"));
        h.context.clearCurrentToolArtifactSource();assertFalse(result.getFailed());
        assertEquals(first.get("surfaceId"),h.persisted.get().get("surfaceId"));
        var output=(org.wwz.ai.domain.agent.ledger.model.tooloutput.GenUiTreeToolOutput)result.getStructuredOutput();
        var metadata=(Map<?,?>)output.getTree().get("_surface");
        assertEquals(h.persisted.get().get("stream"),metadata.get("stream"));assertEquals(h.persisted.get().get("revision"),metadata.get("revision"));
        assertSame(h.persisted.get(),h.generation.complete(tree()));
    }
    @Test public void runFinalizationAndDispatchRejectionReleaseOutstandingGeneration() {
        var h=new Harness();h.offer(1,false);h.context.markTurnClosed();
        assertEquals("failed",((Map<?,?>)h.persisted.get().get("stream")).get("status"));
        var other=new Harness();other.offer(1,false);other.context.closeUiStreamGeneration("call");
        assertEquals("failed",((Map<?,?>)other.persisted.get().get("stream")).get("status"));
        assertNotNull(UiSurfaceDocument.patch(other.persisted.get(),"edit",2L,List.of(Map.of("op","replace","path","/root/props/value","value","B"))));
    }
    @Test public void realToolDispatchRejectionClosesPreviewBeforeToolRuns() {
        var h=new Harness();h.offer(1,false);
        h.context.setRuntimeDependencies(h.context.getRuntimeDependencies().toBuilder().toolExecutor(Runnable::run).taskExecutor(Runnable::run).build());
        var plan=new org.wwz.ai.domain.agent.runtime.planmode.PlanModeState();plan.enterPlanMode();h.context.setPlanModeState(plan);
        var tools=new org.wwz.ai.domain.agent.runtime.tool.ToolCollection();h.context.setToolCollection(tools);
        class Agent extends org.wwz.ai.domain.agent.runtime.agent.BaseAgent {
            Agent(){setContext(h.context);setAvailableTools(tools);}
            public String step(){return "";}
            void dispatch(){executeTools(List.of(org.wwz.ai.domain.agent.runtime.dto.tool.ToolCall.builder().id("call").type("function")
                .function(org.wwz.ai.domain.agent.runtime.dto.tool.ToolCall.Function.builder().name("emit_ui_tree").arguments("{}").build()).build()));}
        }
        new Agent().dispatch();assertEquals("failed",((Map<?,?>)h.persisted.get().get("stream")).get("status"));
    }
    @Test public void enforcesNodeDepthAndInputLimitsAndPreservesAOnInvalidFinalB() {
        var h=new Harness();h.offer(1,false);var a=h.persisted.get().get("tree");
        assertThrows(IllegalArgumentException.class,()->h.generation.complete(Map.of("kind","Stat","props",Map.of("value",Map.of("bad",true)))));
        assertEquals(a,h.persisted.get().get("tree"));assertEquals("failed",((Map<?,?>)h.persisted.get().get("stream")).get("status"));
        assertThrows(IllegalArgumentException.class,()->UiStreamCommit.normalize(Map.of("kind","Card","props",Map.of(),"children",java.util.Collections.nCopies(200,Map.of("kind","Stat","props",Map.of()))),false));
        Object deep=Map.of("kind","Card","props",Map.of());
        for(int i=0;i<24;i++)deep=Map.of("kind","Card","props",Map.of(),"children",List.of(deep));
        Object finalDeep=deep;assertThrows(IllegalArgumentException.class,()->UiStreamCommit.normalize(finalDeep,false));
        assertNull(JsonUiPrefix.preview("x".repeat(1_048_577)));
        assertNull(JsonUiPrefix.preview("{\"tree\":{\"kind\":\"Card\",\"props\":{},\"props\":{}}}"));
    }
    @Test public void cancelAfterLlmCompletionStillTerminalizesGeneration() {
        var persisted=new java.util.concurrent.atomic.AtomicReference<Map<String,Object>>();
        UiSurfaceStore store=org.mockito.Mockito.mock(UiSurfaceStore.class);
        org.mockito.Mockito.when(store.commitStream(org.mockito.ArgumentMatchers.eq("s"),org.mockito.ArgumentMatchers.eq("r1"),org.mockito.ArgumentMatchers.anyMap(),org.mockito.ArgumentMatchers.any())).thenAnswer(inv->{
            var doc=UiStreamCommit.apply(persisted.get(),"s","owner","r1",inv.getArgument(2),inv.getArgument(3));persisted.set(doc);return doc;
        });
        var cancel=new org.wwz.ai.domain.agent.runtime.cancel.RunCancellation();
        var context=org.wwz.ai.domain.agent.runtime.agent.AgentContext.builder().requestId("r1").sessionId("s").runCancellation(cancel)
            .runtimeDependencies(org.wwz.ai.domain.agent.runtime.ResearchRuntimeDependencies.builder().uiSurfaceStore(store).build()).build();
        var clock=new java.util.concurrent.atomic.AtomicLong(1000);
        var generation=new UiStreamGeneration(context,clock::get);
        clock.set(1200);generation.offer("{\"tree\":{\"kind\":\"Stat\",\"props\":{\"value\":\"A\"}}}",false);
        var first=persisted.get();assertNotNull(first);
        // The LLM future may already be successful; no further chunks or tool call are needed.
        cancel.cancel("user_stop");
        assertEquals("cancelled",((Map<?,?>)persisted.get().get("stream")).get("status"));
        assertEquals(first.get("tree"),persisted.get().get("tree"));
        assertThrows(IllegalStateException.class,()->generation.complete(tree()));
    }
    @Test public void finalLegacyTreeDefaultsPropsAndPartialPropsMustBeRenderable() {
        assertNotNull(UiStreamCommit.normalize(Map.of("kind","Card"),true));
        for(var props:List.of(Map.of("title",Map.of()),Map.of("series","bad"),Map.of("series",List.of(Map.of("values","bad"))),Map.of("categories",Map.of()),Map.of("chart",42))) {
            assertThrows(IllegalArgumentException.class,()->UiStreamCommit.normalize(Map.of("root",Map.of("kind","Chart","props",props)),false));
        }
        for(String kind:List.of("Stat","TableCell","CodeBlock"))for(boolean completed:List.of(false,true))assertThrows(IllegalArgumentException.class,()->UiStreamCommit.normalize(Map.of("root",Map.of("kind",kind,"props",Map.of("value",Map.of("bad",true)))),completed));
    }
    private Object tree() { return Map.of("root",Map.of("kind","Card","props",Map.of(),"children",List.of(Map.of("kind","Stat","props",Map.of("value","A"))))); }
    private Map<String,Object> event(int seq,String status) {
        var event=new LinkedHashMap<String,Object>();
        event.putAll(Map.of("protocol","rui-stream/1","sessionId","s","surfaceId","a","messageId","r1","generationId","g1","sequence",seq,"baseRevision",seq-1,"revision",seq,"status",status));
        event.put("startedAt",1000L);event.put("emittedAt",1200L+seq);event.put("firstUsefulAt",1201L);return event;
    }
    @Test public void acceptsAAndRejectsOutOfOrderOrTerminalMutationAtomically() {
        var first=UiStreamCommit.apply(null,"s","owner","r1",event(1,"committed"),tree());
        assertEquals(1L,((Number)first.get("revision")).longValue());
        assertThrows(IllegalStateException.class,()->UiStreamCommit.apply(first,"s","owner","r1",event(3,"committed"),tree()));
        var cancelled=UiStreamCommit.apply(first,"s","owner","r1",event(2,"cancelled"),null);
        assertEquals(first.get("tree"),cancelled.get("tree"));
        assertThrows(IllegalStateException.class,()->UiStreamCommit.apply(cancelled,"s","owner","r1",event(3,"committed"),tree()));
    }
    @Test public void extractsAWithoutClosingIncompleteBOrRootProperties() {
        String prefix="{\"tree\":{\"root\":{\"kind\":\"Card\",\"props\":{},\"children\":[{\"kind\":\"Stat\",\"props\":{\"value\":\"A\"}},";
        var a=JsonUiPrefix.preview(prefix);assertNotNull(a);
        var root=(Map<?,?>)a.get("root");assertEquals(1,((List<?>)root.get("children")).size());
        assertEquals(a,JsonUiPrefix.preview(prefix+"{\"kind\":\"Stat\",\"props\":{\"value\":\"half"));
        assertNull(JsonUiPrefix.preview("{\"tree\":{\"root\":{\"kind\":\"Card\",\"props\":{\"title\":\"half"));
    }
    @Test public void partialExecutableNodesAndUnresolvedReferencesCannotCommit() {
        var html=Map.of("root",Map.of("kind","HtmlFrame","props",Map.of("html","<script>x()</script>")));
        assertThrows(IllegalArgumentException.class,()->UiStreamCommit.apply(null,"s","owner","r1",event(1,"committed"),html));
        var ref=Map.of("root",Map.of("kind","Chart","props",Map.of("dataRef","missing")));
        assertThrows(IllegalArgumentException.class,()->UiStreamCommit.apply(null,"s","owner","r1",event(1,"committed"),ref));
    }
}
