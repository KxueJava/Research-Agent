import { runInNewContext } from "node:vm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { instrumentHtmlRuntime } from "./runtimeBridge";

function boot(blockStorage = false) {
  const handlers = new Map<string, Set<(event: any) => void>>();
  const reports: any[] = [];
  const parent = { postMessage: (data: any) => reports.push(data) };
  const animation = { playState: "running", pause: vi.fn(), play: vi.fn(), cancel: vi.fn() };
  const media = { paused: false, pause: vi.fn(), play: vi.fn().mockResolvedValue(undefined) };
  const contexts: any[] = [];
  class AudioContext {
    suspend = vi.fn().mockResolvedValue(undefined);
    resume = vi.fn().mockResolvedValue(undefined);
    close = vi.fn().mockResolvedValue(undefined);
    constructor() { contexts.push(this); }
  }
  class Animation {
    playState = "running";
    pause() { this.playState = "paused"; }
    play() { this.playState = "running"; }
    cancel() { this.playState = "idle"; }
  }
  class Element { animate() { return new Animation(); } }
  const add = (type: string, fn: (event: any) => void) => {
    if (!handlers.has(type)) handlers.set(type, new Set());
    handlers.get(type)!.add(fn);
  };
  const remove = (type: string, fn: (event: any) => void) => handlers.get(type)?.delete(fn);
  const window: any = { setTimeout, clearTimeout, requestAnimationFrame: (fn: any) => setTimeout(fn, 16),
    cancelAnimationFrame: clearTimeout, AudioContext, Element, Animation, addEventListener: add, removeEventListener: remove };
  if (blockStorage) for (const name of ['localStorage','sessionStorage']) Object.defineProperty(window,name,{configurable:true,get(){throw new Error('SecurityError: opaque origin');}});
  const document = { querySelectorAll: () => [media], getAnimations: () => [animation],
    addEventListener: add, removeEventListener: remove };
  const html = instrumentHtmlRuntime("", "runtime-1");
  runInNewContext(html.slice(html.indexOf("<script>")+8, html.lastIndexOf("</script>")),
    { window, document, parent, performance: { now: () => Date.now() }, Map, Set, Proxy, Reflect, console, DOMException });
  const command = (type: string, runtimeId = "runtime-1", source = parent) => {
    for (const fn of [...(handlers.get("message") || [])]) fn({ source, data: { channel: "research-artifact/v1", runtimeId, type } });
  };
  return { window, command, contexts, animation, media, handlers, reports };
}

describe("executed artifact lifecycle", () => {
  it("provides bounded per-frame memory storage when sandbox storage is denied", () => {
    const a=boot(true),b=boot(true),store=a.window.localStorage;
    expect(store.getItem('best')).toBeNull();store.setItem('best',12);expect(store.getItem('best')).toBe('12');
    expect(store.length).toBe(1);expect(store.key(0)).toBe('best');expect(store.key(2)).toBeNull();
    expect(a.window.sessionStorage.getItem('best')).toBeNull();expect(b.window.localStorage.getItem('best')).toBeNull();
    expect(()=>store.setItem('huge','x'.repeat(1024*1024))).toThrow();expect(store.getItem('best')).toBe('12');
    store.removeItem('best');expect(store.length).toBe(0);store.setItem('best','20');
    a.command('dispose');expect(store.length).toBe(0);b.command('dispose');
  });
  afterEach(() => vi.useRealTimers());
  it("stops timers and animation frames on pause, resumes them once and clears all on dispose", () => {
    vi.useFakeTimers(); const runtime = boot(); let ticks = 0, frames = 0;
    runtime.window.setInterval(() => ticks++, 20);
    runtime.window.requestAnimationFrame(() => frames++);
    runtime.command("pause"); vi.advanceTimersByTime(100);
    expect([ticks, frames]).toEqual([0, 0]);
    runtime.command("resume"); runtime.command("resume"); vi.advanceTimersByTime(40);
    expect([ticks, frames]).toEqual([2, 1]);
    runtime.command("dispose"); vi.advanceTimersByTime(100);
    expect([ticks, frames]).toEqual([2, 1]);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("ignores commands from another parent or old runtime", () => {
    vi.useFakeTimers(); const runtime = boot(); let ticks = 0;
    runtime.window.setInterval(() => ticks++, 20);
    runtime.command("pause", "old"); runtime.command("pause", "runtime-1", {} as any);
    vi.advanceTimersByTime(40); expect(ticks).toBe(2);
    runtime.command("dispose");
  });
  it("keeps animations created or restarted after pause suspended until resume", () => {
    vi.useFakeTimers(); const runtime = boot();
    runtime.command("pause");
    const animation = new runtime.window.Element().animate();
    expect(animation.playState).toBe("paused");
    animation.play(); expect(animation.playState).toBe("paused");
    runtime.command("resume"); expect(animation.playState).toBe("running");
    runtime.command("dispose");
    expect(new runtime.window.Element().animate().playState).toBe("idle");
  });
  it("pauses and resumes active media/animations and closes audio on disposal", () => {
    vi.useFakeTimers(); const runtime = boot(); new runtime.window.AudioContext();
    runtime.command("pause");
    expect(runtime.animation.pause).toHaveBeenCalledOnce();
    expect(runtime.media.pause).toHaveBeenCalledOnce();
    expect(runtime.contexts[0].suspend).toHaveBeenCalledOnce();
    runtime.command("resume");
    expect(runtime.animation.play).toHaveBeenCalledOnce();
    expect(runtime.media.play).toHaveBeenCalledOnce();
    runtime.command("dispose");
    expect(runtime.contexts[0].close).toHaveBeenCalledOnce();
    expect(runtime.animation.cancel).toHaveBeenCalledOnce();
    expect(runtime.handlers.get("message")?.size).toBe(0);
  });
});
