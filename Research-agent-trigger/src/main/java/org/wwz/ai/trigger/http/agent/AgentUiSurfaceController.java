package org.wwz.ai.trigger.http.agent;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.wwz.ai.application.agent.visitor.ConversationSessionOwnershipApplicationService;
import org.wwz.ai.domain.agent.runtime.tool.common.canvas.UiSurfaceStore;
import org.wwz.ai.types.agent.visitor.VisitorRequestContext;
import java.util.Map;

@RestController
@RequestMapping("/api/agent/conversation/sessions/{sessionId}/surfaces")
public class AgentUiSurfaceController {
    private final ObjectProvider<UiSurfaceStore> stores;
    private final ConversationSessionOwnershipApplicationService ownership;
    public AgentUiSurfaceController(ObjectProvider<UiSurfaceStore> stores,ConversationSessionOwnershipApplicationService ownership) {
        this.stores=stores;this.ownership=ownership;
    }
    @GetMapping
    public ResponseEntity<?> snapshots(@PathVariable String sessionId) {
        UiSurfaceStore store=stores.getIfAvailable();
        if(store==null)return ResponseEntity.status(503).build();
        try {
            String visitor=VisitorRequestContext.requireVisitorId();
            ownership.ensureExistingSessionAccessible(visitor,sessionId);
            return ResponseEntity.ok().header("Cache-Control","private, no-store").body(store.list(sessionId,visitor));
        } catch(SecurityException|IllegalStateException|org.wwz.ai.application.agent.visitor.SessionOwnershipDeniedException e) {
            return ResponseEntity.notFound().build();
        } catch(IllegalArgumentException e) {return ResponseEntity.badRequest().build();}
    }
    @GetMapping("/{surfaceId}")
    public ResponseEntity<?> snapshot(@PathVariable String sessionId,@PathVariable String surfaceId) {
        UiSurfaceStore store=stores.getIfAvailable();
        if(store==null)return ResponseEntity.status(503).body(Map.of("error","Surface protocol disabled"));
        try {
            String visitor=VisitorRequestContext.requireVisitorId();
            ownership.ensureExistingSessionAccessible(visitor,sessionId);
            return ResponseEntity.ok(store.read(sessionId,visitor,surfaceId));
        } catch(SecurityException|IllegalStateException|org.wwz.ai.application.agent.visitor.SessionOwnershipDeniedException e) {
            return ResponseEntity.status(404).body(Map.of("error","Surface unavailable"));
        } catch(IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error","Invalid Surface identifier"));
        }
    }
    @GetMapping("/{surfaceId}/versions/{revision}")
    public ResponseEntity<?> version(@PathVariable String sessionId,@PathVariable String surfaceId,@PathVariable long revision) {
        UiSurfaceStore store=stores.getIfAvailable();
        if(store==null)return ResponseEntity.status(503).build();
        try {
            String visitor=VisitorRequestContext.requireVisitorId();
            ownership.ensureExistingSessionAccessible(visitor,sessionId);
            return ResponseEntity.ok().header("Cache-Control","private, no-store").body(store.readVersion(sessionId,visitor,surfaceId,revision));
        } catch(SecurityException|IllegalStateException|org.wwz.ai.application.agent.visitor.SessionOwnershipDeniedException e) {
            return ResponseEntity.notFound().build();
        }
    }
    public record StateRequest(long stateRevision,long baseRevision,Map<String,Object> state){}
    public record ResourceRequest(long baseVersion,Map<String,Object> resource){}
    @PutMapping("/{surfaceId}/interaction")
    public ResponseEntity<?> saveState(@PathVariable String sessionId,@PathVariable String surfaceId,@RequestBody StateRequest request){
        return write(sessionId,store->store.saveInteraction(sessionId,VisitorRequestContext.requireVisitorId(),surfaceId,request.stateRevision(),request.baseRevision(),request.state()));
    }
    @PutMapping("/{surfaceId}/resources")
    public ResponseEntity<?> saveResource(@PathVariable String sessionId,@PathVariable String surfaceId,@RequestBody ResourceRequest request){
        return write(sessionId,store->store.saveResource(sessionId,VisitorRequestContext.requireVisitorId(),surfaceId,request.baseVersion(),request.resource()));
    }
    private ResponseEntity<?> write(String session,java.util.function.Function<UiSurfaceStore,Object> operation){
        var store=stores.getIfAvailable();if(store==null)return ResponseEntity.status(503).build();
        try{ownership.ensureExistingSessionAccessible(VisitorRequestContext.requireVisitorId(),session);return ResponseEntity.ok().header("Cache-Control","private, no-store").body(operation.apply(store));}
        catch(SecurityException|org.wwz.ai.application.agent.visitor.SessionOwnershipDeniedException e){return ResponseEntity.notFound().build();}
        catch(IllegalStateException e){return ResponseEntity.status(409).body(Map.of("error","Recovery version conflict"));}
        catch(IllegalArgumentException e){return ResponseEntity.badRequest().body(Map.of("error","Invalid recovery state"));}
    }
}
