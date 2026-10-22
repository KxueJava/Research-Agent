import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const get = vi.hoisted(() => vi.fn());
vi.mock("@/utils/request", () => ({ default: { get } }));
import { prepareHtmlPreview } from "./prepareHtmlPreview";
const fetchPreview = vi.fn();
beforeEach(() => {
  vi.stubGlobal("fetch", fetchPreview);
  fetchPreview.mockResolvedValue({ ok: true, headers: new Headers({ "content-type": "text/html" }), text: async () => "<h1>report</h1>" });
});

afterEach(() => { vi.clearAllMocks(); vi.unstubAllGlobals(); });
describe("authenticated HTML preview", () => {
  it("refreshes the file cookie through the authenticated client before navigating", async () => {
    vi.stubGlobal("window", { location: { href: "http://localhost:3001/" } });
    get.mockResolvedValue({ username: "test" });
    const controller = new AbortController();
    const html = await prepareHtmlPreview("http://localhost:3001/tool/v1/file_tool/preview/session/page.html", controller.signal);
    expect(get).toHaveBeenCalledWith("/api/v1/admin/admin-user/me", { signal: controller.signal });
    expect(html).toContain("<h1>report</h1>");
    expect(html).toContain("connect-src 'none'");
    expect(html?.indexOf("Content-Security-Policy")).toBeLessThan(html!.indexOf("<h1>"));
  });
  it("does not load a private preview after session preparation fails", async () => {
    vi.stubGlobal("window", { location: { href: "http://localhost:3001/" } });
    get.mockRejectedValue(new Error("expired"));
    await expect(prepareHtmlPreview("/tool/v1/file_tool/preview/session/page.html")).rejects.toThrow("expired");
    expect(fetchPreview).not.toHaveBeenCalled();
  });
  it("rejects an HTTP error instead of displaying an error JSON as a loaded document", async () => {
    vi.stubGlobal("window", { location: { href: "http://localhost:3001/" } });
    get.mockResolvedValue({});
    fetchPreview.mockResolvedValue({ ok: false, status: 403 });
    await expect(prepareHtmlPreview("/tool/v1/file_tool/preview/session/page.html")).rejects.toThrow("403");
  });
  it.each([undefined, "data:text/html,hello", "https://example.com/report.html", "https://foreign.test/tool/v1/file_tool/preview/x/a.html"])("never forwards login information to %s", async (url) => {
    vi.stubGlobal("window", { location: { href: "http://localhost:3001/" } });
    await prepareHtmlPreview(url);
    expect(get).not.toHaveBeenCalled();
  });
});
