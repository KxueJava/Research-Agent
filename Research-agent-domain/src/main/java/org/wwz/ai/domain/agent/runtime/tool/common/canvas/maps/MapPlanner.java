package org.wwz.ai.domain.agent.runtime.tool.common.canvas.maps;
import java.time.Instant;
import java.util.*;

/** Keeps explicit order; never estimates distances or invents missing road geometry. */
public final class MapPlanner {
    private final PlacesProvider places;
    private final RouteProvider routes;
    private final String provider;
    public MapPlanner(PlacesProvider places,RouteProvider routes,String provider){this.places=places;this.routes=routes;this.provider=provider;}
    public PlacesProvider places(){return places;}
    public String provider(){return provider;}
    public MapData plan(String mapId,String surfaceId,long revision,String title,List<String> ids,String mode){
        return plan(mapId,surfaceId,revision,title,ids,mode,List.of());
    }
    // Only MapService supplies these from an owned, validated persisted Surface.
    MapData plan(String mapId,String surfaceId,long revision,String title,List<String> ids,String mode,List<MapData.Place> persisted){
        MapData.mode(mode);
        if(ids.size()<2||ids.size()>10||new HashSet<>(ids).size()!=ids.size())throw new IllegalArgumentException("Provide 2–10 distinct provider place IDs");
        var saved=new HashMap<String,MapData.Place>();persisted.stream().filter(p->p.placeId().startsWith("geo-")&&provider.equals(p.source())).forEach(p->saved.put(p.placeId(),p));
        List<MapData.Place> resolved=ids.stream().map(id->{MapData.id(id);MapData.Place p;
            try{p=places.resolve(id);}catch(MapProviderException expired){if(!"PLACE_EXPIRED".equals(expired.code())||!saved.containsKey(id))throw expired;p=saved.get(id);}
            if(p==null||!id.equals(p.placeId()))throw new MapProviderException("PLACE_UNAVAILABLE","地点不存在或已失效，请重新搜索");return p;}).toList();
        List<MapData.Leg> legs=new ArrayList<>();
        for(int i=1;i<resolved.size();i++){
            if(Thread.currentThread().isInterrupted())throw new MapProviderException("CANCELLED","路线查询已取消");
            legs.add(routes.route(resolved.get(i-1),resolved.get(i),mode));
        }
        return new MapData(mapId,surfaceId,revision,title,resolved,mode,legs,provider,Instant.now().toString());
    }
}
