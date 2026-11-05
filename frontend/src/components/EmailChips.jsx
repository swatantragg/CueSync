import { useState } from "react";
import { X } from "lucide-react";
import { C, alpha, T } from "../styles/palette";

const EMAIL_RE = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;

/**
 * Email address list as removable chips. Enter, comma, semicolon, space or leaving the field adds
 * what was typed; pasting a list adds every address in it. `tone="dark"` matches the dark modals.
 */
export default function EmailChips({ value, onChange, placeholder = "name@example.com", tone = "light", disabled }) {
  const [text, setText] = useState("");
  const [bad, setBad] = useState("");
  const dark = tone === "dark";
  const box = dark
    ? { background: C.mid, borderColor: alpha(C.mint1, "33"), color: C.mint4 }
    : { background: C.white, borderColor: alpha(C.mint1, "44"), color: C.dark };
  const chip = dark ? { background: alpha(C.mint1, "33"), color: C.mint4 } : { background: C.mint4, color: C.dark };

  const add = (raw) => {
    const parts = raw.split(/[\s,;]+/).map((p) => p.trim()).filter(Boolean);
    if (!parts.length) { setText(""); setBad(""); return; }
    const invalid = parts.filter((p) => !EMAIL_RE.test(p));
    const fresh = parts.filter((p) => EMAIL_RE.test(p) && !value.some((v) => v.toLowerCase() === p.toLowerCase()));
    if (fresh.length) onChange([...value, ...fresh]);
    setText(invalid.join(" "));
    setBad(invalid.length ? `Not an email address: ${invalid.join(", ")}` : "");
  };

  const onKeyDown = (e) => {
    if (["Enter", ",", ";", " "].includes(e.key)) {
      if (text.trim()) { e.preventDefault(); add(text); } else if (e.key === "Enter") e.preventDefault();
    } else if (e.key === "Backspace" && !text && value.length) {
      onChange(value.slice(0, -1));
    }
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5 px-2 py-1.5 rounded-lg border min-h-[calc(22px+1.25rem)]"
        style={{ ...box, borderColor: bad ? T.red : box.borderColor, opacity: disabled ? 0.6 : 1 }}>
        {value.map((email) => (
          <span key={email} className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-md text-xs" style={chip}>
            {email}
            {!disabled && (
              <button type="button" onClick={() => onChange(value.filter((v) => v !== email))} className="hover:opacity-70" title="Remove">
                <X className="w-3 h-3" />
              </button>
            )}
          </span>
        ))}
        <input value={text} disabled={disabled}
          onChange={(e) => { setText(e.target.value); setBad(""); }}
          onKeyDown={onKeyDown}
          onBlur={() => text.trim() && add(text)}
          onPaste={(e) => { const t = e.clipboardData.getData("text"); if (/[\s,;]/.test(t.trim())) { e.preventDefault(); add(t); } }}
          placeholder={value.length ? "" : placeholder}
          className="flex-1 min-w-[200px] bg-transparent text-sm focus:outline-none px-1 py-0.5"
          style={{ color: box.color }} />
      </div>
      {bad && <p className="text-[0.6875rem] mt-1" style={{ color: T.red }}>{bad}</p>}
    </div>
  );
}
