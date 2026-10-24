import { C, FONTS, alpha } from "../styles/palette";

export default function InpSm({ value, onChange, onBlur, onFocus, mono, placeholder, readOnly }) {
  return (
    <input
      value={value ?? ""}
      onChange={(e) => onChange?.(e.target.value)}
      placeholder={placeholder}
      readOnly={readOnly}
      className={`w-full border rounded-lg px-2 py-1.5 text-sm focus:outline-none ${readOnly ? "bg-gray-50 cursor-default" : ""}`}
      style={{
        borderColor: alpha(C.mint1, "44"),
        fontFamily: mono ? FONTS.mono : undefined,
        fontSize: mono ? "0.75rem" : undefined,
      }}
      onFocus={(e) => { if (!readOnly) e.target.style.borderColor = C.mint1; onFocus?.(e); }}
      onBlur={(e) => { e.target.style.borderColor = alpha(C.mint1, "44"); onBlur?.(e.target.value); }}
    />
  );
}
