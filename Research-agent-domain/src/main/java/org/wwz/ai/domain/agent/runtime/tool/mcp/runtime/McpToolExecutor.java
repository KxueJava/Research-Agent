package org.wwz.ai.domain.agent.runtime.tool.mcp.runtime;

import jakarta.annotation.Resource;
import org.apache.commons.lang3.StringUtils;
import org.springframework.stereotype.Service;
import org.wwz.ai.domain.agent.adapter.repository.ISessionCapabilityRepository;
import org.wwz.ai.domain.agent.runtime.agent.AgentContext;
import org.wwz.ai.domain.agent.runtime.dto.tool.McpResourceInfo;
import org.wwz.ai.domain.agent.runtime.dto.tool.McpToolInfo;

import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.Objects;

/**
 * MCP 工具统一执行器。
 * Research 侧继续维持原有调用方式，但底层统一走 McpRegistry 复用预热好的客户端和工具缓存。
 */
@Service
public class McpToolExecutor {

    @Resource
    private McpRegistry mcpRegistry;

    @Resource
    private ISessionCapabilityRepository sessionCapabilityRepository;

    // Read on every new operation: a cached AgentContext must not preserve a revoked grant.
    private Map<String, Boolean> currentPermissions(AgentContext context) {
        if (context == null || StringUtils.isBlank(context.getSessionId())
                || sessionCapabilityRepository == null) {
            throw new SecurityException("MCP session authorization unavailable");
        }
        try {
            Map<String, Map<String, Boolean>> overrides =
                    sessionCapabilityRepository.findOverrides(context.getSessionId());
            if (overrides == null) {
                throw new SecurityException("MCP session authorization unavailable");
            }
            return overrides.getOrDefault("mcp", Map.of());
        } catch (RuntimeException e) {
            throw new SecurityException("MCP session authorization unavailable");
        }
    }

    private String requireServer(String server, Map<String, Boolean> permissions) {
        String mcpId = mcpRegistry.resolveMcpId(server);
        if (StringUtils.isBlank(mcpId) || Boolean.FALSE.equals(permissions.get(mcpId))) {
            throw new SecurityException("MCP server unavailable or disabled for this session");
        }
        return mcpId;
    }

    public List<McpToolInfo> filterAllowedTools(AgentContext context, List<McpToolInfo> tools) {
        Map<String, Boolean> permissions = currentPermissions(context);
        return tools.stream().filter(Objects::nonNull)
                .filter(tool -> {
                    String id = StringUtils.defaultIfBlank(tool.getMcpId(), tool.getServerKey());
                    return StringUtils.isNotBlank(id) && !Boolean.FALSE.equals(permissions.get(id));
                }).toList();
    }

    public List<McpResourceInfo> listResources(AgentContext context, String server) {
        Map<String, Boolean> permissions = currentPermissions(context);
        if (StringUtils.isNotBlank(server)) {
            return mcpRegistry.listResources(requireServer(server, permissions));
        }
        return mcpRegistry.listGlobalEnabledResources().stream()
                .filter(Objects::nonNull)
                .filter(resource -> StringUtils.isNotBlank(resource.getMcpId())
                        && !Boolean.FALSE.equals(permissions.get(resource.getMcpId())))
                .toList();
    }

    public String readResource(AgentContext context, String server, String uri) {
        String id = requireServer(server, currentPermissions(context));
        return mcpRegistry.readResource(id, uri);
    }

    public String executeTool(AgentContext context, McpToolInfo toolInfo, Object args) {
        Map<String, Boolean> permissions = currentPermissions(context);
        if (toolInfo == null || StringUtils.isBlank(toolInfo.getName())) {
            throw new IllegalArgumentException("Unknown MCP tool");
        }
        String id = requireServer(StringUtils.defaultIfBlank(toolInfo.getMcpId(), toolInfo.getServerKey()), permissions);
        return mcpRegistry.executeTool(id, toolInfo.resolveWireName(), args);
    }

    /**
     * 获取当前全局启用的 MCP 工具列表。
     */
    public List<McpToolInfo> discoverConfiguredTools() {
        return mcpRegistry.listGlobalEnabledTools();
    }

    /**
     * 兼容保留：根据 mcpId 列表获取工具列表。
     */
    public List<McpToolInfo> discoverTools(List<String> mcpIds) {
        if (mcpIds == null || mcpIds.isEmpty()) {
            return Collections.emptyList();
        }
        return mcpRegistry.listToolsByMcpIds(mcpIds);
    }

    /**
     * 全局 resources。
     */
    public List<McpResourceInfo> listGlobalResources() {
        return mcpRegistry.listGlobalEnabledResources();
    }

    /**
     * 按 server / mcpId 列出 resources。
     */
    public List<McpResourceInfo> listResources(String serverOrMcpId) {
        return mcpRegistry.listResources(serverOrMcpId);
    }

    /**
     * 读取 resource。
     */
    public String readResource(String serverOrMcpId, String uri) {
        return readResource(null, serverOrMcpId, uri);
    }

    /**
     * 是否存在可用 resources。
     */
    public boolean hasAnyResources() {
        return mcpRegistry.hasAnyResources();
    }

    /**
     * 执行单个 MCP 工具（wire 使用 originalName）。
     */
    public String executeTool(McpToolInfo toolInfo, Object args) {
        return executeTool(null, toolInfo, args);
    }
}
