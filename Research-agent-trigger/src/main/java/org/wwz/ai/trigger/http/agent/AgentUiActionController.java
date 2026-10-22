package org.wwz.ai.trigger.http.agent;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.wwz.ai.application.agent.visitor.ConversationSessionOwnershipApplicationService;
import org.wwz.ai.types.agent.visitor.VisitorRequestContext;
import org.wwz.ai.domain.agent.runtime.tool.common.canvas.*;
import java.util.*;
import java.util.function.Supplier;
@RestController
@RequestMapping("/api/agent/conversation/sessions/{sessionId}/ui-actions")
@org.springframework.boot.autoconfigure.condition.ConditionalOnProperty(name="research.ui.surfaces.enabled",havingValue="true",matchIfMissing=true)
public class AgentUiActionController {
  private final UiActionService service;private final ConversationSessionOwnershipApplicationService ownership;
  public AgentUiActionController(UiActionService service,ConversationSessionOwnershipApplicationService ownership){this.service=service;this.ownership=ownership;}
  private String owner(String session){String owner=VisitorRequestContext.requireVisitorId();ownership.ensureExistingSessionAccessible(owner,session);return owner;}
  private ResponseEntity<?> respond(Supplier<Object> operation){try{return ResponseEntity.ok().header("Cache-Control","private, no-store").body(Map.of("code",200,"data",operation.get()));}
    catch(SecurityException|org.wwz.ai.application.agent.visitor.SessionOwnershipDeniedException e){return ResponseEntity.notFound().build();}
    catch(IllegalArgumentException e){return ResponseEntity.badRequest().body(Map.of("error",Objects.toString(e.getMessage(),"Invalid request")));}
    catch(IllegalStateException e){return ResponseEntity.status(409).body(Map.of("error",Objects.toString(e.getMessage(),"Conflict")));}
  }
  @PostMapping public ResponseEntity<?> submit(@PathVariable String sessionId,@RequestBody UiActionService.Request request){return respond(()->service.submit(sessionId,owner(sessionId),request).data());}
  @GetMapping public ResponseEntity<?> list(@PathVariable String sessionId,@RequestParam String surfaceId){return respond(()->service.list(sessionId,owner(sessionId),surfaceId).stream().map(UiActionExecution::data).toList());}
  @GetMapping("/{executionId}") public ResponseEntity<?> get(@PathVariable String sessionId,@PathVariable String executionId){return respond(()->service.get(sessionId,owner(sessionId),executionId).data());}
  @PostMapping("/{executionId}/decision") public ResponseEntity<?> decide(@PathVariable String sessionId,@PathVariable String executionId,@RequestBody Map<String,Boolean> body){return respond(()->{if(!body.containsKey("approved")||body.get("approved")==null)throw new IllegalArgumentException("approved required");return service.decide(sessionId,owner(sessionId),executionId,body.get("approved")).data();});}
  @PostMapping("/{executionId}/cancel") public ResponseEntity<?> cancel(@PathVariable String sessionId,@PathVariable String executionId){return respond(()->service.cancel(sessionId,owner(sessionId),executionId).data());}
}

