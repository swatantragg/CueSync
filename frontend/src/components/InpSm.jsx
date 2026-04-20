import { C, FONTS } from "../styles/palette";

export default function InpSm({ value, onChange, mono, placeholder, readOnly }) {
  return (
    <input
      value={value ?? ""}
      onChange={(e) => onChange?.(e.target.value)}
      placeholder={placeholder}
      readOnly={readOnly}
      className={`w-full border rounded-lg px-2 py-1.5 text-sm focus:outline-none ${readOnly ? "bg-gray-50 cursor-default" : ""}`}
      style={{
        borderColor: C.mint1 + "44",
        fontFamily: mono ? FONTS.mono : undefined,
        fontSize: mono ? 12 : undefined,
      }}
      onFocus={(e) => { if (!readOnly) e.target.style.borderColor = C.mint1; }}
      onBlur={(e) => (e.target.style.borderColor = C.mint1 + "44")}
    />
  );
}
