package org.wwz.ai.domain.agent.ledger;

import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.wwz.ai.domain.agent.runtime.tool.workspace.WorkspacePaths;
import org.wwz.ai.domain.agent.runtime.tool.workspace.WorkspaceRuntimeOptions;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Comparator;
import java.util.stream.Stream;

/**
 * 会话硬删除时同步清理磁盘工作区（{@code skilloutput/{sessionId}}）。
 * <p>
 * 独立于数据库事务：只能在事务提交成功后调用。文件删除失败只记日志，
 * 不回滚数据库——账号里已经不存在的会话不应因为目录删不掉而复活。
 */
@Slf4j
@Component
public class ConversationWorkspaceCleaner {

    private final WorkspaceRuntimeOptions workspaceRuntimeOptions;

    public ConversationWorkspaceCleaner(WorkspaceRuntimeOptions workspaceRuntimeOptions) {
        this.workspaceRuntimeOptions = workspaceRuntimeOptions;
    }

    /**
     * @return 实际删除了目录返回 true；目录不存在或模板不可信返回 false
     */
    public boolean deleteSessionWorkspace(String sessionId) {
        Path sessionRoot = resolveSessionRoot(sessionId);
        if (sessionRoot == null || !Files.isDirectory(sessionRoot)) {
            return false;
        }
        try (Stream<Path> paths = Files.walk(sessionRoot)) {
            paths.sorted(Comparator.reverseOrder()).forEach(path -> {
                try {
                    Files.deleteIfExists(path);
                } catch (IOException e) {
                    log.warn("删除会话工作区条目失败 path={} reason={}", path, e.getMessage());
                }
            });
            log.info("会话工作区已清理 sessionId={} path={}", sessionId, sessionRoot);
            return true;
        } catch (IOException e) {
            log.warn("遍历会话工作区失败 sessionId={} reason={}", sessionId, e.getMessage());
            return false;
        }
    }

    private Path resolveSessionRoot(String sessionId) {
        if (sessionId == null || sessionId.isBlank()) {
            return null;
        }
        String safe = sessionId.replaceAll("[\\\\/:*?\"<>|]", "_");
        String template = workspaceRuntimeOptions.getRootTemplate();
        Path resolved;
        if (template == null || template.isBlank()) {
            resolved = WorkspacePaths.skillOutputSessionRoot(sessionId);
        } else {
            String expanded = template
                    .replace("{repoRoot}", WorkspacePaths.resolveRepoRoot().toString())
                    .replace("{sessionId}", safe);
            resolved = Path.of(expanded).toAbsolutePath().normalize();
        }
        // 只允许删除以 sessionId 命名的目录：模板配错时宁可漏删，也不能误删共享根
        if (!safe.equals(resolved.getFileName() == null ? null : resolved.getFileName().toString())) {
            log.warn("会话工作区模板未落在 sessionId 目录，跳过清理 template={} sessionId={}",
                    template, sessionId);
            return null;
        }
        return resolved;
    }
}
