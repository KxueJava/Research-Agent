package org.wwz.ai.domain.agent.runtime.tool.common.canvas.maps;
import java.util.List;
public interface PlacesProvider {
    List<MapData.Place> search(String query,String city,int limit);
    MapData.Place resolve(String placeId);
    default PlaceDetails details(String placeId){return PlaceDetails.basic(resolve(placeId));}
    List<MapData.Place> geocode(String address,String city);
}
