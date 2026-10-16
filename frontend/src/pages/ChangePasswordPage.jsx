import { useState } from "react";
import { C } from "../styles/palette";
import { useApp } from "../context/AppContext";
import AuthShell, { AuthField, AuthButton } from "../components/AuthShell";
import { PasswordRules } from "../components/PasswordInput";
import { isStrongPassword } from "../utils/password";

// Forced on first sign-in with an admin-assigned password (and after an admin reset).
export default function ChangePasswordPage() {
  const { currentUser, changePassword, logout } = useApp();
  const [form, setForm] = useState({ current_password: "", new_password: "", confirm_password: "" });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const mismatch = form.confirm_password && form.confirm_password !== form.new_password;

  const onSubmit = async (e) => {
    e.preventDefault();
    setErr("");
    if (!isStrongPassword(form.new_password)) { setErr("New password doesn't meet the requirements below."); return; }
    if (form.new_password !== form.confirm_password) { setErr("Passwords do not match"); return; }
    if (form.new_password === form.current_password) { setErr("New password must be different from the current one"); return; }
    setBusy(true);
    try { await changePassword(form); } catch (ex) { setErr(ex.message); } finally { setBusy(false); }
  };

  return (
    <AuthShell
      title="Set your password"
      subtitle={`Welcome${currentUser?.full_name ? `, ${currentUser.full_name.split(/\s+/)[0]}` : ""} — replace the password your admin gave you to continue`}
      footer={
        <button onClick={logout} className="underline hover:opacity-80" style={{ color: C.mint1 }}>
          Sign out
        </button>
      }
    >
      <form onSubmit={onSubmit}>
        <AuthField label="Current (assigned) password" type="password" value={form.current_password} onChange={set("current_password")} required placeholder="••••••••" autoComplete="current-password" />
        <AuthField label="New password" type="password" value={form.new_password} onChange={set("new_password")} required placeholder="••••••••" autoComplete="new-password" />
        <div className="-mt-2 mb-4 px-1">
          <PasswordRules value={form.new_password} tone="dark" />
        </div>
        <AuthField label="Confirm new password" type="password" value={form.confirm_password} onChange={set("confirm_password")} required placeholder="••••••••" autoComplete="new-password" />
        {mismatch && <div className="-mt-2 mb-3 text-xs px-1" style={{ color: "#FFB4A9" }}>Passwords do not match</div>}
        {err && (
          <div className="text-xs mb-3 px-3 py-2 rounded-lg" style={{ background: "#C0392B33", color: "#FFB4A9" }}>
            {err.split("\n").map((line, i) => <div key={i}>• {line}</div>)}
          </div>
        )}
        <AuthButton type="submit" disabled={busy || !isStrongPassword(form.new_password) || form.new_password !== form.confirm_password}>
          {busy ? "Saving…" : "Save password & continue"}
        </AuthButton>
      </form>
    </AuthShell>
  );
}
