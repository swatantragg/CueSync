import { useState } from "react";
import { Music2, Bell, LogOut, ChevronRight } from "lucide-react";
import { C, FONTS } from "../styles/palette";
import { useApp } from "../context/AppContext";
import Notifications from "./Notifications";
import HealthBadge from "./HealthBadge";

export default function Header() {
  const { currentUser, isAdmin, activeProject, activeEpisode, notifications, goHome, logout, setActiveEpisodeId, setScreen } = useApp();
  const [showNotifs, setShowNotifs] = useState(false);
  const unread = notifications.filter((n) => !n.read).length;

  return (
    <header className="sticky top-0 z-30 border-b" style={{ background: C.white, borderColor: C.mint1 + "44" }}>
      <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3 cursor-pointer" onClick={goHome}>
          <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: C.dark }}>
            <Music2 className="w-4 h-4" style={{ color: C.mint1 }} />
          </div>
          <div>
            <div className="text-lg leading-none font-semibold" style={{ fontFamily: FONTS.serif, color: C.dark }}>CueSync</div>
            <div className="text-[9px] uppercase tracking-widest mt-0.5" style={{ color: C.sub }}>v3 · {isAdmin ? "Admin" : "User"}</div>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <HealthBadge />
          <div className="relative">
            <button onClick={() => setShowNotifs(!showNotifs)} className="relative p-2 rounded-xl hover:bg-gray-100 transition">
              <Bell className="w-5 h-5" style={{ color: C.sub }} />
              {unread > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full text-[9px] font-bold flex items-center justify-center text-white" style={{ background: C.danger }}>
                  {unread}
                </span>
              )}
            </button>
            {showNotifs && <Notifications onClose={() => setShowNotifs(false)} />}
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl" style={{ background: C.mint4 + "66" }}>
            <div className="w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-bold" style={{ background: isAdmin ? C.dark : C.mint1, color: isAdmin ? C.mint1 : C.dark }}>
              {currentUser.avatar}
            </div>
            <div>
              <div className="text-xs font-medium" style={{ color: C.dark }}>{currentUser.name}</div>
              <div className="text-[9px] uppercase tracking-wider" style={{ color: C.sub }}>{currentUser.role}</div>
            </div>
          </div>
          <button onClick={logout} className="text-xs flex items-center gap-1 hover:opacity-70" style={{ color: C.sub }}>
            <LogOut className="w-3.5 h-3.5" /> Exit
          </button>
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
    </header>
  );
}
