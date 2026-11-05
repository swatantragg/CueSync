import { useEffect, useState } from "react";
import { useApp } from "../context/AppContext";
import AuthShell, { AuthField, AuthButton } from "../components/AuthShell";
import { C, alpha } from "../styles/palette";
import { api } from "../utils/api";

// The Google redirect lands back here with a one-time ticket (or an error) in the URL fragment. Read and removed
// once at load: React's StrictMode runs effects twice and the ticket only works once.
let googleResult = (() => {
  const hash = new URLSearchParams(window.location.hash.slice(1));
  const ticket = hash.get("google_ticket");
  const error = hash.get("google_error");
  if (!ticket && !error) return null;
  window.history.replaceState(null, "", window.location.pathname + window.location.search);
  return { ticket, error };
})();

function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" className="w-4 h-4 shrink-0" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.7 1.2 9.2 3.6l6.9-6.9C35.9 2.4 30.5 0 24 0 14.6 0 6.5 5.4 2.6 13.3l8 6.2C12.5 13.6 17.8 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 7l7.1 5.5c4.2-3.9 7.2-9.6 7.2-17z" />
      <path fill="#FBBC05" d="M10.6 28.7c-.5-1.4-.8-3-.8-4.7s.3-3.3.8-4.7l-8-6.2C.9 16.4 0 20.1 0 24s.9 7.6 2.6 10.9l8-6.2z" />
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.1-5.5c-2 1.3-4.6 2.1-8.8 2.1-6.2 0-11.5-4.1-13.4-9.9l-8 6.2C6.5 42.6 14.6 48 24 48z" />
    </svg>
  );
}

export default function LoginPage() {
  const { login, loginWithGoogle } = useApp();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [google, setGoogle] = useState(false);

  useEffect(() => {
    api.googleConfig().then((c) => setGoogle(!!c.enabled)).catch(() => {});
    const result = googleResult;
    googleResult = null;
    if (result?.error) setErr(result.error);
    if (result?.ticket) {
      setBusy(true);
      loginWithGoogle(result.ticket).catch((ex) => setErr(ex.message)).finally(() => setBusy(false));
    }
  }, []);

  const onSubmit = async (e) => {
    e.preventDefault();
    setErr(""); setBusy(true);
    try { await login(email, password); } catch (ex) { setErr(ex.message); } finally { setBusy(false); }
  };

  return (
    <AuthShell
      title="Sign in"
      subtitle="Welcome back — enter your credentials"
      footer="Accounts are created by your administrator. Contact them if you need access."
    >
      <form onSubmit={onSubmit}>
        <AuthField label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="you@company.com" autoComplete="email" />
        <AuthField label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required placeholder="••••••••" autoComplete="current-password" />
        {err && (
          <div className="text-xs mb-3 px-3 py-2 rounded-lg" style={{ background: "#C0392B33", color: "#FFB4A9" }}>
            {err.split("\n").map((line, i) => <div key={i}>• {line}</div>)}
          </div>
        )}
        <AuthButton type="submit" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</AuthButton>
      </form>
      {google && (
        <>
          <div className="flex items-center gap-3 my-4 text-[0.625rem] uppercase tracking-widest" style={{ color: alpha(C.mint1, "AA") }}>
            <span className="flex-1 h-px" style={{ background: alpha(C.mint1, "33") }} /> or <span className="flex-1 h-px" style={{ background: alpha(C.mint1, "33") }} />
          </div>
          <a href={api.googleStartUrl()} aria-disabled={busy}
            className="w-full flex items-center justify-center gap-2.5 py-3 rounded-xl text-sm font-semibold transition hover:opacity-90"
            style={{ background: "#FFFFFF", color: "#1F1F1F" }}>
            <GoogleMark /> Continue with Google
          </a>
          <p className="text-[0.6875rem] text-center mt-2" style={{ color: alpha(C.mint4, "AA") }}>Use the Google account with your CueSync email.</p>
        </>
      )}
    </AuthShell>
  );
}
