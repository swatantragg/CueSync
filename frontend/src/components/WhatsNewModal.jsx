import { Sparkles } from "lucide-react";
import { C, FONTS, alpha } from "../styles/palette";
import { useApp } from "../context/AppContext";
import { APP_VERSION } from "../constants/version";

const ROLE_TAG = { work_delegator: "Work Delegator", reviewer: "Reviewer", editor: "Editor" };

// Admins see every change, so each one says who it's for ("Admin" when nobody else gets it; nothing when everyone does).
function audience(roles) {
  if (roles.includes("viewer")) return "Everyone";
  return roles.length ? roles.map((r) => ROLE_TAG[r]).join(" · ") : "Admin";
}

// One-time popup per user per release, listing only what changed for their role (dismissal is stored server-side on the user).
export default function WhatsNewModal() {
  const { showWhatsNew, whatsNew, dismissWhatsNew, screen, isAdmin } = useApp();
  if (!showWhatsNew || screen === "login") return null;
  return (
    <div className="cs-backdrop fixed inset-0 z-[70] flex items-center justify-center">
      <div className="cs-glass w-full max-w-xl rounded-2xl overflow-hidden flex flex-col" style={{ fontFamily: FONTS.sans, maxHeight: "calc(100vh - 40px)" }} role="dialog" aria-modal="true" aria-label="What's new">
        <div className="cs-dark px-6 pt-6 pb-5" style={{ background: C.dark }}>
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest mb-2" style={{ color: C.mint1 }}>
            <Sparkles className="w-4 h-4" /> What's new
          </div>
          <h3 className="text-3xl" style={{ fontFamily: FONTS.serif, color: C.mint4 }}>CueSync V{APP_VERSION}</h3>
          <p className="text-sm mt-1" style={{ color: alpha(C.mint4, "BB") }}>Here's what changed in this update.</p>
        </div>
        <ol className="cs-scroll overflow-y-auto px-6 py-5 space-y-4">
          {whatsNew.map((c, i) => (
            <li key={`${c.version}-${c.title}-${i}`} className="flex gap-3">
              <span className="w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold shrink-0" style={{ background: C.mint4, color: C.dark }}>{i + 1}</span>
              <div className="min-w-0">
                <div className="text-sm font-semibold" style={{ color: C.dark }}>{c.title}</div>
                <div className="text-sm mt-0.5" style={{ color: C.sub }}>{c.body}</div>
                {isAdmin && <div className="text-[0.625rem] font-semibold uppercase tracking-wider mt-1" style={{ color: C.sub }}>{audience(c.roles)}</div>}
              </div>
            </li>
          ))}
        </ol>
        <div className="px-6 py-4 border-t flex justify-end" style={{ borderColor: C.mint4 }}>
          <button onClick={dismissWhatsNew} className="px-6 py-2.5 rounded-xl text-sm font-semibold hover:opacity-90" style={{ background: C.dark, color: C.mint4 }} autoFocus>
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
