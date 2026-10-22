import { describe, expect, it } from "vitest";
import { readRuntimeMessage, instrumentHtmlRuntime } from "./runtimeBridge";
describe("isolated HTML telemetry bridge", () => {
  it("requires exact frame source, channel and current runtime identity", () => {
    const source = {};
    const data = { channel: "research-artifact/v1", runtimeId: "run-1", type: "ready" };
    expect(readRuntimeMessage({ source, data } as any, source as any, "run-1")?.type).toBe("ready");
    expect(readRuntimeMessage({ source: {}, data } as any, source as any, "run-1")).toBeNull();
    expect(readRuntimeMessage({ source, data } as any, source as any, "old")).toBeNull();
    expect(readRuntimeMessage({ source, data: { ...data, type: "tool.invoke" } } as any, source as any, "run-1")).toBeNull();
  });
  it("bounds runtime error text and rejects non-object messages", () => {
    const source = {};
    const message = readRuntimeMessage({ source, data: { channel: "research-artifact/v1", runtimeId: "a", type: "error", message: "x".repeat(2000) } } as any, source as any, "a");
    expect(message?.message?.length).toBeLessThanOrEqual(500);
    expect(readRuntimeMessage({ source, data: "bad" } as any, source as any, "a")).toBeNull();
  });
  it("inserts a lifecycle bridge before generated scripts and escapes runtime identifiers", () => {
    const html = instrumentHtmlRuntime("<script>game()</script>", '</script><script>evil()</script>');
    expect(html.indexOf("research-artifact/v1")).toBeLessThan(html.indexOf("game()"));
    expect(html).not.toContain('</script><script>evil()');
    expect(html).toContain("pagehide");
    expect(html).toContain("dispose");
  });
});
