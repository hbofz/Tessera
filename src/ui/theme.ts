/**
 * Theme: light/dark, persisted, defaulting to the OS preference.
 *
 * The chrome is themeable (DESIGN.md §3 "calm"); the grid's Okabe–Ito hues stay
 * fixed in palette.ts so accessibility (§4b) is unaffected by the theme.
 */

export type Theme = "light" | "dark";

const KEY = "tessera.theme";

function systemPrefersDark(): boolean {
  return typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches;
}

export function getStoredTheme(): Theme | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : null;
  } catch {
    return null;
  }
}

export function resolveInitialTheme(): Theme {
  return getStoredTheme() ?? (systemPrefersDark() ? "dark" : "light");
}

export function applyTheme(theme: Theme): void {
  document.documentElement.setAttribute("data-theme", theme);
}

export function setTheme(theme: Theme): void {
  applyTheme(theme);
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    // best-effort; theme still applies for this session
  }
}

/** Call once at boot, before React renders, to avoid a flash of the wrong theme. */
export function initTheme(): Theme {
  const t = resolveInitialTheme();
  applyTheme(t);
  return t;
}
