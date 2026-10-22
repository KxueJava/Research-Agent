package org.wwz.ai.domain.agent.runtime.tool.common.canvas.maps;

import org.wwz.ai.domain.agent.runtime.agent.AgentContext;
import org.wwz.ai.domain.agent.runtime.tool.*;
import org.wwz.ai.domain.agent.runtime.tool.common.canvas.*;
import java.util.*;

/** Existing ToolCollection/ledger/SSE integration, with identity bound by the factory. */
public final class MapAgentTool implements BaseTool {
    private final String operation;
    private final AgentContext context;
    private final String owner;
    public MapAgentTool(String operation,AgentContext context,String owner){this.operation=operation;this.context=context;this.owner=owner;}
    public String getName(){return operation;}
    public String getDescription(){return switch(operation){
        case "search_places" -> "Search real AMap POIs by query and optional city. Returns stable placeId, name, address and GCJ-02 coordinates. Disambiguate candidates with the user. Never invent coordinates.";
        case "geocode_places" -> "Geocode an explicit address and optional city using AMap. Keep candidate ambiguity visible. No user location is inferred. Prefer stable POI IDs from search_places for reusable itineraries.";
        case "plan_route" -> "Plan actual AMap road routes from 2–10 ordered placeIds found by search_places/geocode_places. travelMode walking or driving. Publishes a MapWidget Surface inline in chat, with marker/list linkage and editing. Returns Surface identity. Never use canvas_publish for a map; never manually fabricate MapData. Missing service permissions are errors, not mock routes.";
        case "get_map" -> "Read the latest owned MapWidget by surfaceId and nodeId. Returns current baseRevision, mapRevision, ordered real place IDs and travelMode without querying routes. Read before modify_itinerary: UI actions can make old chat versions stale. Never infer a version from old messages.";
        default -> "Modify an existing MapWidget using surfaceId, nodeId, baseRevision, complete ordered placeIds and travelMode. First use get_map to read the latest owned version and itinerary. Preserves the same Surface and verifies ownership/version; real provider recalculates all segments. On conflict, read get_map again and reconcile user intent with current places; never blindly overwrite with stale order.";
    };}
    public Map<String,Object> toParams(){
        var props=new LinkedHashMap<String,Object>();List<String> required;
        if(operation.equals("search_places")||operation.equals("geocode_places")){
            String field=operation.equals("search_places")?"query":"address";props.put(field,Map.of("type","string","maxLength",200));props.put("city",Map.of("type","string","maxLength",80));required=List.of(field);
            if(operation.equals("search_places"))props.put("limit",Map.of("type","integer","minimum",1,"maximum",10));
        }else if(operation.equals("get_map")){
            props.put("surfaceId",Map.of("type","string"));props.put("nodeId",Map.of("type","string"));required=List.of("surfaceId","nodeId");
        }else{
            props.put("placeIds",Map.of("type","array","items",Map.of("type","string"),"minItems",2,"maxItems",10));
            props.put("travelMode",Map.of("type","string","enum",List.of("walking","driving")));
            if(operation.equals("plan_route")){props.put("title",Map.of("type","string","maxLength",200));required=List.of("placeIds","travelMode","title");}
            else{props.put("surfaceId",Map.of("type","string"));props.put("nodeId",Map.of("type","string"));props.put("baseRevision",Map.of("type","integer","minimum",1));required=List.of("surfaceId","nodeId","baseRevision","placeIds","travelMode");}
        }return Map.of("type","object","properties",props,"required",required,"additionalProperties",false);
    }
    @Override public Object execute(Object input){
        try{
            if(context==null||context.getRuntimeDependencies()==null||context.getRuntimeDependencies().getMapService()==null)throw new MapProviderException("MAP_NOT_CONFIGURED","地图运行时未启用");
            var service=context.getRuntimeDependencies().getMapService();var p=MapData.object(input);
            if(operation.equals("search_places")){int limit=p.get("limit") instanceof Number n?n.intValue():5;return ToolResultPayload.okData(operation,Map.of("provider",service.planner().provider(),"places",service.planner().places().search(MapData.text(p,"query"),Objects.toString(p.get("city"),""),limit).stream().map(MapData.Place::toMap).toList()));}
            if(operation.equals("geocode_places"))return ToolResultPayload.okData(operation,Map.of("provider",service.planner().provider(),"places",service.planner().places().geocode(MapData.text(p,"address"),Objects.toString(p.get("city"),"")).stream().map(MapData.Place::toMap).toList()));
            MapData.id(context.getSessionId());
            if(operation.equals("plan_route")){
                String id="map-"+UUID.randomUUID();var data=service.planner().plan(id,id,1,MapData.text(p,"title"),MapService.ids(p.get("placeIds")),MapData.text(p,"travelMode"));
                context.getRuntimeDependencies().getUiSurfaceStore().registerMapData(context.getSessionId(),data.toMap());
                var tree=Map.of("kind","MapWidget","nodeId","map","props",Map.of("mapData",data.toMap(),"remoteAction",Map.of("id","modify_itinerary","capability","map_itinerary")));
                var emit=new EmitUiTreeTool();emit.setAgentContext(context);return emit.execute(Map.of("tree",tree,"canvas_id",id));
            }
            if(owner==null||owner.isBlank())throw new SecurityException("Session owner unavailable");
            if(operation.equals("get_map")){
                String surface=MapData.text(p,"surfaceId"),node=MapData.text(p,"nodeId");
                var document=context.getRuntimeDependencies().getUiSurfaceStore().read(context.getSessionId(),owner,surface);
                var data=MapService.map(document,node);
                return ToolResultPayload.okData(operation,Map.of("surfaceId",surface,"nodeId",node,"baseRevision",MapData.number(document.get("revision")),"mapRevision",data.revision(),"title",data.title(),"travelMode",data.travelMode(),"places",data.places().stream().map(MapData.Place::toMap).toList()));
            }
            String surface=MapData.text(p,"surfaceId");long base=MapData.number(p.get("baseRevision"));
            var output=service.modify(context.getSessionId(),owner,surface,MapData.text(p,"nodeId"),base,MapService.ids(p.get("placeIds")),MapData.text(p,"travelMode"));
            context.getRuntimeDependencies().getUiSurfaceStore().registerMapData(context.getSessionId(),output.patches().getFirst().get("value"));
            var emit=new EmitUiPatchTool();emit.setAgentContext(context);return emit.execute(Map.of("canvas_id",surface,"base_revision",base,"patches",output.patches()));
        }catch(MapProviderException e){return ToolResultPayload.failureFrom(e.getMessage(),Map.of("code",e.code()));}
        catch(IllegalArgumentException|IllegalStateException|SecurityException e){return ToolResultPayload.failureFrom("地图请求被拒绝：请检查地点、当前版本和会话权限",Map.of("code","MAP_REQUEST_REJECTED"));}
    }
}
