package org.wwz.ai.trigger.http.agent;

import org.springframework.web.bind.annotation.*;
import org.springframework.http.ResponseEntity;
import org.springframework.core.env.Environment;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.wwz.ai.application.agent.visitor.*;
import org.wwz.ai.types.agent.visitor.VisitorRequestContext;
import org.wwz.ai.domain.agent.runtime.tool.common.canvas.maps.*;
import java.util.*;
import java.util.function.Supplier;

@RestController
@RequestMapping("/api/agent/conversation/sessions/{sessionId}/maps")
@ConditionalOnProperty(name="research.ui.surfaces.enabled",havingValue="true",matchIfMissing=true)
public class AgentMapsController {
    private final MapService service;private final ConversationSessionOwnershipApplicationService ownership;private final Environment env;
    private final Map<String,long[]> budgets=new HashMap<>();
    public AgentMapsController(MapService service,ConversationSessionOwnershipApplicationService ownership,Environment env){this.service=service;this.ownership=ownership;this.env=env;}
    private String owner(String session){String owner=VisitorRequestContext.requireVisitorId();ownership.ensureExistingSessionAccessible(owner,session);return owner;}
    private synchronized void budget(String owner,String group,int max){long minute=System.currentTimeMillis()/60000;String key=owner+":"+group;var value=budgets.get(key);if(value==null||value[0]!=minute){if(budgets.size()>=1000)budgets.entrySet().removeIf(e->e.getValue()[0]!=minute);if(budgets.size()>=1000)throw new MapProviderException("MAP_RATE_LIMIT","地图服务繁忙，请稍后重试");value=new long[]{minute,0};budgets.put(key,value);}if(++value[1]>max)throw new MapProviderException("MAP_RATE_LIMIT","地图请求过于频繁，请稍后重试");}
    private ResponseEntity<?> respond(Supplier<Object> action){try{return ResponseEntity.ok().header("Cache-Control","private, no-store").body(Map.of("code",200,"data",action.get()));}
        catch(SessionOwnershipDeniedException|SecurityException e){return ResponseEntity.notFound().build();}
        catch(MapProviderException e){return ResponseEntity.status(e.code().equals("MAP_RATE_LIMIT")?429:503).body(Map.of("code",e.code(),"message",e.getMessage()));}
        catch(IllegalArgumentException e){return ResponseEntity.badRequest().body(Map.of("message","地图参数无效"));}
        catch(IllegalStateException e){return ResponseEntity.status(409).body(Map.of("message","地图状态已更新，请重新同步"));}}
    @GetMapping("/config") public ResponseEntity<?> config(@PathVariable String sessionId){return respond(()->{
        owner(sessionId);String key=env.getProperty("AMAP_JS_KEY",""),code=env.getProperty("AMAP_SECURITY_JSCODE",""),host=env.getProperty("AMAP_SECURITY_SERVICE_HOST","");
        if(!service.enabled())return Map.of("jsReady",false,"webConfigured",false,"travelModes",List.of(),"disabled",true);
        var result=new LinkedHashMap<String,Object>();boolean ready=!key.isBlank()&&(!code.isBlank()||!host.isBlank());result.put("jsReady",ready);result.put("webConfigured",!env.getProperty("AMAP_WEB_KEY","").isBlank());result.put("travelModes",List.of("walking","driving"));
        if(ready){result.put("jsKey",key);if(!host.isBlank())result.put("securityServiceHost",host);else result.put("securityJsCode",code);}return result;
    });}
    @GetMapping("/places") public ResponseEntity<?> search(@PathVariable String sessionId,@RequestParam String query,@RequestParam(defaultValue="") String city,@RequestParam(defaultValue="5") int limit){return respond(()->{String who=owner(sessionId);budget(who,"search",30);return service.planner().places().search(query,city,limit).stream().map(MapData.Place::toMap).toList();});}
    @GetMapping("/{surfaceId}/{nodeId}/state") public ResponseEntity<?> view(@PathVariable String sessionId,@PathVariable String surfaceId,@PathVariable String nodeId){return respond(()->{String who=owner(sessionId);return service.readView(sessionId,who,surfaceId,nodeId);});}
    @GetMapping("/{surfaceId}/{nodeId}/photos") public ResponseEntity<?> photos(@PathVariable String sessionId,@PathVariable String surfaceId,@PathVariable String nodeId){return respond(()->{String who=owner(sessionId);budget(who,"photos",6);return service.readPhotos(sessionId,who,surfaceId,nodeId);});}
    @GetMapping("/{surfaceId}/{nodeId}/places/{placeId}") public ResponseEntity<?> details(@PathVariable String sessionId,@PathVariable String surfaceId,@PathVariable String nodeId,@PathVariable String placeId){return respond(()->{String who=owner(sessionId);budget(who,"details",30);return service.readDetails(sessionId,who,surfaceId,nodeId,placeId);});}
    public record ViewRequest(long stateRevision,long mapRevision,Map<String,Object> state){}
    @PutMapping("/{surfaceId}/{nodeId}/state") public ResponseEntity<?> save(@PathVariable String sessionId,@PathVariable String surfaceId,@PathVariable String nodeId,@RequestBody ViewRequest request){return respond(()->{String who=owner(sessionId);budget(who,"view",180);if(request.state()==null)throw new IllegalArgumentException();return service.saveView(sessionId,who,surfaceId,nodeId,request.stateRevision(),request.mapRevision(),request.state());});}
}
