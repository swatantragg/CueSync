import { C, FONTS, alpha } from "../styles/palette";

export default function MetaCard({ label, value, mono }) {
  return (
    <div className="rounded-xl border px-4 py-3" style={{ background: C.white, borderColor: alpha(C.mint1, "44") }}>
      <div className="text-[0.625rem] uppercase tracking-widest mb-1" style={{ color: C.sub }}>{label}</div>
      <div className="text-sm font-medium" style={mono ? { fontFamily: FONTS.mono } : { fontFamily: FONTS.serif, fontSize: "1rem" }}>
        {value || "—"}
      </div>
    </div>
  );
}
