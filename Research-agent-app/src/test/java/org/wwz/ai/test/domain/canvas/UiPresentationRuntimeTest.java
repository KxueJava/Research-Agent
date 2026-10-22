package org.wwz.ai.test.domain.canvas;

import com.alibaba.fastjson.JSON;
import org.junit.Test;
import org.wwz.ai.domain.agent.runtime.ResearchRuntimeDependencies;
import org.wwz.ai.domain.agent.runtime.agent.AgentContext;
import org.wwz.ai.domain.agent.runtime.tool.*;
import org.wwz.ai.domain.agent.runtime.tool.common.canvas.*;
import org.wwz.ai.domain.agent.runtime.tool.common.canvas.planner.*;
import java.util.*;
import static org.junit.Assert.*;
import static org.mockito.Mockito.*;

public class UiPresentationRuntimeTest {
    @org.junit.Rule public org.junit.rules.TemporaryFolder temp=new org.junit.rules.TemporaryFolder();
    private AgentContext context(String goal,UiSurfaceStore store){
        var tools=new ToolCollection();tools.setToolMap(new LinkedHashMap<>(Map.of("emit_ui_tree",new EmitUiTreeTool(),"emit_ui_patch",new EmitUiPatchTool(),"canvas_publish",new CanvasPublishTool())));
        return AgentContext.builder().sessionId("test-session").requestId("request").query(goal).toolCollection(tools).runtimeDependencies(ResearchRuntimeDependencies.builder().uiSurfaceStore(store).build()).build();
    }
    private Map<String,Object> tree(String title){return Map.of("root",Map.of("kind","Card","nodeId","card","props",Map.of("title",title)));}
    private Map<String,Object> doc(){return UiSurfaceDocument.create("test-session","owner","old-request","s1","old",tree("before"));}
    @Test public void guideIsDynamicSerializableAndDoesNotSpendBudget(){
        var store=mock(UiSurfaceStore.class);when(store.planningSnapshots(anyString())).thenReturn(List.of(doc()));
        var c=context("把这个标题改为新的",store);var tool=new GetGenuiGuideTool();tool.setAgentContext(c);
        for(int n=0;n<5;n++){var result=(ToolResultPayload)tool.execute(Map.of());String json=JSON.toJSONString(result.getLlmData());assertTrue(json,json.contains("RICH_UI"));assertTrue(json,json.contains("s1"));}
        assertFalse(c.getUiPresentationSession().exhausted());assertTrue(UiPresentationRuntime.userGuidance(c).contains("baseRevision"));
    }
    @Test public void failedResultingPatchNeverReachesStoreAndValidFollowupUsesOriginal(){
        var store=mock(UiSurfaceStore.class);when(store.planningSnapshots(anyString())).thenReturn(List.of(doc()));
        var c=context("把这个标题改为新的",store);var tool=new EmitUiPatchTool();tool.setAgentContext(c);
        var bad=(ToolResultPayload)tool.execute(Map.of("canvas_id","s1","base_revision",1,"patches",List.of(Map.of("op","add","path","/root/props/remoteAction","value",Map.of("id","hack","capability","shell")))));
        assertTrue(bad.getFailed());verify(store,never()).patch(any(),any(),any(),any(),any());
        when(store.patch(any(),any(),any(),any(),any())).thenAnswer(call->UiSurfaceDocument.patch(doc(),"ok",1L,call.getArgument(4)));
        var good=(ToolResultPayload)tool.execute(Map.of("canvas_id","s1","base_revision",1,"patches",List.of(Map.of("op","replace","path","/root/props/title","value","after"))));
        assertFalse(String.valueOf(good.getLlmData()),good.getFailed());verify(store).patch(eq("test-session"),eq("s1"),any(),eq(1L),any());
    }
    @Test public void sameSurfacePreferenceIsEnforcedAndCannotCreateSibling(){
        var store=mock(UiSurfaceStore.class);when(store.planningSnapshots(anyString())).thenReturn(List.of(doc()));
        var tool=new EmitUiTreeTool();tool.setAgentContext(context("修改这个卡片标题",store));
        assertTrue(((ToolResultPayload)tool.execute(Map.of("tree",tree("new")))).getFailed());verify(store,never()).publish(any(),any(),any(),any(),any());
    }
    @Test public void threeInvalidAttemptsExhaustSharedBudgetAcrossTreeHtmlAndStream(){
        var store=mock(UiSurfaceStore.class);when(store.planningSnapshots(anyString())).thenReturn(List.of());
        var c=context("生成交互卡片",store);var tool=new EmitUiTreeTool();tool.setAgentContext(c);
        for(int n=0;n<3;n++)assertTrue(((ToolResultPayload)tool.execute(Map.of("tree",Map.of("kind","Invented")))).getFailed());
        assertTrue(c.getUiPresentationSession().exhausted());
        var blocked=(ToolResultPayload)tool.execute(Map.of("tree",tree("valid")));assertTrue(blocked.getFailed());assertEquals("TEXT",((Map<?,?>)blocked.getLlmData()).get("fallback"));
        var html=new CanvasPublishTool();html.setAgentContext(c);assertTrue(((ToolResultPayload)html.execute(Map.of("html_path","game.html"))).getFailed());
        new UiStreamGeneration(c,System::currentTimeMillis).offer("{\"tree\":{\"kind\":\"Card\",\"props\":{\"title\":\"new\"}}}",true);
        verify(store,never()).publish(any(),any(),any(),any(),any());verify(store,never()).commitStream(any(),any(),any(),any());verify(store,never()).publishArtifact(any(),any(),any(),any());
    }
    @Test public void unknownResourceCannotCommitEvenBeforeFinalMessage(){
        var store=mock(UiSurfaceStore.class);when(store.planningSnapshots(anyString())).thenReturn(List.of());
        var c=context("生成交互卡片",store);var generation=new UiStreamGeneration(c,System::currentTimeMillis);
        generation.offer("{\"tree\":{\"kind\":\"Table\",\"props\":{\"dataRef\":{\"id\":\"invented\"}}}}",true);
        verify(store,never()).commitStream(any(),any(),any(),any());assertFalse(c.getUiPresentationSession().exhausted());
    }
    @Test public void htmlFollowupKeepsPathAndRejectsNewSiblingArtifact(){
        var store=mock(UiSurfaceStore.class);when(store.planningSnapshots(anyString())).thenReturn(List.of(Map.of("surfaceId","h1","revision",2,"kind","html","artifact",Map.of("relativePath","game.html"))));
        var c=context("把这个速度调快",store);UiPresentationRuntime.checkArtifact(c);UiPresentationRuntime.checkArtifactPath(c,"game.html");
        try{UiPresentationRuntime.checkArtifactPath(c,"game2.html");fail();}catch(IllegalArgumentException expected){}
    }
    @Test public void explicitPatchTargetWorksAmongMultipleSurfacesAndScopesResources(){
        var store=mock(UiSurfaceStore.class);var other=new LinkedHashMap<>(doc());other.put("surfaceId","s2");
        other.put("resources",List.of(Map.of("id","second-only","version",1,"columns",List.of("value"))));
        when(store.planningSnapshots(anyString())).thenReturn(List.of(doc(),other));
        var c=context("修改这个标题",store);
        assertTrue(((Map<?,?>)UiPresentationRuntime.guidance(c).get("plan")).get("needsTarget").equals(true));
        assertTrue(UiPresentationRuntime.checkPatch(c,"s2",1L,List.of(Map.of("op","replace","path","/root/props/title","value","after"))).publishable());
        Map<String,Object> ref=Map.of("op","add","path","/root/props/dataRef","value","second-only");
        assertTrue(UiPresentationRuntime.checkPatch(c,"s2",1L,List.of(ref)).publishable());
        assertThrows(IllegalArgumentException.class,()->UiPresentationRuntime.checkPatch(c,"s1",1L,List.of(ref)));
    }
    @Test public void usefulACommitsBeforeFinalAndInvalidBPreservesIt(){
        var store=mock(UiSurfaceStore.class);when(store.planningSnapshots(anyString())).thenReturn(List.of());
        var prior=new java.util.concurrent.atomic.AtomicReference<Map<String,Object>>();
        when(store.commitStream(any(),any(),any(),any())).thenAnswer(call->{
            var next=UiStreamCommit.apply(prior.get(),call.getArgument(0),"owner",call.getArgument(1),call.getArgument(2),call.getArgument(3));prior.set(next);return next;
        });
        var clock=new java.util.concurrent.atomic.AtomicLong(1000);var c=context("交互卡片",store);var generation=new UiStreamGeneration(c,clock::get);
        generation.offer("{\"tree\":{\"kind\":\"Card\",\"nodeId\":\"a\",\"props\":{\"title\":\"A\"}}}",true);
        assertNotNull(prior.get());assertEquals("committed",((Map<?,?>)prior.get().get("stream")).get("status"));
        var a=prior.get();clock.addAndGet(200);
        generation.offer("{\"tree\":{\"kind\":\"Table\",\"props\":{\"dataRef\":\"invented\"}}}",true);
        assertSame(a,prior.get());verify(store,times(1)).commitStream(any(),any(),any(),any());
        generation.complete(tree("A"));assertEquals("completed",((Map<?,?>)prior.get().get("stream")).get("status"));
        verify(store,times(2)).planningSnapshots(anyString());
    }
    @Test public void newExplicitCanvasIdDoesNotHaveToExist(){
        var c=context("交互卡片",mock(UiSurfaceStore.class));
        assertTrue(UiPresentationRuntime.checkTree(c,tree("New"),false,"new-id").publishable());
    }
    @Test public void artifactContentChecksDoNotPretendToProvePlayability()throws Exception{
        var c=context("生成小游戏",mock(UiSurfaceStore.class));var file=temp.newFile("game.html").toPath();
        java.nio.file.Files.writeString(file,"plain text");assertThrows(IllegalArgumentException.class,()->UiPresentationRuntime.checkArtifactContent(c,file));
        java.nio.file.Files.writeString(file,"<main>Game</main>");assertThrows(IllegalArgumentException.class,()->UiPresentationRuntime.checkArtifactContent(c,file));
        java.nio.file.Files.writeString(file,"<canvas></canvas><script>const score=0;</script>");UiPresentationRuntime.checkArtifactContent(c,file);
    }
}

