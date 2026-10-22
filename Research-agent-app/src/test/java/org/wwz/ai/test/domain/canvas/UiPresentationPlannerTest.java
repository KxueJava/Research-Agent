package org.wwz.ai.test.domain.canvas;

import org.junit.Test;
import org.wwz.ai.domain.agent.runtime.tool.common.canvas.GenUiCatalog;
import org.wwz.ai.domain.agent.runtime.tool.common.canvas.planner.UiPresentationPlanner;
import java.util.*;
import static org.junit.Assert.*;
import static org.wwz.ai.domain.agent.runtime.tool.common.canvas.planner.UiPresentationPlanner.*;

public class UiPresentationPlannerTest {
    private final UiPresentationPlanner planner=new UiPresentationPlanner();
    private Input input(String goal){return new Input(goal,Set.of("emit_ui_tree","emit_ui_patch","canvas_publish","plan_route"),GenUiCatalog.ALLOWED_KINDS,Set.of("sales_analysis","map_itinerary"),List.of(),List.of(),"responsive",null);}
    @Test public void selectsFiveOriginalCasesAndBillSubcase(){
        assertEquals(Mode.MIXED,planner.plan(input("上传销售 CSV，筛选图表与表格联动分析看板")).mode());
        assertEquals(Mode.TEXT,planner.plan(input("根据研究笔记整理报告和来源，列出未知项")).mode());
        assertEquals(Mode.RICH_UI,planner.plan(input("生成参数表单，筛选月份并提交分析")).mode());
        assertEquals(Mode.ARTIFACT,planner.plan(input("生成可玩的贪吃蛇小游戏")).mode());
        assertEquals(Mode.MIXED,planner.plan(input("厦门站出发规划三个景点的步行地图路线")).mode());
        assertEquals(Mode.RICH_UI,planner.plan(input("做一个分账器，金额人数可调整")).mode());
    }
    @Test public void explicitResearchCardsAreMixedButPlainExplanationIsText(){
        assertEquals(Mode.MIXED,planner.plan(input("用交互卡片和时间线展示研究报告与来源")).mode());
        assertEquals(Mode.TEXT,planner.plan(input("解释一下什么是坐标系")).mode());
        var plan=planner.plan(input("做一个交互图解，用数轴和坐标系演示函数"));
        assertTrue(plan.components().containsAll(Set.of("ConceptDemo","NumberLine","CoordinateGrid")));
    }
    @Test public void unavailableToolsFallBackAndNeverInventCapabilities(){
        var i=new Input("生成小游戏",Set.of(),Set.of(),Set.of(),List.of(),List.of(),"mobile",null);
        var p=planner.plan(i);assertEquals(Mode.TEXT,p.mode());assertEquals("stacked",p.layout());assertTrue(p.capabilities().isEmpty());
    }
    @Test public void followupTargetsUniqueSurfaceButNeverGuessesAmongMany(){
        var s=new Surface("s1",3,"genui");var i=input("把这个看板改成按月份排序");
        i=new Input(i.goal(),i.tools(),i.components(),i.capabilities(),List.of(),List.of(s),"desktop",null);
        assertEquals(s,planner.plan(i).target());
        var many=new Input(i.goal(),i.tools(),i.components(),i.capabilities(),List.of(),List.of(s,new Surface("s2",1,"genui")),"desktop",null);
        assertNull(planner.plan(many).target());assertTrue(planner.plan(many).needsTarget());
    }
    @Test public void referencesComeOnlyFromVerifiedInput(){
        var i=input("交互看板");var r=new Resource("sales",2,Set.of("revenue"));
        i=new Input(i.goal(),i.tools(),i.components(),i.capabilities(),List.of(r),List.of(),"desktop",null);
        var plan=planner.plan(i);assertEquals(List.of(r),plan.resources());
        var good=node("Table","table",Map.of("dataRef",Map.of("id","sales","version",2)));
        assertTrue(planner.evaluate(i,plan,good,true).publishable());
        assertFalse(planner.evaluate(i,plan,node("Table","table",Map.of("dataRef",Map.of("id","sales","version",1))),false).publishable());
        assertFalse(planner.evaluate(i,plan,node("Button","go",Map.of("remoteAction",Map.of("id","x","capability","invented"))),false).publishable());
    }
    @Test public void incompleteUploadIsPendingNotCompletedAndMissingLocalReferencesFail(){
        var i=input("交互看板");var p=planner.plan(i);
        var tree=Map.of("kind","Card","children",List.of(node("FileInput","upload",Map.of("resourceId","sales")),node("Table","table",Map.of("dataRef",Map.of("id","sales")))));
        var q=planner.evaluate(i,p,tree,true);assertTrue(q.publishable());assertEquals("pending_input",q.dimensions().get("content_completeness"));assertEquals("unverified",q.dimensions().get("task_completion"));
        assertFalse(planner.evaluate(i,p,node("Stat","stat",Map.of("computation",Map.of("op","split","amount",Map.of("fromNode","missing")))),false).publishable());
    }
    @Test public void partialBlocksDoNotNeedFinalTaskCoverage(){
        var i=input("销售 CSV 分析看板，图表表格联动");var p=planner.plan(i);
        assertTrue(planner.evaluate(i,p,node("SectionHeader","title",Map.of("text","销售分析")),true).publishable());
        assertFalse(planner.evaluate(i,p,node("SectionHeader","title",Map.of("text","销售分析")),false).publishable());
    }
    @Test public void mixedKindsAndMultipleHtmlNeedExplicitTargetForUntypedFollowup(){
        var i=input("把这个速度调快");
        var mixed=new Input(i.goal(),i.tools(),i.components(),i.capabilities(),List.of(),List.of(new Surface("h1",1,"html"),new Surface("g1",1,"genui")),"desktop",null);
        assertTrue(planner.plan(mixed).needsTarget());assertNull(planner.plan(mixed).target());
        var html=new Input(i.goal(),i.tools(),i.components(),i.capabilities(),List.of(),List.of(new Surface("h1",1,"html"),new Surface("h2",1,"html")),"desktop",null);
        assertTrue(planner.plan(html).needsTarget());
    }
    @Test public void stringResourcesCannotBypassTrustCheck(){
        var i=input("交互卡片");assertFalse(planner.evaluate(i,planner.plan(i),node("Table","table",Map.of("dataRef","invented")),true).publishable());
    }
    @Test public void questionsDoNotCreateArtifactsAndCommonChartWordsAreRecognized(){
        assertEquals(Mode.TEXT,planner.plan(input("生成小游戏功能实现了吗")).mode());
        assertEquals(Mode.TEXT,planner.plan(input("高德支持3d地图吗")).mode());
        assertEquals(Mode.TEXT,planner.plan(input("解释这个图表是什么意思")).mode());
        assertEquals(Mode.MIXED,planner.plan(input("帮我画一个销售额折线图")).mode());
        assertEquals(Mode.RICH_UI,planner.plan(input("用图解演示坐标系")).mode());
    }
    private Map<String,Object> node(String kind,String id,Map<String,Object> props){return Map.of("kind",kind,"nodeId",id,"props",props);}
}

