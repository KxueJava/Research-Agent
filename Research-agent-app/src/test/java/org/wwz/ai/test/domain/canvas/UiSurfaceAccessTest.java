package org.wwz.ai.test.domain.canvas;

import org.junit.Test;
import org.springframework.beans.factory.ObjectProvider;
import org.wwz.ai.trigger.http.agent.AgentUiSurfaceController;
import org.wwz.ai.application.agent.visitor.ConversationSessionOwnershipApplicationService;
import org.wwz.ai.application.agent.visitor.SessionOwnershipDeniedException;
import org.wwz.ai.domain.agent.runtime.tool.common.canvas.UiSurfaceStore;
import org.wwz.ai.types.agent.visitor.VisitorRequestContext;
import static org.junit.Assert.*;
import static org.mockito.Mockito.*;

public class UiSurfaceAccessTest {
    @Test public void actionResponsesUseTheHttpClientSuccessEnvelope(){
        var service=mock(org.wwz.ai.domain.agent.runtime.tool.common.canvas.UiActionService.class);
        var execution=new org.wwz.ai.domain.agent.runtime.tool.common.canvas.UiActionExecution(java.util.Map.of("id","e","status","approval_required"));
        when(service.get("s","owner","e")).thenReturn(execution);
        VisitorRequestContext.bind("owner");
        try{var response=new org.wwz.ai.trigger.http.agent.AgentUiActionController(service,mock(ConversationSessionOwnershipApplicationService.class)).get("s","e");
            var body=(java.util.Map<?,?>)response.getBody();assertEquals(200,body.get("code"));assertEquals("approval_required",((java.util.Map<?,?>)body.get("data")).get("status"));
        }finally{VisitorRequestContext.clear();}
    }
    @Test public void actionEndpointsDenyForeignSessionBeforeService(){
        var service=mock(org.wwz.ai.domain.agent.runtime.tool.common.canvas.UiActionService.class);var ownership=mock(ConversationSessionOwnershipApplicationService.class);
        doThrow(new SessionOwnershipDeniedException("denied")).when(ownership).ensureExistingSessionAccessible("other","s");VisitorRequestContext.bind("other");
        try{var controller=new org.wwz.ai.trigger.http.agent.AgentUiActionController(service,ownership);assertEquals(404,controller.get("s","e").getStatusCode().value());assertEquals(404,controller.list("s","a").getStatusCode().value());assertEquals(404,controller.cancel("s","e").getStatusCode().value());verifyNoInteractions(service);}finally{VisitorRequestContext.clear();}
    }
    @Test public void deniesUnownedSessionBeforeListingInterruptedStreams() {
        ObjectProvider<UiSurfaceStore> provider=mock(ObjectProvider.class);UiSurfaceStore store=mock(UiSurfaceStore.class);when(provider.getIfAvailable()).thenReturn(store);
        var ownership=mock(ConversationSessionOwnershipApplicationService.class);
        doThrow(new SessionOwnershipDeniedException("denied")).when(ownership).ensureExistingSessionAccessible("other","s");
        VisitorRequestContext.bind("other");
        try {assertEquals(404,new AgentUiSurfaceController(provider,ownership).snapshots("s").getStatusCode().value());verifyNoInteractions(store);}
        finally {VisitorRequestContext.clear();}
    }
    @Test public void deniesUnownedSessionBeforeReadingSnapshot() {
        ObjectProvider<UiSurfaceStore> provider=mock(ObjectProvider.class);
        UiSurfaceStore store=mock(UiSurfaceStore.class);when(provider.getIfAvailable()).thenReturn(store);
        var ownership=mock(ConversationSessionOwnershipApplicationService.class);
        doThrow(new SessionOwnershipDeniedException("denied")).when(ownership).ensureExistingSessionAccessible("other","s");
        VisitorRequestContext.bind("other");
        try {assertEquals(404,new AgentUiSurfaceController(provider,ownership).snapshot("s","a").getStatusCode().value());verifyNoInteractions(store);}
        finally {VisitorRequestContext.clear();}
    }
}
