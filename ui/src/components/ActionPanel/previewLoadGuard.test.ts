import { afterEach, describe, expect, it, vi } from "vitest";
import { createPreviewLoadGuard, PREVIEW_LOAD_TIMEOUT_MS } from "./previewLoadGuard";

afterEach(() => vi.useRealTimers());

describe("HTML preview navigation recovery", () => {
  it("recreates a stalled frame once, then reports timeout instead of spinning forever", () => {
    vi.useFakeTimers();
    const retry = vi.fn();
    const timeout = vi.fn();
    createPreviewLoadGuard(retry, timeout);
    vi.advanceTimersByTime(PREVIEW_LOAD_TIMEOUT_MS);
    expect(retry).toHaveBeenCalledTimes(1);
    expect(timeout).not.toHaveBeenCalled();
    vi.advanceTimersByTime(PREVIEW_LOAD_TIMEOUT_MS * 3);
    expect(retry).toHaveBeenCalledTimes(1);
    expect(timeout).toHaveBeenCalledTimes(1);
  });

  it("a completed navigation cancels recovery", () => {
    vi.useFakeTimers();
    const retry = vi.fn();
    const timeout = vi.fn();
    const guard = createPreviewLoadGuard(retry, timeout);
    guard.finish();
    vi.runAllTimers();
    expect(retry).not.toHaveBeenCalled();
    expect(timeout).not.toHaveBeenCalled();
  });

  it("a successful retry cancels the final deadline", () => {
    vi.useFakeTimers();
    const timeout = vi.fn();
    const guard = createPreviewLoadGuard(vi.fn(), timeout);
    vi.advanceTimersByTime(PREVIEW_LOAD_TIMEOUT_MS);
    guard.finish();
    vi.runAllTimers();
    expect(timeout).not.toHaveBeenCalled();
  });

  it("unmounting or changing files cancels the old navigation", () => {
    vi.useFakeTimers();
    const retry = vi.fn();
    const timeout = vi.fn();
    const guard = createPreviewLoadGuard(retry, timeout);
    guard.dispose();
    vi.runAllTimers();
    expect(retry).not.toHaveBeenCalled();
    expect(timeout).not.toHaveBeenCalled();
  });
});
