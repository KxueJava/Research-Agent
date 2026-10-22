import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createOceanScene } from "./scene";

const gpu = vi.hoisted(() => ({
  created: 0,
  released: 0,
  renders: 0
}));
vi.mock("three", () => ({
  WebGLRenderer: class {
    constructor() { gpu.created++; }
    setPixelRatio() {} setSize() {} render() { gpu.renders++; }
    dispose() { gpu.released++; }
  },
  Scene: class { add() {} },
  Camera: class {},
  Mesh: class {},
  PlaneGeometry: class { dispose() {} },
  ShaderMaterial: class { dispose() {} },
}));

class MotionPreference extends EventTarget {
  matches = false;
  addListener() {} removeListener() {}
}

describe("decorative ocean lifecycle", () => {
  let motion: MotionPreference;
  let doc: EventTarget & { hidden: boolean; documentElement: { classList: { contains: () => boolean } } };
  let callbacks: Map<number, FrameRequestCallback>;
  let id: number;
  let dispose: (() => void) | undefined;
  beforeEach(() => {
    gpu.created = 0; gpu.released = 0; gpu.renders = 0;
    motion = new MotionPreference(); callbacks = new Map(); id = 0;
    doc = Object.assign(new EventTarget(), {
      hidden: false,
      documentElement: { classList: { contains: () => true } }
    });
    const win = Object.assign(new EventTarget(), {
      innerWidth: 1440,
      innerHeight: 900,
      devicePixelRatio: 1,
      matchMedia: () => motion
    });
    vi.stubGlobal("document", doc); vi.stubGlobal("window", win);
    vi.stubGlobal("MutationObserver", class { observe() {} disconnect() {} });
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { callbacks.set(++id, callback); return id; });
    vi.stubGlobal("cancelAnimationFrame", (key: number) => callbacks.delete(key));
  });
  afterEach(() => { dispose?.(); dispose = undefined; vi.unstubAllGlobals(); });
  const canvas = () => Object.assign(new EventTarget(), { dataset: { state: "static" } }) as unknown as HTMLCanvasElement;

  it("honors reduced motion before allocating any GPU resources", () => {
    motion.matches = true;
    const target = canvas(); dispose = createOceanScene(target);
    expect(gpu.created).toBe(0); expect(callbacks.size).toBe(0);
    expect(target.dataset.state).toBe("static");
    motion.matches = false; motion.dispatchEvent(new Event("change"));
    expect(gpu.created).toBe(1); expect(callbacks.size).toBe(1);
  });
  it("pauses in hidden tabs and resumes one animation loop", () => {
    dispose = createOceanScene(canvas());
    expect(callbacks.size).toBe(1);
    doc.hidden = true; doc.dispatchEvent(new Event("visibilitychange"));
    expect(callbacks.size).toBe(0);
    doc.hidden = false; doc.dispatchEvent(new Event("visibilitychange"));
    doc.dispatchEvent(new Event("visibilitychange"));
    expect(callbacks.size).toBe(1); expect(gpu.created).toBe(1);
  });
  it("falls back on context loss and replaces the disposed renderer on recovery", () => {
    const target = canvas(); dispose = createOceanScene(target);
    target.dispatchEvent(new Event("webglcontextlost", { cancelable: true }));
    expect(target.dataset.state).toBe("static"); expect(callbacks.size).toBe(0);
    target.dispatchEvent(new Event("webglcontextrestored"));
    expect(gpu.released).toBe(1); expect(gpu.created).toBe(2);
    expect(target.dataset.state).toBe("animated"); expect(callbacks.size).toBe(1);
  });
  it("releases rendering and listeners on unmount", () => {
    dispose = createOceanScene(canvas()); dispose(); dispose = undefined;
    expect(gpu.released).toBe(1); expect(callbacks.size).toBe(0);
    doc.dispatchEvent(new Event("visibilitychange")); motion.dispatchEvent(new Event("change"));
    expect(callbacks.size).toBe(0); expect(gpu.created).toBe(1);
  });
});
