package org.wwz.ai.test.spring.ai;

import org.junit.Test;
import org.junit.Assert;
import org.mockito.Mockito;
import org.springframework.test.util.ReflectionTestUtils;
import org.wwz.ai.domain.agent.adapter.repository.ISessionCapabilityRepository;
import org.wwz.ai.domain.agent.runtime.ResearchRuntimeDependencies;
import org.wwz.ai.domain.agent.runtime.agent.AgentContext;
import org.wwz.ai.domain.agent.runtime.dto.tool.McpToolInfo;
import org.wwz.ai.domain.agent.runtime.tool.ToolCollection;
import org.wwz.ai.domain.agent.runtime.tool.ToolResultPayload;
import org.wwz.ai.domain.agent.runtime.tool.common.mcp.ToolSearchTool;
import org.wwz.ai.domain.agent.runtime.tool.common.mcp.ReadMcpResourceTool;
import org.wwz.ai.domain.agent.runtime.tool.mcp.runtime.*;
import java.util.*;

public class McpSessionBoundaryTest {
    private final McpRegistry registry = Mockito.mock(McpRegistry.class);
    private final ISessionCapabilityRepository repo = Mockito.mock(ISessionCapabilityRepository.class);
    private final McpToolExecutor executor = new McpToolExecutor();
    private final McpToolInfo tool = McpToolInfo.builder().mcpId("private").serverKey("alias")
            .name("mcp__alias__read").originalName("read").parameters("{}").build();

    private AgentContext context(String session) {
        ReflectionTestUtils.setField(executor, "mcpRegistry", registry);
        ReflectionTestUtils.setField(executor, "sessionCapabilityRepository", repo);
        Mockito.when(registry.resolveMcpId("alias")).thenReturn("private");
        Mockito.when(registry.resolveMcpId("private")).thenReturn("private");
        var context = AgentContext.builder().sessionId(session).requestId("offline")
                .runtimeDependencies(ResearchRuntimeDependencies.builder().mcpToolExecutor(executor).build()).build();
        var collection = new ToolCollection();
        collection.setMcpToolExecutor(executor); collection.setAgentContext(context);
        context.setToolCollection(collection);
        context.setDeferredMcpCatalog(new DeferredMcpCatalog(List.of(tool)));
        return context;
    }

    @Test public void disabledServerCannotBeReactivatedFromAnOldCatalog() {
        var context = context("A");
        context.setDisabledMcpIds(Set.of("private"));
        Mockito.when(repo.findOverrides("A")).thenReturn(Map.of("mcp", Map.of("private", false)));
        var search = new ToolSearchTool(); search.setAgentContext(context);
        search.execute(Map.of("query", "select:" + tool.getName()));
        Assert.assertFalse(context.getToolCollection().getMcpToolMap().containsKey(tool.getName()));
    }

    @Test public void cachedToolExecutionChecksLatestPermissionAndOtherSessionStillWorks() {
        var a = context("A"); var b = context("B");
        a.getToolCollection().addMcpTool(tool); b.getToolCollection().addMcpTool(tool);
        Mockito.when(repo.findOverrides("A")).thenReturn(Map.of("mcp", Map.of("private", false)));
        Mockito.when(repo.findOverrides("B")).thenReturn(Map.of());
        Mockito.when(registry.executeTool("private", "read", Map.of())).thenReturn("content");
        Assert.assertThrows(SecurityException.class, () -> a.getToolCollection().execute(tool.getName(), Map.of()));
        Assert.assertEquals("content", b.getToolCollection().execute(tool.getName(), Map.of()));
        Mockito.verify(registry, Mockito.times(1)).executeTool("private", "read", Map.of());
    }

    @Test public void disabledResourceAliasIsRejectedBeforeRemoteRead() {
        var context = context("A");
        Mockito.when(repo.findOverrides("A")).thenReturn(Map.of("mcp", Map.of("private", false)));
        var read = new ReadMcpResourceTool(); read.setAgentContext(context);
        var result = (ToolResultPayload) read.execute(Map.of("server", "alias", "uri", "test://resource"));
        Assert.assertEquals(Boolean.TRUE, result.getFailed());
        Mockito.verify(registry, Mockito.never()).readResource(Mockito.anyString(), Mockito.anyString());
    }

    @Test public void invalidRegistryReadThrowsInsteadOfReturningAnErrorString() {
        Assert.assertThrows(RuntimeException.class, () -> new McpRegistry().readResource("", "test://resource"));
    }

    @Test public void springCallbackCannotBypassCurrentSessionPermission() {
        var context = context("A"); context.getToolCollection().addMcpTool(tool);
        Mockito.when(repo.findOverrides("A")).thenReturn(Map.of("mcp", Map.of("private", false)));
        var provider = new org.wwz.ai.domain.agent.runtime.llm.LlmToolCallbackProvider();
        ReflectionTestUtils.setField(provider, "mcpRegistry", registry);
        var callback = provider.buildToolCallbacks(context.getToolCollection(), "A").get(0);
        Assert.assertThrows(SecurityException.class, () -> callback.call("{}"));
        Mockito.verify(registry, Mockito.never()).executeTool(Mockito.anyString(), Mockito.anyString(), Mockito.any());
    }

    @Test public void resourceErrorIsSanitizedButEmptyAndErrorLookingTextRemainValid() {
        var context = context("B");
        Mockito.when(repo.findOverrides("B")).thenReturn(Map.of());
        var read = new ReadMcpResourceTool(); read.setAgentContext(context);
        Mockito.when(registry.readResource(Mockito.anyString(), Mockito.anyString()))
                .thenThrow(new IllegalStateException("private-key-value"));
        var failure = (ToolResultPayload) read.execute(Map.of("server", "alias", "uri", "test://resource"));
        Assert.assertTrue(failure.getFailed());
        Assert.assertFalse(String.valueOf(failure.getErrorMsg()).contains("private-key-value"));
        for (String text : List.of("", "Resource read Error. is legitimate document text")) {
            Mockito.reset(registry);
            Mockito.when(registry.resolveMcpId("alias")).thenReturn("private");
            Mockito.when(registry.readResource(Mockito.anyString(), Mockito.anyString())).thenReturn(text);
            Assert.assertFalse(((ToolResultPayload) read.execute(Map.of("server", "alias", "uri", "test://resource"))).getFailed());
        }
    }

    @Test public void resourceListingsFilterDisabledServersAndRejectTheirAliases() {
        var context = context("A");
        Mockito.when(repo.findOverrides("A")).thenReturn(Map.of("mcp", Map.of("private", false)));
        var hidden = org.wwz.ai.domain.agent.runtime.dto.tool.McpResourceInfo.builder()
                .mcpId("private").serverKey("alias").uri("test://hidden").build();
        var visible = org.wwz.ai.domain.agent.runtime.dto.tool.McpResourceInfo.builder()
                .mcpId("public").serverKey("public").uri("test://visible").build();
        Mockito.when(registry.listGlobalEnabledResources()).thenReturn(List.of(hidden, visible));
        Assert.assertEquals(List.of(visible), executor.listResources(context, null));
        var list = new org.wwz.ai.domain.agent.runtime.tool.common.mcp.ListMcpResourcesTool();
        list.setAgentContext(context);
        Assert.assertTrue(((ToolResultPayload) list.execute(Map.of("server", "alias"))).getFailed());
        Mockito.verify(registry, Mockito.never()).listResources(Mockito.anyString());
    }

    @Test public void permissionChangesApplyToAlreadyCachedCallbacksAndChildAgents() {
        var parent = context("A"); parent.getToolCollection().addMcpTool(tool);
        Mockito.when(repo.findOverrides("A")).thenReturn(Map.of());
        Mockito.when(registry.executeTool("private", "read", "{}")).thenReturn("content");
        var provider = new org.wwz.ai.domain.agent.runtime.llm.LlmToolCallbackProvider();
        var callback = provider.buildToolCallbacks(parent.getToolCollection(), "A").get(0);
        Assert.assertEquals("content", callback.call("{}"));
        var childTools = new ToolCollection(); childTools.setMcpToolExecutor(executor); childTools.addMcpTool(tool);
        var child = org.wwz.ai.domain.agent.runtime.subagent.SubAgentContextFactory.create(
                parent, "offline", "test", childTools, "child", "research");
        Mockito.when(repo.findOverrides("A")).thenReturn(Map.of("mcp", Map.of("private", false)));
        Assert.assertThrows(SecurityException.class, () -> callback.call("{}"));
        Assert.assertThrows(SecurityException.class, () -> callback.call("{}",
                new org.springframework.ai.chat.model.ToolContext(Map.of("sessionId", "B"))));
        Assert.assertThrows(SecurityException.class, () -> child.getToolCollection().execute(tool.getName(), "{}"));
        Mockito.verify(registry, Mockito.times(1)).executeTool("private", "read", "{}");
    }

    @Test public void missingSessionAndRepositoryFailuresDenyWithoutRemoteCalls() {
        var context = context("A"); context.getToolCollection().addMcpTool(tool);
        Mockito.when(repo.findOverrides("A")).thenThrow(new IllegalStateException("database-private-value"));
        Assert.assertThrows(SecurityException.class, () -> context.getToolCollection().execute(tool.getName(), "{}"));
        context.setSessionId(null);
        Assert.assertThrows(SecurityException.class, () -> executor.readResource(context, "alias", "test://x"));
        Assert.assertThrows(SecurityException.class, () -> executor.executeTool(tool, "{}"));
        Assert.assertThrows(SecurityException.class, () -> new RegistryBackedToolCallback(registry, tool).call("{}"));
        Mockito.verify(registry, Mockito.never()).executeTool(Mockito.anyString(), Mockito.anyString(), Mockito.any());
        Mockito.verify(registry, Mockito.never()).readResource(Mockito.anyString(), Mockito.anyString());
    }

    @Test public void blockedSearchEntriesDoNotConsumeTheResultLimitOrLeakSchema() {
        var context = context("A");
        var visible = McpToolInfo.builder().mcpId("public").serverKey("public")
                .name("mcp__public__read").originalName("read").parameters("{}").build();
        context.setDeferredMcpCatalog(new DeferredMcpCatalog(List.of(tool, visible)));
        Mockito.when(repo.findOverrides("A")).thenReturn(Map.of("mcp", Map.of("private", false)));
        var search = new ToolSearchTool(); search.setAgentContext(context);
        var result = (ToolResultPayload) search.execute(Map.of("query", "read", "max_results", 1));
        Assert.assertFalse(result.getFailed());
        Assert.assertEquals(Set.of(visible.getName()), context.getToolCollection().getMcpToolMap().keySet());
        Assert.assertFalse(String.valueOf(result.getLlmData()).contains(tool.getName()));
        Assert.assertFalse(context.getDeferredMcpCatalog().isActivated(tool.getName()));
    }

    @Test public void callbackCacheDoesNotReuseAnotherRequestCollection() {
        var first = context("A"); first.getToolCollection().addMcpTool(tool);
        var second = context("A"); second.getToolCollection().addMcpTool(tool);
        Mockito.when(repo.findOverrides("A")).thenReturn(Map.of());
        Mockito.when(registry.executeTool("private", "read", "{}")).thenReturn("second request");
        var provider = new org.wwz.ai.domain.agent.runtime.llm.LlmToolCallbackProvider();
        var oldCallback = provider.buildToolCallbacks(first.getToolCollection(), "A").get(0);
        var newCallback = provider.buildToolCallbacks(second.getToolCollection(), "A").get(0);
        first.setSessionId(null);
        Assert.assertNotSame(oldCallback, newCallback);
        Assert.assertThrows(SecurityException.class, () -> oldCallback.call("{}"));
        Assert.assertEquals("second request", newCallback.call("{}"));
    }

    @Test public void catalogAssemblyExcludesDisabledEagerAndDeferredTools() {
        var factory = Mockito.mock(org.wwz.ai.domain.agent.runtime.tool.factory.AgentToolCollectionFactory.class,
                Mockito.CALLS_REAL_METHODS);
        var config = new org.wwz.ai.domain.agent.research.config.ResearchConfig();
        ReflectionTestUtils.setField(factory, "researchConfig", config);
        var discovery = Mockito.mock(McpToolExecutor.class);
        ReflectionTestUtils.setField(factory, "mcpToolExecutor", discovery);
        Mockito.when(discovery.discoverConfiguredTools()).thenReturn(List.of(tool));
        var request = new org.wwz.ai.domain.agent.research.model.req.AgentRequest();
        request.setOutputStyle("html");
        for (String mode : List.of("always", "standard")) {
            config.setMcpToolSearchMode(mode);
            var context = context("A"); context.setDisabledMcpIds(Set.of("private"));
            ReflectionTestUtils.invokeMethod(factory, "attachMcpSurface", context.getToolCollection(), context, request);
            Assert.assertEquals(0, context.getDeferredMcpCatalog().size());
            Assert.assertTrue(context.getToolCollection().getMcpToolMap().isEmpty());
            Assert.assertFalse(context.getDeferredMcpCatalog().formatAvailableDeferredToolsBlock().contains(tool.getName()));
        }
    }

    @Test public void realRegistryDistinguishesRemoteFailureFromValidResourceContent() {
        var client = Mockito.mock(io.modelcontextprotocol.client.McpSyncClient.class);
        var actual = new McpRegistry();
        ReflectionTestUtils.setField(actual, "globalEnabledMcpIds", List.of("private"));
        var runtime = McpClientRuntime.builder().syncClient(client)
                .descriptor(McpServerDescriptor.builder().mcpId("private").serverKey("alias")
                        .transportType(McpServerDescriptor.TRANSPORT_TYPE_STREAMABLE_HTTP).build()).build();
        @SuppressWarnings("unchecked")
        var runtimes = (Map<String, McpClientRuntime>) ReflectionTestUtils.getField(actual, "runtimeCache");
        runtimes.put("private", runtime);
        @SuppressWarnings("unchecked")
        var tools = (Map<String, List<McpToolInfo>>) ReflectionTestUtils.getField(actual, "toolCache");
        tools.put("private", List.of(tool));
        Mockito.when(client.readResource(Mockito.any(io.modelcontextprotocol.spec.McpSchema.ReadResourceRequest.class)))
                .thenThrow(new IllegalStateException("private-key-value"));
        var failure = Assert.assertThrows(McpResourceReadException.class,
                () -> actual.readResource("alias", "test://resource"));
        Assert.assertEquals("READ_FAILED", failure.getErrorCode());
        Assert.assertFalse(failure.getMessage().contains("private-key-value"));
        Mockito.reset(client);
        var empty = Mockito.mock(io.modelcontextprotocol.spec.McpSchema.ReadResourceResult.class);
        Mockito.when(empty.contents()).thenReturn(List.of());
        Mockito.when(client.readResource(Mockito.any(io.modelcontextprotocol.spec.McpSchema.ReadResourceRequest.class)))
                .thenReturn(empty);
        Assert.assertNotNull(actual.readResource("alias", "test://resource"));
        var document = Mockito.mock(io.modelcontextprotocol.spec.McpSchema.TextResourceContents.class);
        String text = "Resource read Error. is legitimate document text";
        Mockito.when(document.text()).thenReturn(text);
        Mockito.when(empty.contents()).thenReturn(List.of(document));
        Assert.assertEquals(text, actual.readResource("alias", "test://resource"));
        Mockito.when(client.readResource(Mockito.any(io.modelcontextprotocol.spec.McpSchema.ReadResourceRequest.class)))
                .thenReturn(null);
        Assert.assertEquals("INVALID_RESPONSE", Assert.assertThrows(McpResourceReadException.class,
                () -> actual.readResource("alias", "test://resource")).getErrorCode());
        Assert.assertEquals("UNKNOWN_SERVER", Assert.assertThrows(McpResourceReadException.class,
                () -> actual.readResource("missing", "test://resource")).getErrorCode());
    }

    @Test public void registryPreloadFailuresAlsoUseTypedSanitizedErrors() {
        var actual = new McpRegistry();
        var configuration = Mockito.mock(org.wwz.ai.domain.agent.adapter.repository.IAgentRepository.class);
        ReflectionTestUtils.setField(actual, "repository", configuration);
        Mockito.when(configuration.queryEnabledAiClientToolMcpVOList())
                .thenThrow(new IllegalStateException("private-key-value"));
        var failure = Assert.assertThrows(McpResourceReadException.class,
                () -> actual.readResource("alias", "test://resource"));
        Assert.assertEquals("READ_FAILED", failure.getErrorCode());
        Assert.assertFalse(failure.getMessage().contains("private-key-value"));
    }
}
