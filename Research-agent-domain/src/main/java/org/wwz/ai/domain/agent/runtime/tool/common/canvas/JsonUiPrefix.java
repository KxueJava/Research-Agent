package org.wwz.ai.domain.agent.runtime.tool.common.canvas;

import com.fasterxml.jackson.core.*;
import com.fasterxml.jackson.core.io.JsonEOFException;
import java.io.IOException;
import java.util.*;

/** Reads only closed JSON values. Never repairs strings, props or child objects. */
public final class JsonUiPrefix {
    private static final JsonFactory FACTORY = new JsonFactory().enable(JsonParser.Feature.STRICT_DUPLICATE_DETECTION);
    private record Value(Object value, boolean complete) {}
    private JsonUiPrefix() {}

    public static Map<String,Object> preview(String arguments) {
        if(arguments==null || arguments.length()>1_048_576) return null;
        try(var parser=FACTORY.createParser(arguments)) {
            if(parser.nextToken()!=JsonToken.START_OBJECT)return null;
            Value args=read(parser,0),tree=members(args).get("tree");
            if(tree==null || !(tree.value instanceof Map))return null; // JSON-string legacy trees wait for final execution.
            Value root=members(tree).getOrDefault("root",tree);
            var fields=members(root);
            if(!fields.containsKey("kind") || !fields.containsKey("props") || !fields.get("props").complete)return null;
            Value children=fields.get("children");
            if(!root.complete && (children==null || !(children.value instanceof List<?> list) || list.isEmpty()))return null;
            Map<String,Object> candidate=new LinkedHashMap<>();
            for(String name:List.of("kind","nodeId","props","children"))if(fields.containsKey(name))candidate.put(name,unwrap(fields.get(name)));
            return Map.of("schemaVersion","1","root",candidate);
        } catch(IOException|IllegalArgumentException e) { return null; }
    }
    private static Value read(JsonParser parser,int depth) throws IOException {
        if(depth>60)throw new IllegalArgumentException("JSON nesting limit");
        JsonToken token=parser.currentToken();
        if(token==JsonToken.START_OBJECT) {
            Map<String,Value> out=new LinkedHashMap<>();
            try {
                while(true) {
                    token=parser.nextToken();
                    if(token==JsonToken.END_OBJECT)return new Value(out,true);
                    if(token==null)return new Value(out,false);
                    if(token!=JsonToken.FIELD_NAME)throw new IllegalArgumentException("Expected JSON field");
                    String name=parser.currentName();
                    if(parser.nextToken()==null)return new Value(out,false);
                    Value child=read(parser,depth+1);
                    if(child.complete || Set.of("tree","root","children").contains(name))out.put(name,child);
                    if(!child.complete)return new Value(out,false);
                }
            } catch(JsonParseException e) {if(isEndOfInput(e))return new Value(out,false);throw e;}
        }
        if(token==JsonToken.START_ARRAY) {
            List<Value> out=new ArrayList<>();
            try {
                while(true) {
                    token=parser.nextToken();
                    if(token==JsonToken.END_ARRAY)return new Value(out,true);
                    if(token==null)return new Value(out,false);
                    Value child=read(parser,depth+1);
                    if(!child.complete)return new Value(out,false);
                    out.add(child);
                    if(out.size()>2000)throw new IllegalArgumentException("JSON array limit");
                }
            } catch(JsonParseException e) {if(isEndOfInput(e))return new Value(out,false);throw e;}
        }
        return new Value(switch(token) {
            case VALUE_STRING -> parser.getText();
            case VALUE_NUMBER_INT,VALUE_NUMBER_FLOAT -> parser.getNumberValue();
            case VALUE_TRUE -> true;
            case VALUE_FALSE -> false;
            case VALUE_NULL -> null;
            default -> throw new IllegalArgumentException("Incomplete JSON value");
        },true);
    }
    // Jackson uses a plain JsonParseException for EOF immediately after an array comma.
    private static boolean isEndOfInput(JsonParseException error) {
        return error instanceof JsonEOFException || error.getOriginalMessage().startsWith("Unexpected end-of-input");
    }
    @SuppressWarnings("unchecked") private static Map<String,Value> members(Value value) {
        return value!=null && value.value instanceof Map ? (Map<String,Value>)value.value:Map.of();
    }
    private static Object unwrap(Value value) {
        if(value.value instanceof Map<?,?> map) {
            Map<String,Object> out=new LinkedHashMap<>();map.forEach((k,v)->out.put(String.valueOf(k),unwrap((Value)v)));return out;
        }
        if(value.value instanceof List<?> list)return list.stream().map(v->unwrap((Value)v)).toList();
        return value.value;
    }
}
