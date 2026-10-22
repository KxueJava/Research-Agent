package org.wwz.ai.test.domain;

import org.junit.*;
import org.mockito.*;
import org.wwz.ai.application.agent.visitor.ConversationSessionOwnershipApplicationService;
import org.wwz.ai.application.agent.visitor.SessionOwnershipDeniedException;
import org.wwz.ai.domain.agent.runtime.capability.SessionCapabilityService;
import org.wwz.ai.trigger.http.agent.AgentSessionCapabilityController;
import org.wwz.ai.types.agent.visitor.VisitorRequestContext;
import org.wwz.ai.types.enums.ResponseCode;

public class SessionCapabilityOwnershipTest {
    @Mock private SessionCapabilityService capabilities;
    @Mock private ConversationSessionOwnershipApplicationService ownership;
    @InjectMocks private AgentSessionCapabilityController controller;
    private AutoCloseable mocks;

    @Before public void setUp() {
        mocks = MockitoAnnotations.openMocks(this);
        org.springframework.test.util.ReflectionTestUtils.setField(controller,
                "conversationSessionOwnershipApplicationService", ownership);
        VisitorRequestContext.bind("visitor-b");
        Mockito.doThrow(new SessionOwnershipDeniedException("无权访问"))
                .when(ownership).ensureCapabilitySessionAccessible("visitor-b", "session-a");
    }
    @After public void tearDown() throws Exception {
        VisitorRequestContext.clear();
        mocks.close();
    }
    @Test public void foreignSessionCannotBeRead() {
        Assert.assertNotEquals(ResponseCode.SUCCESS.getCode(), controller.capabilities("session-a").getCode());
        Mockito.verifyNoInteractions(capabilities);
    }
    @Test public void foreignSessionCannotBeChanged() {
        var body = new AgentSessionCapabilityController.CapabilityToggleBody();
        body.setKind("skill"); body.setRefId("test"); body.setEnabled(false);
        Assert.assertNotEquals(ResponseCode.SUCCESS.getCode(), controller.update("session-a", body).getCode());
        Mockito.verifyNoInteractions(capabilities);
    }
    @Test public void missingIdentityCannotReadCapabilities() {
        VisitorRequestContext.clear();
        Assert.assertNotEquals(ResponseCode.SUCCESS.getCode(), controller.capabilities("session-a").getCode());
        Mockito.verifyNoInteractions(capabilities);
    }
    @Test public void ownerCanChangeCapabilities() {
        var body = new AgentSessionCapabilityController.CapabilityToggleBody();
        body.setKind("skill"); body.setRefId("test"); body.setEnabled(false);
        Assert.assertEquals(ResponseCode.SUCCESS.getCode(), controller.update("session-b", body).getCode());
        Mockito.verify(ownership).ensureCapabilitySessionAccessible("visitor-b", "session-b");
        Mockito.verify(capabilities).setEnabled("session-b", "skill", "test", false);
    }

    @Test public void newSessionCanConfigureCapabilitiesBeforeFirstMessage() {
        var ctx = ExecutionLedgerFixtureFactory.newLedgerTestContext();
        @SuppressWarnings("unchecked")
        org.springframework.beans.factory.ObjectProvider<org.wwz.ai.domain.agent.memory.ltm.LtmManager> ltm = Mockito.mock(org.springframework.beans.factory.ObjectProvider.class);
        var realOwnership = new ConversationSessionOwnershipApplicationService(ctx.readRepository, ctx.writeRepository, ltm);
        org.springframework.test.util.ReflectionTestUtils.setField(controller,
                "conversationSessionOwnershipApplicationService", realOwnership);
        Assert.assertEquals(ResponseCode.SUCCESS.getCode(), controller.capabilities("brand-new").getCode());
        Assert.assertEquals("visitor-b", ctx.readRepository.querySessionEntity("brand-new").getVisitorId());
        VisitorRequestContext.bind("visitor-c");
        Assert.assertNotEquals(ResponseCode.SUCCESS.getCode(), controller.capabilities("brand-new").getCode());
        Assert.assertEquals("visitor-b", ctx.readRepository.querySessionEntity("brand-new").getVisitorId());
    }
}
