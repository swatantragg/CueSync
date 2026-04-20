import { Download } from "lucide-react";
import { C, FONTS } from "../styles/palette";

export default function ExpBtn({ label, sub, icon, onClick }) {
  return (
    <button
      onClick={onClick}
      className="px-6 py-5 text-left transition-colors group"
      style={{ borderColor: C.mid }}
      onMouseEnter={(e) => (e.currentTarget.style.background = C.mid)}
      onMouseLeave={(e) => (e.currentTarget.style.background = "")}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-lg">{icon}</span>
        <Download className="w-4 h-4 opacity-40 group-hover:opacity-100" style={{ color: C.mint1 }} />
      </div>
      <div className="font-semibold text-lg" style={{ fontFamily: FONTS.serif, color: C.mint4 }}>{label}</div>
      <div className="text-xs mt-1" style={{ color: C.mint1 + "88" }}>{sub}</div>
    </button>
  );
}
