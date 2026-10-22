import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("./adminUser", () => ({ adminUserApi: { me: vi.fn(async () => ({})) } }));
vi.mock("@/utils/authToken", () => ({ getAccessToken: () => "local-access" }));
import { githubAuth, GITHUB_ATTEMPT_KEY } from "./githubAuth";

describe("GitHub authorization redirect", () => {
  let storage: Map<string, string>;
  const fetchMock = vi.fn();
  beforeEach(() => {
    storage = new Map(); fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("sessionStorage", { getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) });
    vi.stubGlobal("window", { location: { origin: "http://localhost:3001", assign: vi.fn() } });
  });
  afterEach(() => vi.unstubAllGlobals());
  it("rejects a callback from another browser/tab without contacting the server", async () => {
    await expect(githubAuth.complete(new URLSearchParams("code=c&state=unexpected"))).rejects.toThrow("无效");
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("rejects a different callback origin and never redirects", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ code: "0000", data: {
      authorizationUrl: "https://github.com/login/oauth/authorize?state=s", state: "s", callbackOrigin: "http://127.0.0.1:3001" } }) });
    await expect(githubAuth.start("login")).rejects.toThrow("127.0.0.1");
    expect(storage.size).toBe(0);
  });
  it("exchanges the one-time code in the request body, never in an API URL", async () => {
    storage.set(GITHUB_ATTEMPT_KEY, JSON.stringify({ state: "s", action: "login" }));
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ code: "0000", data: { action: "login", auth: { accessToken: "a", refreshToken: "r" } } }) });
    await githubAuth.complete(new URLSearchParams("code=one-time-code&state=s"));
    expect(fetchMock.mock.calls[0][0]).toBe("/api/v1/admin/github/complete");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ code: "one-time-code", state: "s", error: null });
    expect(storage.has(GITHUB_ATTEMPT_KEY)).toBe(false);
    await expect(githubAuth.complete(new URLSearchParams("code=one-time-code&state=s"))).rejects.toThrow("无效");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
