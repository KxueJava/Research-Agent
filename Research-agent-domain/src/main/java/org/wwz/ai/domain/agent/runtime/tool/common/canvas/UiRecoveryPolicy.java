package org.wwz.ai.domain.agent.runtime.tool.common.canvas;

import com.alibaba.fastjson.JSON;
import java.util.*;

/** Strict sidecar policy: only declared local interaction, never arbitrary form drafts or patches. */
public final class UiRecoveryPolicy {
    private UiRecoveryPolicy() {}
    private static Map<?,?> obj(Object raw){return raw instanceof Map<?,?> map?map:Map.of();}
    public static Set<String> allowedNodes(Object tree){
        var candidates=new HashSet<String>();var safe=new HashSet<String>();
        var blocked=new HashSet<String>();collect(obj(tree).containsKey("root")?obj(tree).get("root"):tree,false,candidates,safe,blocked);
        candidates.retainAll(safe);candidates.removeAll(blocked);return candidates;
    }
    private static void collect(Object raw,boolean inForm,Set<String> refs,Set<String> safe,Set<String> blocked){
        var node=obj(raw);var props=obj(node.get("props"));String kind=Objects.toString(node.get("kind"),"");
        String id=Objects.toString(node.get("nodeId"),"");
        boolean excluded=inForm||Boolean.TRUE.equals(props.get("sensitive"))||"password".equals(props.get("type"))||secret(id+" "+Objects.toString(props.get("name"),""));
        if(excluded)blocked.add(id);
        if(!excluded&&Set.of("Select","Input","TextInput","NumberInput","Slider","Switch","Checkbox","MultiSelect","Table","Chart").contains(kind)){
            safe.add(id);if(Boolean.TRUE.equals(props.get("persistState"))&&!Set.of("Input","TextInput").contains(kind))refs.add(id);
        }
        if(!excluded){var ref=obj(props.get("dataRef"));reference(ref.get("sort"),refs);if(ref.get("selectionNodeId") instanceof String selection&&!secret(selection)){refs.add(selection);safe.add(selection);}
            if(ref.get("filters") instanceof List<?> filters)for(var filter:filters)reference(obj(filter).get("value"),refs);
        }
        if(node.get("children") instanceof List<?> children)for(Object child:children)collect(child,excluded,refs,safe,blocked);
    }
    private static boolean secret(String name){return name.toLowerCase(Locale.ROOT).matches(".*(password|passwd|secret|token|credential|身份证|密码).*");}
    private static void reference(Object raw,Set<String> refs){if(obj(raw).get("fromNode") instanceof String id)refs.add(id);}
    public static Map<String,Object> state(Map<String,Object> document,Map<String,Object> state){
        if(state==null||JSON.toJSONString(state).length()>65536)throw new IllegalArgumentException("Interaction state too large");
        if("html".equals(document.get("kind"))){
            if(!Set.of("artifactRevision","sourceVisible").containsAll(state.keySet()))throw new IllegalArgumentException("Invalid artifact state");
            if(state.containsKey("artifactRevision")&&(!(state.get("artifactRevision") instanceof Number n)||n.doubleValue()!=n.longValue()||n.longValue()<0||n.longValue()>((Number)document.get("revision")).longValue()))throw new IllegalArgumentException("Invalid artifact revision");
            if(state.containsKey("sourceVisible")&&!(state.get("sourceVisible") instanceof Boolean))throw new IllegalArgumentException("Invalid source mode");
        }else{
            if(!Set.of("nodes").containsAll(state.keySet())||!(state.get("nodes") instanceof Map<?,?> nodes)||nodes.size()>100)throw new IllegalArgumentException("Invalid node state");
            var allowed=allowedNodes(document.get("tree"));
            for(var entry:nodes.entrySet())if(!allowed.contains(String.valueOf(entry.getKey()))||!value(entry.getValue()))throw new IllegalArgumentException("Node is not recoverable");
        }
        return JSON.parseObject(JSON.toJSONString(state));
    }
    private static boolean value(Object raw){
        if(raw==null||raw instanceof Boolean)return true;
        if(raw instanceof String s)return s.length()<=512;
        if(raw instanceof Number n)return Double.isFinite(n.doubleValue());
        return raw instanceof List<?> list&&list.size()<=1000&&list.stream().allMatch(v->v instanceof String s&&s.length()<=128);
    }
    public static Map<String,Object> resource(Map<String,Object> document,String id,Map<String,Object> raw){
        if(!resourceIds(document.get("tree")).contains(id)||!id.equals(raw.get("id")))throw new IllegalArgumentException("Resource is not declared by this Surface");
        if(!(raw.get("version") instanceof Number version)||version.longValue()<1||version.doubleValue()!=version.longValue()||JSON.toJSONString(raw).length()>2097152)throw new IllegalArgumentException("Invalid resource version or size");
        var source=obj(raw.get("source"));if(!Set.of("inline","upload").contains(source.get("type"))||!(source.get("name") instanceof String name)||name.isBlank()||name.length()>256)throw new IllegalArgumentException("Invalid resource source");
        try{java.time.Instant.parse(String.valueOf(raw.get("collectedAt")));}catch(Exception e){throw new IllegalArgumentException("Invalid resource timestamp");}
        if(!(raw.get("columns") instanceof List<?> columns)||columns.isEmpty()||columns.size()>50||new HashSet<>(columns).size()!=columns.size()||columns.stream().anyMatch(c->!(c instanceof String s)||s.isBlank()||s.length()>128||Set.of("__proto__","constructor","prototype").contains(s)))throw new IllegalArgumentException("Invalid resource columns");
        if(!(raw.get("rows") instanceof List<?> rows)||rows.size()>10000)throw new IllegalArgumentException("Invalid resource rows");
        for(Object row:rows){var cells=obj(row);if(cells.size()!=columns.size()||!cells.keySet().containsAll(columns))throw new IllegalArgumentException("Invalid row");for(Object cell:cells.values())if(!(cell==null||cell instanceof Boolean||cell instanceof String s&&s.length()<=65536||cell instanceof Number n&&Double.isFinite(n.doubleValue())))throw new IllegalArgumentException("Invalid cell");}
        var out=new LinkedHashMap<String,Object>();for(String field:List.of("id","version","columns","rows","collectedAt"))out.put(field,raw.get(field));
        var cleanSource=new LinkedHashMap<String,Object>();cleanSource.put("type",source.get("type"));cleanSource.put("name",source.get("name"));
        if(source.get("resourceKey") instanceof String key&&key.length()<=2048)cleanSource.put("resourceKey",key);out.put("source",cleanSource);return out;
    }
    public static Set<String> resourceIds(Object raw){var out=new HashSet<String>();ids(obj(raw).containsKey("root")?obj(raw).get("root"):raw,out);return out;}
    private static void ids(Object raw,Set<String> out){var node=obj(raw);var props=obj(node.get("props"));var ref=props.get("dataRef");if(ref instanceof String id)out.add(id);else if(obj(ref).get("id") instanceof String id)out.add(id);if(props.get("resourceId") instanceof String id)out.add(id);if(node.get("children") instanceof List<?> children)children.forEach(child->ids(child,out));}
}
