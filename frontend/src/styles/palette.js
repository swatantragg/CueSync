// Colours are CSS custom properties so light/dark mode and colour themes switch instantly, and
// `.cs-dark` panels (modals, review panel, login) keep their dark look in either mode.
// Use alpha(color, "44") instead of string-concatenating a hex alpha onto a palette value.

const KEYS = ["mint1", "mint2", "mint3", "mint4", "dark", "mid", "light", "white", "sub", "muted", "danger", "warn", "ok", "blue"];

const SHARED_LIGHT = { white: "#FFFFFF", danger: "#C0392B", warn: "#E67E22", ok: "#27AE60", blue: "#2980B9" };
const SHARED_DARK  = { danger: "#F07167", warn: "#F2A65A", ok: "#4CC38A", blue: "#6CB4EE" };

// `light` is the original design; `dark` inverts the roles: "dark" stays the strong ink / primary
// button colour (now light), "white"/"light" are the surfaces (now dark), mint4 the subtle tint.
export const THEMES = {
  forest: {
    label: "Forest",
    light: { mint1: "#ACE1AF", mint2: "#B0EBB4", mint3: "#BFF6C3", mint4: "#E0FBE2", dark: "#1B3A2D", mid: "#2D5F4A", light: "#F6FFF8", sub: "#4A7A63", muted: "#8ABEAA" },
    dark:  { mint1: "#3E7D5F", mint2: "#284A37", mint3: "#22402F", mint4: "#1C3329", dark: "#E4F5E9", mid: "#B3DEC0", light: "#0E1813", white: "#15241D", sub: "#9CC2AD", muted: "#6F9483" },
  },
  ocean: {
    label: "Ocean",
    light: { mint1: "#A7D3F0", mint2: "#B6DCF5", mint3: "#C6E6FA", mint4: "#E1F1FC", dark: "#12324A", mid: "#1F4E6E", light: "#F5FAFE", sub: "#3F6A86", muted: "#87AFC8" },
    dark:  { mint1: "#36668F", mint2: "#223C53", mint3: "#1D3449", mint4: "#182C3F", dark: "#E3F0FB", mid: "#AFD2EE", light: "#0B1520", white: "#122130", sub: "#98B8D0", muted: "#6A8AA3" },
  },
  plum: {
    label: "Plum",
    light: { mint1: "#D3B8E8", mint2: "#DCC6EE", mint3: "#E6D5F4", mint4: "#F3EAFA", dark: "#33204A", mid: "#4F3570", light: "#FBF7FE", sub: "#6B4F8A", muted: "#AE96C7" },
    dark:  { mint1: "#6B4E91", mint2: "#33284A", mint3: "#2D2240", mint4: "#261D33", dark: "#F1E9FA", mid: "#D4BEEB", light: "#130E1A", white: "#1C1526", sub: "#B9A3D1", muted: "#8774A0" },
  },
  terracotta: {
    label: "Terracotta",
    light: { mint1: "#F2C3A7", mint2: "#F5CFB7", mint3: "#F8DCCA", mint4: "#FDEEE4", dark: "#4A2618", mid: "#713B26", light: "#FFFAF6", sub: "#8A5A44", muted: "#C9A08C" },
    dark:  { mint1: "#93573E", mint2: "#452E23", mint3: "#3C281F", mint4: "#33221A", dark: "#FBEDE4", mid: "#F0C7AE", light: "#1A110D", white: "#251812", sub: "#D4AB95", muted: "#A07F6E" },
  },
  slate: {
    label: "Slate",
    light: { mint1: "#C3CCD6", mint2: "#CDD5DE", mint3: "#D8DFE6", mint4: "#EDF1F5", dark: "#1F2933", mid: "#3A4754", light: "#F7F9FB", sub: "#52606D", muted: "#9AA5B1" },
    dark:  { mint1: "#4F5D6C", mint2: "#2C3540", mint3: "#262E37", mint4: "#20272F", dark: "#EAEEF2", mid: "#C6CED7", light: "#0F1317", white: "#171C22", sub: "#A7B1BC", muted: "#7A8591" },
  },
};

// Status / accent tones that used to be hard-coded pastel hex values: [light, dark].
const TONES = {
  greenBg:      ["#E8F5E9", "#1D3A27"], green:        ["#2E7D32", "#7DD487"], greenBorder:  ["#A5D6A7", "#2F6B3D"],
  greenBg2:     ["#D8F3DC", "#1D3A27"], greenBg3:     ["#F1F8E9", "#1A3123"],
  blueBg:       ["#E3F2FD", "#152A40"], blue:         ["#1565C0", "#7CB8F6"], blueBorder:   ["#90CAF9", "#2C5280"],
  orangeBg:     ["#FFF3E0", "#3A2615"], orange:       ["#E65100", "#FFA463"], orange2:      ["#F57C00", "#FFB36B"],
  amberBg:      ["#FFF8E1", "#332A10"], amberBorder:  ["#FFE082", "#6E5716"], orangeDeep:   ["#BF360C", "#FF9F7E"],
  yellowBg:     ["#FFFDE7", "#2E2A12"], peachBg:      ["#FFDDD2", "#3D2119"],
  redBg:        ["#FFEBEE", "#3B1A1E"], red:          ["#C62828", "#FF8B8B"], redBorder:    ["#EF9A9A", "#7C3036"],
  redDeep:      ["#B71C1C", "#FF9C9C"],
  purpleBg:     ["#F3E5F5", "#2E1C37"], purple:       ["#7B1FA2", "#D69CEC"], purple2:      ["#6A1B9A", "#CB98F1"],
  purple3:      ["#9C27B0", "#E3A8F1"], purpleBorder: ["#CE93D8", "#5F3A6D"],
  violetBg:     ["#EDE7F6", "#26203E"], violet:       ["#4527A0", "#B8A8F7"],
  grayBg:       ["#F3F4F6", "#1F2925"], gray:         ["#374151", "#CAD4D0"], grayMid:      ["#6B7280", "#9BA8A3"],
  grayLight:    ["#9E9E9E", "#7E8B86"], neutralBg:    ["#F5F5F5", "#1A2420"], toggleOff:    ["#D1D5DB", "#3A4743"],
  teal:         ["#0D9488", "#5EE0CC"],
};

const cssVar = (prefix) => (key) => `var(--${prefix}-${key})`;

export const C = Object.freeze(Object.fromEntries(KEYS.map((k) => [k, cssVar("c")(k)])));
export const T = Object.freeze(Object.fromEntries(Object.keys(TONES).map((k) => [k, cssVar("t")(k)])));

// Hex-alpha suffix ("44" etc.) applied to either a palette var or a literal hex colour.
export function alpha(color, hex2) {
  if (!color) return color;
  if (/^#[0-9a-f]{6}$/i.test(color)) return color + hex2;
  const pct = Math.round((parseInt(hex2, 16) / 255) * 1000) / 10;
  return `color-mix(in srgb, ${color} ${pct}%, transparent)`;
}

export const resolveMode = (mode) =>
  mode === "system"
    ? (typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light")
    : mode === "dark" ? "dark" : "light";

// Writes the active palette to :root. `--cd-*` always holds the light-mode palette for `.cs-dark` panels.
export function applyTheme(themeName, mode) {
  const theme = THEMES[themeName] || THEMES.forest;
  const dark = resolveMode(mode) === "dark";
  const lightPal = { ...SHARED_LIGHT, ...theme.light };
  const active = dark ? { ...SHARED_LIGHT, ...SHARED_DARK, ...theme.dark } : lightPal;
  const root = document.documentElement;
  for (const k of KEYS) {
    root.style.setProperty(`--c-${k}`, active[k]);
    root.style.setProperty(`--cd-${k}`, lightPal[k]);
  }
  for (const [k, [l, d]] of Object.entries(TONES)) root.style.setProperty(`--t-${k}`, dark ? d : l);
  root.dataset.mode = dark ? "dark" : "light";
  root.style.colorScheme = dark ? "dark" : "light";
}

export const FONTS = {
  sans: "'DM Sans', sans-serif",
  serif: "'DM Serif Display', serif",
  mono: "'DM Mono', monospace",
};
