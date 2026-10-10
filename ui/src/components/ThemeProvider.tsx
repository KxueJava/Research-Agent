import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { ConfigProvider, theme as antdTheme } from "antd";
import { Moon, Sun } from "lucide-react";
import { readTheme, THEME_STORAGE_KEY, type Theme } from "@/utils/theme";
import "@/styles/theme-toggle.css";

const ThemeContext = createContext<{ theme: Theme; toggle: () => void } | null>(null);

export function ThemeToggle() {
  const context = useContext(ThemeContext);
  if (!context) return null;
  const { theme, toggle } = context;
  const label = theme === "dark" ? "切换到浅色主题" : "切换到深色主题";

  return (
    <button type="button" className="global-theme-toggle" onClick={toggle}
      aria-label={label} aria-pressed={theme === "dark"} title={label}>
      <Sun className="theme-sun" aria-hidden="true" />
      <Moon className="theme-moon" aria-hidden="true" />
    </button>
  );
}

export default function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => readTheme());

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.documentElement.style.colorScheme = theme;
  }, [theme]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onSystemChange = () => {
      try { if (localStorage.getItem(THEME_STORAGE_KEY)) return; } catch { /* Storage unavailable. */ }
      setTheme(media.matches ? "dark" : "light");
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === THEME_STORAGE_KEY || event.key === null) setTheme(readTheme());
    };
    media.addEventListener("change", onSystemChange);
    window.addEventListener("storage", onStorage);
    return () => {
      media.removeEventListener("change", onSystemChange);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const toggle = () => {
    const next = theme === "dark" ? "light" : "dark";
    try { localStorage.setItem(THEME_STORAGE_KEY, next); } catch { /* Still switch for this session. */ }
    setTheme(next);
  };
  return (
    <ConfigProvider theme={{ algorithm: theme === "dark" ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm }}>
      <ThemeContext.Provider value={{ theme, toggle }}>
        {children}
      </ThemeContext.Provider>
    </ConfigProvider>
  );
}
