package org.wwz.ai.test.domain;

import org.junit.Assert;
import org.junit.Test;
import org.wwz.ai.domain.agent.runtime.tool.workspace.WorkspacePaths;
import org.wwz.ai.domain.agent.runtime.tool.workspace.WorkspaceRuntimeOptions;
import org.wwz.ai.domain.agent.runtime.tool.workspace.WorkspaceService;

import java.nio.file.Files;
import java.nio.file.Path;

public class WorkspacePathsTest {

    @Test
    public void shouldFallbackToWorkingDirectoryForPackagedClasspath() throws Exception {
        byte[] bytes;
        try (var input = WorkspacePaths.class.getResourceAsStream("WorkspacePaths.class")) {
            Assert.assertNotNull(input);
            bytes = input.readAllBytes();
        }
        class PackagedLoader extends java.security.SecureClassLoader {
            Class<?> loadPackaged() throws Exception {
                var origin = new java.security.CodeSource(
                        java.net.URI.create("jar:file:/stage9-not-mounted.jar!/BOOT-INF/lib/domain.jar!/").toURL(),
                        (java.security.cert.Certificate[]) null);
                return defineClass(WorkspacePaths.class.getName(), bytes, 0, bytes.length, origin);
            }
        }
        String previous = System.getProperty("user.dir");
        Path working = Path.of("/stage9-runtime-without-source").toAbsolutePath().normalize();
        try {
            System.setProperty("user.dir", working.toString());
            var type = new PackagedLoader().loadPackaged();
            Assert.assertEquals(working, type.getMethod("resolveRepoRoot").invoke(null));
        } finally {
            System.setProperty("user.dir", previous);
        }
    }

    @Test
    public void shouldResolveRepoRootContainingResearchTool() {
        Path root = WorkspacePaths.resolveRepoRoot();
        Assert.assertTrue(Files.isDirectory(root.resolve("research-tool")));
    }

    @Test
    public void shouldExpandWorkspaceTemplateUnderRepoResearchTool() {
        WorkspaceService service = new WorkspaceService(
                WorkspaceRuntimeOptions.builder()
                        .enabled(true)
                        .rootTemplate("${user.dir}/research-tool/skilloutput/{sessionId}")
                        .build(),
                null,
                null,
                null
        );
        Path resolved = service.resolveRoot("session-align-001");
        Path expected = WorkspacePaths.resolveRepoRoot()
                .resolve("research-tool")
                .resolve("skilloutput")
                .resolve("session-align-001")
                .normalize();
        Assert.assertEquals(expected, resolved.normalize());
        Assert.assertTrue(Files.isDirectory(WorkspacePaths.resolveRepoRoot().resolve("Research-agent-app")));
        Assert.assertTrue(resolved.endsWith(Path.of("research-tool", "skilloutput", "session-align-001")));
    }

    @Test
    public void shouldKeepExplicitSharedVolumeWorkspaceRoot() {
        Path sharedRoot = Path.of("/data/skilloutput").toAbsolutePath().normalize();
        WorkspaceService service = new WorkspaceService(
                WorkspaceRuntimeOptions.builder()
                        .enabled(true)
                        .rootTemplate(sharedRoot + "/{sessionId}")
                        .build(),
                null,
                null,
                null
        );

        Assert.assertEquals(
                sharedRoot.resolve("session-shared-volume").normalize(),
                service.resolveRoot("session-shared-volume").normalize()
        );
    }

    @Test
    public void shouldPreferMonorepoWhenParentAlsoHasResearchTool() {
        String previous = System.getProperty("user.dir");
        try {
            Path monorepo = WorkspacePaths.resolveRepoRoot();
            Path parent = monorepo.getParent();
            Assert.assertNotNull(parent);
            System.setProperty("user.dir", parent.toString());
            Path resolved = WorkspacePaths.resolveRepoRoot();
            Assert.assertEquals(monorepo.normalize(), resolved.normalize());
        } finally {
            if (previous == null) {
                System.clearProperty("user.dir");
            } else {
                System.setProperty("user.dir", previous);
            }
        }
    }

    @Test
    public void shouldIgnoreSpringPreExpandedWrongUserDirSkilloutput() {
        Path monorepo = WorkspacePaths.resolveRepoRoot();
        Path parent = monorepo.getParent();
        Assert.assertNotNull(parent);
        // 模拟 Spring 已把 ${user.dir} 展开成 monorepo 上级目录
        String springExpanded = parent + "/research-tool/skilloutput/{sessionId}";
        WorkspaceService service = new WorkspaceService(
                WorkspaceRuntimeOptions.builder()
                        .enabled(true)
                        .rootTemplate(springExpanded)
                        .build(),
                null,
                null,
                null
        );
        Path resolved = service.resolveRoot("session-spring-preexpand");
        Path expected = monorepo.resolve("research-tool").resolve("skilloutput")
                .resolve("session-spring-preexpand").normalize();
        Assert.assertEquals(expected, resolved.normalize());
    }

    @Test
    public void shouldPreferConfiguredSandboxRootOverSkillOutputDefault() {
        Path configured = Path.of(System.getProperty("java.io.tmpdir"), "research-ws-align", "session-x")
                .toAbsolutePath()
                .normalize();
        Assert.assertEquals(
                configured,
                WorkspacePaths.resolveSandboxRoot(configured.toString(), "other-session"));
        Assert.assertEquals(
                WorkspacePaths.skillOutputSessionRoot("s1"),
                WorkspacePaths.resolveSandboxRoot("  ", "s1"));
    }
}
