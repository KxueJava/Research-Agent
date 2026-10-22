package org.wwz.ai.test.domain.canvas;
import org.junit.Test;
import org.wwz.ai.application.agent.file.ConversationFileAccessService;
import org.wwz.ai.application.agent.visitor.*;
import org.wwz.ai.domain.agent.ledger.*;
import org.wwz.ai.domain.agent.ledger.entity.*;
import static org.junit.Assert.*;
import static org.mockito.Mockito.*;
public class ConversationFileAccessTest {
    @Test public void resolvesLegacyRequestToCurrentSessionOwnership() {
        var ledger=mock(IExecutionLedgerReadRepository.class);
        var ownership=mock(ConversationSessionOwnershipApplicationService.class);
        when(ledger.queryRunByRequestId("request")).thenReturn(DialogueRun.builder().sessionId("session").build());
        new ConversationFileAccessService(ledger,ownership).requireReadable("visitor","request");
        verify(ownership).ensureExistingSessionAccessible("visitor","session");
    }
    @Test public void missingAndUnownedOrDeletedScopesAreDenied() {
        var ledger=mock(IExecutionLedgerReadRepository.class);
        var ownership=mock(ConversationSessionOwnershipApplicationService.class);
        var service=new ConversationFileAccessService(ledger,ownership);
        assertThrows(org.wwz.ai.application.agent.file.UnmappedFileScopeException.class,()->service.requireReadable("visitor","missing"));
        when(ledger.isKnownFileScope("purged")).thenReturn(true);
        assertThrows(SessionOwnershipDeniedException.class,()->service.requireReadable("visitor","purged"));
        when(ledger.querySessionEntity("session")).thenReturn(DialogueSession.builder().sessionId("session").build());
        doThrow(new SessionOwnershipDeniedException("denied")).when(ownership).ensureExistingSessionAccessible("visitor","session");
        assertThrows(SessionOwnershipDeniedException.class,()->service.requireReadable("visitor","session"));
    }
}
