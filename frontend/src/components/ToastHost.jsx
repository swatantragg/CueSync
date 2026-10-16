import { Briefcase, CheckCircle2, Info, X, XCircle } from "lucide-react";
import { C, FONTS, alpha, T } from "../styles/palette";
import { useApp } from "../context/AppContext";

const KIND = {
  success: { Icon: CheckCircle2, color: T.green, bg: T.greenBg },
  assign:  { Icon: Briefcase,    color: T.orange, bg: T.orangeBg },
  error:   { Icon: XCircle,      color: T.red, bg: T.redBg },
  info:    { Icon: Info,         color: null,      bg: null },
};

export default function ToastHost() {
  const { toasts, dismissToast } = useApp();
  if (!toasts.length) return null;
  return (
    <div className="fixed right-4 flex flex-col gap-2.5 pointer-events-none" style={{ top: "4.75rem", zIndex: 1100, width: "min(24rem, calc(100vw - 2rem))" }}>
      {toasts.map((t) => {
        const k = KIND[t.kind] || KIND.info;
        const color = k.color || C.dark;
        return (
          <div
            key={t.id}
            role="status"
            className="pointer-events-auto rounded-2xl shadow-2xl overflow-hidden border"
            style={{ background: C.white, borderColor: alpha(C.mint1, "66"), fontFamily: FONTS.sans, animation: "toast-in 180ms ease-out" }}
          >
            <div className="flex items-start gap-3 px-4 py-3">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" style={{ background: k.bg || C.mint4 }}>
                <k.Icon className="w-4 h-4" style={{ color }} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold leading-snug" style={{ color: C.dark }}>{t.title}</div>
                {t.body && <div className="text-xs mt-0.5" style={{ color: C.sub }}>{t.body}</div>}
                {t.items?.length > 0 && (
                  <ul className="mt-1.5 space-y-1">
                    {t.items.slice(0, 4).map((it, i) => (
                      <li key={i} className="text-xs flex items-center gap-1.5" style={{ color: C.dark }}>
                        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: color }} />
                        <span className="truncate">{it}</span>
                      </li>
                    ))}
                    {t.items.length > 4 && (
                      <li className="text-xs" style={{ color: C.sub }}>+{t.items.length - 4} more in notifications</li>
                    )}
                  </ul>
                )}
              </div>
              <button onClick={() => dismissToast(t.id)} className="p-0.5 rounded hover:opacity-60 shrink-0" style={{ color: C.sub }} aria-label="Dismiss">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="h-1" style={{ background: C.mint4 }}>
              <div className="h-full origin-left" style={{ background: color, animation: `toast-bar ${t.duration}ms linear forwards` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
