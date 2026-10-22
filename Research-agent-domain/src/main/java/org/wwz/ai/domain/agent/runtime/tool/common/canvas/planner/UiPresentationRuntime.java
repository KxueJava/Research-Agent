package org.wwz.ai.domain.agent.runtime.tool.common.canvas.planner;

import com.alibaba.fastjson.JSON;
import org.wwz.ai.domain.agent.runtime.agent.AgentContext;
import org.wwz.ai.domain.agent.runtime.tool.ToolResultPayload;
import org.wwz.ai.domain.agent.runtime.tool.common.canvas.*;
import java.util.*;
import static org.wwz.ai.domain.agent.runtime.tool.common.canvas.planner.UiPresentationPlanner.*;

/** Adapts trusted runtime state to the pure planner; never accepts evidence in tool arguments. */
public final class UiPresentationRuntime {
    private static final UiPresentationPlanner PLANNER=new UiPresentationPlanner();
    private UiPresentationRuntime(){}
    public static boolean enabled(AgentContext c){return c!=null&&c.getQuery()!=null&&!c.getQuery().isBlank()&&c.getToolCollection()!=null&&(c.getRuntimeDependencies()==null||c.getRuntimeDependencies().getResearchConfig()==null||Boolean.TRUE.equals(c.getRuntimeDependencies().getResearchConfig().getUiPlannerEnabled()));}
    private static List<Map<String,Object>> snapshots(AgentContext c){
        var d=c.getRuntimeDependencies();return d==null||d.getUiSurfaceStore()==null?List.of():d.getUiSurfaceStore().planningSnapshots(c.getSessionId());
    }
    public static Input input(AgentContext c){
        return input(c,null);
    }
    private static Input input(AgentContext c,String selectedSurface){
        Set<String> tools=new HashSet<>();for(String name:List.of("emit_ui_tree","emit_ui_patch","canvas_publish","plan_route"))
            if(c.getToolCollection().getTool(name)!=null&&(c.getToolDispatchWhitelist()==null||c.getToolDispatchWhitelist().contains(name))
                    &&org.wwz.ai.domain.agent.runtime.planmode.PlanModeToolPolicy.denyReason(c,name,Map.of())==null)tools.add(name);
        var docs=snapshots(c);List<Surface> current=new ArrayList<>();
        for(var doc:docs)if(doc.get("surfaceId") instanceof String id&&doc.get("revision") instanceof Number rev)
            current.add(new Surface(id,rev.longValue(),Objects.toString(doc.get("kind"),"genui")));
        var original=c.getUiPresentationSession().originals(current);
        // Keep original identities stable within this run, refresh their revisions for explicit CAS patches.
        var surfaces=original.stream().map(s->current.stream().filter(n->n.id().equals(s.id())).findFirst().orElse(null)).filter(Objects::nonNull).toList();
        var deps=c.getRuntimeDependencies();Set<String> actions=deps==null||deps.getUiActionService()==null?Set.of():deps.getUiActionService().capabilityNames();
        if(deps!=null&&deps.getResearchConfig()!=null&&!Boolean.TRUE.equals(deps.getResearchConfig().getUiMapsEnabled())){tools.remove("plan_route");actions=new HashSet<>(actions);actions.remove("map_itinerary");}
        if(selectedSurface!=null&&surfaces.stream().noneMatch(s->s.id().equals(selectedSurface)))throw new IllegalArgumentException("Selected Surface unavailable in this request");
        Input base=new Input(c.getQuery(),tools,GenUiCatalog.ALLOWED_KINDS,actions,List.of(),surfaces,"responsive",selectedSurface);
        var target=PLANNER.plan(base).target();List<Resource> resources=new ArrayList<>();
        // Resources are scoped to the target Surface; other Surface resources would not resolve in the renderer.
        if(target!=null)for(var doc:docs)if(target.id().equals(doc.get("surfaceId")))for(String field:List.of("resources","resourceHistory"))
            if(doc.get(field) instanceof List<?> list)for(Object raw:list)if(raw instanceof Map<?,?> r&&r.get("id") instanceof String id&&r.get("version") instanceof Number version&&r.get("columns") instanceof List<?> columns)
                resources.add(new Resource(id,version.longValue(),new HashSet<>(columns.stream().map(String::valueOf).toList())));
        return new Input(base.goal(),tools,base.components(),actions,resources,surfaces,base.device(),selectedSurface);
    }
    public static Map<String,Object> guidance(AgentContext c){
        if(!enabled(c))return Map.of();
        try {
            return guidanceValue(c,PLANNER.plan(input(c)));
        }catch(RuntimeException e){return Map.of("mode","TEXT","reason","Verified UI context unavailable; explain limitations without publishing");}
    }
    private static Map<String,Object> guidanceValue(AgentContext c,Plan p){
        var value=new LinkedHashMap<String,Object>();value.put("mode",p.mode().name());value.put("reason",p.reason());value.put("layout",p.layout());value.put("components",p.components());value.put("capabilities",p.capabilities());
        value.put("resources",p.resources().stream().map(r->Map.of("id",r.id(),"version",r.version(),"columns",r.columns())).toList());
        value.put("target",p.target()==null?null:Map.of("surfaceId",p.target().id(),"baseRevision",p.target().revision(),"kind",p.target().kind()));value.put("needsTarget",p.needsTarget());value.put("sections",p.sections());
        var out=new LinkedHashMap<String,Object>();out.put("plan",value);out.put("fallback",c.getUiPresentationSession().exhausted()?"TEXT":"repair_then_TEXT");
        out.put("maximumRepairs",2);out.put("qualityEvidence","Static publication checks only; task completion requires actual interaction/tool evidence");
        out.put("followup","Use emit_ui_patch with target id/revision; ambiguous target requires clarification. Keep the same html_path for artifact updates.");return out;
    }
    public static String userGuidance(AgentContext c){return enabled(c)?"\n\n<ui_presentation_plan>\n"+JSON.toJSONString(guidance(c))+"\n</ui_presentation_plan>":"";}
    public static Quality checkTree(AgentContext c,Object tree,boolean partial,String canvasId){
        if(!enabled(c))return null;
        ensureAvailable(c);var base=partial?c.getUiPresentationSession().prefixInput(()->input(c)):input(c);
        var in=canvasId!=null&&base.surfaces().stream().anyMatch(s->s.id().equals(canvasId))?input(c,canvasId):base;
        var plan=PLANNER.plan(in);
        if(plan.target()!=null&&!Objects.equals(canvasId,plan.target().id()))throw new IllegalArgumentException("Follow-up must update original Surface "+plan.target().id()+" at revision "+plan.target().revision()+" with emit_ui_patch");
        var quality=PLANNER.evaluate(in,plan,tree,partial);if(!quality.publishable())throw new IllegalArgumentException(String.join("; ",quality.errors()));return quality;
    }
    public static Quality checkPatch(AgentContext c,String id,Long revision,List<Map<String,Object>> patches){
        if(!enabled(c))return null;ensureAvailable(c);
        var docs=snapshots(c).stream().filter(d->d.get("tree") instanceof Map<?,?>).filter(d->id==null||id.equals(d.get("surfaceId"))).toList();
        if(docs.size()!=1)throw new IllegalArgumentException("Select exactly one persisted Surface for this patch");
        if(revision==null)throw new IllegalArgumentException("Planner updates require confirmed base_revision");
        var next=UiSurfaceDocument.patch(docs.getFirst(),"planner-preflight",revision,patches);
        return checkTree(c,next.get("tree"),false,String.valueOf(next.get("surfaceId")));
    }
    public static void checkArtifact(AgentContext c){
        if(!enabled(c))return;ensureAvailable(c);var plan=PLANNER.plan(input(c));
        if(plan.mode()!=Mode.ARTIFACT)throw new IllegalArgumentException("Presentation plan selects "+plan.mode()+"; HTML artifact is unnecessary");
        if(plan.needsTarget())throw new IllegalArgumentException("Identify the original HTML Surface before publishing an update");
    }
    public static void checkArtifactPath(AgentContext c,String path){
        if(!enabled(c))return;var target=PLANNER.plan(input(c)).target();if(target==null)return;
        var doc=snapshots(c).stream().filter(d->target.id().equals(d.get("surfaceId"))).findFirst().orElseThrow();
        if(!(doc.get("artifact") instanceof Map<?,?> a)||!path.equals(a.get("relativePath")))throw new IllegalArgumentException("Update the original HTML workspace path; do not create a replacement Surface");
    }
    public static void checkArtifactContent(AgentContext c,java.nio.file.Path file) throws java.io.IOException {
        if(!enabled(c))return;
        if(java.nio.file.Files.size(file)>2_097_152)throw new IllegalArgumentException("HTML exceeds publication size limit");
        String html=java.nio.file.Files.readString(file).toLowerCase(Locale.ROOT);
        if(!java.util.regex.Pattern.compile("<(?:!doctype|html|body|head|main|div|canvas|section|h[1-6])(?:\\s|>)").matcher(html).find())throw new IllegalArgumentException("HTML artifact is empty or contains no document content");
        if(UiPresentationPlanner.has(c.getQuery().toLowerCase(Locale.ROOT),"游戏","game")&&!html.contains("<script"))throw new IllegalArgumentException("Requested game has no executable script; runtime playability still requires browser validation");
    }
    public static Map<String,Object> qualityData(Quality quality){return Map.of("publishable",quality.publishable(),"dimensions",quality.dimensions(),"errors",quality.errors());}
    public static void ensureAvailable(AgentContext c){if(enabled(c)&&c.getUiPresentationSession().exhausted())throw new IllegalStateException("UI repair budget exhausted. Answer in TEXT; preserve the last valid Surface and explain unavailable results.");}
    public static ToolResultPayload failure(AgentContext c,String message){
        if(!enabled(c))return ToolResultPayload.failureFrom(message,null);
        int failures=c.getUiPresentationSession().reject();boolean fallback=failures>=3;
        return ToolResultPayload.failureFrom(message,Map.of("type","ui_quality_rejection","errors",List.of(message),"repairAttemptsRemaining",Math.max(0,3-failures),"fallback",fallback?"TEXT":"repair","instruction",fallback?"Stop all UI publication attempts this request. Explain the limitation in plain text; no task success claim.":"Repair only the reported issues and retry. Keep the last valid Surface."));
    }
}
