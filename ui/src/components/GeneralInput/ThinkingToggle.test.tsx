import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import ThinkingToggle from "./ThinkingToggle";
import { buildAgentStreamRequest } from "@/utils/agentRequest";

const captured = vi.hoisted(() => ({ content: null as any }));
vi.mock("antd", () => ({ Popover: ({ content, children }: any) => {
  captured.content = content;
  return <>{children}{content}</>;
} }));

function findProps(node: any, match: (props: any) => boolean): any {
  if (!React.isValidElement(node)) return undefined;
  const props = node.props as any;
  if (match(props)) return props;
  for (const child of React.Children.toArray(props.children)) {
    const result = findProps(child, match);
    if (result) return result;
  }
}

function render(thinking = false, levels: readonly ("low" | "medium" | "high" | "max" | "ultra")[] = ["low", "high"]) {
  const onChange = vi.fn();
  const html = renderToStaticMarkup(<ThinkingToggle supported thinking={thinking} effort="ultra" levels={levels} onChange={onChange} open onOpenChange={vi.fn()} />);
  return { html, onChange };
}

describe("reasoning controls", () => {
  it("restores Off and preserves the disabled state when adjusting or resetting effort", () => {
    const { html, onChange } = render();
    expect(html).toContain("Reasoning effort: Off");
    const slider = findProps(captured.content, (props) => props.type === "range");
    slider.onKeyDown({ key: "End", preventDefault: vi.fn() });
    expect(onChange).toHaveBeenLastCalledWith(false, "high");
    findProps(captured.content, (props) => props["aria-label"] === "Reset reasoning effort").onClick();
    expect(onChange).toHaveBeenLastCalledWith(false, "high");
  });

  it("explicitly turns reasoning off and omits effort from the next request", () => {
    const { onChange } = render(true);
    findProps(captured.content, (props) => props.role === "switch").onClick();
    expect(onChange).toHaveBeenLastCalledWith(false, "high");
    const [thinking, thinkingEffort] = onChange.mock.calls[0];
    const request = buildAgentStreamRequest({ sessionId: "s", requestId: "r", message: "next", deepThink: false, thinking, thinkingEffort });
    expect(request.thinking).toBe(false);
    expect(request).not.toHaveProperty("thinkingEffort");
  });

  it("reenables only through the explicit switch and uses an allowed level", () => {
    const { onChange } = render(false);
    findProps(captured.content, (props) => props.role === "switch").onClick();
    expect(onChange).toHaveBeenLastCalledWith(true, "high");
  });

  it("does not create phantom levels for single or empty declarations", () => {
    render(true, ["high"]);
    expect(findProps(captured.content, (props) => props.type === "range")).toMatchObject({ max: 0, disabled: true });
    render(true, []);
    expect(findProps(captured.content, (props) => props.type === "range")).toBeUndefined();
  });
});
