package org.wwz.ai.domain.agent.runtime.tool.workspace;

import java.nio.file.Files;
import java.nio.file.Path;

/**
 * 解析包含 {@code research-tool} 的仓库根，避免 JVM {@code user.dir} 在 monorepo 上级启动时
 * 把 skilloutput 写到错误位置（如 {@code ai-agent/research-tool} 而非 {@code Research-agent/research-tool}）。
 */
public final class WorkspacePaths {

    private static final String RESEARCH_TOOL = "research-tool";
    private static final String REPO_DIR_NAME = "Research-agent";
    private static final String APP_MODULE = "Research-agent-app";

    private WorkspacePaths() {
    }

    /**
     * 返回应作为 {@code ${user.dir}} 展开结果的仓库根目录（其下应有 research-tool）。
     * <p>
     * 优先识别 monorepo 根（同时存在 research-tool 与 Research-agent-app），
     * 避免父目录下另有同名 research-tool 时误写。
     */
    public static Path resolveRepoRoot() {
        Path start = Path.of(System.getProperty("user.dir", ".")).toAbsolutePath().normalize();
        for (Path cursor = start; cursor != null; cursor = cursor.getParent()) {
            Path nested = cursor.resolve(REPO_DIR_NAME);
            if (isMonorepoRoot(nested)) {
                return nested.normalize();
            }
            if (isMonorepoRoot(cursor)) {
                return cursor.normalize();
            }
        }
        // Checkout names are user-defined. A classpath anchor also finds a checkout
        // when user.dir points to its parent and that parent has a research-tool folder.
        try {
            Path anchor = Path.of(WorkspacePaths.class.getProtectionDomain().getCodeSource().getLocation().toURI());
            for (Path cursor = anchor; cursor != null; cursor = cursor.getParent()) {
                if (isMonorepoRoot(cursor)) {
                    return cursor.normalize();
                }
            }
        } catch (java.net.URISyntaxException | java.nio.file.FileSystemNotFoundException | IllegalArgumentException ignored) {
            // Packaged/non-file classpaths still use the explicit working-directory fallback.
        }
        for (Path cursor = start; cursor != null; cursor = cursor.getParent()) {
            if (Files.isDirectory(cursor.resolve(RESEARCH_TOOL))) {
                return cursor.normalize();
            }
        }
        return start;
    }

    public static Path skillOutputSessionRoot(String sessionId) {
        String safe = (sessionId == null || sessionId.isBlank()) ? "anonymous" : sessionId;
        safe = safe.replaceAll("[\\\\/:*?\"<>|]", "_");
        return resolveRepoRoot().resolve(RESEARCH_TOOL).resolve("skilloutput").resolve(safe).normalize();
    }

    /**
     * bash / code_execution 推沙箱用的本地根：优先会话已解析的 workspaceRoot
     *（与 workspace_write 同一目录），未设置时回退 skilloutput/{sessionId}。
     */
    public static Path resolveSandboxRoot(String configuredRoot, String sessionId) {
        if (configuredRoot != null && !configuredRoot.isBlank()) {
            return Path.of(configuredRoot.trim()).toAbsolutePath().normalize();
        }
        return skillOutputSessionRoot(sessionId);
    }

    private static boolean isMonorepoRoot(Path path) {
        return path != null
                && Files.isDirectory(path)
                && Files.isDirectory(path.resolve(RESEARCH_TOOL))
                && Files.isDirectory(path.resolve(APP_MODULE));
    }
}
