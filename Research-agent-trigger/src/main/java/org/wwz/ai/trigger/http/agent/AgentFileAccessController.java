package org.wwz.ai.trigger.http.agent;

import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.wwz.ai.application.agent.file.ConversationFileAccessService;
import org.wwz.ai.application.agent.visitor.SessionOwnershipDeniedException;
import org.wwz.ai.types.agent.visitor.VisitorRequestContext;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/agent/file")
public class AgentFileAccessController {
    private final ConversationFileAccessService access;
    @org.springframework.beans.factory.annotation.Value("${RESEARCH_FILE_SERVICE_TOKEN:}")
    private String serviceToken="";
    @GetMapping("/scope-kind")
    public ResponseEntity<?> scopeKind(@RequestParam String scope,@RequestHeader(value="X-Research-File-Service",defaultValue="") String token) {
        if(serviceToken.isBlank()||!java.security.MessageDigest.isEqual(serviceToken.getBytes(java.nio.charset.StandardCharsets.UTF_8),token.getBytes(java.nio.charset.StandardCharsets.UTF_8)))
            return ResponseEntity.status(403).build();
        if(scope==null||scope.isBlank()||scope.length()>128)return ResponseEntity.badRequest().build();
        return ResponseEntity.ok().header("Cache-Control","no-store").body(java.util.Map.of("kind",access.isKnownScope(scope)?"conversation":"unmapped"));
    }
    @GetMapping("/identity")
    public ResponseEntity<?> identity() {
        return ResponseEntity.ok().header("Cache-Control","no-store")
            .body(java.util.Map.of("visitorId",VisitorRequestContext.requireVisitorId()));
    }
    @GetMapping("/access")
    public ResponseEntity<Void> access(@RequestParam String requestId) {
        try {
            access.requireReadable(VisitorRequestContext.requireVisitorId(),requestId);
            return ResponseEntity.noContent().header("Cache-Control","no-store").build();
        } catch(org.wwz.ai.application.agent.file.UnmappedFileScopeException e) {
            return ResponseEntity.unprocessableEntity().header("Cache-Control","no-store").build();
        } catch(SessionOwnershipDeniedException|IllegalArgumentException e) {
            return ResponseEntity.notFound().header("Cache-Control","no-store").build();
        }
    }
}
