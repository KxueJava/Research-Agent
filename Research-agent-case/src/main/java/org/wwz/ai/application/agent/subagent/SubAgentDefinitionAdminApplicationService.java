package org.wwz.ai.application.agent.subagent;

import lombok.RequiredArgsConstructor;
import org.apache.commons.lang3.StringUtils;
import org.springframework.stereotype.Service;
import org.wwz.ai.domain.agent.adapter.repository.ISubAgentDefinitionRepository;
import org.wwz.ai.domain.agent.runtime.subagent.SubAgentDefinitionLoader;
import org.wwz.ai.domain.agent.runtime.subagent.SubAgentDefinitionRecord;
import org.wwz.ai.domain.agent.runtime.subagent.SubAgentDefinitionUpsertCommand;
import org.wwz.ai.domain.agent.runtime.subagent.SubAgentRegistry;

import java.util.List;
import java.util.Optional;
import java.util.regex.Pattern;

/**
 * 可配置子 Agent 定义管理应用服务。
 */
@Service
@RequiredArgsConstructor
public class SubAgentDefinitionAdminApplicationService {

    private static final Pattern AGENT_KEY_PATTERN = Pattern.compile("^[a-zA-Z][a-zA-Z0-9_/-]{1,62}$");

    private final ISubAgentDefinitionRepository subAgentDefinitionRepository;
    private final SubAgentDefinitionLoader subAgentDefinitionLoader;

    @org.springframework.beans.factory.annotation.Autowired
    private org.wwz.ai.domain.agent.adapter.repository.ILlmModelConfigRepository modelRepository;

    public List<SubAgentDefinitionRecord> listAll() {
        return subAgentDefinitionRepository.listAll();
    }

    public Optional<SubAgentDefinitionRecord> get(String agentKey) {
        if (StringUtils.isBlank(agentKey)) {
            return Optional.empty();
        }
        return subAgentDefinitionRepository.findByAgentKey(agentKey.trim());
    }

    public boolean create(SubAgentDefinitionUpsertCommand command) {
        validateUpsert(command, true);
        String key = command.getAgentKey().trim();
        if (subAgentDefinitionRepository.findByAgentKey(key).isPresent()) {
            throw new IllegalArgumentException("agentKey 已存在: " + key);
        }
        boolean ok = subAgentDefinitionRepository.insert(normalize(command));
        if (ok) {
            subAgentDefinitionLoader.reload();
        }
        return ok;
    }

    public boolean update(SubAgentDefinitionUpsertCommand command) {
        validateUpsert(command, false);
        String key = command.getAgentKey().trim();
        if (subAgentDefinitionRepository.findByAgentKey(key).isEmpty()) {
            throw new IllegalArgumentException("agentKey 不存在: " + key);
        }
        boolean ok = subAgentDefinitionRepository.updateByAgentKey(normalize(command));
        if (ok) {
            subAgentDefinitionLoader.reload();
        }
        return ok;
    }

    public boolean delete(String agentKey) {
        if (StringUtils.isBlank(agentKey)) {
            throw new IllegalArgumentException("agentKey 不能为空");
        }
        String key = agentKey.trim();
        assertNotBuiltin(key);
        boolean ok = subAgentDefinitionRepository.softDeleteByAgentKey(key);
        if (ok) {
            subAgentDefinitionLoader.reload();
        }
        return ok;
    }

    public int reload() {
        return subAgentDefinitionLoader.reload();
    }

    private SubAgentDefinitionUpsertCommand normalize(SubAgentDefinitionUpsertCommand command) {
        Integer status = command.getStatus() == null ? 1 : (command.getStatus() == 0 ? 0 : 1);
        return SubAgentDefinitionUpsertCommand.builder()
                .agentKey(command.getAgentKey().trim())
                .displayName(StringUtils.trimToNull(command.getDisplayName()))
                .whenToUse(command.getWhenToUse().trim())
                .systemPrompt(command.getSystemPrompt())
                .allowedTools(command.getAllowedTools())
                .disallowedTools(command.getDisallowedTools())
                .maxSteps(command.getMaxSteps())
                .modelConfigId(command.getModelConfigId())
                .thinkingEffort(StringUtils.trimToNull(command.getThinkingEffort()))
                .status(status)
                .build();
    }

    private void validateUpsert(SubAgentDefinitionUpsertCommand command, boolean create) {
        if (command == null || StringUtils.isBlank(command.getAgentKey())) {
            throw new IllegalArgumentException("agentKey 不能为空");
        }
        String key = command.getAgentKey().trim();
        if (!AGENT_KEY_PATTERN.matcher(key).matches()) {
            throw new IllegalArgumentException("agentKey 格式非法：字母开头，仅含字母数字_-/长度2-63");
        }
        assertNotBuiltin(key);
        if (StringUtils.isBlank(command.getWhenToUse())) {
            throw new IllegalArgumentException("whenToUse 不能为空");
        }
        if (command.getSystemPrompt() == null || command.getSystemPrompt().isBlank()) {
            throw new IllegalArgumentException("systemPrompt 不能为空");
        }
        if (command.getMaxSteps() != null && command.getMaxSteps() <= 0) {
            throw new IllegalArgumentException("maxSteps 必须为正整数或留空");
        }
        String thinkingEffort = StringUtils.trimToNull(command.getThinkingEffort());
        if (thinkingEffort != null && !List.of("low", "medium", "high", "max", "ultra").contains(thinkingEffort)) {
            throw new IllegalArgumentException("thinkingEffort 必须为 low、medium、high、max、ultra 或留空");
        }
        if (thinkingEffort != null && command.getModelConfigId() == null) {
            throw new IllegalArgumentException("继承主 Agent 模型时不能单独指定推理强度");
        }
        if (command.getModelConfigId() != null) {
            var binding = modelRepository == null ? java.util.Optional.<org.wwz.ai.domain.agent.runtime.llm.LlmModelBinding>empty()
                    : modelRepository.listUsable().stream()
                    .filter(model -> command.getModelConfigId().equals(model.getId())).findFirst();
            if (command.getModelConfigId() <= 0 || binding.isEmpty()) {
                throw new IllegalArgumentException("所选模型配置不存在、已禁用或连接配置不完整");
            }
            List<String> supportedEfforts = binding.get().getSupportedReasoningEfforts();
            String modelIdentity = binding.get().getModelName() + " " + binding.get().getModelId();
            List<String> defaultEfforts = StringUtils.containsIgnoreCase(modelIdentity, "luna")
                    ? List.of("low", "medium", "high", "max")
                    : List.of("low", "medium", "high", "max", "ultra");
            if (supportedEfforts == null || supportedEfforts.isEmpty()) {
                supportedEfforts = defaultEfforts;
            } else {
                supportedEfforts = supportedEfforts.stream().filter(defaultEfforts::contains).toList();
                if (supportedEfforts.isEmpty()) supportedEfforts = defaultEfforts;
            }
            if (thinkingEffort != null && !supportedEfforts.contains(thinkingEffort)) {
                throw new IllegalArgumentException("所选模型不支持该推理强度");
            }
        }
        if (!create && StringUtils.isBlank(key)) {
            throw new IllegalArgumentException("agentKey 不能为空");
        }
    }

    private static void assertNotBuiltin(String agentKey) {
        String key = agentKey.trim();
        if (SubAgentRegistry.TYPE_GENERAL_PURPOSE.equalsIgnoreCase(key)) {
            throw new IllegalArgumentException("禁止覆盖内置子 Agent: " + key);
        }
    }
}
