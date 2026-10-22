package org.wwz.ai.trigger.http.agent;

import org.springframework.web.bind.annotation.*;
import org.springframework.http.*;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.wwz.ai.application.agent.visitor.*;
import org.wwz.ai.domain.agent.runtime.tool.common.canvas.maps.*;
import org.wwz.ai.types.agent.visitor.VisitorRequestContext;
import org.wwz.ai.trigger.http.research.support.SseLifecycleSupport;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;
import reactor.core.Disposables;
import reactor.core.publisher.Flux;
import java.time.Duration;

@RestController
@RequestMapping("/api/agent/conversation/sessions/{sessionId}/maps")
@ConditionalOnProperty(name="research.ui.surfaces.enabled",havingValue="true",matchIfMissing=true)
public class AgentMapIntroductionController {
    private final PlaceIntroductionService introductions;private final ConversationSessionOwnershipApplicationService ownership;
    public AgentMapIntroductionController(PlaceIntroductionService introductions,ConversationSessionOwnershipApplicationService ownership){this.introductions=introductions;this.ownership=ownership;}
    public record Request(long mapRevision,String generationId,String model){public Request(long mapRevision,String generationId){this(mapRevision,generationId,null);}}
    @PostMapping(value="/{surfaceId}/{nodeId}/places/{placeId}/introduction",produces=MediaType.TEXT_EVENT_STREAM_VALUE)
    public ResponseEntity<SseEmitter> generate(@PathVariable String sessionId,@PathVariable String surfaceId,@PathVariable String nodeId,@PathVariable String placeId,@RequestBody Request request){
        try{
            String owner=VisitorRequestContext.requireVisitorId();ownership.ensureExistingSessionAccessible(owner,sessionId);
            if(request==null||request.generationId()==null)throw new IllegalArgumentException();
            var events=introductions.open(sessionId,owner,surfaceId,nodeId,placeId,request.mapRevision(),request.generationId(),request.model());
            var emitter=SseLifecycleSupport.createEmitter(185_000);var subscription=Disposables.composite();
            emitter.onCompletion(subscription::dispose);emitter.onTimeout(()->{subscription.dispose();emitter.complete();});emitter.onError(error->subscription.dispose());
            subscription.add(events.subscribe(frame->{try{emitter.send(SseEmitter.event().name("place_introduction").data(frame,MediaType.APPLICATION_JSON));}catch(Exception closed){subscription.dispose();try{emitter.complete();}catch(Exception ignored){}}},error->{subscription.dispose();emitter.complete();},emitter::complete));
            // Detect a closed reader even while the model is still thinking; comments are not text deltas.
            subscription.add(Flux.interval(Duration.ofSeconds(5)).subscribe(tick->{try{emitter.send(SseEmitter.event().comment("keep-alive"));}catch(Exception closed){subscription.dispose();try{emitter.complete();}catch(Exception ignored){}}}));
            return ResponseEntity.ok().contentType(MediaType.TEXT_EVENT_STREAM).header("Cache-Control","private, no-store, no-transform").header("X-Accel-Buffering","no").body(emitter);
        }catch(SessionOwnershipDeniedException|SecurityException denied){return ResponseEntity.notFound().build();}
        catch(IllegalArgumentException invalid){return ResponseEntity.badRequest().build();}
        catch(IllegalStateException conflict){return ResponseEntity.status(409).build();}
        catch(MapProviderException unavailable){return ResponseEntity.status(unavailable.code().equals("MAP_RATE_LIMIT")?429:503).build();}
    }
}
