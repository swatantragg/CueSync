import { useState } from "react";
import { C } from "../styles/palette";
import { useApp } from "../context/AppContext";
import AuthShell, { AuthField, AuthButton } from "../components/AuthShell";

export default function SignupPage() {
  const { signup, setScreen } = useApp();
  const [form, setForm] = useState({ username: "", email: "", password: "", confirm_password: "" });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const onSubmit = async (e) => {
    e.preventDefault();
    setErr("");
    if (form.password !== form.confirm_password) { setErr("Passwords do not match"); return; }
    if (form.password.length < 6) { setErr("Password must be at least 6 characters"); return; }
    setBusy(true);
    try {
      await signup({ full_name: form.username, email: form.email, password: form.password, confirm_password: form.confirm_password });
    } catch (ex) { setErr(ex.message); } finally { setBusy(false); }
  };

  return (
    <AuthShell
      title="Create account"
      subtitle="Join CueSync — start automating cue sheets"
      footer={
        <>
          Already have an account?{" "}
          <button onClick={() => setScreen("login")} className="underline hover:opacity-80" style={{ color: C.mint1 }}>
            Sign in
          </button>
        </>
      }
    >
      <form onSubmit={onSubmit}>
        <AuthField label="Username" value={form.username} onChange={set("username")} required placeholder="Your name" autoComplete="name" />
        <AuthField label="Email" type="email" value={form.email} onChange={set("email")} required placeholder="you@company.com" autoComplete="email" />
        <AuthField label="Password" type="password" value={form.password} onChange={set("password")} required placeholder="••••••••" autoComplete="new-password" />
        <AuthField label="Confirm password" type="password" value={form.confirm_password} onChange={set("confirm_password")} required placeholder="••••••••" autoComplete="new-password" />
        {err && (
          <div className="text-xs mb-3 px-3 py-2 rounded-lg" style={{ background: "#C0392B33", color: "#FFB4A9" }}>
            {err.split("\n").map((line, i) => <div key={i}>• {line}</div>)}
          </div>
        )}
        <AuthButton type="submit" disabled={busy}>{busy ? "Creating…" : "Create account"}</AuthButton>
      </form>
    </AuthShell>
  );
}
