import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  normalizeAction,
  dispatchGenUiAction,
  registerGenUiActionAdapters,
  resetGenUiActionAdapters,
} from "./genUiActionBus";

describe("genUiActionBus", () => {
  it("releases adapter closures on unmount without reviving an already removed bridge",async()=>{
    const a=vi.fn(),b=vi.fn(),removeA=registerGenUiActionAdapters({setState:a}),removeB=registerGenUiActionAdapters({setState:b});
    const action={type:"set_state",payload:{nodeId:"x",value:1}};
    removeA();await dispatchGenUiAction(action,{sessionId:"s",surfaceId:"a",nodeId:"button"});expect(b).toHaveBeenCalledTimes(1);expect(a).not.toHaveBeenCalled();
    removeB();expect((await dispatchGenUiAction(action,{sessionId:"s",surfaceId:"a",nodeId:"button"})).ok).toBe(false);
  });
  it("dispatches declared local state within the same Surface without messaging",async()=>{
    const setState=vi.fn(),sendMessage=vi.fn();registerGenUiActionAdapters({setState,sendMessage});
    expect((await dispatchGenUiAction({type:"set_state",payload:{nodeId:"filter",value:""}},{sessionId:"s",surfaceId:"a",nodeId:"reset"})).ok).toBe(true);
    expect(setState).toHaveBeenCalledWith({nodeId:"filter",value:""},expect.objectContaining({surfaceId:"a"}));expect(sendMessage).not.toHaveBeenCalled();
    expect(normalizeAction({type:"set_state",payload:{nodeId:"__proto__",value:"x"}})).toBeNull();
  });
  beforeEach(() => {
    resetGenUiActionAdapters();
  });

  it("does not treat bare actionId as send_message", () => {
    expect(normalizeAction("click me")).toBeNull();
    expect(normalizeAction(undefined, { actionId: "hello" })).toBeNull();
  });
  it("rejects script URLs including embedded control characters",()=>{
    for(const url of ["javascript:alert(1)","java\nscript:alert(1)","data:text/html,bad","file:///secret"]) {
      expect(normalizeAction({type:"open_url",payload:{url}})).toBeNull();
      expect(normalizeAction({type:"navigate",payload:{route:url}})).toBeNull();
    }
    expect(normalizeAction({type:"navigate",payload:{route:"//evil.invalid"}})).toBeNull();
    expect(normalizeAction({type:"navigate",payload:{route:"/workspace/models"}})?.type).toBe("navigate");
  });

  it("normalizes explicit send_message only", () => {
    expect(
      normalizeAction({ type: "send_message", payload: { content: "hi" } })
    ).toEqual({ type: "send_message", payload: { content: "hi" } });
  });

  it("normalizes patch_ui", () => {
    const action = normalizeAction({
      type: "patch_ui",
      payload: {
        patches: [{ op: "replace", path: "/root/props/title", value: "X" }],
      },
    });
    expect(action?.type).toBe("patch_ui");
  });

  it("dispatches patch_ui to adapter, not sendMessage", async () => {
    const patchUi = vi.fn();
    const sendMessage = vi.fn();
    registerGenUiActionAdapters({ patchUi, sendMessage });
    const result = await dispatchGenUiAction({
      type: "patch_ui",
      payload: {
        patches: [{ op: "replace", path: "/root/props/title", value: "Y" }],
      },
    });
    expect(result).toEqual({ ok: true, type: "patch_ui" });
    expect(patchUi).toHaveBeenCalledTimes(1);
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("returns invalid when action cannot be normalized", async () => {
    const result = await dispatchGenUiAction("bare-string");
    expect(result).toEqual({ ok: false, reason: "invalid" });
  });
});

