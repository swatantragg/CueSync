import { C, FONTS, alpha, T } from "../styles/palette";

export default function Inp({ value, onChange, onBlur, placeholder, mono, readOnly }) {
  return (
    <input
      value={value ?? ""}
      onChange={(e) => onChange?.(e.target.value)}
      placeholder={placeholder}
      readOnly={readOnly}
      className={`w-full border rounded-xl px-3 py-2 text-sm focus:outline-none transition-colors ${readOnly ? "bg-gray-50 cursor-default" : ""}`}
      style={{
        borderColor: alpha(C.mint1, "66"),
        fontFamily: mono ? FONTS.mono : undefined,
        fontSize: mono ? "0.8125rem" : undefined,
        background: readOnly ? T.neutralBg : C.white,
      }}
      onFocus={(e) => { if (!readOnly) e.target.style.borderColor = C.mint1; }}
      onBlur={(e) => { e.target.style.borderColor = alpha(C.mint1, "66"); onBlur?.(e.target.value); }}
    />
  );
}
