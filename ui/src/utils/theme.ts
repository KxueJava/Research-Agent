export type Theme = "light" | "dark";
export const THEME_STORAGE_KEY = "research.theme";

export function readTheme(): Theme {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === "light" || saved === "dark") return saved;
  } catch { /* Fall back to system preference. */ }
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches
    ? "dark" : "light";
}

export type Appearance = "native" | "ocean";
export const APPEARANCE_STORAGE_KEY = "research.appearance";

/** Preserve the current ocean skin unless the user explicitly chooses native. */
export function readAppearance(): Appearance {
  try {
    return localStorage.getItem(APPEARANCE_STORAGE_KEY) === "native" ? "native" : "ocean";
  } catch { return "ocean"; }
}
