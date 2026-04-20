import { C, FONTS } from "../styles/palette";

export default function Inp({ value, onChange, placeholder, mono, readOnly }) {
  return (
    <input
      value={value ?? ""}
      onChange={(e) => onChange?.(e.target.value)}
      placeholder={placeholder}
      readOnly={readOnly}
      className={`w-full border rounded-xl px-3 py-2 text-sm focus:outline-none transition-colors ${readOnly ? "bg-gray-50 cursor-default" : ""}`}
      style={{
        borderColor: C.mint1 + "66",
        fontFamily: mono ? FONTS.mono : undefined,
        fontSize: mono ? 13 : undefined,
        background: readOnly ? "#f5f5f5" : C.white,
      }}
      onFocus={(e) => { if (!readOnly) e.target.style.borderColor = C.mint1; }}
      onBlur={(e) => (e.target.style.borderColor = C.mint1 + "66")}
    />
  );
}
