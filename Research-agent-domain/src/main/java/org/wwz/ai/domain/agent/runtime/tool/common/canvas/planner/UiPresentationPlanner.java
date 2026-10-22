package org.wwz.ai.domain.agent.runtime.tool.common.canvas.planner;

import org.wwz.ai.domain.agent.runtime.tool.common.canvas.GenUiSchema;
import java.util.*;

/** Deterministic routing and static publication checks. No model-supplied evidence is trusted. */
public final class UiPresentationPlanner {
    public enum Mode {TEXT,RICH_UI,MIXED,ARTIFACT}
    public record Resource(String id,long version,Set<String> columns) {
        public Resource {columns=Set.copyOf(columns);if(id==null||id.isBlank()||version<1)throw new IllegalArgumentException("Invalid verified resource");}
    }
    public record Surface(String id,long revision,String kind) {}
    public record Input(String goal,Set<String> tools,Set<String> components,Set<String> capabilities,
                        List<Resource> resources,List<Surface> surfaces,String device,String currentSurfaceId) {
        public Input {goal=Objects.toString(goal,"");tools=Set.copyOf(tools);components=Set.copyOf(components);capabilities=Set.copyOf(capabilities);resources=List.copyOf(resources);surfaces=List.copyOf(surfaces);}
    }
    public record Plan(Mode mode,String reason,String layout,Set<String> components,Set<String> capabilities,
                       List<Resource> resources,Surface target,boolean needsTarget,List<String> sections) {}
    public record Quality(boolean publishable,Map<String,String> dimensions,List<String> errors) {}

    public Plan plan(Input in) {
        String q=in.goal().toLowerCase(Locale.ROOT);
        boolean followup=has(q,"修改","改成","改为","换成","替换","调整","这个","刚才","继续","排序","update","modify","change");
        boolean artifact=has(q,"小游戏","贪吃蛇","游戏","game","html","网页","落地页");
        boolean map=has(q,"地图","路线","行程","map","itinerary");
        boolean sales=has(q,"看板","仪表盘","dashboard","图表","chart","csv","折线图","柱状图","饼图","散点图","可视化");
        boolean form=has(q,"表单","分账","计算器","form","calculator");
        boolean teaching=has(q,"图解","交互演示","动态演示","数轴","interactive diagram");
        boolean rich=sales||form||teaching||has(q,"交互","卡片","时间线","interactive","timeline");
        boolean untypedFollowup=followup&&!artifact&&!map&&!rich;
        Surface selected=in.surfaces().stream().filter(s->s.id().equals(in.currentSurfaceId())).findFirst().orElse(null);
        if(untypedFollowup){
            Surface inherited=selected!=null?selected:in.surfaces().size()==1?in.surfaces().getFirst():null;
            if(inherited!=null)artifact="html".equals(inherited.kind());
        }
        Mode mode=artifact?Mode.ARTIFACT:map?Mode.MIXED:sales?Mode.MIXED:rich?(form||teaching?Mode.RICH_UI:Mode.MIXED):Mode.TEXT;
        if(mode==Mode.TEXT&&followup&&!in.surfaces().isEmpty())mode=Mode.RICH_UI;
        boolean create=has(q,"请生成","帮我生成","生成一个","做一个","制作","创建","画一个","添加","增加","修改","改成","筛选","图解","演示");
        boolean question=has(q,"实现了吗","支持吗","是什么","是什么意思","怎么用","如何使用","是否支持","what is","how to use")
                ||(q.contains("支持")&&has(q,"吗","？","?"))
                ||((q.startsWith("解释")||q.startsWith("介绍")||q.startsWith("说明"))&&!has(q,"交互","图解","演示"));
        if(question&&!create)mode=Mode.TEXT;
        if(has(q,"只用文字","仅用文字","不要界面","不要交互","text only"))mode=Mode.TEXT;
        String reason=mode==Mode.TEXT?"A text response is sufficient":"The requested task benefits from interaction";
        if(mode==Mode.ARTIFACT&&!in.tools().contains("canvas_publish")||mode!=Mode.ARTIFACT&&mode!=Mode.TEXT&&!in.tools().contains("emit_ui_tree")) {
            mode=Mode.TEXT;reason="Required publication tool unavailable; explain the limitation in text";
        }
        if(map&&!in.tools().contains("plan_route")){mode=Mode.TEXT;reason="Verified route provider tool unavailable; do not invent a route";}
        Set<String> requested=new LinkedHashSet<>();
        if(mode==Mode.RICH_UI||mode==Mode.MIXED){
            requested.addAll(List.of("Card","SectionHeader"));
            if(map)requested.add("MapWidget");
            if(sales)requested.addAll(List.of("Chart","Table","Stat","Select","FileInput"));
            if(form)requested.addAll(List.of("Form","NumberInput","Select","Button","Stat"));
            if(teaching){requested.add("ConceptDemo");if(has(q,"数轴","number line"))requested.add("NumberLine");if(has(q,"坐标","coordinate"))requested.add("CoordinateGrid");}
            if(!sales&&!map&&!form&&!teaching)requested.addAll(List.of("Card","List"));
        }
        requested.retainAll(in.components());
        Set<String> actions=new LinkedHashSet<>();
        if(map&&in.capabilities().contains("map_itinerary"))actions.add("map_itinerary");
        if(has(q,"提交","执行分析","submit")&&in.capabilities().contains("sales_analysis"))actions.add("sales_analysis");
        final boolean artifactKind=artifact;
        List<Surface> candidates=in.surfaces().stream().filter(s->untypedFollowup||modeKind(artifactKind,s)).toList();
        Surface target=null;
        if(in.currentSurfaceId()!=null)target=candidates.stream().filter(s->s.id().equals(in.currentSurfaceId())).findFirst().orElse(null);
        if(target==null&&followup&&candidates.size()==1)target=candidates.getFirst();
        boolean ambiguous=followup&&target==null&&candidates.size()>1;
        return new Plan(mode,reason,"mobile".equals(in.device())?"stacked":"responsive",Set.copyOf(requested),Set.copyOf(actions),in.resources(),target,ambiguous,
                map?List.of("summary","verified_route","stops"):sales?List.of("summary","metrics","chart","table"):List.of("content"));
    }

    private static boolean modeKind(boolean artifact,Surface s){return artifact=="html".equals(s.kind());}
    public static boolean has(String q,String... hints){for(String hint:hints)if(q.contains(hint))return true;return false;}

    public Quality evaluate(Input in,Plan plan,Object raw,boolean partial) {
        List<String> errors=new ArrayList<>();Map<String,String> dimensions=new LinkedHashMap<>();
        dimensions.put("necessity",plan.mode()==Mode.TEXT?"unnecessary":"justified");
        dimensions.put("information_organization","checked");dimensions.put("interaction_correctness","static_checked");
        dimensions.put("content_completeness",partial?"partial":"structurally_checked");dimensions.put("task_completion","unverified");
        if(plan.mode()==Mode.TEXT)errors.add("Use TEXT: "+plan.reason());
        if(plan.needsTarget())errors.add("Multiple Surfaces match; identify the target before modifying");
        if(plan.mode()==Mode.ARTIFACT)errors.add("Use canvas_publish for this artifact task");
        try {
            var tree=GenUiSchema.validateUiTree(raw);var nodes=new ArrayList<Map<?,?>>();collect(tree.get("root"),nodes);
            if(!partial&&nodes.size()==1&&((Map<?,?>)nodes.getFirst().get("props")).isEmpty())errors.add("Empty interface has no useful content");
            if(nodes.getFirst().get("children") instanceof List<?> list&&list.size()>10&&!Set.of("Table","List","FeatureGrid","KpiBoard","SlideDeck").contains(nodes.getFirst().get("kind"))) {
                dimensions.put("information_organization","failed");errors.add("Organize more than ten peers into meaningful sections");
            }
            Set<String> ids=new HashSet<>(),kinds=new HashSet<>(),uploads=new HashSet<>();
            for(var node:nodes){
                kinds.add(String.valueOf(node.get("kind")));
                if(!in.components().contains(String.valueOf(node.get("kind"))))errors.add("Component unavailable: "+node.get("kind"));
                if(node.get("nodeId") instanceof String id&&!ids.add(id))errors.add("Duplicate nodeId: "+id);
                if("FileInput".equals(node.get("kind"))&&node.get("props") instanceof Map<?,?> p&&p.get("resourceId") instanceof String id)uploads.add(id);
            }
            boolean pending=false;Map<String,Long> boundVersions=new HashMap<>();
            for(var node:nodes)if(node.get("props") instanceof Map<?,?> props){
                Object dataRef=props.get("dataRef");
                if(dataRef instanceof String id)dataRef=Map.of("id",id);
                if(dataRef!=null&&!(dataRef instanceof Map<?,?>))errors.add("Invalid dataRef shape");
                if(dataRef instanceof Map<?,?> ref){
                    var matches=in.resources().stream().filter(r->r.id().equals(ref.get("id"))&&(ref.get("version")==null||ref.get("version") instanceof Number n&&n.doubleValue()==r.version())).toList();
                    if(matches.isEmpty()){
                        if(ref.get("version")==null&&uploads.contains(ref.get("id")))pending=true;
                        else errors.add("Unverified resource/version: "+ref.get("id")+"@"+ref.get("version"));
                    } else {
                        Resource resource=matches.stream().max(Comparator.comparingLong(Resource::version)).orElseThrow();
                        Long previous=boundVersions.putIfAbsent(resource.id(),resource.version());
                        if(previous!=null&&previous!=resource.version())errors.add("Linked components reference different resource versions: "+resource.id());
                        for(String key:List.of("column","groupBy"))if(ref.get(key) instanceof String column&&!resource.columns().contains(column))errors.add("Unknown resource column: "+column);
                        if("Chart".equals(node.get("kind"))&&(!resource.columns().contains(ref.get("column"))||!resource.columns().contains(ref.get("groupBy"))))errors.add("Chart requires verified groupBy and value columns");
                        if("Stat".equals(node.get("kind"))&&!"count".equals(ref.get("aggregate"))&&!resource.columns().contains(ref.get("column")))errors.add("Stat requires a verified value column");
                        if(ref.get("aggregate")!=null&&!Set.of("sum","avg","min","max","count").contains(ref.get("aggregate")))errors.add("Unknown aggregation");
                        if(ref.get("filters")!=null&&(!(ref.get("filters") instanceof List<?> filters)||filters.size()>20))errors.add("Invalid resource filter list");
                        if(ref.get("filters") instanceof List<?> filters)for(Object filter:filters){
                            if(!(filter instanceof Map<?,?> f)||!resource.columns().contains(f.get("column"))||!Set.of("eq","neq","contains","gt","gte","lt","lte","in").contains(f.get("op")))errors.add("Invalid resource filter");
                        }
                        if(ref.get("sort")!=null&&(!(ref.get("sort") instanceof Map<?,?> sort)||!sort.containsKey("fromNode")&&(!resource.columns().contains(sort.get("column"))||!Set.of("asc","desc").contains(sort.get("direction")))))errors.add("Invalid resource sort");
                    }
                }
                if(props.get("remoteAction") instanceof Map<?,?> binding){
                    if(!in.capabilities().contains(binding.get("capability")))errors.add("Unregistered Action capability: "+binding.get("capability"));
                    if(!(binding.get("id") instanceof String id)||id.isBlank())errors.add("Remote Action requires an id");
                    if(binding.get("targetId") instanceof String id&&!ids.contains(id))errors.add("Action target missing: "+id);
                }
                checkReferences(props,ids,partial,errors);
                if(props.get("action") instanceof Map<?,?> action){
                    String type=Objects.toString(action.get("type"),"");
                    if(!Set.of("patch_ui","set_state","submit_form","remote_action","open_url","navigate","send_message").contains(type))errors.add("Unknown action type: "+type);
                    if("remote_action".equals(type)&&!(props.get("remoteAction") instanceof Map<?,?>))errors.add("remote_action requires registered binding");
                }
            }
            if(pending)dimensions.put("content_completeness","pending_input");
            if(!partial){
                if(plan.components().contains("MapWidget")&&!kinds.contains("MapWidget"))errors.add("Requested route requires a verified MapWidget");
                if(plan.sections().contains("chart")&&has(in.goal().toLowerCase(Locale.ROOT),"看板","dashboard","csv","联动")&&(!kinds.contains("Chart")||!kinds.contains("Table")))errors.add("Analysis requires both Chart and Table");
                if(plan.components().contains("Form")&&!kinds.contains("Form")&&!kinds.contains("NumberInput"))errors.add("Requested parameter interface has no input");
                if(plan.components().contains("ConceptDemo")&&Collections.disjoint(kinds,Set.of("ConceptDemo","NumberLine","CoordinateGrid","ParametricLab","AnimStepLab")))errors.add("Requested explanation requires an existing interactive diagram component");
            }
        } catch(IllegalArgumentException error){errors.add(error.getMessage());}
        if(!errors.isEmpty()){dimensions.put("interaction_correctness","failed");dimensions.put("content_completeness","failed");}
        return new Quality(errors.isEmpty(),Map.copyOf(dimensions),List.copyOf(errors));
    }
    private static void collect(Object raw,List<Map<?,?>> out){if(raw instanceof Map<?,?> node){out.add(node);if(node.get("children") instanceof List<?> list)list.forEach(n->collect(n,out));}}
    private static void checkReferences(Object raw,Set<String> ids,boolean partial,List<String> errors){
        if(raw instanceof Map<?,?> map){
            if(map.get("fromNode") instanceof String id&&!ids.contains(id))errors.add("Local input reference missing: "+id);
            map.values().forEach(v->checkReferences(v,ids,partial,errors));
        } else if(raw instanceof List<?> list)list.forEach(v->checkReferences(v,ids,partial,errors));
    }
}

