package org.wwz.ai.domain.agent.runtime.subagent;

import lombok.Builder;
import lombok.Data;

import java.util.Set;

/**
 * 子 Agent 定义管理视图（含 status / displayName，装配配置非 ledger）。
 */
@Data
@Builder
public class SubAgentDefinitionRecord {

    private String agentKey;

    private String displayName;

    private String whenToUse;

    private String systemPrompt;

    private Set<String> allowedTools;

    private Set<String> disallowedTools;

    private Integer maxSteps;

    /** 模型配置行 ID；null 表示继承主 Agent 模型。 */
    private Long modelConfigId;

    /** 独立模型推理强度；null 表示模型默认。 */
    private String thinkingEffort;

    /** 1=启用,0=禁用 */
    private Integer status;
}
