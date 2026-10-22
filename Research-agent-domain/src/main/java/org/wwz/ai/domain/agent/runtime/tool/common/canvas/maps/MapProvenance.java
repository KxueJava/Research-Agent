package org.wwz.ai.domain.agent.runtime.tool.common.canvas.maps;
import org.wwz.ai.domain.agent.runtime.tool.common.canvas.UiActionService;
/** Content-addressed proof is registered only by server provider execution, never by model JSON. */
public final class MapProvenance {
    private MapProvenance(){}
    public static String digest(Object raw){
        // JSON persistence may turn integral doubles into integers. Hash the typed
        // representation so registration and publication use identical numbers.
        var canonical=new java.util.LinkedHashMap<>(MapData.parse(raw).toMap());
        var input=MapData.object(raw);
        if(input.containsKey("requestId")){String request=MapData.text(input,"requestId");MapData.id(request);canonical.put("requestId",request);}
        return UiActionService.digest(canonical);
    }
}
