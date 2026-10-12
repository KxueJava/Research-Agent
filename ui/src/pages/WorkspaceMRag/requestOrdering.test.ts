import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Run the real hooks against a deterministic hook scheduler, without a browser
// or network. Effects are flushed after each render, as in a committed render.
const { hooks, api } = vi.hoisted(() => {
  let cursor = 0;
  let slots: any[] = [];
  let pending: Array<() => void> = [];
  const same = (a: unknown[] | undefined, b: unknown[] | undefined) =>
    a && b && a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
  return {
    hooks: {
      reset() { cursor = 0; slots = []; pending = []; },
      render<T>(run: () => T): T {
        cursor = 0;
        const value = run();
        const effects = pending; pending = [];
        effects.forEach((effect) => effect());
        return value;
      },
      unmount() { slots.forEach((slot) => slot?.cleanup?.()); },
      useState(initial: any) {
        const index = cursor++;
        slots[index] ??= { value: typeof initial === "function" ? initial() : initial };
        return [slots[index].value, (value: any) => {
          slots[index].value = typeof value === "function" ? value(slots[index].value) : value;
        }];
      },
      useRef(initial: any) { const index = cursor++; return slots[index] ??= { current: initial }; },
      useCallback(callback: any, deps: unknown[]) {
        const index = cursor++;
        if (!same(slots[index]?.deps, deps)) slots[index] = { deps, callback };
        return slots[index].callback;
      },
      useEffect(effect: () => void | (() => void), deps: unknown[]) {
        const index = cursor++;
        if (same(slots[index]?.deps, deps)) return;
        const previous = slots[index];
        slots[index] = { deps };
        pending.push(() => { previous?.cleanup?.(); slots[index].cleanup = effect(); });
      },
    },
    api: {
      listKnowledgeBases: vi.fn(), listKnowledgeBaseFiles: vi.fn(),
      getKnowledgeBaseFileFullContent: vi.fn(), addWebUrlToKnowledgeBase: vi.fn(),
      createKnowledgeBase: vi.fn(), deleteKnowledgeBase: vi.fn(),
      deleteKnowledgeBaseFiles: vi.fn(), ingestLocalFilesToKnowledgeBase: vi.fn(),
    },
  };
});
vi.mock("react", () => hooks);
vi.mock("antd", () => ({ Modal: { confirm: vi.fn() } }));
vi.mock("@/services/mragWorkspace", () => ({ ...api, mapMragError: (error: Error) => error.message }));
vi.mock("@/utils", () => ({ showMessage: () => ({ error: vi.fn(), success: vi.fn() }) }));
vi.mock("./utils", () => ({ MRAG_FILE_POLL_INTERVAL_MS: 2000, MRAG_FILE_REFRESH_DELAY_MS: 1000 }));

import { useKnowledgeBaseFiles } from "./useKnowledgeBaseFiles";
import { useKnowledgeBaseCatalog } from "./useKnowledgeBaseCatalog";

function deferred<T = any>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };
const file = (id: string) => ({ id, title: id, fileStatus: "SUCCESS" });
const content = (title: string) => ({ title, content: title, contentStatus: "READY", errorMessage: "" });

beforeEach(() => {
  hooks.reset();
  Object.values(api).forEach((mock) => mock.mockReset());
  api.listKnowledgeBaseFiles.mockResolvedValue([]);
  vi.stubGlobal("window", { setTimeout, clearTimeout });
});
afterEach(() => { hooks.unmount(); vi.unstubAllGlobals(); });

describe("knowledge base request ordering", () => {
  it.each([false, true])("切换 A 到 B 后忽略 A 的迟到响应（失败=%s）", async (fail) => {
    const a = deferred(); const b = deferred();
    api.listKnowledgeBaseFiles.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise);
    let selected = "A";
    const render = () => hooks.render(() => useKnowledgeBaseFiles("/tool", selected));
    render(); selected = "B"; render();
    b.resolve([file("B-file")]); await flush();
    if (fail) a.reject(new Error("old A failed")); else a.resolve([file("A-file")]);
    await flush();
    expect(render().files.map((item) => item.id)).toEqual(["B-file"]);
    expect(render().filesError).toBe("");
  });

  it("旧请求 finally 不关闭新请求 loading", async () => {
    const a = deferred(); const b = deferred();
    api.listKnowledgeBaseFiles.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise);
    let selected = "A";
    const render = () => hooks.render(() => useKnowledgeBaseFiles("/tool", selected));
    render(); selected = "B"; render();
    a.resolve([]); await flush();
    expect(render().filesLoading).toBe(true);
    b.resolve([]); await flush(); expect(render().filesLoading).toBe(false);
  });

  it("同一个库连续刷新只接受最后发起的请求", async () => {
    const render = () => hooks.render(() => useKnowledgeBaseFiles("/tool", "A"));
    render(); await flush();
    const old = deferred(); const latest = deferred();
    api.listKnowledgeBaseFiles.mockReturnValueOnce(old.promise).mockReturnValueOnce(latest.promise);
    const state = render();
    const first = state.refreshFiles("A"); const second = state.refreshFiles("A");
    latest.resolve([file("latest")]); await second;
    old.resolve([file("old")]); await first;
    expect(render().files.map((item) => item.id)).toEqual(["latest"]);
  });

  it("清空选中知识库后迟到响应不能恢复旧资料", async () => {
    const a = deferred(); api.listKnowledgeBaseFiles.mockReturnValueOnce(a.promise);
    let selected = "A";
    const render = () => hooks.render(() => useKnowledgeBaseFiles("/tool", selected));
    render(); selected = ""; render(); a.resolve([file("A-file")]); await flush();
    expect(render().files).toEqual([]); expect(render().filesLoading).toBe(false);
  });

  it("旧上传完成后不得发起旧库刷新", async () => {
    const upload = deferred(); api.ingestLocalFilesToKnowledgeBase.mockReturnValueOnce(upload.promise);
    let selected = "A";
    const render = () => hooks.render(() => useKnowledgeBaseFiles("/tool", selected));
    render(); await flush();
    const uploading = render().handleFileInputChange({ target: { files: [{}], value: "file" } } as any);
    selected = "B"; render(); await flush();
    const count = api.listKnowledgeBaseFiles.mock.calls.length;
    upload.resolve([]); await uploading;
    expect(api.listKnowledgeBaseFiles).toHaveBeenCalledTimes(count);
  });

  it("全文 X/Y 响应乱序不能覆盖当前 Y 详情", async () => {
    const render = () => hooks.render(() => useKnowledgeBaseFiles("/tool", "A"));
    render(); await flush();
    const x = deferred(); const y = deferred();
    api.getKnowledgeBaseFileFullContent.mockReturnValueOnce(x.promise).mockReturnValueOnce(y.promise);
    const first = render().handleOpenFullContent("X");
    const second = render().handleOpenFullContent("Y");
    y.resolve(content("Y")); await second; x.resolve(content("X")); await first;
    expect(render().fullContentTitle).toBe("Y");
    expect(render().activeFullContentFileId).toBe("Y");
  });

  it("关闭全文后迟到结果不得更新已关闭详情", async () => {
    const render = () => hooks.render(() => useKnowledgeBaseFiles("/tool", "A"));
    render(); await flush(); const request = deferred();
    api.getKnowledgeBaseFileFullContent.mockReturnValueOnce(request.promise);
    const reading = render().handleOpenFullContent("X");
    render().handleCloseFullContent(); request.resolve(content("old")); await reading;
    expect(render().fullContentMarkdown).toBe(""); expect(render().fullContentLoading).toBe(false);
  });

  it("目录旧响应不覆盖新目录，也不向调用方返回可用于选择的旧列表", async () => {
    const render = () => hooks.render(() => useKnowledgeBaseCatalog("/tool"));
    const old = deferred(); const latest = deferred();
    api.listKnowledgeBases.mockReturnValueOnce(old.promise).mockReturnValueOnce(latest.promise);
    const state = render();
    const first = state.refreshKnowledgeBases(); const second = state.refreshKnowledgeBases();
    latest.resolve([{ id: "new" }]); await second;
    old.resolve([{ id: "old" }]); expect(await first).toBeUndefined();
    expect(render().knowledgeBases.map((item) => item.id)).toEqual(["new"]);
  });

  it("工具地址切换后忽略旧目录错误及 loading 收口", async () => {
    let url = "/tool-a";
    const render = () => hooks.render(() => useKnowledgeBaseCatalog(url));
    const old = deferred(); const latest = deferred();
    api.listKnowledgeBases.mockReturnValueOnce(old.promise).mockReturnValueOnce(latest.promise);
    const first = render().refreshKnowledgeBases(); url = "/tool-b";
    const second = render().refreshKnowledgeBases();
    old.reject(new Error("old failure")); expect(await first).toBeUndefined();
    expect(render().knowledgeBasesError).toBe(""); expect(render().knowledgeBasesLoading).toBe(true);
    latest.resolve([]); await second;
  });

  it("旧全文错误不关闭正在加载的新全文", async () => {
    const render = () => hooks.render(() => useKnowledgeBaseFiles("/tool", "A"));
    render(); await flush();
    const x = deferred(); const y = deferred();
    api.getKnowledgeBaseFileFullContent.mockReturnValueOnce(x.promise).mockReturnValueOnce(y.promise);
    const first = render().handleOpenFullContent("X");
    const second = render().handleOpenFullContent("Y");
    x.reject(new Error("X failed")); await first;
    expect(render().fullContentLoading).toBe(true); expect(render().fullContentError).toBe("");
    y.resolve(content("Y")); await second;
    expect(render().fullContentMarkdown).toBe("Y");
  });

  it("切换知识库后旧全文不能填充新抽屉", async () => {
    let selected = "A";
    const render = () => hooks.render(() => useKnowledgeBaseFiles("/tool", selected));
    render(); await flush(); const old = deferred();
    api.getKnowledgeBaseFileFullContent.mockReturnValueOnce(old.promise);
    const reading = render().handleOpenFullContent("X");
    selected = "B"; render(); await flush(); old.resolve(content("X")); await reading;
    expect(render().fullContentMarkdown).toBe(""); expect(render().fullContentDrawerOpen).toBe(false);
  });

  it("切换 A/B/A 时不能接收第一次 A 的结果", async () => {
    const old = deferred(); api.listKnowledgeBaseFiles.mockReturnValueOnce(old.promise);
    let selected = "A";
    const render = () => hooks.render(() => useKnowledgeBaseFiles("/tool", selected));
    render(); selected = "B"; render(); await flush();
    api.listKnowledgeBaseFiles.mockResolvedValueOnce([file("new-A")]);
    selected = "A"; render(); await flush(); old.resolve([file("old-A")]); await flush();
    expect(render().files.map((item) => item.id)).toEqual(["new-A"]);
  });

  it("旧静默轮询不能覆盖最新主动刷新", async () => {
    const render = () => hooks.render(() => useKnowledgeBaseFiles("/tool", "A"));
    render(); await flush(); const poll = deferred(); const manual = deferred();
    api.listKnowledgeBaseFiles.mockReturnValueOnce(poll.promise).mockReturnValueOnce(manual.promise);
    const first = render().refreshFiles("A", { silent: true });
    const second = render().refreshFiles("A");
    manual.resolve([file("new")]); await second; poll.reject(new Error("stale poll")); await first;
    expect(render().files.map((item) => item.id)).toEqual(["new"]);
    expect(render().filesError).toBe("");
  });

  it("当前列表刷新失败仍显示错误并关闭加载", async () => {
    const render = () => hooks.render(() => useKnowledgeBaseFiles("/tool", "A"));
    render(); await flush(); api.listKnowledgeBaseFiles.mockRejectedValueOnce(new Error("current failed"));
    await render().refreshFiles("A");
    expect(render().filesError).toBe("current failed"); expect(render().filesLoading).toBe(false);
  });

  it("卸载后旧目录返回不会更新状态或给调用方返回旧数据", async () => {
    const old = deferred(); api.listKnowledgeBases.mockReturnValueOnce(old.promise);
    const render = () => hooks.render(() => useKnowledgeBaseCatalog("/tool"));
    const loading = render().refreshKnowledgeBases(); hooks.unmount();
    old.resolve([{ id: "old" }]); expect(await loading).toBeUndefined();
    expect(render().knowledgeBases).toEqual([]);
  });
});
