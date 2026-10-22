import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { post } = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock("axios", () => ({ default: { post, create: () => ({
  interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
}) } }));
vi.mock("./utils", () => ({ jumpUrl: vi.fn(), showMessage: vi.fn() }));
vi.mock("@/services/agentConversation", () => ({ getDeviceId: () => "test" }));
vi.mock("./origin", () => ({ resolveServiceBaseUrl: () => "/backend" }));

const accessKey = "research.admin.access-token";
const refreshKey = "research.admin.refresh-token";
const payload = { data: { data: { accessToken: "new-access", refreshToken: "new-refresh", user: { username: "a" } } } };

describe("refresh coordination", () => {
  beforeEach(() => {
    vi.resetModules();
    post.mockReset();
    const values = new Map<string, string>([[accessKey, "old-access"], [refreshKey, "old-refresh"]]);
    vi.stubGlobal("localStorage", { getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) });
    vi.stubGlobal("SERVICE_BASE_URL", "/backend");
    let tail = Promise.resolve();
    vi.stubGlobal("navigator", { locks: { request: (_name: string, operation: () => Promise<unknown>) => {
      const next = tail.then(operation);
      tail = next.then(() => undefined, () => undefined);
      return next;
    } } });
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it("coalesces concurrent refreshes within one tab", async () => {
    post.mockResolvedValue(payload);
    const { refreshAccessToken } = await import("./request");
    expect(await Promise.all([refreshAccessToken(), refreshAccessToken()])).toEqual(["new-access", "new-access"]);
    expect(post).toHaveBeenCalledTimes(1);
  });

  it("serializes separate tabs and reuses the winner's credentials", async () => {
    post.mockResolvedValue(payload);
    const tabA = await import("./request");
    vi.resetModules();
    const tabB = await import("./request");
    expect(await Promise.all([tabA.refreshAccessToken(), tabB.refreshAccessToken()])).toEqual(["new-access", "new-access"]);
    expect(post).toHaveBeenCalledTimes(1);
  });

  it("does not restore credentials when logout happens during refresh", async () => {
    let finish!: (value: typeof payload) => void;
    post.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const { refreshAccessToken } = await import("./request");
    const result = refreshAccessToken();
    await vi.waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    localStorage.removeItem(accessKey); localStorage.removeItem(refreshKey);
    finish(payload);
    expect(await result).toBeNull();
    expect(localStorage.getItem(refreshKey)).toBeNull();
  });

  it("does not replace a new login with a late refresh response", async () => {
    let finish!: (value: typeof payload) => void;
    post.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const { refreshAccessToken } = await import("./request");
    const result = refreshAccessToken();
    await vi.waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    localStorage.setItem(accessKey, "other-access"); localStorage.setItem(refreshKey, "other-refresh");
    finish(payload);
    expect(await result).toBe("other-access");
    expect(localStorage.getItem(refreshKey)).toBe("other-refresh");
  });

  it("waits for the CAS winner when Web Locks are unavailable and the loser responds first", async () => {
    vi.stubGlobal("navigator", {});
    vi.stubGlobal("window", new EventTarget());
    let finish!: (value: typeof payload) => void;
    post.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }))
      .mockResolvedValueOnce({ data: { code: "0003", data: null } });
    const tabA = await import("./request");
    vi.resetModules();
    const tabB = await import("./request");
    const winner = tabA.refreshAccessToken();
    const loser = tabB.refreshAccessToken();
    let loserFinished = false;
    void loser.then(token => {
      loserFinished = true;
      // Match the interceptor's cleanup on an unsuccessful refresh.
      if (!token) { localStorage.removeItem(accessKey); localStorage.removeItem(refreshKey); }
    });
    await vi.waitFor(() => expect(post).toHaveBeenCalledTimes(2));
    expect(loserFinished).toBe(false);
    finish(payload);
    expect(await winner).toBe("new-access");
    window.dispatchEvent(new Event("storage"));
    expect(await loser).toBe("new-access");
    expect(localStorage.getItem(refreshKey)).toBe("new-refresh");
  });

  it("bounds the fallback wait when refresh is invalid and no other tab wins", async () => {
    vi.stubGlobal("navigator", {});
    vi.stubGlobal("window", new EventTarget());
    const remove = vi.spyOn(window, "removeEventListener");
    post.mockResolvedValue({ data: { code: "0003", data: null } });
    const { refreshAccessToken } = await import("./request");
    vi.useFakeTimers();
    const pending = refreshAccessToken();
    await vi.advanceTimersByTimeAsync(10000);
    expect(await pending).toBeNull();
    expect(remove).toHaveBeenCalledWith("storage", expect.any(Function));
    expect(vi.getTimerCount()).toBe(0);
  });
});
