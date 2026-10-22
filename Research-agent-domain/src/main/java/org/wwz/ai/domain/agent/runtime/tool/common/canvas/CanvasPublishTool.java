package org.wwz.ai.domain.agent.runtime.tool.common.canvas;

import lombok.Data;
import lombok.extern.slf4j.Slf4j;
import org.apache.commons.lang3.StringUtils;
import org.wwz.ai.domain.agent.ledger.model.tooloutput.CanvasPublishToolOutput;
import org.wwz.ai.domain.agent.ledger.model.tooloutput.ToolFileRefMapper;
import org.wwz.ai.domain.agent.research.config.ResearchConfig;
import org.wwz.ai.domain.agent.runtime.agent.AgentContext;
import org.wwz.ai.domain.agent.runtime.artifact.ToolArtifactSource;
import org.wwz.ai.domain.agent.runtime.dto.CodeInterpreterResponse;
import org.wwz.ai.domain.agent.runtime.tool.BaseTool;
import org.wwz.ai.domain.agent.runtime.tool.ToolResultPayload;
import org.wwz.ai.domain.agent.runtime.tool.workspace.WorkspacePaths;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 发布当前会话工作区中已经存在的 HTML 文件。
 * <p>
 * 文件由 workspace_write/edit 写入、登记并建立 artifact；本工具只生成稳定的
 * preview/download URL，并按需通知前端打开预览，避免再次上传或登记同一文件。
 * </p>
 */
@Slf4j
@Data
public class CanvasPublishTool implements BaseTool {

    private static final String HTML_MODE = "html";

    private AgentContext agentContext;

    @Override
    public String getName() {
        return CanvasToolNames.CANVAS_PUBLISH;
    }

    @Override
    public String getDescription() {
        return "Publish an existing HTML file from the active workspace into the preview panel. "
                + "Use ONLY when the user explicitly wants HTML / a webpage / printable report, "
                + "or page-scale layout that cannot be expressed by GenUI components. "
                + "Charts / KPI / dashboards / multi-card UI -> prefer emit_ui_tree (not this tool). "
                + "First write the page with workspace_write, then pass its html_path. "
                + "html_path is required; this tool does not accept inline HTML or upload/register files.";
    }

    @Override
    public Map<String, Object> toParams() {
        Map<String, Object> title = new HashMap<>();
        title.put("type", "string");
        title.put("description", "Canvas title shown to the user.");

        Map<String, Object> htmlPath = new HashMap<>();
        htmlPath.put("type", "string");
        htmlPath.put("description", "Required path to an existing HTML file under the active workspace.");

        Map<String, Object> openInPanel = new HashMap<>();
        openInPanel.put("type", "boolean");
        openInPanel.put("description", "Whether to notify the UI to open the preview panel. Default true.");

        Map<String, Object> properties = new LinkedHashMap<>();
        properties.put("title", title);
        properties.put("html_path", htmlPath);
        properties.put("open_in_panel", openInPanel);

        Map<String, Object> parameters = new HashMap<>();
        parameters.put("type", "object");
        parameters.put("properties", properties);
        parameters.put("required", List.of("html_path"));
        parameters.put("additionalProperties", false);
        return parameters;
    }

    @Override
    public Object execute(Object input) {
        String title = "Canvas";
        try {
            org.wwz.ai.domain.agent.runtime.tool.common.canvas.planner.UiPresentationRuntime.checkArtifact(agentContext);
            Map<String, Object> params = input instanceof Map<?, ?> map
                    ? castMap(map)
                    : Map.of();
            title = StringUtils.defaultIfBlank(stringVal(params.get("title")), "Canvas");
            String htmlPath = stringVal(params.get("html_path"));
            boolean salvaged = Boolean.TRUE.equals(params.get("__salvaged"));
            boolean openInPanel = params.get("open_in_panel") == null
                    || Boolean.TRUE.equals(params.get("open_in_panel"))
                    || "true".equalsIgnoreCase(String.valueOf(params.get("open_in_panel")));

            if (StringUtils.isBlank(htmlPath)) {
                return failure(title, "html_path is required; write the file with workspace_write first");
            }
            if (agentContext == null || agentContext.getRuntimeDependencies() == null) {
                return failure(title, "canvas_publish requires an active agent context");
            }

            String relativePath = resolveWorkspaceRelativePath(htmlPath);
            if (relativePath == null) {
                return failure(title, "html_path not found or outside the active workspace: " + htmlPath);
            }
            org.wwz.ai.domain.agent.runtime.tool.common.canvas.planner.UiPresentationRuntime.checkArtifactPath(agentContext,relativePath);

            ResearchConfig researchConfig = agentContext.getRuntimeDependencies().requireResearchConfig();
            if (researchConfig == null || StringUtils.isBlank(researchConfig.getCodeInterpreterUrl())) {
                return failure(title, "canvas_publish file service URL is not configured");
            }

            Path filePath = WorkspacePaths.resolveSandboxRoot(
                            agentContext.getWorkspaceRoot(), agentContext.getSessionId())
                    .resolve(relativePath)
                    .normalize();
            int fileSize = (int) Math.min(Files.size(filePath), Integer.MAX_VALUE);
            org.wwz.ai.domain.agent.runtime.tool.common.canvas.planner.UiPresentationRuntime.checkArtifactContent(agentContext,filePath);
            String fileName = Path.of(relativePath).getFileName().toString();
            String previewUrl = buildFileUrl(researchConfig, "preview", relativePath);
            String downloadUrl = buildFileUrl(researchConfig, "download", relativePath);

            Map<String,Object> surface=null;
            UiSurfaceStore store=UiSurfaceTools.store(agentContext);
            if(store!=null) {
                if(Files.size(filePath)>2*1024*1024) return failure(title,"HTML Surface exceeds the 2 MiB publication limit");
                byte[] content=Files.readAllBytes(filePath);
                String digest=sha256(content);
                String surfaceId="html-"+sha256(relativePath.getBytes(StandardCharsets.UTF_8));
                String snapshotPath=".ui-surfaces/"+surfaceId+"/"+digest+".html";
                Path root=WorkspacePaths.resolveSandboxRoot(agentContext.getWorkspaceRoot(),agentContext.getSessionId()).toRealPath();
                Path snapshot=root.resolve(snapshotPath);
                Path parent=root;
                for(Path segment:root.relativize(snapshot.getParent())) {
                    parent=parent.resolve(segment);
                    if(!Files.exists(parent,java.nio.file.LinkOption.NOFOLLOW_LINKS))Files.createDirectory(parent);
                    if(!parent.toRealPath().startsWith(root))throw new SecurityException("Invalid snapshot directory");
                }
                // CREATE_NEW prevents silent overwrite, and digest verification detects altered snapshots.
                try {Files.write(snapshot,content,java.nio.file.StandardOpenOption.CREATE_NEW);}
                catch(java.nio.file.FileAlreadyExistsException exists) {
                    if(!Files.isRegularFile(snapshot,java.nio.file.LinkOption.NOFOLLOW_LINKS)
                            || !digest.equals(sha256(Files.readAllBytes(snapshot))))throw new SecurityException("HTML snapshot integrity failure");
                }
                previewUrl=buildFileUrl(researchConfig,"preview",snapshotPath);
                downloadUrl=buildFileUrl(researchConfig,"download",snapshotPath);
                agentContext.getRuntimeDependencies().requireFileArtifactPort().register(researchConfig.getCodeInterpreterUrl(),
                    org.wwz.ai.domain.agent.runtime.dto.FileRequest.builder().requestId(agentContext.getSessionId())
                        .fileName(snapshotPath).localPath(snapshot.toString()).description("Immutable HTML Surface snapshot").build());
                Map<String,Object> artifact=new LinkedHashMap<>();
                artifact.put("surfaceId",surfaceId);artifact.put("relativePath",relativePath);artifact.put("snapshotPath",snapshotPath);
                artifact.put("sha256",digest);artifact.put("title",title);artifact.put("previewUrl",previewUrl);artifact.put("downloadUrl",downloadUrl);
                surface=store.publishArtifact(agentContext.getSessionId(),agentContext.getRequestId(),UiSurfaceTools.eventId(agentContext),artifact);
                // A duplicate event returns its previously acknowledged revision and URLs.
                Map<?,?> acknowledged=(Map<?,?>)surface.get("artifact");
                previewUrl=String.valueOf(acknowledged.get("previewUrl"));downloadUrl=String.valueOf(acknowledged.get("downloadUrl"));
            }

            List<CodeInterpreterResponse.FileInfo> fileInfo = new ArrayList<>();
            fileInfo.add(CodeInterpreterResponse.FileInfo.builder()
                    .fileName(fileName)
                    .relativePath(relativePath)
                    .ossUrl(downloadUrl)
                    .domainUrl(previewUrl)
                    .fileSize(fileSize)
                    .build());

            ToolArtifactSource artifactSource = agentContext.getCurrentToolArtifactSource();
            if (openInPanel && agentContext.getPrinter() != null) {
                String toolCallId = artifactSource == null ? null : artifactSource.getToolCallId();
                CodeInterpreterResponse htmlResponse = CodeInterpreterResponse.builder()
                        .surface(surface)
                        .isFinal(true)
                        .toolCallId(toolCallId)
                        .fileInfo(fileInfo)
                        .data(title)
                        .codeOutput(title)
                        .build();
                String digitalEmployee = agentContext.getToolCollection() == null
                        ? null
                        : agentContext.getToolCollection().getDigitalEmployee(getName());
                agentContext.getPrinter().send(toolCallId, "html", htmlResponse, digitalEmployee, true);
            }

            CanvasPublishToolOutput structuredOutput = CanvasPublishToolOutput.builder()
                    .surface(surface)
                    .title(title)
                    .mode(HTML_MODE)
                    .primaryFileName(fileName)
                    .previewUrl(previewUrl)
                    .downloadUrl(downloadUrl)
                    .openInPanel(openInPanel)
                    .salvaged(salvaged)
                    .fileRefs(ToolFileRefMapper.fromCodeInterpreterFileInfo(fileInfo))
                    .build();
            Map<String, Object> fields = new LinkedHashMap<>();
            fields.put("message", "Canvas published.");
            fields.put("title", title);
            fields.put("mode", HTML_MODE);
            fields.put("fileName", fileName);
            fields.put("relativePath", relativePath);
            fields.put("openInPanel", openInPanel);
            fields.put("salvaged", salvaged);
            if(org.wwz.ai.domain.agent.runtime.tool.common.canvas.planner.UiPresentationRuntime.enabled(agentContext))
                fields.put("quality",Map.of("necessity","justified","information_organization","artifact_document","interaction_correctness","runtime_unverified","content_completeness","file_structurally_checked","task_completion","unverified"));
            if(surface!=null)fields.put("surface",surface);
            return ToolResultPayload.okData(getName(), fields, structuredOutput);
        } catch (Exception e) {
            log.error("{} canvas_publish error", agentContext == null ? "-" : agentContext.getRequestId(), e);
            return failure(title, "canvas_publish failed: " + e.getMessage());
        }
    }

    private static String sha256(byte[] bytes) throws java.security.NoSuchAlgorithmException {
        return java.util.HexFormat.of().formatHex(java.security.MessageDigest.getInstance("SHA-256").digest(bytes));
    }

    private String resolveWorkspaceRelativePath(String htmlPath) {
        if (agentContext == null || StringUtils.isBlank(agentContext.getSessionId())) {
            return null;
        }
        String normalized = htmlPath.trim().replace('\\', '/');
        if (StringUtils.isBlank(normalized)) {
            return null;
        }
        try {
            Path sessionRoot = WorkspacePaths.resolveSandboxRoot(
                            agentContext.getWorkspaceRoot(), agentContext.getSessionId())
                    .toAbsolutePath()
                    .normalize();
            Path inputPath = Path.of(normalized);
            Path candidate = inputPath.isAbsolute()
                    ? inputPath.normalize()
                    : sessionRoot.resolve(normalized).normalize();
            if (!candidate.startsWith(sessionRoot) || !Files.isRegularFile(candidate)) {
                return null;
            }

            // 检查真实路径，避免工作区内的符号链接把 html_path 指向工作区外。
            if (!candidate.toRealPath().startsWith(sessionRoot.toRealPath())) {
                return null;
            }
            return sessionRoot.relativize(candidate).toString().replace('\\', '/');
        } catch (Exception e) {
            log.warn("{} canvas_publish html_path validation failed path={}",
                    agentContext.getRequestId(), htmlPath, e);
            return null;
        }
    }

    private String buildFileUrl(ResearchConfig researchConfig, String operation, String relativePath) {
        String baseUrl = StringUtils.removeEnd(researchConfig.getCodeInterpreterUrl(), "/");
        return baseUrl
                + "/v1/file_tool/"
                + operation
                + "/"
                + encodePathSegment(agentContext.getSessionId())
                + "/"
                + encodePath(relativePath);
    }

    private String encodePath(String path) {
        StringBuilder encoded = new StringBuilder();
        for (String segment : path.replace('\\', '/').split("/")) {
            if (segment.isEmpty()) {
                continue;
            }
            if (encoded.length() > 0) {
                encoded.append('/');
            }
            encoded.append(encodePathSegment(segment));
        }
        return encoded.toString();
    }

    private String encodePathSegment(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8).replace("+", "%20");
    }

    private ToolResultPayload failure(String title, String message) {
        if(org.wwz.ai.domain.agent.runtime.tool.common.canvas.planner.UiPresentationRuntime.enabled(agentContext))
            return org.wwz.ai.domain.agent.runtime.tool.common.canvas.planner.UiPresentationRuntime.failure(agentContext,message);
        return ToolResultPayload.failure(
                message,
                message,
                CanvasPublishToolOutput.builder()
                        .title(title)
                        .mode(HTML_MODE)
                        .build(),
                message
        );
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

    private String stringVal(Object value) {
        if (value == null) {
            return null;
        }
        String s = String.valueOf(value).trim();
        return s.isEmpty() ? null : s;
    }
}
