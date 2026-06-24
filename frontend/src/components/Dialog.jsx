import { useEffect, useState } from "react";
import { AlertTriangle, Trash2, X, Info, CheckCircle2, AlertCircle, ShieldOff } from "lucide-react";
import { C, FONTS } from "../styles/palette";

// ── Imperative API ────────────────────────────────────────────────────────────
let _push = null;

function enqueue(dialog) {
  return new Promise((resolve) => {
    _push?.({ ...dialog, resolve });
  });
}

export const showConfirm = (message, opts = {}) =>
  enqueue({ type: "confirm", message, ...opts });

export const showAlert = (message, opts = {}) =>
  enqueue({ type: "alert", message, ...opts });

// ── Variant config ────────────────────────────────────────────────────────────
const VARIANTS = {
  danger: {
    Icon: Trash2,
    iconColor: C.danger,
    iconBg: "#FFEBEE",
    btnBg: C.danger,
    btnColor: "#fff",
  },
  error: {
    Icon: AlertCircle,
    iconColor: C.danger,
    iconBg: "#FFEBEE",
    btnBg: C.danger,
    btnColor: "#fff",
  },
  warn: {
    Icon: AlertTriangle,
    iconColor: "#E67E22",
    iconBg: "#FFF8E1",
    btnBg: "#E67E22",
    btnColor: "#fff",
  },
  info: {
    Icon: Info,
    iconColor: C.sub,
    iconBg: C.mint4,
    btnBg: C.dark,
    btnColor: C.mint4,
  },
  success: {
    Icon: CheckCircle2,
    iconColor: C.ok,
    iconBg: "#E8F5E9",
    btnBg: C.ok,
    btnColor: "#fff",
  },
  privilege: {
    Icon: ShieldOff,
    iconColor: C.danger,
    iconBg: "#FFEBEE",
    btnBg: C.mint1,
    btnColor: C.dark,
  },
};

// ── Single dialog card ────────────────────────────────────────────────────────
function DialogCard({ dialog, onDone }) {
  const v = VARIANTS[dialog.variant || (dialog.type === "alert" ? "error" : "danger")];
  const { Icon, iconColor, iconBg, btnBg, btnColor } = v;

  const confirm = (result) => { onDone(); dialog.resolve(result); };

  // Close on backdrop click only for alert (not destructive confirm)
  const onBackdrop = () => { if (dialog.type === "alert") confirm(undefined); };

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center px-4"
      style={{ background: "rgba(0,0,0,0.62)", backdropFilter: "blur(2px)" }}
      onClick={onBackdrop}
    >
      <div
        className="w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden"
        style={{ background: C.dark, border: `1px solid ${C.mid}` }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 pt-5 pb-3 flex items-start gap-3.5">
          <div
            className="shrink-0 w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: iconBg }}
          >
            <Icon className="w-4.5 h-4.5" style={{ color: iconColor, width: 18, height: 18 }} />
          </div>
          <div className="flex-1 min-w-0 pt-0.5">
            <div
              className="font-semibold text-sm leading-tight"
              style={{ fontFamily: FONTS.serif, color: C.mint4 }}
            >
              {dialog.title || (dialog.type === "confirm" ? "Confirm Action" : "Notice")}
            </div>
            <div className="text-xs mt-1.5 leading-relaxed whitespace-pre-line" style={{ color: C.muted }}>
              {dialog.message}
            </div>
            {dialog.detail && (
              <div className="text-[11px] mt-1.5 leading-relaxed opacity-70" style={{ color: C.muted }}>
                {dialog.detail}
              </div>
            )}
          </div>
          <button
            onClick={() => confirm(false)}
            className="shrink-0 p-1 rounded-lg hover:opacity-70 transition-opacity mt-0.5"
            style={{ color: C.muted }}
          >
            <X style={{ width: 14, height: 14 }} />
          </button>
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: C.mid }} />

        {/* Actions */}
        <div className="px-5 py-3.5 flex items-center justify-end gap-2.5">
          {dialog.type === "confirm" && (
            <button
              onClick={() => confirm(false)}
              className="px-4 py-2 rounded-xl text-xs font-medium hover:opacity-80 transition-opacity"
              style={{ background: "rgba(255,255,255,0.07)", color: C.muted, border: `1px solid ${C.mid}` }}
            >
              {dialog.cancelLabel || "Cancel"}
            </button>
          )}
          <button
            onClick={() => confirm(dialog.type === "confirm" ? true : undefined)}
            className="px-5 py-2 rounded-xl text-xs font-semibold hover:opacity-90 transition-opacity"
            style={{ background: btnBg, color: btnColor }}
          >
            {dialog.confirmLabel || (dialog.type === "confirm" ? "Confirm" : "OK")}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Root — mount once in App ──────────────────────────────────────────────────
export function DialogRoot() {
  const [queue, setQueue] = useState([]);

  useEffect(() => {
    _push = (dialog) => setQueue((prev) => [...prev, dialog]);
    return () => { _push = null; };
  }, []);

  if (queue.length === 0) return null;
  const current = queue[0];
  const onDone = () => setQueue((prev) => prev.slice(1));

  return <DialogCard key={queue.length} dialog={current} onDone={onDone} />;
}
