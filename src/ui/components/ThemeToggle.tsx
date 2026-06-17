/**
 * ThemeToggle — a small light/dark switch in the app header. Persists the
 * choice (theme.ts). Only the chrome changes; the grid's Okabe–Ito hues are
 * theme-independent (§4b).
 */

import { useState } from "react";
import { type Theme, resolveInitialTheme, setTheme } from "../theme.js";

export function ThemeToggle() {
  const [theme, setThemeState] = useState<Theme>(() => resolveInitialTheme());
  const next = theme === "dark" ? "light" : "dark";
  const toggle = () => {
    setTheme(next);
    setThemeState(next);
  };
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
      className="inline-flex items-center justify-center w-9 h-9 rounded-pill border border-border bg-surface text-text-muted hover:text-text hover:bg-surface-2 transition"
    >
      <span aria-hidden="true" className="text-base">
        {theme === "dark" ? "☀" : "☾"}
      </span>
    </button>
  );
}
