package org.wwz.ai.test.domain.subagent;

import org.junit.Assert;
import org.junit.Test;
import org.wwz.ai.domain.agent.runtime.agent.AgentContext;
import org.wwz.ai.domain.agent.runtime.subagent.SubAgentContextFactory;
import org.wwz.ai.domain.agent.runtime.subagent.SubAgentDefinition;
import org.wwz.ai.domain.agent.runtime.tool.ToolCollection;

public class SubAgentModelConfigurationTest {
    @Test
    public void registryReloadPreservesSelectedModel() {
        org.wwz.ai.domain.agent.runtime.subagent.SubAgentRegistry registry =
                new org.wwz.ai.domain.agent.runtime.subagent.SubAgentRegistry();
        registry.replaceConfigured(java.util.List.of(SubAgentDefinition.builder()
                .agentType("worker").modelConfigId(42L).thinkingEffort("high").build()));
        Assert.assertEquals(Long.valueOf(42), registry.require("worker").getModelConfigId());
        Assert.assertEquals("high", registry.require("worker").getThinkingEffort());
    }
    @Test
    public void inheritPreservesParentModelAndThinking() {
        AgentContext parent = parent();
        AgentContext child = child(parent);
        SubAgentContextFactory.applyModelConfiguration(child, SubAgentDefinition.builder().build());
        Assert.assertEquals("parent-model", child.getModel());
        Assert.assertEquals(Boolean.TRUE, child.getThinking());
        Assert.assertEquals("high", child.getThinkingEffort());
    }

    @Test
    public void independentChildrenUseExactBindingsWithoutMutatingParent() {
        AgentContext parent = parent();
        AgentContext first = child(parent);
        AgentContext second = child(parent);
        SubAgentContextFactory.applyModelConfiguration(first, SubAgentDefinition.builder().modelConfigId(42L).build());
        SubAgentContextFactory.applyModelConfiguration(second, SubAgentDefinition.builder().modelConfigId(43L).build());
        Assert.assertEquals("__db_binding__:42", first.getModel());
        Assert.assertEquals("__db_binding__:43", second.getModel());
        Assert.assertNull(first.getThinking());
        Assert.assertNull(first.getThinkingEffort());
        Assert.assertEquals("parent-model", parent.getModel());
        Assert.assertEquals(Boolean.TRUE, parent.getThinking());
        Assert.assertEquals("high", parent.getThinkingEffort());
    }

    @Test
    public void independentChildUsesConfiguredEffortAndEnablesThinking() {
        AgentContext parent = AgentContext.builder().requestId("parent").sessionId("session")
                .model("parent-model").thinking(false).thinkingEffort(null).build();
        AgentContext child = child(parent);

        SubAgentContextFactory.applyModelConfiguration(child,
                SubAgentDefinition.builder().modelConfigId(42L).thinkingEffort("max").build());

        Assert.assertEquals("__db_binding__:42", child.getModel());
        Assert.assertEquals(Boolean.TRUE, child.getThinking());
        Assert.assertEquals("max", child.getThinkingEffort());
        Assert.assertEquals(Boolean.FALSE, parent.getThinking());
    }

    private AgentContext parent() {
        return AgentContext.builder().requestId("parent").sessionId("session")
                .model("parent-model").thinking(true).thinkingEffort("high").build();
    }

    private AgentContext child(AgentContext parent) {
        return SubAgentContextFactory.create(parent, "task", "description", new ToolCollection(), "child", "worker");
    }
}
