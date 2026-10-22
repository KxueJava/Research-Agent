package org.wwz.ai.domain.agent.runtime.tool.common.canvas;

import com.alibaba.fastjson.JSON;
import java.util.*;

/** Atomic versioned commit contract shared by preview production, storage and final execution. */
public final class UiStreamCommit {
    public static final String PROTOCOL="rui-stream/1";
    private static final Set<String> STATES=Set.of("committed","completed","cancelled","failed");
    private static final Set<String> EXECUTABLE=Set.of("HtmlFrame","ThreeJsFrame","HostedCanvasFrame","LiveCamera","Model3D","Video");
    private static final Set<String> PREVIEW_KINDS=Set.of("AspectBox","Card","Stat","Progress","List","ListItem","Table","TableRow","TableCell","Image","Icon","CodeBlock","Chart","Button","LinkButton","InteractiveButton","ToggleButton","Form","Input","Textarea","Select","NumberInput","Switch","Slider","SectionHeader","Skeleton","Avatar");
    private UiStreamCommit() {}

    @SuppressWarnings("unchecked")
    public static Map<String,Object> apply(Map<String,Object> previous,String session,String owner,String message,Map<String,Object> event,Object tree) {
        if(!PROTOCOL.equals(event.get("protocol")) || !session.equals(event.get("sessionId")) || !message.equals(event.get("messageId")))
            throw new IllegalArgumentException("Invalid stream identity");
        for(String key:List.of("surfaceId","generationId","messageId"))
            if(!(event.get(key) instanceof String s) || s.isBlank() || s.length()>128)throw new IllegalArgumentException("Invalid "+key);
        long seq=integer(event,"sequence"),base=integer(event,"baseRevision"),revision=integer(event,"revision");
        String status=Objects.toString(event.get("status"),"");
        if(seq<1 || !STATES.contains(status)||revision!=base+1)throw new IllegalArgumentException("Invalid stream version/state");
        long started=integer(event,"startedAt"),at=integer(event,"emittedAt"),first=integer(event,"firstUsefulAt");
        if(started>first || first>at)throw new IllegalArgumentException("Invalid stream timestamps");
        if(previous==null) {
            if(seq!=1 || base!=0 || Set.of("failed","cancelled").contains(status))throw new IllegalStateException("Missing stream base");
        } else {
            Map<String,Object> prior=(Map<String,Object>)previous.get("stream");
            if(prior==null || !"committed".equals(prior.get("status")) || !Objects.equals(prior.get("generationId"),event.get("generationId"))
                || !Objects.equals(previous.get("surfaceId"),event.get("surfaceId")) || integer(previous,"revision")!=base
                || integer(prior,"sequence")+1!=seq || integer(prior,"startedAt")!=started || integer(prior,"firstUsefulAt")!=first || integer(prior,"emittedAt")>at)
                throw new IllegalStateException("Stale, terminal or out-of-order stream commit");
        }
        Object snapshot=Set.of("failed","cancelled").contains(status)?previous.get("tree"):tree;
        Map<String,Object> normalized=normalize(snapshot,"completed".equals(status));
        Map<String,Object> document=UiSurfaceDocument.create(session,owner,message,String.valueOf(event.get("surfaceId")),event.get("generationId")+":"+seq,normalized);
        document.put("baseRevision",base);document.put("revision",revision);
        document.put("stream",new LinkedHashMap<>(event));
        if(previous!=null)for(String field:List.of("interaction","resources","resourceHistory","mapStates"))if(previous.containsKey(field))document.put(field,previous.get(field));
        return document;
    }
    public static long integer(Map<String,?> value,String key) {
        Object raw=value.get(key);
        if(!(raw instanceof Number n) || n.doubleValue()!=n.longValue() || n.longValue()<0 || n.longValue()>9_007_199_254_740_991L)
            throw new IllegalArgumentException("Invalid "+key);
        return n.longValue();
    }
    @SuppressWarnings("unchecked") public static Map<String,Object> normalize(Object raw,boolean completed) {
        if(!(raw instanceof Map<?,?> map))throw new IllegalArgumentException("Expected complete tree");
        if(JSON.toJSONString(raw).length()>1_048_576)throw new IllegalArgumentException("Stream tree too large");
        // Full tools retain legacy aliases/default props; previews require explicitly closed props.
        if(completed) map=(Map<?,?>)UiSurfaceDocument.create("validation","validation","validation","validation","validation",raw).get("tree");
        Object root=map.containsKey("root")?map.get("root"):map;
        checkNode(root,1,new int[]{0},completed);
        return (Map<String,Object>)UiSurfaceDocument.create("validation","validation","validation","validation","validation",raw).get("tree");
    }
    private static void checkNode(Object raw,int depth,int[] count,boolean completed) {
        if(depth>24 || ++count[0]>200 || !(raw instanceof Map<?,?> node))throw new IllegalArgumentException("Invalid node/depth/count");
        Object kind=node.get("kind");
        if(!(kind instanceof String k)||!GenUiCatalog.isAllowedKind(k)||(!completed&&(EXECUTABLE.contains(k)||!PREVIEW_KINDS.contains(k))))throw new IllegalArgumentException("Unsafe/incomplete streaming component");
        if(!(node.get("props") instanceof Map<?,?> props))throw new IllegalArgumentException("Incomplete props");
        checkValue(props,0,completed);
        if(!completed || PREVIEW_KINDS.contains(kind)) {
            Set<String> composite=new HashSet<>(Set.of("action"));
            if(completed)composite.addAll(Set.of("dataRef","computation","remoteAction"));
            if("Chart".equals(kind))composite.addAll(Set.of("series","categories"));
            if("Table".equals(kind))composite.add("headers");
            if("Select".equals(kind))composite.add("options");
            for(var entry:props.entrySet())if((entry.getValue() instanceof Map<?,?>||entry.getValue() instanceof List<?>)&&!composite.contains(entry.getKey()))throw new IllegalArgumentException("Invalid composite prop: "+entry.getKey());
            if(props.containsKey("action") && (!(props.get("action") instanceof Map<?,?> action)||!(action.get("type") instanceof String)||action.containsKey("payload")&&!(action.get("payload") instanceof Map)))throw new IllegalArgumentException("Invalid action");
            if(props.containsKey("dataRef")&&!(props.get("dataRef") instanceof String||props.get("dataRef") instanceof Map)||props.containsKey("computation")&&!(props.get("computation") instanceof Map))throw new IllegalArgumentException("Invalid resource/computation declaration");
            if("Table".equals(kind)&&props.containsKey("headers")&&(!(props.get("headers") instanceof List<?> headers)||headers.stream().anyMatch(v->!(v instanceof String))))throw new IllegalArgumentException("Invalid headers");
            if("Select".equals(kind)&&props.containsKey("options")) {
                if(!(props.get("options") instanceof List<?> options)||options.stream().anyMatch(v->!(v instanceof String)&&(!(v instanceof Map<?,?> option)||!(option.get("label") instanceof String)||!(option.get("value") instanceof String||option.get("value") instanceof Number))))throw new IllegalArgumentException("Invalid options");
            }
            for(String key:List.of("title","text","label","description","subtitle","placeholder","name","chart"))
                if(props.get(key)!=null && !(props.get(key) instanceof String))throw new IllegalArgumentException("Invalid text prop: "+key);
            if("Chart".equals(kind)) {
                if(props.containsKey("categories") && (!(props.get("categories") instanceof List<?> categories)||categories.stream().anyMatch(v->!(v instanceof String))))throw new IllegalArgumentException("Invalid chart categories");
                if(props.containsKey("series")) {
                    if(!(props.get("series") instanceof List<?> series))throw new IllegalArgumentException("Invalid chart series");
                    for(Object rawSeries:series) {
                        if(!(rawSeries instanceof Map<?,?> s)||s.get("name")!=null&&!(s.get("name") instanceof String))throw new IllegalArgumentException("Invalid chart series");
                        if(s.containsKey("values") && (!(s.get("values") instanceof List<?> values)||values.stream().anyMatch(v->!(v instanceof Number n)||!Double.isFinite(n.doubleValue()))))throw new IllegalArgumentException("Invalid chart values");
                    }
                }
            }
        }
        if(node.containsKey("children")) {
            if(!(node.get("children") instanceof List<?> children))throw new IllegalArgumentException("Incomplete children");
            for(Object child:children)checkNode(child,depth+1,count,completed);
        }
    }
    private static void checkValue(Object value,int depth,boolean completed) {
        if(depth>24)throw new IllegalArgumentException("Props nesting limit");
        if(value instanceof String text && text.length()>65536)throw new IllegalArgumentException("String limit");
        if(value instanceof Map<?,?> map) for(var entry:map.entrySet()) {
            String key=String.valueOf(entry.getKey());
            if(Set.of("__proto__","prototype","constructor").contains(key) || !completed&&Set.of("dataRef","$ref","$binding","html","sceneScript","srcDoc","script","svg").contains(key))
                throw new IllegalArgumentException("Unresolved/unsafe streaming prop");
            checkValue(entry.getValue(),depth+1,completed);
        }
        if(value instanceof List<?> list) {
            if(list.size()>2000)throw new IllegalArgumentException("Props array limit");
            for(Object item:list)checkValue(item,depth+1,completed);
        }
    }
    @SuppressWarnings("unchecked") public static Map<String,Object> payload(Map<String,Object> document) {
        Map<String,Object> out=new LinkedHashMap<>((Map<String,Object>)document.get("stream"));
        out.put("snapshot",document.get("tree"));out.put("surface",UiSurfaceDocument.metadata(document));
        return out;
    }
}
