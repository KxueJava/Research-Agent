import { beforeEach, describe, expect, it, vi } from "vitest";

const { getMock } = vi.hoisted(() => ({ getMock: vi.fn() }));
vi.mock("./index", () => ({ default: { get: getMock } }));

import { loadSuggestedPrompts } from "./suggestedPrompts";

const fallback = [{ label: "原有推荐" }];
const items = Array.from({ length: 5 }, (_, index) => ({ label: `新推荐${index}` }));

describe("daily suggested prompts", () => {
  beforeEach(() => getMock.mockReset());

  it("loads the shared batch from a read-only endpoint", async () => {
    getMock.mockResolvedValue({ date: "2026-10-10", items });
    expect(await loadSuggestedPrompts("task", fallback)).toEqual(items);
    expect(getMock).toHaveBeenCalledWith("/web/suggested-prompts", { productType: "task" }, expect.any(Object));
  });

  it("keeps current examples when unavailable, empty, malformed or duplicated", async () => {
    for (const response of [null, { items: [] }, { items: [{ label: "" }] }, { items: [...items.slice(0, 4), items[0]] }]) {
      getMock.mockResolvedValueOnce(response);
      expect(await loadSuggestedPrompts("task", fallback)).toBe(fallback);
    }
    getMock.mockRejectedValueOnce(new Error("offline"));
    expect(await loadSuggestedPrompts("task", fallback)).toBe(fallback);
  });

  it("does not request or replace dataAgent examples", async () => {
    expect(await loadSuggestedPrompts("dataAgent", fallback)).toBe(fallback);
    expect(getMock).not.toHaveBeenCalled();
  });
});
