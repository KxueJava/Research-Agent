package org.wwz.ai.trigger.http.agent;
import org.springframework.web.bind.annotation.*;
import org.springframework.http.ResponseEntity;
import org.wwz.ai.domain.agent.research.config.ResearchConfig;
import java.util.Map;
/** Public, read-only rollout metadata. No keys, user data or mutation endpoint. */
@RestController
public class AgentUiFeaturesController {
 private final ResearchConfig config;
 public AgentUiFeaturesController(ResearchConfig config){this.config=config;}
 @GetMapping("/api/agent/ui-features") public ResponseEntity<?> features(){
  return ResponseEntity.ok().header("Cache-Control","no-store").body(Map.of("streaming",Boolean.TRUE.equals(config.getUiStreamingEnabled()),"actions",Boolean.TRUE.equals(config.getUiActionsEnabled()),"maps",Boolean.TRUE.equals(config.getUiMapsEnabled()),"planner",Boolean.TRUE.equals(config.getUiPlannerEnabled())));
 }
}
