import { describe, expect, it } from "vitest";
import { describeModelChange, selectConversationModel, submitConversationModel, type ConversationModelConfig, type ConversationModelState } from "./conversationModelConfig";
import { buildAgentStreamRequest } from "./agentRequest";

const sol: ConversationModelConfig = { model: "sol", modelLabel: "GPT-6.1 Sol", thinking: true, thinkingEffort: "medium" };
const terra: ConversationModelConfig = { model: "terra", modelLabel: "GPT-5.6 Terra", thinking: true, thinkingEffort: "max" };
const initial: ConversationModelState = { selected: sol, submitted: sol, history: [] };

describe("conversation model changes", () => {
  it("keeps the current run unchanged and applies both parameters to the next request", () => {
    const current = buildAgentStreamRequest({ sessionId: "s", requestId: "first", message: "first", deepThink: false, ...sol });
    const selected = selectConversationModel(initial, terra, "first");
    expect(selected.submitted).toEqual(sol);
    expect(current.model).toBe("sol");
    expect(current.thinkingEffort).toBe("medium");
    const next = buildAgentStreamRequest({ sessionId: "s", requestId: "second", message: "second", deepThink: false, ...selected.selected });
    expect(next.model).toBe("terra");
    expect(next.thinkingEffort).toBe("max");
    const submitted = submitConversationModel(selected, terra);
    expect(submitted.pending).toBeUndefined();
    expect(submitted.history).toEqual([{ afterRequestId: "first", from: sol, to: terra, previousSelection: undefined }]);
  });

  it("coalesces consecutive changes and cancels when the user returns to the previous configuration", () => {
    const selected = selectConversationModel(initial, terra, "first");
    const adjusted = selectConversationModel(selected, { ...terra, thinkingEffort: "high" }, "first");
    expect(adjusted.pending?.from).toEqual(sol);
    expect(adjusted.history).toHaveLength(0);
    expect(selectConversationModel(adjusted, sol, "first").pending).toBeUndefined();
  });

  it("does not fabricate a switch on hydration and survives serialized restoration", () => {
    const hydrated = selectConversationModel({ history: [] }, sol, "old-request");
    expect(hydrated.pending).toBeUndefined();
    const pending = selectConversationModel(hydrated, terra, "old-request");
    const restored = JSON.parse(JSON.stringify(pending));
    expect(describeModelChange(restored.pending)).toContain("模型已选择 GPT-5.6 Terra");
    expect(describeModelChange(restored.pending)).toContain("推理强度已选择 max");
    expect(selectConversationModel(restored, sol, "old-request").pending).toBeUndefined();
  });

  it("only records reasoning changes when the model is unchanged", () => {
    const selected = selectConversationModel(initial, { ...sol, thinkingEffort: "high" }, "first");
    expect(describeModelChange(selected.pending!)).toBe("推理强度已从 medium 更改为 high。");
  });
});
