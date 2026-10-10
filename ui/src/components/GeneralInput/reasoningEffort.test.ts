import { describe, expect, it } from "vitest";
import { getReasoningLevels, normalizeReasoningEffort, supportsModelThinking } from "./reasoningEffort";

describe("reasoning effort model compatibility", () => {
  it("keeps Terra reasoning controls visible with the legacy unconfigured zero flag", () => {
    expect(supportsModelThinking("gpt-5.6-terra", "terra", 0, [])).toBe(true);
    expect(supportsModelThinking("gpt-6-luna", "luna", 0)).toBe(true);
  });

  it("prioritizes declared capabilities while hiding models without reasoning information", () => {
    expect(supportsModelThinking("custom-model", "custom", 0, ["low", "high"])).toBe(true);
    expect(supportsModelThinking("custom-model", "custom", 1)).toBe(true);
    expect(supportsModelThinking("gpt-4o", "chat", 0, [])).toBe(false);
    expect(supportsModelThinking("custom-model", "custom", undefined)).toBe(false);
    expect(getReasoningLevels("gpt-5.6-terra", "terra", ["low", "medium", "high"])).toEqual(["low", "medium", "high"]);
  });
  it("hides Ultra for Luna models", () => {
    expect(getReasoningLevels("gpt-5.6-luna")).toEqual(["low", "medium", "high", "max"]);
  });

  it("keeps Ultra for models without a Luna marker", () => {
    const levels = getReasoningLevels("gpt-5.6-sol");
    expect(levels[levels.length - 1]).toBe("ultra");
  });

  it("falls back to the strongest available level when the stored value is unsupported", () => {
    expect(normalizeReasoningEffort("ultra", ["low", "medium", "high", "max"])).toBe("max");
  });

  it("uses declared levels in slider order without adding unsupported levels", () => {
    expect(getReasoningLevels("gpt-6-sol", "sol", ["high", "low", "low", "xhigh"]))
      .toEqual(["low", "high"]);
    expect(getReasoningLevels("gpt-6-luna", "luna", ["medium"]))
      .toEqual(["medium"]);
  });

  it("does not invent levels when a declaration only contains unknown values", () => {
    expect(getReasoningLevels("gpt-6-sol", "sol", ["custom"])).toEqual([]);
    expect(normalizeReasoningEffort("ultra", [])).toBeNull();
  });

  it("normalizes stored and reset values into the declared levels", () => {
    expect(normalizeReasoningEffort("max", ["low", "high"])).toBe("high");
    expect(normalizeReasoningEffort(null, ["low", "high"])).toBe("high");
    expect(normalizeReasoningEffort("low", ["high"])).toBe("high");
  });
});
