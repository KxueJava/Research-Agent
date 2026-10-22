package org.wwz.ai.domain.agent.runtime.tool.common.canvas.maps;
@FunctionalInterface
public interface RouteProvider {
    MapData.Leg route(MapData.Place from,MapData.Place to,String travelMode);
}
