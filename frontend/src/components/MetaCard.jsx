import { C, FONTS } from "../styles/palette";

export default function MetaCard({ label, value, mono }) {
  return (
    <div className="rounded-xl border px-4 py-3" style={{ background: C.white, borderColor: C.mint1 + "44" }}>
      <div className="text-[10px] uppercase tracking-widest mb-1" style={{ color: C.sub }}>{label}</div>
      <div className="text-sm font-medium" style={mono ? { fontFamily: FONTS.mono } : { fontFamily: FONTS.serif, fontSize: 16 }}>
        {value || "—"}
      </div>
    </div>
  );
}
