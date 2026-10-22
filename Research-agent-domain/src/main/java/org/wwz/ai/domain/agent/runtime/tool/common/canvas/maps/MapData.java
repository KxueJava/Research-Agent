package org.wwz.ai.domain.agent.runtime.tool.common.canvas.maps;

import java.time.Instant;
import java.util.*;

/** Provider-native GCJ-02 coordinates, deliberately not represented as WGS-84 GeoJSON. */
public record MapData(String mapId, String surfaceId, long revision, String title,
                      List<Place> places, String travelMode, List<Leg> legs,
                      String provider, String fetchedAt) {
    public MapData {
        id(mapId); id(surfaceId);
        if (revision < 1 || title == null || title.isBlank() || title.length() > 200) invalid("Invalid map identity/title");
        mode(travelMode);
        if (!Set.of("amap", "mock").contains(provider)) invalid("Unknown map provider");
        Instant.parse(fetchedAt);
        places = List.copyOf(places); legs = List.copyOf(legs);
        if (places.size() < 2 || places.size() > 10 || legs.size() != places.size()-1) invalid("A route requires 2–10 places and consecutive legs");
        if (places.stream().map(Place::placeId).distinct().count() != places.size()) invalid("Duplicate place identifiers");
        if (places.stream().anyMatch(p -> !provider.equals(p.source()))) invalid("Mixed place providers");
        int points = 0;
        for (int i=0; i<legs.size(); i++) {
            Leg leg=legs.get(i);
            if (!leg.fromPlaceId().equals(places.get(i).placeId()) || !leg.toPlaceId().equals(places.get(i+1).placeId())) invalid("Leg order differs from itinerary");
            points += leg.geometry().size();
        }
        if (points > 2000) invalid("Route geometry exceeds 2000 points");
    }
    public record Place(String placeId, String name, double longitude, double latitude,
                        String address, String source, String photoUrl) {
        public Place {
            id(placeId);
            if (name == null || name.isBlank() || name.length()>200 || address==null || address.length()>500) invalid("Invalid place metadata");
            coordinate(List.of(longitude,latitude));
            if (!Set.of("amap","mock").contains(source)) invalid("Unknown place source");
            if (photoUrl != null && !photoUrl.startsWith("https://")) invalid("Untrusted place image");
        }
        public List<Double> coordinates() { return List.of(longitude,latitude); }
        public Map<String,Object> toMap() {
            var out=new LinkedHashMap<String,Object>();
            out.put("placeId",placeId);out.put("name",name);out.put("coordinates",coordinates());
            out.put("coordinateSystem","GCJ-02");out.put("address",address);out.put("source",source);
            if(photoUrl!=null)out.put("photoUrl",photoUrl);
            return out;
        }
    }
    public record Leg(String fromPlaceId,String toPlaceId,long distanceMeters,long durationSeconds,List<List<Double>> geometry) {
        public Leg {
            id(fromPlaceId);id(toPlaceId);
            if(distanceMeters<0||durationSeconds<0||distanceMeters>100_000_000L||durationSeconds>10_000_000L||geometry.size()<2||geometry.size()>2000)invalid("Invalid route leg");
            geometry=geometry.stream().map(MapData::coordinate).toList();
        }
        public Map<String,Object> toMap(){return Map.of("fromPlaceId",fromPlaceId,"toPlaceId",toPlaceId,"distanceMeters",distanceMeters,"durationSeconds",durationSeconds,"geometry",geometry);}
    }
    public Map<String,Object> toMap() {
        var out=new LinkedHashMap<String,Object>();
        out.put("schemaVersion","map/1");out.put("mapId",mapId);out.put("surfaceId",surfaceId);out.put("revision",revision);out.put("title",title);
        out.put("origin",places.getFirst().toMap());out.put("stops",places.subList(1,places.size()).stream().map(Place::toMap).toList());
        out.put("travelMode",travelMode);out.put("selectedPlaceId",places.getFirst().placeId());out.put("provider",provider);out.put("fetchedAt",fetchedAt);
        out.put("routeStatus","ready");out.put("dataStatus","fresh");
        var route=new LinkedHashMap<String,Object>();
        route.put("revision",revision);route.put("coordinateSystem","GCJ-02");route.put("provider",provider);route.put("computedAt",fetchedAt);route.put("travelMode",travelMode);
        route.put("distanceMeters",legs.stream().mapToLong(Leg::distanceMeters).sum());route.put("durationSeconds",legs.stream().mapToLong(Leg::durationSeconds).sum());
        route.put("legs",legs.stream().map(Leg::toMap).toList());route.put("geometry",legs.stream().flatMap(l->l.geometry().stream()).toList());out.put("route",route);
        return out;
    }
    public static MapData parse(Object raw) {
        var m=object(raw);
        if(!"map/1".equals(m.get("schemaVersion")))invalid("Unsupported MapData version");
        List<Place> places=new ArrayList<>();places.add(parsePlace(m.get("origin")));
        for(Object stop:list(m.get("stops")))places.add(parsePlace(stop));
        var r=object(m.get("route"));
        if(!"GCJ-02".equals(r.get("coordinateSystem"))||!Objects.equals(r.get("provider"),m.get("provider"))||!Objects.equals(r.get("travelMode"),m.get("travelMode")))invalid("Route provider/coordinate system mismatch");
        List<Leg> legs=new ArrayList<>();
        for(Object rawLeg:list(r.get("legs"))){var l=object(rawLeg);legs.add(new Leg(text(l,"fromPlaceId"),text(l,"toPlaceId"),number(l.get("distanceMeters")),number(l.get("durationSeconds")),list(l.get("geometry")).stream().map(MapData::coordinate).toList()));}
        long revision=number(m.get("revision"));
        if(number(r.get("revision"))!=revision)invalid("Route revision mismatch");
        var data=new MapData(text(m,"mapId"),text(m,"surfaceId"),revision,text(m,"title"),places,text(m,"travelMode"),legs,text(m,"provider"),text(m,"fetchedAt"));
        if(number(r.get("distanceMeters"))!=legs.stream().mapToLong(Leg::distanceMeters).sum()||number(r.get("durationSeconds"))!=legs.stream().mapToLong(Leg::durationSeconds).sum())invalid("Route totals differ from segments");
        var geometry=list(r.get("geometry")).stream().map(MapData::coordinate).toList();
        if(!geometry.equals(legs.stream().flatMap(l->l.geometry().stream()).toList()))invalid("Route geometry differs from segments");
        if(!"ready".equals(m.get("routeStatus"))||!"fresh".equals(m.get("dataStatus")))invalid("Uncommitted map payload");
        return data;
    }
    public static Place parsePlace(Object raw){var m=object(raw);if(!"GCJ-02".equals(m.get("coordinateSystem")))invalid("Place coordinate system must be GCJ-02");var c=coordinate(m.get("coordinates"));return new Place(text(m,"placeId"),text(m,"name"),c.get(0),c.get(1),text(m,"address"),text(m,"source"),m.get("photoUrl") instanceof String s?s:null);}
    public static List<Double> coordinate(Object raw){var p=list(raw);if(p.size()!=2||!(p.get(0) instanceof Number a)||!(p.get(1) instanceof Number b))throw new IllegalArgumentException("Expected [longitude, latitude]");double x=a.doubleValue(),y=b.doubleValue();if(!Double.isFinite(x)||!Double.isFinite(y)||Math.abs(x)>180||Math.abs(y)>90)invalid("Invalid longitude/latitude");return List.of(x,y);}
    public static void mode(String mode){if(!Set.of("walking","driving").contains(mode))invalid("Unsupported travel mode");}
    public static void id(String id){if(id==null||id.isBlank()||id.length()>128||id.chars().anyMatch(Character::isISOControl))invalid("Invalid map identifier");}
    @SuppressWarnings("unchecked") public static Map<String,Object> object(Object raw){if(!(raw instanceof Map<?,?>))throw new IllegalArgumentException("Expected map object");return (Map<String,Object>)raw;}
    public static List<?> list(Object raw){if(!(raw instanceof List<?> l))throw new IllegalArgumentException("Expected map array");return l;}
    public static String text(Map<String,Object> m,String key){if(!(m.get(key) instanceof String s))throw new IllegalArgumentException("Missing map field: "+key);return s;}
    public static long number(Object raw){if(!(raw instanceof Number n)||!Double.isFinite(n.doubleValue())||n.doubleValue()!=n.longValue())throw new IllegalArgumentException("Expected integer");return n.longValue();}
    private static void invalid(String message){throw new IllegalArgumentException(message);}
}
