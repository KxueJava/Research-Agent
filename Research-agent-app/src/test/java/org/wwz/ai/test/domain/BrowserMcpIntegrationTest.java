package org.wwz.ai.test.domain;

import com.sun.net.httpserver.HttpServer;
import org.junit.Assume;
import org.junit.Test;
import org.springframework.test.util.ReflectionTestUtils;
import org.wwz.ai.domain.agent.adapter.repository.IAgentRepository;
import org.wwz.ai.domain.agent.model.valobj.AiClientToolMcpVO;
import org.wwz.ai.domain.agent.runtime.tool.mcp.runtime.*;
import java.lang.reflect.Proxy;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;
import static org.junit.Assert.*;

/** Opt in with -Dbrowser.mcp.integration=true after starting scripts/browser-mcp/start.ps1. */
public class BrowserMcpIntegrationTest {
    @Test public void registeredBrowserPreservesPageAcrossNavigationTypingClickAndScreenshot() throws Exception {
        Assume.assumeTrue(Boolean.getBoolean("browser.mcp.integration"));
        HttpServer fixture = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        fixture.createContext("/", exchange -> {
            byte[] html = ("<!doctype html><html><head><title>Research Browser Check</title></head><body>"
                    + "<h1>Browser integration check</h1><label for='q'>Research topic</label><input id='q'>"
                    + "<button onclick=\"document.getElementById('result').textContent=document.getElementById('q').value\">Run</button>"
                    + "<p id='result' role='status'>Waiting</p></body></html>").getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "text/html; charset=utf-8");
            exchange.sendResponseHeaders(200, html.length);
            try (var out = exchange.getResponseBody()) { out.write(html); }
        });
        fixture.start();
        var config = AiClientToolMcpVO.builder().mcpId("browser_playwright").mcpName("browser")
                .transportType("sse").requestTimeout(2)
                .transportConfigSse(AiClientToolMcpVO.TransportConfigSse.builder()
                        .baseUri("http://127.0.0.1:8931").sseEndpoint("/sse").build()).build();
        var repository = (IAgentRepository) Proxy.newProxyInstance(IAgentRepository.class.getClassLoader(),
                new Class[]{IAgentRepository.class}, (proxy, method, args) -> {
                    if (method.getName().equals("queryEnabledAiClientToolMcpVOList")) return List.of(config);
                    throw new UnsupportedOperationException(method.getName());
                });
        var registry = new McpRegistry();
        ReflectionTestUtils.setField(registry, "repository", repository);
        ReflectionTestUtils.setField(registry, "runtimeFactory", new McpClientRuntimeFactory());
        try {
            registry.preloadAllEnabledMcps();
            var names = registry.listGlobalEnabledTools().stream().map(tool -> tool.getOriginalName()).toList();
            for (String name : List.of("browser_navigate", "browser_snapshot", "browser_click", "browser_type", "browser_take_screenshot", "browser_close")) assertTrue(name, names.contains(name));
            String page = registry.executeTool("browser_playwright", "browser_navigate", Map.of("url", "http://127.0.0.1:" + fixture.getAddress().getPort() + "/"));
            assertTrue(page, page.contains("Research Browser Check"));
            page = registry.executeTool("browser_playwright", "browser_snapshot", Map.of());
            String input = ref(page, "textbox", "Research topic");
            String button = ref(page, "button", "Run");
            String typed = registry.executeTool("browser_playwright", "browser_type", Map.of("element", "Research topic", "target", input, "text", "Browser MCP ready"));
            assertFalse(typed, typed.contains(" Error."));
            String clicked = registry.executeTool("browser_playwright", "browser_click", Map.of("element", "Run", "target", button));
            assertFalse(clicked, clicked.contains(" Error."));
            String snapshot = registry.executeTool("browser_playwright", "browser_snapshot", Map.of());
            assertTrue(snapshot, Pattern.compile("status[^\\n]*: Browser MCP ready").matcher(snapshot).find());
            String image = registry.executeTool("browser_playwright", "browser_take_screenshot", Map.of("type", "png", "filename", "browser-smoke.png"));
            assertTrue(image, image.contains("browser-smoke.png"));
            assertFalse(image, image.contains(" Error."));
            System.out.println("Browser MCP: " + names.size() + " tools discovered; navigation/type/click/snapshot/screenshot passed.");
        } finally {
            registry.executeTool("browser_playwright", "browser_close", Map.of());
            @SuppressWarnings("unchecked")
            var runtimes = (Map<String, McpClientRuntime>) ReflectionTestUtils.getField(registry, "runtimeCache");
            if (runtimes != null) for (var runtime : runtimes.values()) runtime.getSyncClient().closeGracefully();
            fixture.stop(0);
        }
    }
    private String ref(String snapshot, String role, String name) {
        var matcher = Pattern.compile(role + " \\\"" + Pattern.quote(name) + "\\\" \\[ref=([^\\]]+)\\]").matcher(snapshot);
        assertTrue(snapshot, matcher.find());
        return matcher.group(1);
    }
}
