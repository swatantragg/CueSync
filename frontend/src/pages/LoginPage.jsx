import { Music2, Shield, User } from "lucide-react";
import { C, FONTS } from "../styles/palette";
import { USERS_DB } from "../constants/users";
import { useApp } from "../context/AppContext";

export default function LoginPage() {
  const { setCurrentUser, setScreen } = useApp();

  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: `linear-gradient(145deg,${C.dark} 0%,${C.mid} 50%,${C.dark} 100%)`, fontFamily: FONTS.sans }}>
      <div className="absolute inset-0 opacity-30" style={{ background: `radial-gradient(circle at 30% 40%,${C.mint1} 0%,transparent 50%),radial-gradient(circle at 70% 60%,${C.mint3} 0%,transparent 50%)` }} />
      <div className="w-full max-w-lg relative z-10">
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-6" style={{ background: C.mint1 }}>
            <Music2 className="w-8 h-8" style={{ color: C.dark }} />
          </div>
          <h1 className="text-6xl mb-3" style={{ fontFamily: FONTS.serif, color: C.mint4, letterSpacing: "-0.03em" }}>CueSync</h1>
          <p className="text-xs tracking-[0.3em] uppercase" style={{ color: C.mint2 + "99" }}>CUE SHEET AUTOMATION</p>
        </div>
        <div className="p-8 rounded-2xl border" style={{ background: "rgba(255,255,255,0.05)", borderColor: C.mint1 + "22", backdropFilter: "blur(12px)" }}>
          <p className="text-center text-sm mb-6" style={{ color: C.mint4 + "AA" }}>Select your role to enter the workspace</p>
          <div className="space-y-3">
            {USERS_DB.map((u) => (
              <button
                key={u.id}
                onClick={() => { setCurrentUser(u); setScreen("workspace"); }}
                className="w-full py-4 px-5 rounded-xl text-left flex items-center gap-4 transition-all hover:scale-[1.01] active:scale-[0.99]"
                style={{ background: u.role === "admin" ? C.mint1 : "rgba(255,255,255,0.08)", border: `1px solid ${u.role === "admin" ? C.mint1 : C.mint1 + "33"}`, cursor: "pointer" }}
              >
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold" style={{ background: u.role === "admin" ? C.dark : C.mint1 + "44", color: u.role === "admin" ? C.mint1 : C.mint4 }}>
                  {u.avatar}
                </div>
                <div className="flex-1">
                  <div className="font-medium" style={{ color: u.role === "admin" ? C.dark : C.mint4 }}>{u.name}</div>
                  <div className="text-xs" style={{ color: u.role === "admin" ? C.mid : C.mint1 + "88" }}>{u.email}</div>
                </div>
                <div className="flex items-center gap-1.5 text-xs uppercase tracking-wider font-medium px-3 py-1 rounded-lg" style={{ background: u.role === "admin" ? C.dark : C.mint1 + "22", color: u.role === "admin" ? C.mint1 : C.mint2 }}>
                  {u.role === "admin" ? <Shield className="w-3.5 h-3.5" /> : <User className="w-3.5 h-3.5" />} {u.role}
                </div>
              </button>
            ))}
          </div>
          <p className="text-center text-xs pt-5 mt-5 border-t" style={{ color: C.mint1 + "44", borderColor: C.mint1 + "22" }}>Prototype · No credentials required</p>
        </div>
      </div>
    </div>
  );
}
