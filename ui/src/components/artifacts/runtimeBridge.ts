export type RuntimeMessage = { type: "ready" | "error" | "paused" | "running"; message?: string };
export function readRuntimeMessage(event: Pick<MessageEvent, "source" | "data">, source: Window | null, runtimeId: string): RuntimeMessage | null {
  const data = event.data;
  if (!source || event.source !== source || !data || typeof data !== "object" || Array.isArray(data)
      || data.channel !== "research-artifact/v1" || data.runtimeId !== runtimeId
      || !["ready", "error", "paused", "running"].includes(data.type)) return null;
  return { type: data.type, ...(typeof data.message === "string" ? { message: data.message.slice(0, 500) } : {}) };
}

// Serialized into the opaque-origin frame. All dependencies must stay local.
function runtimeBootstrap(runtimeId: string) {
  const channel = "research-artifact/v1";
  const nativeSet = window.setTimeout.bind(window), nativeClear = window.clearTimeout.bind(window);
  const nativeRaf = window.requestAnimationFrame.bind(window), nativeCancel = window.cancelAnimationFrame.bind(window);
  const timers = new Map<number, any>(), frames = new Map<number, any>(), audio = new Set<any>();
  const animations = new Set<Animation>(), media = new Set<HTMLMediaElement>();
  // Opaque-origin iframes cannot access Web Storage. Provide frame-local memory,
  // never host storage or credentials, before any generated game scripts execute.
  const memoryStores: Storage[] = [];
  for (const name of ["localStorage", "sessionStorage"] as const) {
    try { void window[name]; }
    catch {
      const values = new Map<string, string>(); let size = 0;
      const store = {
        get length() { return values.size; },
        key(index: number) { return [...values.keys()][Number(index) >>> 0] ?? null; },
        getItem(key: string) { return values.get(String(key)) ?? null; },
        setItem(key: string, value: string) {
          key = String(key); value = String(value);
          const before = values.has(key) ? (key.length + values.get(key)!.length) * 2 : 0;
          const next = size - before + (key.length + value.length) * 2;
          if (next > 1024 * 1024) throw new DOMException("Artifact memory storage is full", "QuotaExceededError");
          values.set(key, value); size = next;
        },
        removeItem(key: string) { key = String(key); if (values.has(key)) { size -= (key.length + values.get(key)!.length) * 2; values.delete(key); } },
        clear() { values.clear(); size = 0; }
      };
      Object.defineProperty(window, name, { value: store, configurable: true });
      memoryStores.push(store);
    }
  }
  let sequence = 0, paused = false, disposed = false;
  const guardAnimation = (animation: Animation) => {
    if (disposed) animation.cancel();
    else if (paused) { animations.add(animation); animation.pause(); }
    return animation;
  };
  const nativeAnimate = window.Element?.prototype.animate;
  if (nativeAnimate) window.Element.prototype.animate = function (...args) {
    return guardAnimation(nativeAnimate.apply(this, args));
  };
  const nativePlay = window.Animation?.prototype.play;
  if (nativePlay) window.Animation.prototype.play = function (...args) {
    nativePlay.apply(this, args); guardAnimation(this);
  };
  const report = (type: string, message?: string) => parent.postMessage({ channel, runtimeId, type, message: message?.slice(0, 500) }, "*");
  const arm = (id: number, item: any) => {
    item.started = performance.now();
    item.handle = nativeSet(() => {
      if (disposed || paused || !timers.has(id)) return;
      if (!item.repeat) timers.delete(id);
      try { item.callback(...item.args); }
      finally { if (item.repeat && timers.has(id) && !paused && !disposed) { item.remaining = item.delay; arm(id, item); } }
    }, item.remaining);
  };
  const schedule = (callback: any, delay: number, repeat: boolean, args: any[]) => {
    if (disposed) return 0;
    if (typeof callback !== "function") return nativeSet(callback, delay, ...args);
    const id = ++sequence, item = { callback, args, delay: Math.max(0, Number(delay) || 0), repeat, remaining: Math.max(0, Number(delay) || 0), handle: 0, started: 0 };
    timers.set(id, item); if (!paused) arm(id, item); return id;
  };
  window.setTimeout = ((callback: any, delay = 0, ...args: any[]) => schedule(callback, delay, false, args)) as typeof window.setTimeout;
  window.setInterval = ((callback: any, delay = 0, ...args: any[]) => schedule(callback, delay, true, args)) as typeof window.setInterval;
  window.clearTimeout = window.clearInterval = ((id: number) => { const item = timers.get(id); if (item) { nativeClear(item.handle); timers.delete(id); } }) as typeof window.clearTimeout;
  const queueFrame = (id: number, item: any) => { item.handle = nativeRaf(time => { frames.delete(id); if (!paused && !disposed) item.callback(time); }); };
  window.requestAnimationFrame = callback => { if (disposed) return 0; const id = ++sequence, item = { callback, handle: 0 }; frames.set(id, item); if (!paused) queueFrame(id, item); return id; };
  window.cancelAnimationFrame = id => { const item = frames.get(id); if (item) { nativeCancel(item.handle); frames.delete(id); } };
  const Audio = window.AudioContext;
  if (Audio) window.AudioContext = new Proxy(Audio, { construct(target, args) {
    const context = Reflect.construct(target, args); audio.add(context);
    if (paused || disposed) context.suspend()?.catch(() => {});
    if (disposed) context.close()?.catch(() => {});
    return context;
  } });
  const pauseVisuals = () => {
    document.getAnimations?.().forEach(animation => {
      if (animation.playState === "running") { animations.add(animation); animation.pause(); }
    });
    document.querySelectorAll("audio,video").forEach(element => {
      const item = element as HTMLMediaElement;
      if (!item.paused) { media.add(item); item.pause(); }
    });
  };
  const setPaused = (value: boolean) => {
    if (disposed || paused === value) return;
    paused = value;
    timers.forEach((item, id) => {
      if (value) { nativeClear(item.handle); item.remaining = Math.max(0, item.remaining - (performance.now() - item.started)); }
      else arm(id, item);
    });
    frames.forEach((item, id) => value ? nativeCancel(item.handle) : queueFrame(id, item));
    audio.forEach(context => { try { const promise = value ? context.suspend() : context.resume(); promise?.catch(() => {}); } catch { /* closed audio */ } });
    if (value) pauseVisuals();
    else {
      animations.forEach(animation => { try { animation.play(); } catch { /* removed animation */ } }); animations.clear();
      media.forEach(item => { try { item.play()?.catch(() => {}); } catch { /* removed media */ } }); media.clear();
    }
    report(value ? "paused" : "running");
  };
  const dispose = () => {
    if (disposed) return;
    setPaused(true); disposed = true;
    memoryStores.forEach(store => store.clear());
    timers.forEach(item => nativeClear(item.handle)); timers.clear();
    frames.forEach(item => nativeCancel(item.handle)); frames.clear();
    audio.forEach(context => { try { context.close()?.catch(() => {}); } catch { /* already closed */ } }); audio.clear();
    animations.forEach(animation => animation.cancel()); animations.clear(); media.clear();
    window.removeEventListener("message", receive);
    window.removeEventListener("pagehide", dispose);
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onRejection);
    window.removeEventListener("DOMContentLoaded", ready);
    document.removeEventListener("animationstart", onAnimation, true);
    document.removeEventListener("transitionrun", onAnimation, true);
    document.removeEventListener("play", onAnimation, true);
  };
  const receive = (event: MessageEvent) => {
    if (event.source !== parent || event.data?.channel !== channel || event.data?.runtimeId !== runtimeId) return;
    if (event.data.type === "pause") setPaused(true);
    if (event.data.type === "resume") setPaused(false);
    if (event.data.type === "dispose") dispose();
  };
  const onError = (event: ErrorEvent) => report("error", event.message || "脚本执行失败");
  const onRejection = (event: PromiseRejectionEvent) => report("error", String(event.reason?.message || event.reason || "异步执行失败"));
  const ready = () => report("ready");
  const onAnimation = () => { if (paused) pauseVisuals(); };
  window.addEventListener("message", receive);
  window.addEventListener("pagehide", dispose);
  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);
  window.addEventListener("DOMContentLoaded", ready, { once: true });
  document.addEventListener("animationstart", onAnimation, true);
  document.addEventListener("transitionrun", onAnimation, true);
  document.addEventListener("play", onAnimation, true);
}

export function instrumentHtmlRuntime(html: string, runtimeId: string): string {
  const script = `<script>(${runtimeBootstrap.toString()})(${JSON.stringify(runtimeId).replace(/</g, "\\u003c")});</script>`;
  const policy = html.match(/<meta\s+http-equiv="Content-Security-Policy"[^>]*>/i);
  const offset = policy ? policy.index! + policy[0].length : (html.match(/^\s*<!doctype[^>]*>/i)?.[0].length || 0);
  return html.slice(0, offset) + script + html.slice(offset);
}
