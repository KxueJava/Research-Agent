import { createContext, useContext, useEffect, useId, useState, type ReactNode } from "react";
import { ConfigProvider, theme as antdTheme } from "antd";
import { Check, Moon, Sun } from "lucide-react";
import { readAppearance, readTheme, APPEARANCE_STORAGE_KEY, THEME_STORAGE_KEY, type Appearance, type Theme } from "@/utils/theme";
import "@/styles/theme-toggle.css";
import OceanBackground from "./OceanBackground";

const ThemeContext = createContext<{ theme: Theme; toggle:() => void; appearance: Appearance; setAppearance: (value: Appearance) => void } | null>(null);

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

/** Native radio inputs provide arrow-key navigation without changing sidebar routes. */
export function AppearanceMenuOptions() {
  const context = useContext(ThemeContext);
  const name = useId();
  if (!context) return null;
  return <fieldset className="appearance-menu-options">
    <legend>外观风格</legend>
    {([ ["ocean", "深海玻璃"], ["native", "原生简洁"] ] as const).map(([value, label]) => (
      <label key={value} className="appearance-menu-option">
        <input type="radio" name={name} value={value} checked={context.appearance === value}
          onChange={() => context.setAppearance(value)} />
        <span>{label}</span>
        <Check className="appearance-menu-check" aria-hidden="true" />
      </label>
    ))}
  </fieldset>;
}

export default function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => readTheme());
  const [appearance, setAppearanceState] = useState<Appearance>(() => readAppearance());

  useEffect(() => {
    document.documentElement.classList.toggle("ocean-ui", appearance === "ocean");
    document.documentElement.dataset.appearance = appearance;
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.documentElement.style.colorScheme = theme;
  }, [theme, appearance]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onSystemChange = () => {
      try { if (localStorage.getItem(THEME_STORAGE_KEY)) return; } catch { /* Storage unavailable. */ }
      setTheme(media.matches ? "dark" : "light");
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === THEME_STORAGE_KEY || event.key === null) setTheme(readTheme());
      if (event.key === APPEARANCE_STORAGE_KEY || event.key === null) setAppearanceState(readAppearance());
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
  const setAppearance = (value: Appearance) => {
    try { localStorage.setItem(APPEARANCE_STORAGE_KEY, value); } catch { /* Still switch for this session. */ }
    setAppearanceState(value);
  };
  return (
    <ConfigProvider theme={{ algorithm: theme === "dark" ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm }}>
      <ThemeContext.Provider value={{
        theme,
        toggle,
        appearance,
        setAppearance
      }}>
        {appearance === "ocean" ? <OceanBackground /> : null}
        {children}
      </ThemeContext.Provider>
    </ConfigProvider>
  );
}
