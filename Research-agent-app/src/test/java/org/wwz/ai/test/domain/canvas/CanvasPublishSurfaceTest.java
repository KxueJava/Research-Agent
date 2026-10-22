package org.wwz.ai.test.domain.canvas;

import org.junit.*;
import org.junit.rules.TemporaryFolder;
import org.springframework.test.util.ReflectionTestUtils;
import org.wwz.ai.domain.agent.adapter.port.FileArtifactPort;
import org.wwz.ai.domain.agent.research.config.ResearchConfig;
import org.wwz.ai.domain.agent.runtime.ResearchRuntimeDependencies;
import org.wwz.ai.domain.agent.runtime.agent.AgentContext;
import org.wwz.ai.domain.agent.runtime.artifact.ToolArtifactSource;
import org.wwz.ai.domain.agent.runtime.tool.ToolResultPayload;
import org.wwz.ai.domain.agent.runtime.tool.common.canvas.*;
import org.wwz.ai.domain.agent.ledger.model.tooloutput.CanvasPublishToolOutput;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.atomic.AtomicLong;
import static org.junit.Assert.*;
import static org.mockito.Mockito.*;

public class CanvasPublishSurfaceTest {
    @Rule public TemporaryFolder temp=new TemporaryFolder();
    @Test public void publishesImmutableVersionsAndPreservesSourceFileIdentity() throws Exception {
        Path root=temp.getRoot().toPath();Files.writeString(root.resolve("game.html"),"<h1>V1</h1>");
        var config=new ResearchConfig();ReflectionTestUtils.setField(config,"codeInterpreterUrl","http://127.0.0.1:1601");
        var port=mock(FileArtifactPort.class);var store=mock(UiSurfaceStore.class);var revision=new AtomicLong();
        when(store.publishArtifact(anyString(),anyString(),anyString(),anyMap())).thenAnswer(call->{
            Map<String,Object> artifact=call.getArgument(3);
            return Map.of("kind","html","surfaceId",artifact.get("surfaceId"),"sessionId","s","revision",revision.incrementAndGet(),"artifact",artifact);
        });
        var context=AgentContext.builder().sessionId("s").requestId("r1").workspaceRoot(root.toString())
            .runtimeDependencies(ResearchRuntimeDependencies.builder().researchConfig(config).fileArtifactPort(port).uiSurfaceStore(store).build()).build();
        var tool=new CanvasPublishTool();tool.setAgentContext(context);
        context.bindCurrentToolArtifactSource(ToolArtifactSource.builder().toolCallId("h1").build());
        var first=(ToolResultPayload)tool.execute(Map.of("html_path","game.html","open_in_panel",false));
        assertFalse(String.valueOf(first.getLlmData()),first.getFailed());
        var a=((CanvasPublishToolOutput)first.getStructuredOutput()).getSurface();
        var aRef=(Map<?,?>)a.get("artifact");String pathA=(String)aRef.get("snapshotPath");
        Files.writeString(root.resolve("game.html"),"<h1>V2</h1>");
        context.bindCurrentToolArtifactSource(ToolArtifactSource.builder().toolCallId("h2").build());
        var second=(ToolResultPayload)tool.execute(Map.of("html_path","game.html","open_in_panel",false));
        assertFalse(second.getFailed());var b=((CanvasPublishToolOutput)second.getStructuredOutput()).getSurface();
        assertEquals(a.get("surfaceId"),b.get("surfaceId"));assertEquals(2L,b.get("revision"));
        assertEquals("<h1>V1</h1>",Files.readString(root.resolve(pathA)));
        assertNotEquals(aRef.get("sha256"),((Map<?,?>)b.get("artifact")).get("sha256"));
        assertEquals("<h1>V2</h1>",Files.readString(root.resolve("game.html")));
        verify(port,times(2)).register(anyString(),any());
    }
}
