package org.wwz.ai.domain.agent.runtime.tool.common.canvas;

import java.util.List;
import java.util.Map;

/** Session comes exclusively from the authenticated runtime, never tool arguments. */
public interface UiSurfaceStore {
    /** Trusted Agent runtime only; session identity has already been authorized by bootstrap. */
    default List<Map<String,Object>> planningSnapshots(String sessionId) {return List.of();}
    Map<String,Object> publish(String sessionId, String messageId, String canvasId, String eventId, Object tree);
    Map<String,Object> patch(String sessionId, String canvasId, String eventId, Long baseRevision, List<Map<String,Object>> patches);
    Map<String,Object> read(String sessionId, String ownerId, String surfaceId);
    default Map<String,Object> saveInteraction(String session,String owner,String surface,long stateRevision,long baseRevision,Map<String,Object> state){throw new UnsupportedOperationException("Interaction persistence unavailable");}
    default Map<String,Object> saveResource(String session,String owner,String surface,long baseVersion,Map<String,Object> resource){throw new UnsupportedOperationException("Resource persistence unavailable");}
    default void registerMapData(String session,Object mapData){
        if("amap".equals(org.wwz.ai.domain.agent.runtime.tool.common.canvas.maps.MapData.parse(mapData).provider()))throw new UnsupportedOperationException("Trusted provider registration unavailable");
    }
    default Map<String,Object> saveMapState(String session,String owner,String surface,String node,long stateRevision,long mapRevision,Map<String,Object> state){
        throw new UnsupportedOperationException("Map view persistence unavailable");
    }
    default Map<String,Object> applyAction(String session,String surface,String event,long revision,List<Map<String,Object>> patches,List<Map<String,Object>> resources){
        return patch(session,surface,event,revision,patches);
    }
    default boolean supportsStreaming() {return false;}
    default Map<String,Object> commitStream(String sessionId,String messageId,Map<String,Object> event,Object tree) {
        throw new UnsupportedOperationException("Incremental UI persistence unavailable");
    }
    default List<Map<String,Object>> list(String sessionId,String ownerId) {return List.of();}
    default Map<String,Object> publishArtifact(String sessionId,String messageId,String eventId,Map<String,Object> artifact) {
        throw new UnsupportedOperationException("HTML Surface persistence unavailable");
    }
    default Map<String,Object> readVersion(String sessionId,String ownerId,String surfaceId,long revision) {
        Map<String,Object> doc=read(sessionId,ownerId,surfaceId);
        if(((Number)doc.get("revision")).longValue()!=revision)throw new SecurityException("Version unavailable");
        return doc;
    }
}
