import { Music2, Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import { C, FONTS } from "../styles/palette";

export default function AuthShell({ title, subtitle, children, footer }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: `linear-gradient(145deg,${C.dark} 0%,${C.mid} 50%,${C.dark} 100%)`, fontFamily: FONTS.sans }}>
      <div className="absolute inset-0 opacity-30" style={{ background: `radial-gradient(circle at 30% 40%,${C.mint1} 0%,transparent 50%),radial-gradient(circle at 70% 60%,${C.mint3} 0%,transparent 50%)` }} />
      <div className="w-full max-w-md relative z-10">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-5" style={{ background: C.mint1 }}>
            <Music2 className="w-7 h-7" style={{ color: C.dark }} />
          </div>
          <h1 className="text-5xl mb-2" style={{ fontFamily: FONTS.serif, color: C.mint4, letterSpacing: "-0.03em" }}>CueSync</h1>
          <p className="text-[11px] tracking-[0.3em] uppercase" style={{ color: C.mint2 + "99" }}>CUE SHEET AUTOMATION</p>
        </div>
        <div className="p-8 rounded-2xl border" style={{ background: "rgba(255,255,255,0.05)", borderColor: C.mint1 + "22", backdropFilter: "blur(12px)" }}>
          <div className="mb-6 text-center">
            <h2 className="text-xl font-semibold mb-1" style={{ color: C.mint4, fontFamily: FONTS.serif }}>{title}</h2>
            {subtitle && <p className="text-xs" style={{ color: C.mint4 + "AA" }}>{subtitle}</p>}
          </div>
          {children}
          {footer && <div className="text-center text-xs pt-5 mt-5 border-t" style={{ color: C.mint1 + "AA", borderColor: C.mint1 + "22" }}>{footer}</div>}
        </div>
      </div>
    </div>
  );
}

export function AuthField({ label, type, ...props }) {
  const [show, setShow] = useState(false);
  const isPassword = type === "password";

  return (
    <div className="mb-4">
      <label className="text-[10px] uppercase tracking-widest block mb-1.5" style={{ color: C.mint1 + "CC" }}>{label}</label>
      <div className="relative">
        <input
          {...props}
          type={isPassword ? (show ? "text" : "password") : type}
          className="w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none transition-colors"
          style={{ background: "rgba(255,255,255,0.05)", color: C.mint4, borderColor: C.mint1 + "44", paddingRight: isPassword ? "2.75rem" : undefined }}
          onFocus={(e) => (e.target.style.borderColor = C.mint1)}
          onBlur={(e) => (e.target.style.borderColor = C.mint1 + "44")}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            className="absolute right-3 top-1/2 -translate-y-1/2 focus:outline-none"
            style={{ color: C.mint1 + "99" }}
            tabIndex={-1}
          >
            {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        )}
      </div>
    </div>
  );
}

export function AuthButton({ children, ...props }) {
  return (
    <button
      {...props}
      className="w-full py-3 rounded-xl text-sm font-semibold mt-2 transition hover:opacity-90 disabled:opacity-40"
      style={{ background: C.mint1, color: C.dark }}
    >
      {children}
    </button>
  );
}
