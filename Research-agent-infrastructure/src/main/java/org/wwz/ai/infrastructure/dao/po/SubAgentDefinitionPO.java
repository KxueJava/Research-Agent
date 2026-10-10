package org.wwz.ai.infrastructure.dao.po;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/**
 * 可配置子 Agent 定义 PO。
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SubAgentDefinitionPO {

    private Long id;

    private String agentKey;

    private String displayName;

    private String whenToUse;

    private String systemPrompt;

    private String allowedToolsJson;

    private String disallowedToolsJson;

    private Integer maxSteps;

    /** 模型配置行 ID；null 表示继承主 Agent 模型。 */
    private Long modelConfigId;

    private String thinkingEffort;

    private Integer status;

    private LocalDateTime createTime;

    private LocalDateTime updateTime;

    private Integer deleted;
}
