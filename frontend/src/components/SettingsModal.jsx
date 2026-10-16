import { Check, Monitor, Moon, Settings, Sun, X } from "lucide-react";
import { C, FONTS, THEMES, alpha } from "../styles/palette";
import { FONT_SIZES, MODES } from "../utils/prefs";
import { useApp } from "../context/AppContext";

export function ThemeSwatches({ size = "md" }) {
  const { prefs, setTheme } = useApp();
  const dim = size === "sm" ? "w-7 h-7" : "w-11 h-11";
  return (
    <div className={`flex items-start ${size === "sm" ? "gap-2" : "gap-3 flex-wrap"}`}>
      {Object.entries(THEMES).map(([key, t]) => {
        const on = prefs.theme === key;
        return (
          <button
            key={key}
            type="button"
            onClick={() => setTheme(key)}
            title={t.label}
            aria-label={`${t.label} theme`}
            aria-pressed={on}
            className="flex flex-col items-center gap-1 group"
          >
            <span
              className={`${dim} rounded-full flex items-center justify-center transition-transform group-hover:scale-105`}
              style={{
                background: `linear-gradient(135deg, ${t.light.dark} 0 50%, ${t.light.mint1} 50% 100%)`,
                boxShadow: on ? `0 0 0 2px ${C.white}, 0 0 0 4px ${C.dark}` : `0 0 0 1px ${t.light.mint1}`,
              }}
            >
              {on && <Check className="w-3.5 h-3.5" style={{ color: "#fff" }} />}
            </span>
            {size !== "sm" && (
              <span className="text-xs" style={{ color: on ? C.dark : C.sub, fontWeight: on ? 700 : 500 }}>{t.label}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

const MODE_ICON = { light: Sun, dark: Moon, system: Monitor };

// Light / Dark / System segmented switch.
export function ModeSwitch({ compact = false }) {
  const { prefs, setMode } = useApp();
  return (
    <div className="grid grid-cols-3 gap-1 p-1 rounded-xl" role="radiogroup" aria-label="Appearance"
      style={{ background: C.mint4, border: `1px solid ${alpha(C.mint1, "66")}` }}>
      {MODES.map((m) => {
        const on = prefs.mode === m.key;
        const Icon = MODE_ICON[m.key];
        return (
          <button key={m.key} type="button" role="radio" aria-checked={on} onClick={() => setMode(m.key)}
            className={`flex items-center justify-center gap-1.5 rounded-lg font-semibold transition-colors ${compact ? "py-1.5 text-xs" : "py-2 text-sm"}`}
            style={on ? { background: C.dark, color: C.mint4 } : { color: C.mid }}>
            <Icon className={compact ? "w-3.5 h-3.5" : "w-4 h-4"} />{m.label}
          </button>
        );
      })}
    </div>
  );
}

export default function SettingsModal({ onClose }) {
  const { prefs, setFontSize } = useApp();
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.45)" }} onClick={onClose}>
      <div
        className="cs-pop w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden"
        style={{ background: C.white, fontFamily: FONTS.sans, color: C.dark }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
      >
        <div className="px-6 py-4 border-b flex items-center justify-between" style={{ borderColor: C.mint4, background: alpha(C.mint4, "88") }}>
          <div className="flex items-center gap-2.5">
            <Settings className="w-5 h-5" style={{ color: C.dark }} />
            <h3 className="text-xl" style={{ fontFamily: FONTS.serif }}>Settings</h3>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:opacity-70" style={{ color: C.sub }} aria-label="Close"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-6 space-y-7">
          <section>
            <div className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: C.sub }}>Appearance</div>
            <ModeSwitch />
          </section>

          <section>
            <div className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: C.sub }}>Font size</div>
            <p className="text-xs mb-3" style={{ color: C.sub }}>Scales all text and spacing across CueSync on this device.</p>
            <div className="grid grid-cols-5 gap-2">
              {FONT_SIZES.map((f, i) => {
                const on = prefs.fontSize === f.key;
                return (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => setFontSize(f.key)}
                    aria-pressed={on}
                    className="rounded-xl border flex flex-col items-center justify-end gap-1 py-3 transition-colors"
                    style={{
                      borderColor: on ? C.dark : alpha(C.mint1, "88"),
                      background: on ? C.dark : C.white,
                      color: on ? C.mint4 : C.dark,
                    }}
                  >
                    <span style={{ fontFamily: FONTS.serif, fontSize: `${13 + i * 4}px`, lineHeight: 1 }}>Aa</span>
                    <span className="text-[0.625rem] font-semibold uppercase tracking-wide text-center leading-tight">{f.label}</span>
                  </button>
                );
              })}
            </div>
          </section>

          <section>
            <div className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: C.sub }}>Colour theme</div>
            <ThemeSwatches />
          </section>
        </div>

        <div className="px-6 py-4 border-t flex justify-end" style={{ borderColor: C.mint4 }}>
          <button onClick={onClose} className="px-5 py-2 rounded-xl text-sm font-semibold hover:opacity-90" style={{ background: C.dark, color: C.mint4 }}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
