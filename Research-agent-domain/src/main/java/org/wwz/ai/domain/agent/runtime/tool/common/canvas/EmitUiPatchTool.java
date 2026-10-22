package org.wwz.ai.domain.agent.runtime.tool.common.canvas;

import lombok.Data;
import lombok.extern.slf4j.Slf4j;
import org.apache.commons.lang3.StringUtils;
import org.wwz.ai.domain.agent.ledger.model.tooloutput.GenUiPatchToolOutput;
import org.wwz.ai.domain.agent.runtime.agent.AgentContext;
import org.wwz.ai.domain.agent.runtime.artifact.ToolArtifactSource;
import org.wwz.ai.domain.agent.runtime.tool.BaseTool;
import org.wwz.ai.domain.agent.runtime.tool.ToolResultPayload;

import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 校验并发布 GenUI 增量补丁。
 *
 * <p>补丁只描述对既有树的操作，不在领域工具内维护树副本；前端按
 * {@code canvas_id} 和可选序号应用它们，工具输出账本则保存本次补丁事实。</p>
 */
@Slf4j
@Data
public class EmitUiPatchTool implements BaseTool {

    private AgentContext agentContext;

    @Override
    public String getName() {
        return CanvasToolNames.EMIT_UI_PATCH;
    }

    @Override
    public String getDescription() {
        return "Update a previously emitted Surface in the active session, including earlier conversation rounds. "
                + "Args: patches, canvas_id (use surfaceId returned by emit_ui_tree), base_revision (latest revision). "
                + "Omit canvas_id only when the session contains exactly one Surface. Use /root/... paths. "
                + "Revision conflicts must reload the latest snapshot before retrying. Never claim success after an error.";
    }

    @Override
    public Map<String, Object> toParams() {
        Map<String, Object> patches = new HashMap<>();
        patches.put("type", "array");
        patches.put("minItems", 1);
        patches.put("description", "JSON-Patch ops targeting /root/... paths.");

        Map<String, Object> canvasId = new HashMap<>();
        canvasId.put("type", "string");

        Map<String, Object> seq = new HashMap<>();
        seq.put("type", "integer");
        seq.put("minimum", 0);

        Map<String, Object> properties = new LinkedHashMap<>();
        properties.put("patches", patches);
        properties.put("canvas_id", canvasId);
        properties.put("seq", seq);
        properties.put("base_revision", Map.of("type","integer","minimum",1,"description","Latest confirmed Surface revision"));

        Map<String, Object> parameters = new HashMap<>();
        parameters.put("type", "object");
        parameters.put("properties", properties);
        parameters.put("required", List.of("patches"));
        return parameters;
    }

    @Override
    @SuppressWarnings("unchecked")
    public Object execute(Object input) {
        try {
            org.wwz.ai.domain.agent.runtime.tool.common.canvas.planner.UiPresentationRuntime.ensureAvailable(agentContext);
            Map<String, Object> params = input instanceof Map<?, ?> map ? castMap(map) : Map.of();
            // 规范化同时过滤未知字段，并确保 remove 不携带无意义的 value。
            Map<String, Object> normalized = GenUiSchema.validateUiPatch(params);

            Map<String,Object> surface = null;
            Map<String,Object> snapshot = null;
            UiSurfaceStore surfaceStore = UiSurfaceTools.store(agentContext);
            if (surfaceStore != null) {
                Object base = params.get("base_revision");
                if (base != null && (!(base instanceof Number) || ((Number)base).longValue()<1
                        || ((Number)base).doubleValue()!=((Number)base).longValue()))
                    throw new IllegalArgumentException("base_revision must be a positive integer");
                var quality=org.wwz.ai.domain.agent.runtime.tool.common.canvas.planner.UiPresentationRuntime.checkPatch(agentContext,stringVal(params.get("canvas_id")),base==null?null:((Number)base).longValue(),(List<Map<String,Object>>)normalized.get("patches"));
                if(quality!=null)normalized.put("quality",org.wwz.ai.domain.agent.runtime.tool.common.canvas.planner.UiPresentationRuntime.qualityData(quality));
                Map<String,Object> document = surfaceStore.patch(agentContext.getSessionId(),
                        stringVal(params.get("canvas_id")), UiSurfaceTools.eventId(agentContext),
                        base==null?null:((Number)base).longValue(), (List<Map<String,Object>>)normalized.get("patches"));
                surface = UiSurfaceDocument.metadata(document);
                snapshot = (Map<String,Object>)document.get("tree");
                normalized.put("canvas_id",document.get("surfaceId"));
                normalized.put("seq",((Number)document.get("revision")).intValue());
                // Ordinary patches run only after a streamed generation becomes terminal (enforced by the store).
            }

            Map<String, Object> streamPayload = new LinkedHashMap<>(normalized);
            streamPayload.put("isFinal", true);
            if (surface != null) {
                streamPayload.put("surface", surface);
                streamPayload.put("snapshot", snapshot);
            }
            ToolArtifactSource artifactSource = agentContext == null
                    ? null
                    : agentContext.getCurrentToolArtifactSource();
            if (artifactSource != null) {
                streamPayload.put("toolCallId", artifactSource.getToolCallId());
                streamPayload.put("toolName", artifactSource.getToolName());
            }

            // 流式事件是实时投影，结构化 ToolResult 仍是账本和历史回放的事实来源。
            if (agentContext != null && agentContext.getPrinter() != null) {
                String toolCallId = artifactSource == null ? null : artifactSource.getToolCallId();
                String digitalEmployee = agentContext.getToolCollection() == null
                        ? null
                        : agentContext.getToolCollection().getDigitalEmployee(getName());
                agentContext.getPrinter().send(toolCallId, "ui_patch", streamPayload, digitalEmployee, true);
            }

            Integer seq = null;
            if (normalized.get("seq") instanceof Number n) {
                seq = n.intValue();
            }
            List<Map<String, Object>> patches = (List<Map<String, Object>>) normalized.get("patches");
            String canvasId = stringVal(normalized.get("canvas_id"));
            Map<String, Object> fields = new LinkedHashMap<>();
            fields.put("message", "GenUI patch applied (" + patches.size() + " ops).");
            fields.put("canvasId", canvasId);
            fields.put("seq", seq);
            fields.put("patchCount", patches.size());
            if(normalized.containsKey("quality"))fields.put("quality",normalized.get("quality"));
            if (surface != null) fields.put("surface",surface);
            return ToolResultPayload.okData(
                    getName(),
                    fields,
                    GenUiPatchToolOutput.builder()
                            .patches(patches)
                            .canvasId(canvasId)
                            .seq(seq)
                            .surface(surface)
                            .snapshot(snapshot)
                            .build()
            );
        } catch (Exception e) {
            log.warn("emit_ui_patch failed: {}", e.getMessage());
            return org.wwz.ai.domain.agent.runtime.tool.common.canvas.planner.UiPresentationRuntime.failure(agentContext,"emit_ui_patch validation failed: " + e.getMessage());
        }
    }

    private Map<String, Object> castMap(Map<?, ?> map) {
        Map<String, Object> out = new LinkedHashMap<>();
        for (Map.Entry<?, ?> e : map.entrySet()) {
            if (e.getKey() != null) {
                out.put(String.valueOf(e.getKey()), e.getValue());
            }
        }
        return out;
    }

    private String stringVal(Object v) {
        if (v == null) {
            return null;
        }
        String s = String.valueOf(v).trim();
        return StringUtils.isBlank(s) ? null : s;
    }
}
