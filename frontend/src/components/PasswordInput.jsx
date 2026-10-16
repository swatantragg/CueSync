import { useState } from "react";
import { Check, Eye, EyeOff, X } from "lucide-react";
import { C, alpha } from "../styles/palette";
import { PASSWORD_RULES } from "../utils/password";

// Password box with a show/hide toggle; className/style apply to the <input>.
export default function PasswordInput({ className = "", style, ...props }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        {...props}
        type={show ? "text" : "password"}
        className={`w-full ${className}`}
        style={{ ...style, paddingRight: "2.5rem" }}
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-md hover:opacity-70 focus:outline-none"
        style={{ color: style?.color || C.sub }}
        title={show ? "Hide password" : "Show password"}
        aria-label={show ? "Hide password" : "Show password"}
        tabIndex={-1}
      >
        {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  );
}

// Live checklist of the password policy.
export function PasswordRules({ value, tone = "light" }) {
  const dark = tone === "dark";
  return (
    <ul className="grid grid-cols-2 gap-x-4 gap-y-1">
      {PASSWORD_RULES.map((r) => {
        const ok = r.test(value || "");
        const color = ok ? (dark ? C.mint1 : C.ok) : (dark ? alpha(C.mint4, "99") : C.sub);
        return (
          <li key={r.key} className="flex items-center gap-1.5 text-xs" style={{ color }}>
            {ok ? <Check className="w-3.5 h-3.5 shrink-0" /> : <X className="w-3.5 h-3.5 shrink-0 opacity-60" />}
            {r.label}
          </li>
        );
      })}
    </ul>
  );
}
