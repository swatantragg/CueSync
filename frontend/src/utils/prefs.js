// Per-browser display preferences (font size, colour theme, light/dark mode).
const PREFS_KEY = "cuesync_prefs";

export const FONT_SIZES = [
  { key: "xs", label: "Extra Small", px: 16 },
  { key: "sm", label: "Small",       px: 18 },
  { key: "md", label: "Medium",      px: 20 },
  { key: "lg", label: "Large",       px: 22 },
  { key: "xl", label: "Extra Large", px: 24 },
];
export const MODES = [
  { key: "light",  label: "Light" },
  { key: "dark",   label: "Dark" },
  { key: "system", label: "System" },
];
export const DEFAULT_PREFS = { fontSize: "md", theme: "forest", mode: "light" };

export function loadPrefs() {
  try {
    const raw = JSON.parse(localStorage.getItem(PREFS_KEY) || "null");
    return { ...DEFAULT_PREFS, ...(raw && typeof raw === "object" ? raw : {}) };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function savePrefs(prefs) {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch { /* storage unavailable */ }
}

// Every rem-based size in the app scales from the root font size.
export function applyFontSize(key) {
  const size = FONT_SIZES.find((f) => f.key === key) || FONT_SIZES.find((f) => f.key === DEFAULT_PREFS.fontSize);
  document.documentElement.style.fontSize = `${size.px}px`;
}
