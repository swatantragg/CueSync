import { C } from "../styles/palette";

const SPAN = { 2: "col-span-2", 3: "col-span-3", 4: "col-span-4" };
const TAG = {
  auto:   { c: "#27AE60", l: "A" },
  once:   { c: "#1D4E89", l: "S" },
  hybrid: { c: "#C0392B", l: "H" },
  manual: { c: "#B08900", l: "M" },
};

export default function Fld({ label, children, span, tag }) {
  const cls = SPAN[span] || "";
  const t = TAG[tag];
  return (
    <div className={cls}>
      <label className="text-[10px] uppercase tracking-widest block mb-1.5 flex items-center gap-1.5" style={{ color: C.sub }}>
        {t && (
          <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full text-[7px] font-bold text-white" style={{ background: t.c }}>
            {t.l}
          </span>
        )}
        {label}
      </label>
      {children}
    </div>
  );
}
