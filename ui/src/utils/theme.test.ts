import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { APPEARANCE_STORAGE_KEY, readAppearance, readTheme, THEME_STORAGE_KEY } from "./theme";

describe("independent appearance and color mode preferences", () => {
  let values: Map<string, string>;
  beforeEach(() => {
    values = new Map();
    vi.stubGlobal("localStorage", { getItem: (key: string) => values.get(key) ?? null });
    vi.stubGlobal("window", { matchMedia: () => ({ matches: false }) });
  });
  afterEach(() => vi.unstubAllGlobals());
  it("keeps the current ocean appearance by default, including invalid stored values", () => {
    expect(readAppearance()).toBe("ocean");
    values.set(APPEARANCE_STORAGE_KEY, "unknown"); expect(readAppearance()).toBe("ocean");
  });
  it.each(["light", "dark"] as const)("restores native appearance independently of %s mode", (theme) => {
    values.set(APPEARANCE_STORAGE_KEY, "native"); values.set(THEME_STORAGE_KEY, theme);
    expect(readAppearance()).toBe("native"); expect(readTheme()).toBe(theme);
    values.set(APPEARANCE_STORAGE_KEY, "ocean");
    expect(readAppearance()).toBe("ocean"); expect(readTheme()).toBe(theme);
  });
  it("still loads when browser storage is unavailable", () => {
    vi.stubGlobal("localStorage", { getItem: () => { throw new Error("disabled"); } });
    expect(readAppearance()).toBe("ocean"); expect(readTheme()).toBe("light");
  });
});
