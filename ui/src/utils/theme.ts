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
