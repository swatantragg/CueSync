import { useEffect, useRef, useState } from "react";
import { Music2, Bell, LogOut, ChevronRight, ChevronDown, Settings, Mail, ShieldCheck, Palette } from "lucide-react";
import { C, FONTS, alpha, T } from "../styles/palette";
import { useApp } from "../context/AppContext";
import Notifications from "./Notifications";
import SettingsModal, { ModeSwitch, ThemeSwatches } from "./SettingsModal";

const ROLE_LABEL = { admin: "Admin", work_delegator: "Work Delegator", reviewer: "Reviewer", editor: "Editor", viewer: "Viewer" };

function ProfileMenu({ roleLabel, onSettings }) {
  const { currentUser, isAdmin, logout } = useApp();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const fullName = currentUser.full_name || currentUser.name || currentUser.email;
  const firstName = (fullName || "").trim().split(/\s+/)[0];

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const avatar = (cls) => (
    <div className={`${cls} rounded-lg flex items-center justify-center font-bold shrink-0`} style={{ background: isAdmin ? C.dark : C.mint1, color: isAdmin ? C.mint1 : C.dark }}>
      {currentUser.avatar || (fullName || "?").slice(0, 2).toUpperCase()}
    </div>
  );

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-2 pl-1.5 pr-2.5 py-1.5 rounded-xl transition-colors"
        style={{ background: open ? C.mint4 : alpha(C.mint4, "88"), border: `1px solid ${open ? C.mint1 : "transparent"}` }}
      >
        {avatar("w-8 h-8 text-xs")}
        <span className="text-sm font-semibold max-w-[10rem] truncate" style={{ color: C.dark }}>{firstName}</span>
        <ChevronDown className="w-4 h-4 transition-transform" style={{ color: C.sub, transform: open ? "rotate(180deg)" : "none" }} />
      </button>

      {open && (
        <div role="menu" className="cs-pop absolute right-0 mt-2 w-72 rounded-2xl border shadow-2xl overflow-hidden z-50" style={{ background: C.white, borderColor: alpha(C.mint1, "66") }}>
          <div className="px-4 py-4 flex items-center gap-3" style={{ background: alpha(C.mint4, "88") }}>
            {avatar("w-11 h-11 text-sm")}
            <div className="min-w-0">
              <div className="text-sm font-semibold truncate" style={{ color: C.dark }}>{fullName}</div>
              <span className="inline-flex items-center gap-1 mt-1 text-[0.625rem] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md" style={{ background: C.dark, color: C.mint4 }}>
                <ShieldCheck className="w-3 h-3" />{roleLabel}
              </span>
            </div>
          </div>
          <div className="px-4 py-3 border-t flex items-center gap-2 text-xs" style={{ borderColor: C.mint4, color: C.sub }}>
            <Mail className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate" title={currentUser.email}>{currentUser.email}</span>
          </div>
          <div className="px-4 py-3 border-t" style={{ borderColor: C.mint4 }}>
            <div className="flex items-center gap-2 text-xs font-semibold mb-2.5" style={{ color: C.dark }}>
              <Palette className="w-3.5 h-3.5" /> Theme
            </div>
            <ModeSwitch compact />
            <div className="mt-3"><ThemeSwatches size="sm" /></div>
          </div>
          <div className="border-t py-1" style={{ borderColor: C.mint4 }}>
            <button role="menuitem" onClick={() => { setOpen(false); onSettings(); }}
              className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-left transition-colors"
              style={{ color: C.dark }}
              onMouseEnter={(e) => (e.currentTarget.style.background = alpha(C.mint4, "AA"))}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
              <Settings className="w-4 h-4" style={{ color: C.sub }} /> Settings
              <span className="ml-auto text-xs" style={{ color: C.muted }}>Font size</span>
            </button>
            <button role="menuitem" onClick={() => { setOpen(false); logout(); }}
              className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-left transition-colors"
              style={{ color: C.danger }}
              onMouseEnter={(e) => (e.currentTarget.style.background = T.redBg)}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
              <LogOut className="w-4 h-4" /> Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Header() {
  const { role, isSuperAdmin, activeProject, activeEpisode, unreadCount, goHome, setActiveEpisodeId, setScreen } = useApp();
  const [showNotifs, setShowNotifs] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const roleLabel = isSuperAdmin ? "Super Admin" : ROLE_LABEL[role] || role;

  return (
    <header className="sticky top-0 z-30 border-b" style={{ background: C.white, borderColor: alpha(C.mint1, "44") }}>
      <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3 cursor-pointer" onClick={goHome}>
          <div className="cs-dark w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: C.dark }}>
            <Music2 className="w-4 h-4" style={{ color: C.mint1 }} />
          </div>
          <div>
            <div className="text-lg leading-none font-semibold" style={{ fontFamily: FONTS.serif, color: C.dark }}>CueSync</div>
            <div className="text-[0.5625rem] uppercase tracking-widest mt-0.5" style={{ color: C.sub }}>v3 · {roleLabel}</div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <button onClick={() => setShowNotifs(!showNotifs)} className="relative p-2 rounded-xl transition-colors" style={{ background: showNotifs ? C.mint4 : "transparent" }} aria-label="Notifications">
              <Bell className="w-5 h-5" style={{ color: C.sub }} />
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 rounded-full text-[0.5625rem] font-bold flex items-center justify-center text-white" style={{ background: C.danger }}>
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </button>
            {showNotifs && <Notifications onClose={() => setShowNotifs(false)} />}
          </div>
          <ProfileMenu roleLabel={roleLabel} onSettings={() => setShowSettings(true)} />
        </div>
      </div>
      <div className="max-w-7xl mx-auto px-6 pb-2 flex items-center gap-2 text-xs" style={{ color: C.sub }}>
        <button onClick={goHome} className="hover:underline">Projects</button>
        {activeProject && (
          <>
            <ChevronRight className="w-3 h-3" />
            <button onClick={() => { setActiveEpisodeId(null); setScreen("serial"); }} className="hover:underline">
              {activeProject.title}
            </button>
          </>
        )}
        {activeEpisode && (
          <>
            <ChevronRight className="w-3 h-3" />
            <span style={{ color: C.dark }}>Episode {activeEpisode.number}</span>
          </>
        )}
      </div>
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </header>
  );
}
