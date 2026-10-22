import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("@/utils/authToken", () => ({ getAccessToken: () => "token" }));
vi.mock("@/utils/request", () => ({ refreshAccessToken: vi.fn(async () => "renewed") }));
vi.mock("./agentConversation", () => ({ getDeviceId: () => "device" }));
import { fetchHtmlSurface } from "./htmlSurface";
const doc = { kind: "html", schemaVersion: "rui/1", sessionId: "s", surfaceId: "a", messageId: "r", revision: 2, artifact: { title: "game", previewUrl: "http://localhost:1601/v1/file_tool/preview/s/a.html" } };
afterEach(() => vi.unstubAllGlobals());
describe("HTML version reads", () => {
  it("validates the requested revision and ownership metadata", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => doc })));
    expect((await fetchHtmlSurface("s", "a", 2)).revision).toBe(2);
    await expect(fetchHtmlSurface("s", "a", 1)).rejects.toThrow();
    await expect(fetchHtmlSurface("foreign", "a", 2)).rejects.toThrow();
  });
  it("refreshes expired access once before retrying and supports cancellation", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce({ status: 401, ok: false }).mockResolvedValue({ ok: true, json: async () => doc });
    vi.stubGlobal("fetch", fetcher);
    const controller = new AbortController();
    await fetchHtmlSurface("s", "a", 2, controller.signal);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[1][1].signal).toBe(controller.signal);
    expect(fetcher.mock.calls[1][1].headers.Authorization).toBe("Bearer renewed");
  });
});
