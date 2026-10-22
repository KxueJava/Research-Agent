package org.wwz.ai.domain.agent.runtime.tool.common.canvas.maps;

import org.wwz.ai.domain.agent.runtime.tool.common.canvas.*;
import java.util.*;

/** Map planning uses the same Surface and Action transaction as other GenUI capabilities. */
public final class MapService implements UiActionService.Tool {
    private final MapPlanner planner;
    private final UiSurfaceStore surfaces;
    private record PhotoCache(String url,long expires){}
    private final Map<String,PhotoCache> photoCache=Collections.synchronizedMap(new LinkedHashMap<>());
    private record DetailCache(PlaceDetails details,long expires){}
    private final Map<String,DetailCache> detailCache=Collections.synchronizedMap(new LinkedHashMap<>());
    private final java.util.function.BooleanSupplier enabled;
    public MapService(MapPlanner planner,UiSurfaceStore surfaces){this(planner,surfaces,()->true);}
    public MapService(MapPlanner planner,UiSurfaceStore surfaces,java.util.function.BooleanSupplier enabled){this.planner=planner;this.surfaces=surfaces;this.enabled=enabled;}
    public boolean enabled(){return enabled.getAsBoolean();}
    private void requireEnabled(){if(!enabled())throw new MapProviderException("MAP_DISABLED","地图已关闭，历史行程仍可阅读");}
    public MapPlanner planner(){requireEnabled();return planner;}
    public Map<String,Object> readDetails(String session,String owner,String surface,String node,String placeId){
        requireEnabled();
        var data=map(surfaces.read(session,owner,surface),node);MapData.id(placeId);
        var place=data.places().stream().filter(p->p.placeId().equals(placeId)).findFirst().orElseThrow(()->new IllegalArgumentException("Place is not in itinerary"));
        PlaceDetails detail;
        if(!"amap".equals(data.provider())||placeId.startsWith("geo-"))detail=PlaceDetails.basic(place);
        else {var saved=detailCache.get(placeId);if(saved!=null&&saved.expires()>System.currentTimeMillis())detail=saved.details();else{
            detail=planner.places().details(placeId);if(detail==null||!placeId.equals(detail.place().placeId())||!place.source().equals(detail.place().source()))throw new MapProviderException("INVALID_PROVIDER_DATA","地点详情身份不匹配");
            synchronized(detailCache){if(detailCache.size()>=300)detailCache.remove(detailCache.keySet().iterator().next());detailCache.put(placeId,new DetailCache(detail,System.currentTimeMillis()+600_000));}
        }}
        return Map.of("mapRevision",data.revision(),"placeId",placeId,"details",detail.toMap());
    }
    /** Enrich old snapshots without changing route identity, revisions, provenance or the saved tree. */
    public Map<String,Object> readPhotos(String session,String owner,String surface,String node){
        requireEnabled();
        var data=map(surfaces.read(session,owner,surface),node);
        Map<String,String> photos=new LinkedHashMap<>();List<String> missing=new ArrayList<>(),failed=new ArrayList<>();
        for(var place:data.places()){
            if(place.photoUrl()!=null){photos.put(place.placeId(),place.photoUrl());continue;}
            if(!"amap".equals(data.provider())||place.placeId().startsWith("geo-")){missing.add(place.placeId());continue;}
            var cached=photoCache.get(place.placeId());if(cached!=null&&cached.expires()>System.currentTimeMillis()){if(cached.url()!=null)photos.put(place.placeId(),cached.url());else missing.add(place.placeId());continue;}
            try{var resolved=planner.places().resolve(place.placeId());if(!place.placeId().equals(resolved.placeId())||!place.source().equals(resolved.source()))throw new MapProviderException("INVALID_PROVIDER_DATA","地点照片身份不匹配");
                String url=resolved.photoUrl();synchronized(photoCache){if(photoCache.size()>=500)photoCache.remove(photoCache.keySet().iterator().next());photoCache.put(place.placeId(),new PhotoCache(url,System.currentTimeMillis()+600_000));}
                if(url!=null)photos.put(place.placeId(),url);else missing.add(place.placeId());
            }catch(MapProviderException unavailable){failed.add(place.placeId());}
        }
        return Map.of("mapRevision",data.revision(),"photos",photos,"unavailablePlaceIds",missing,"failedPlaceIds",failed);
    }
    @Override public UiActionService.Output execute(UiActionExecution e){
        var input=MapData.object(e.data().get("payload"));
        if(!Set.of("placeIds","travelMode","requestId").containsAll(input.keySet()))throw new IllegalArgumentException("Map action accepts only placeIds, travelMode and requestId");
        MapData.id(MapData.text(input,"requestId"));
        var output=modify(e.sessionId(),e.ownerId(),e.surfaceId(),MapData.text(e.data(),"componentId"),e.baseRevision(),ids(input.get("placeIds")),MapData.text(input,"travelMode"));
        MapData.object(output.patches().getFirst().get("value")).put("requestId",input.get("requestId"));
        surfaces.registerMapData(e.sessionId(),output.patches().getFirst().get("value"));
        return output;
    }
    public UiActionService.Output modify(String session,String owner,String surface,String nodeId,long revision,List<String> ids,String mode){
        requireEnabled();
        var document=surfaces.read(session,owner,surface);
        if(MapData.number(document.get("revision"))!=revision)throw new IllegalStateException("Surface revision conflict");
        var old=map(document,nodeId);
        if(!surface.equals(old.surfaceId()))throw new IllegalArgumentException("Map belongs to a different Surface");
        var next=planner.plan(old.mapId(),surface,old.revision()+1,old.title(),ids,mode,old.places());
        String path=path(document.get("tree"),nodeId,"/root");
        return new UiActionService.Output(List.of(Map.of("op","replace","path",path+"/props/mapData","value",next.toMap())),List.of(),"行程已更新："+next.places().size()+" 个路线节点，"+next.toMap().get("travelMode")+"。距离与耗时来自 "+next.provider()+"，数据时间 "+next.fetchedAt());
    }
    public Map<String,Object> readView(String session,String owner,String surface,String node){
        var document=surfaces.read(session,owner,surface);var data=map(document,node);
        var states=document.get("mapStates") instanceof Map<?,?> m?m:Map.of();
        return states.get(node) instanceof Map<?,?> raw?MapData.object(raw):Map.of("stateRevision",0L,"mapRevision",data.revision(),"state",Map.of());
    }
    public Map<String,Object> saveView(String session,String owner,String surface,String node,long expected,long mapRevision,Map<String,Object> state){
        var data=map(surfaces.read(session,owner,surface),node);
        if(data.revision()!=mapRevision)throw new IllegalStateException("Map revision changed");
        if(expected<0||!Set.of("selectedPlaceId","center","zoom","pitch","rotation","theme","viewports").containsAll(state.keySet()))throw new IllegalArgumentException("Invalid map view fields");
        if(state.containsKey("selectedPlaceId")&&(!(state.get("selectedPlaceId") instanceof String selected)||data.places().stream().noneMatch(p->selected.equals(p.placeId()))))throw new IllegalArgumentException("Selected place is not in itinerary");
        if(state.containsKey("center"))MapData.coordinate(state.get("center"));
        bounded(state,"zoom",2,20);bounded(state,"pitch",0,83);bounded(state,"rotation",-360,360);
        if(state.containsKey("theme")&&!Set.of("light","dark").contains(state.get("theme")))throw new IllegalArgumentException("Invalid map theme");
        if(state.containsKey("viewports")){
            var slots=MapData.object(state.get("viewports"));if(!Set.of("inline","expanded").containsAll(slots.keySet()))throw new IllegalArgumentException("Invalid viewport mode");
            for(Object raw:slots.values()){var camera=MapData.object(raw);if(!Set.of("center","zoom","pitch","rotation").containsAll(camera.keySet()))throw new IllegalArgumentException("Invalid camera fields");
                if(camera.containsKey("center"))MapData.coordinate(camera.get("center"));bounded(camera,"zoom",2,20);bounded(camera,"pitch",0,83);bounded(camera,"rotation",-360,360);}
        }
        return surfaces.saveMapState(session,owner,surface,node,expected,mapRevision,state);
    }
    public static MapData map(Map<String,Object> document,String nodeId){
        MapData.id(nodeId);var node=UiActionService.findNode(document.get("tree"),nodeId);
        if(node==null||!"MapWidget".equals(node.get("kind")))throw new IllegalArgumentException("Map component not found");
        return MapData.parse(MapData.object(node.get("props")).get("mapData"));
    }
    public static List<String> ids(Object raw){var values=MapData.list(raw);if(values.size()>10)throw new IllegalArgumentException("At most ten route nodes");return values.stream().map(v->{if(!(v instanceof String s))throw new IllegalArgumentException("Expected provider place ID");MapData.id(s);return s;}).toList();}
    private static void bounded(Map<String,Object> m,String key,double min,double max){if(m.containsKey(key)&&(!(m.get(key) instanceof Number n)||!Double.isFinite(n.doubleValue())||n.doubleValue()<min||n.doubleValue()>max))throw new IllegalArgumentException("Invalid map view "+key);}
    private static String path(Object raw,String id,String path){if(!(raw instanceof Map<?,?> m))return null;if(m.containsKey("root"))return path(m.get("root"),id,path);if(id.equals(m.get("nodeId")))return path;if(m.get("children") instanceof List<?> children)for(int i=0;i<children.size();i++){String found=path(children.get(i),id,path+"/children/"+i);if(found!=null)return found;}return null;}
}
