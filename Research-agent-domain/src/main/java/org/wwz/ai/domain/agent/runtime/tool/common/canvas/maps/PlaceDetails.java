package org.wwz.ai.domain.agent.runtime.tool.common.canvas.maps;

import java.util.*;

/** Read-only provider metadata; deliberately separate from the versioned itinerary. */
public record PlaceDetails(MapData.Place place,List<String> photos,String category,String introduction,
                           String phone,String website,String openingHours,Double rating,boolean synthesized) {
    public PlaceDetails {
        Objects.requireNonNull(place);photos=List.copyOf(photos);
        if(photos.size()>8||photos.stream().anyMatch(s->!s.startsWith("https://")||s.length()>4096))throw new IllegalArgumentException("Invalid place photos");
        if(introduction==null||introduction.length()>6000||category==null||category.length()>500)throw new IllegalArgumentException("Invalid place details");
        if(rating!=null&&(!Double.isFinite(rating)||rating<=0||rating>5))throw new IllegalArgumentException("Invalid place rating");
    }
    public static PlaceDetails basic(MapData.Place p){return new PlaceDetails(p,p.photoUrl()==null?List.of():List.of(p.photoUrl()),"",p.address().isBlank()?"该地点暂未提供文字介绍。":p.name()+"位于"+p.address()+"。",null,null,null,null,true);}
    public Map<String,Object> toMap(){var out=new LinkedHashMap<String,Object>();out.put("place",place.toMap());out.put("photos",photos);out.put("category",category);out.put("introduction",introduction);out.put("synthesized",synthesized);
        if(phone!=null&&!phone.isBlank())out.put("phone",phone);if(website!=null&&!website.isBlank())out.put("website",website);if(openingHours!=null&&!openingHours.isBlank())out.put("openingHours",openingHours);if(rating!=null)out.put("rating",rating);return out;}
}
