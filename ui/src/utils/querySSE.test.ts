import { beforeEach, describe, expect, it, vi } from "vitest";

const { fetchEventSourceMock } = vi.hoisted(() => ({ fetchEventSourceMock: vi.fn(), }));
const { refreshAccessTokenMock, noAuthMock } = vi.hoisted(() => ({
  refreshAccessTokenMock: vi.fn(), noAuthMock: vi.fn(),
}));
vi.mock("./request", () => ({
  refreshAccessToken: refreshAccessTokenMock, noAuth: noAuthMock,
}));

vi.mock("@microsoft/fetch-event-source", () => ({ fetchEventSource: fetchEventSourceMock, }));

import querySSE from "./querySSE";

const createConfig = (overrides: Record<string, unknown> = {}) => ({
  body: { requestId: "request-1" },
  handleMessage: vi.fn(),
  handleError: vi.fn(),
  handleClose: vi.fn(),
  ...overrides,
});

describe("querySSE", () => {
  beforeEach(() => {
    fetchEventSourceMock.mockReset();
    fetchEventSourceMock.mockResolvedValue(undefined);
    refreshAccessTokenMock.mockReset();
    refreshAccessTokenMock.mockResolvedValue(null);
    noAuthMock.mockReset();
  });

  it("默认不重发 POST，并在页面隐藏时保持 SSE 连接", () => {
    const config = createConfig();

    querySSE(config);

    const options = fetchEventSourceMock.mock.calls[0][1] as {
      onerror: (error: Error) => unknown;
      openWhenHidden: boolean;
    };

    expect(options.openWhenHidden).toBe(true);
    expect(() => options.onerror(new Error("network disconnected"))).toThrow(
      "network disconnected"
    );
    expect(config.handleError).not.toHaveBeenCalled();
  });

  it("HTTP SSE 响应建立后通知调用方", () => {
    const handleOpen = vi.fn();
    const config = createConfig({ handleOpen });

    querySSE(config);

    const options = fetchEventSourceMock.mock.calls[0][1] as {
      onopen: (response: Response) => void;
    };
    options.onopen(new Response("", { headers: { "Content-Type": "text/event-stream; charset=utf-8" } }));

    expect(handleOpen).toHaveBeenCalledTimes(1);
  });

  it("收到带 id 的事件时保存事件游标", () => {
    const handleEventId = vi.fn();
    const config = createConfig({ handleEventId });

    querySSE(config);

    const options = fetchEventSourceMock.mock.calls[0][1] as {
      onmessage: (event: { id: string; data: string }) => void;
    };
    options.onmessage({
      id: "event-7",
      data: JSON.stringify({ value: 1 }),
    });

    expect(handleEventId).toHaveBeenCalledWith("event-7");
    expect(config.handleMessage).toHaveBeenCalledWith({ value: 1 });
  });

  it("单条 SSE 帧解析失败不冒充连接断开", () => {
    const config = createConfig({
      parser: () => {
        throw new Error("invalid frame");
      },
    });

    querySSE(config);

    const options = fetchEventSourceMock.mock.calls[0][1] as {
      onmessage: (event: { id: string; data: string }) => void;
    };
    options.onmessage({
      id: "event-invalid",
      data: JSON.stringify({ value: 1 })
    });

    expect(config.handleError).not.toHaveBeenCalled();
  });

  it("主动 abort 不进入业务错误回调", async () => {
    fetchEventSourceMock.mockRejectedValueOnce(
      new DOMException("aborted", "AbortError")
    );
    const config = createConfig();

    querySSE(config);
    await Promise.resolve();

    expect(config.handleError).not.toHaveBeenCalled();
  });

  it.each([
    [401, "application/json"], [403, "application/json"],
    [500, "text/event-stream"], [200, "application/json"],
    [200, "text/html"], [200, "text/event-stream-invalid"],
    [200, ""],
  ])("拒绝无效握手 %s / %s，只报告一次错误且不报告打开或关闭", async (status, contentType) => {
    fetchEventSourceMock.mockImplementationOnce(async (_url, options) => {
      try {
        await options.onopen(new Response("", { status, headers: { "Content-Type": contentType } }));
        options.onclose();
      } catch (error) {
        options.onerror(error);
      }
    });
    const handleOpen = vi.fn();
    const config = createConfig({ handleOpen, retryOnError: true });
    querySSE(config);
    await vi.waitFor(() => expect(config.handleError).toHaveBeenCalledTimes(1));
    expect(handleOpen).not.toHaveBeenCalled();
    expect(config.handleClose).not.toHaveBeenCalled();
    expect(fetchEventSourceMock).toHaveBeenCalledTimes(1);
  });

  it("401 刷新失败走登录失效流程", async () => {
    querySSE(createConfig());
    const options = fetchEventSourceMock.mock.calls[0][1];
    await expect(options.onopen(new Response(null, { status: 401 }))).rejects.toThrow("登录");
    expect(refreshAccessTokenMock).toHaveBeenCalledTimes(1);
    expect(noAuthMock).toHaveBeenCalledTimes(1);
  });

  it("401 刷新成功保留认证并要求手动重试，不重发任务", async () => {
    refreshAccessTokenMock.mockResolvedValue("new-token");
    querySSE(createConfig());
    const options = fetchEventSourceMock.mock.calls[0][1];
    await expect(options.onopen(new Response(null, { status: 401 }))).rejects.toThrow("重试");
    expect(noAuthMock).not.toHaveBeenCalled();
    expect(fetchEventSourceMock).toHaveBeenCalledTimes(1);
  });

  it("非 Error 的请求异常仍通知业务层", async () => {
    fetchEventSourceMock.mockRejectedValueOnce("network failed");
    const config = createConfig();
    querySSE(config);
    await vi.waitFor(() => expect(config.handleError).toHaveBeenCalledTimes(1));
    expect(config.handleError.mock.calls[0][0]).toBeInstanceOf(Error);
  });

  it("没有响应体的 SSE 不被标记为已建立", async () => {
    const handleOpen = vi.fn();
    querySSE(createConfig({ handleOpen }));
    const options = fetchEventSourceMock.mock.calls[0][1];
    await expect(options.onopen(new Response(null, {
      headers: { "Content-Type": "text/event-stream" },
    }))).rejects.toThrow("SSE");
    expect(handleOpen).not.toHaveBeenCalled();
  });

  it("主动取消后的普通网络异常也不报告任务失败", async () => {
    const controller = new AbortController();
    fetchEventSourceMock.mockRejectedValueOnce(new Error("network failed"));
    const config = createConfig({ signal: controller.signal });
    querySSE(config);
    controller.abort();
    await Promise.resolve();
    expect(config.handleError).not.toHaveBeenCalled();
  });
});
