package org.wwz.ai.application.agent.file;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.wwz.ai.application.agent.visitor.ConversationSessionOwnershipApplicationService;
import org.wwz.ai.application.agent.visitor.SessionOwnershipDeniedException;
import org.wwz.ai.domain.agent.ledger.IExecutionLedgerReadRepository;

/** Files historically use either a session ID or a run request ID as storage scope. */
@Service
@RequiredArgsConstructor
public class ConversationFileAccessService {
    private final IExecutionLedgerReadRepository ledger;
    private final ConversationSessionOwnershipApplicationService ownership;
    public boolean isKnownScope(String scope) {return ledger.isKnownFileScope(scope);}

    public void requireReadable(String visitorId, String requestId) {
        if(requestId==null || requestId.isBlank() || requestId.length()>128)
            throw new SessionOwnershipDeniedException("File unavailable");
        String sessionId=requestId;
        if(ledger.querySessionEntity(requestId)==null) {
            var run=ledger.queryRunByRequestId(requestId);
            if(run==null) {
                if(ledger.isKnownFileScope(requestId))throw new SessionOwnershipDeniedException("File unavailable");
                throw new UnmappedFileScopeException();
            }
            sessionId=run.getSessionId();
        }
        // This checks current ownership and deletion state, not historical run ownership.
        ownership.ensureExistingSessionAccessible(visitorId,sessionId);
    }
}
