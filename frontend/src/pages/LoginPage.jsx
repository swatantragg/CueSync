import { useState } from "react";
import { C } from "../styles/palette";
import { useApp } from "../context/AppContext";
import AuthShell, { AuthField, AuthButton } from "../components/AuthShell";

export default function LoginPage() {
  const { login, setScreen } = useApp();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setErr(""); setBusy(true);
    try { await login(email, password); } catch (ex) { setErr(ex.message); } finally { setBusy(false); }
  };

  return (
    <AuthShell
      title="Sign in"
      subtitle="Welcome back — enter your credentials"
      footer={
        <>
          No account?{" "}
          <button onClick={() => setScreen("signup")} className="underline hover:opacity-80" style={{ color: C.mint1 }}>
            Create one
          </button>
        </>
      }
    >
      <form onSubmit={onSubmit}>
        <AuthField label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="you@company.com" autoComplete="email" />
        <AuthField label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required placeholder="••••••••" autoComplete="current-password" />
        {err && <div className="text-xs mb-3 px-3 py-2 rounded-lg" style={{ background: "#C0392B33", color: "#FFB4A9" }}>{err}</div>}
        <AuthButton type="submit" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</AuthButton>
      </form>
    </AuthShell>
  );
}
