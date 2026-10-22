package org.wwz.ai.domain.agent.runtime.tool.common.canvas;

import com.alibaba.fastjson.JSON;
import java.time.Instant;
import java.util.*;

/** Pure, strict mutation of a persisted Surface. Invalid patches never partially commit. */
public final class UiSurfaceDocument {
    private UiSurfaceDocument() {}

    public static Map<String,Object> create(String session, String owner, String message, String id, String event, Object tree) {
        Map<String,Object> out=new LinkedHashMap<>();
        out.put("schemaVersion","rui/1");out.put("surfaceId",id);out.put("sessionId",session);
        out.put("ownerId",owner);out.put("messageId",message);out.put("revision",1L);
        out.put("baseRevision",0L);out.put("eventId",event);out.put("updatedAt",Instant.now().toString());
        out.put("tree",normalize(tree));
        return out;
    }

    public static Map<String,Object> patch(Map<String,Object> previous, String event, Long expected, List<Map<String,Object>> patches) {
        if(previous.get("stream") instanceof Map<?,?> stream && "committed".equals(stream.get("status")))
            throw new IllegalStateException("UI generation still active; wait for completion or cancel before patching");
        long revision=((Number)previous.get("revision")).longValue();
        if(expected!=null && expected!=revision) throw new IllegalStateException("Surface revision conflict; reload snapshot (current="+revision+")");
        List<Map<String,Object>> validated=(List<Map<String,Object>>)GenUiSchema.validateUiPatch(Map.of("patches",patches)).get("patches");
        Map<String,Object> next=copy(previous);
        next.remove("stream");
        Object tree=next.get("tree");
        for(Map<String,Object> operation:validated) tree=apply(tree,operation);
        next.put("tree",normalize(tree));next.put("eventId",event);
        next.put("baseRevision",revision);next.put("revision",revision+1);next.put("updatedAt",Instant.now().toString());
        return next;
    }

    public static Map<String,Object> metadata(Map<String,Object> document) {
        Map<String,Object> meta=new LinkedHashMap<>(document);for(String field:List.of("tree","interaction","resources","resourceHistory","mapStates"))meta.remove(field);return meta;
    }

    private static Map<String,Object> normalize(Object raw) {
        Map<String,Object> tree=copy(raw);
        Object root=tree.containsKey("root")?tree.get("root"):tree;
        Set<String> reserved=new HashSet<>();
        collectIds(root,reserved,1,new int[]{0});
        assignIds(root,"root",reserved,1,new int[]{0});
        return GenUiSchema.validateUiTree(tree);
    }

    private static void assignIds(Object raw,String path,Set<String> ids,int depth,int[] count) {
        if(depth>24 || ++count[0]>200) throw new IllegalArgumentException("Surface exceeds node/depth limit");
        if(!(raw instanceof Map<?,?>)) throw new IllegalArgumentException("Expected node object");
        Map<String,Object> node=(Map<String,Object>)raw;
        String id=Objects.toString(node.get("nodeId"),"").trim();
        if(id.isBlank()) {
            id="rui-"+path;int suffix=1;
            while(ids.contains(id))id="rui-"+path+"-new"+suffix++;
            ids.add(id);node.put("nodeId",id);
        }
        if(node.get("children") instanceof List<?> children)
            for(int i=0;i<children.size();i++) assignIds(children.get(i),path+"-"+i,ids,depth+1,count);
    }

    private static void collectIds(Object raw,Set<String> ids,int depth,int[] count) {
        if(depth>24||++count[0]>200)throw new IllegalArgumentException("Surface exceeds node/depth limit");
        if(!(raw instanceof Map<?,?> node))throw new IllegalArgumentException("Expected node object");
        String id=Objects.toString(node.get("nodeId"),"").trim();
        if(id.length()>128)throw new IllegalArgumentException("nodeId exceeds max length");
        if(!id.isBlank()&&!ids.add(id))throw new IllegalArgumentException("Duplicate nodeId: "+id);
        if(node.get("children") instanceof List<?> children)
            for(Object child:children)collectIds(child,ids,depth+1,count);
    }

    private static Object apply(Object tree,Map<String,Object> patch) {
        String path=String.valueOf(patch.get("path"));
        if(!path.startsWith("/root/")) throw new IllegalArgumentException("Patch must target /root/... (not protocol metadata)");
        String[] tokens=path.substring(1).split("/",-1);
        for(int i=0;i<tokens.length;i++) {
            tokens[i]=tokens[i].replace("~1","/").replace("~0","~");
            if(Set.of("__proto__","prototype","constructor").contains(tokens[i])) throw new IllegalArgumentException("Unsafe patch key");
        }
        Object parent=tree;
        for(int i=0;i<tokens.length-1;i++) {
            if(parent instanceof Map<?,?> map && map.containsKey(tokens[i])) parent=map.get(tokens[i]);
            else if(parent instanceof List<?> list) parent=list.get(index(tokens[i],list.size(),false));
            else throw new IllegalArgumentException("Patch parent does not exist: "+path);
        }
        String key=tokens[tokens.length-1],op=String.valueOf(patch.get("op"));
        Object value=patch.containsKey("value")?JSON.parse(JSON.toJSONString(patch.get("value"))):null;
        if(parent instanceof Map<?,?>) {
            Map<String,Object> map=(Map<String,Object>)parent;
            if(!"add".equals(op) && !map.containsKey(key)) throw new IllegalArgumentException("Patch target does not exist: "+path);
            if("remove".equals(op)) map.remove(key);else map.put(key,value);
        } else if(parent instanceof List<?>) {
            List<Object> list=(List<Object>)parent;
            int i="-".equals(key)&&"add".equals(op)?list.size():index(key,list.size(),"add".equals(op));
            if("remove".equals(op))list.remove(i);else if("add".equals(op))list.add(i,value);else list.set(i,value);
        } else throw new IllegalArgumentException("Invalid patch parent: "+path);
        return tree;
    }

    private static int index(String token,int size,boolean append) {
        if(!token.matches("0|[1-9][0-9]*")) throw new IllegalArgumentException("Invalid array index");
        try {int i=Integer.parseInt(token);if(i<size || append&&i==size)return i;}catch(NumberFormatException ignored){}
        throw new IllegalArgumentException("Array index out of bounds");
    }
    private static Map<String,Object> copy(Object value) {
        Object parsed=JSON.parse(JSON.toJSONString(value));
        if(!(parsed instanceof Map<?,?>))throw new IllegalArgumentException("Expected object");
        return (Map<String,Object>)parsed;
    }
}
