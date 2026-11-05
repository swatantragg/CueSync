import { useCallback, useEffect, useState } from "react";
import {
  Plus, Edit2, Trash2, X, Mail, RefreshCw, Unlink, Link2, AlertTriangle, CheckCircle2, Search,
} from "lucide-react";
import { C, FONTS, alpha, T } from "../styles/palette";
import Select from "./Select";
import { api, API_ORIGIN } from "../utils/api";
import { fmtDateTime } from "../utils/format";
import { showAlert, showConfirm } from "./Dialog";
import { useApp } from "../context/AppContext";

const MAILBOX = {
  connected:        { label: "Connected",        bg: T.greenBg,  color: T.green  },
  reconnect_needed: { label: "Reconnect needed", bg: T.orangeBg, color: T.orange },
  none:             { label: "Not connected",    bg: T.grayBg,   color: T.grayMid },
};

const TH = "text-left text-[0.625rem] uppercase tracking-wider font-semibold px-4 py-2.5";

function MailboxPill({ status }) {
  const s = MAILBOX[status] || MAILBOX.none;
  return (
    <span className="inline-flex items-center gap-1 text-[0.625rem] px-2 py-0.5 rounded-full font-semibold whitespace-nowrap" style={{ background: s.bg, color: s.color }}>
      {status === "connected" ? <CheckCircle2 className="w-3 h-3" /> : status === "reconnect_needed" ? <AlertTriangle className="w-3 h-3" /> : null}
      {s.label}
    </span>
  );
}

function RowButton({ onClick, disabled, title, primary, danger, children }) {
  return (
    <button onClick={onClick} disabled={disabled} title={title}
      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
      style={primary
        ? { background: C.dark, color: C.mint4 }
        : { background: danger ? T.redBg : C.mint4, color: danger ? T.red : C.dark }}>
      {children}
    </button>
  );
}

// ─── Add / edit client ────────────────────────────────────────────────────────
function ClientForm({ initial, onSave, onClose }) {
  const [form, setForm] = useState({
    name: initial?.name || "",
    email: initial?.email || "",
    notes: initial?.notes || "",
    is_active: initial ? initial.is_active : true,
  });
  const [saving, setSaving] = useState(false);
  const locked = initial?.mailbox && "Disconnect the Gmail connection before changing the email.";

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { await showAlert("Enter the client name.", { variant: "warn" }); return; }
    setSaving(true);
    try {
      await onSave({ name: form.name.trim(), email: form.email.trim() || null, notes: form.notes.trim() || null, ...(initial ? { is_active: form.is_active } : {}) });
      onClose();
    } catch (ex) {
      await showAlert(ex.message, { title: "Save Failed", variant: "error" });
    } finally { setSaving(false); }
  };

  const inp = "w-full px-3 py-2 rounded-lg text-sm focus:outline-none";
  const inpStyle = { background: C.mid, color: C.mint4, border: `1px solid ${alpha(C.mint1, "33")}` };

  return (
    <div className="cs-backdrop fixed inset-0 z-50 flex items-center justify-center">
      <div className="cs-dark cs-glass rounded-2xl w-full max-w-md overflow-hidden">
        <div className="px-6 py-4 border-b flex items-center justify-between" style={{ borderColor: C.mid }}>
          <h3 className="font-semibold text-lg" style={{ fontFamily: FONTS.serif, color: C.mint4 }}>
            {initial ? "Edit Client" : "Add Client"}
          </h3>
          <button onClick={onClose} style={{ color: C.muted }}><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: C.muted }}>Client Name *</label>
            <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Client 1" className={inp} style={inpStyle} autoFocus />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: C.muted }}>Gmail Address</label>
            <input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              placeholder="client1@gmail.com" className={inp} style={{ ...inpStyle, opacity: locked ? 0.6 : 1 }}
              disabled={!!locked} title={locked || undefined} />
            <p className="text-[0.6875rem] mt-1" style={{ color: C.muted }}>
              {locked || "The mailbox CueSync sends from for this client. Needed before connecting Gmail."}
            </p>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: C.muted }}>Notes</label>
            <textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              rows={2} placeholder="Optional notes…" className={`${inp} resize-none`} style={inpStyle} />
          </div>
          {initial && (
            <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: C.mint4 }}>
              <input type="checkbox" checked={form.is_active} onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))} />
              Active — can be picked for new delegations and submissions
            </label>
          )}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm" style={{ color: C.muted }}>Cancel</button>
            <button type="submit" disabled={saving} className="px-5 py-2 rounded-lg text-sm font-medium disabled:opacity-50" style={{ background: C.mint1, color: C.dark }}>
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Names typed before the client list existed ───────────────────────────────
function LegacyNames({ groups, clients, onLink, onCreate }) {
  const [pick, setPick] = useState({});
  const active = clients.filter((c) => c.is_active);
  if (!groups.length) return null;
  return (
    <div className="rounded-2xl border overflow-hidden" style={{ background: C.white, borderColor: T.amberBorder }}>
      <div className="px-5 py-3 border-b" style={{ background: T.amberBg, borderColor: T.amberBorder }}>
        <div className="text-sm font-semibold" style={{ color: C.dark }}>Old client names to link ({groups.length})</div>
        <div className="text-xs mt-0.5" style={{ color: C.sub }}>
          These names were typed before the client list existed. Link each one to a client, or add it as a client, so all its work shows under one name.
        </div>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr style={{ background: alpha(C.mint4, "33"), color: C.sub }}>
            <th className={TH}>Typed as</th>
            <th className={TH}>Used in</th>
            <th className={`${TH} text-right`}>Link to</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => {
            const chosen = pick[g.label] ?? (g.match ? String(g.match.id) : "");
            return (
              <tr key={g.label} className="border-t" style={{ borderColor: alpha(C.mint4, "88") }}>
                <td className="px-4 py-2.5">
                  <div className="font-semibold" style={{ color: C.dark }}>{g.label}</div>
                  {g.names.length > 1 && (
                    <div className="text-[0.6875rem]" style={{ color: C.sub }}>also typed as {g.names.slice(1).map((n) => `"${n}"`).join(", ")}</div>
                  )}
                </td>
                <td className="px-4 py-2.5 text-xs" style={{ color: C.sub }}>
                  {g.delegations} delegation{g.delegations !== 1 ? "s" : ""} · {g.submissions} submission{g.submissions !== 1 ? "s" : ""}
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex items-center justify-end gap-2">
                    <Select value={chosen} onChange={(e) => setPick((p) => ({ ...p, [g.label]: e.target.value }))}
                      className="px-3 py-1.5 rounded-lg text-xs border min-w-44"
                      style={{ borderColor: alpha(C.mint1, "44"), color: C.dark, background: C.white }}>
                      <option value="">Choose client…</option>
                      {active.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </Select>
                    <RowButton primary disabled={!chosen} onClick={() => onLink(Number(chosen), g)}>
                      <Link2 className="w-3 h-3" /> Link
                    </RowButton>
                    <RowButton onClick={() => onCreate(g)} title={`Add "${g.label}" to the client list`}>
                      <Plus className="w-3 h-3" /> Add as client
                    </RowButton>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Clients tab (Admin + Reviewer) ───────────────────────────────────────────
export default function ClientsPanel({ canDelete = false }) {
  const { pushToast } = useApp();
  const [clients, setClients] = useState([]);
  const [legacy, setLegacy]   = useState([]);
  const [config, setConfig]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy]       = useState(null);   // client id with a request in flight
  const [editing, setEditing] = useState(null);   // null | "new" | client
  const [q, setQ]             = useState("");

  const load = useCallback(() => {
    Promise.all([api.listClients(), api.legacyClientNames(), api.clientMailConfig()])
      .then(([c, l, cfg]) => { setClients(c); setLegacy(l); setConfig(cfg); })
      .catch((ex) => pushToast({ kind: "error", title: "Could not load clients", body: ex.message }))
      .finally(() => setLoading(false));
  }, [pushToast]);

  useEffect(() => { load(); }, [load]);

  // The Google sign-in popup posts its result from the callback's host (GOOGLE_REDIRECT_URI);
  // returning to the tab also refreshes.
  const callbackOrigin = (() => { try { return new URL(config?.redirect_uri).origin; } catch { return null; } })();
  useEffect(() => {
    const onMessage = (e) => {
      if (e.data?.type !== "cuesync-mailbox" || ![API_ORIGIN, window.location.origin, callbackOrigin].includes(e.origin)) return;
      pushToast({ kind: e.data.ok ? "success" : "error", title: e.data.ok ? "Gmail connected" : "Gmail not connected", body: e.data.message, duration: e.data.ok ? undefined : 9000 });
      load();
    };
    window.addEventListener("message", onMessage);
    window.addEventListener("focus", load);
    return () => { window.removeEventListener("message", onMessage); window.removeEventListener("focus", load); };
  }, [load, pushToast, callbackOrigin]);

  const run = async (id, fn) => {
    setBusy(id);
    try { await fn(); } catch (ex) { await showAlert(ex.message, { title: "Failed", variant: "error" }); }
    finally { setBusy(null); }
  };

  const save = async (payload) => {
    if (editing === "new") {
      const c = await api.createClient(payload);
      pushToast({ kind: "success", title: `${c.name} added`, body: c.linked ? `Linked ${c.linked} earlier entr${c.linked === 1 ? "y" : "ies"} typed with this name.` : undefined });
    } else {
      await api.updateClient(editing.id, payload);
    }
    load();
  };

  const connect = async (c) => {
    const ok = await showConfirm(
      `A Google sign-in window opens next.\n\n1. Sign in as ${c.email} with the client's password (and the OTP if Google asks).\n2. If Google says "Google hasn't verified this app", click Advanced → Go to CueSync.\n3. Tick both permissions and click Continue.\n\nThe window closes by itself when the connection is saved.`,
      { title: `Connect ${c.name}'s Gmail`, confirmLabel: "Open Google sign-in", variant: "info" },
    );
    if (!ok) return;
    const popup = window.open("", "cuesync-gmail", "width=520,height=720");
    await run(c.id, async () => {
      try {
        const { url } = await api.connectClientMailbox(c.id);
        if (popup) popup.location.href = url; else window.location.href = url;
      } catch (ex) { popup?.close(); throw ex; }
    });
  };

  const check = (c) => run(c.id, async () => {
    const row = await api.checkClientMailbox(c.id);
    const ok = row.mailbox?.status === "connected" && !row.mailbox?.last_error;
    pushToast({ kind: ok ? "success" : "error", title: ok ? `${c.name}'s Gmail works` : `${c.name}'s Gmail has a problem`, body: ok ? undefined : row.mailbox?.last_error });
    load();
  });

  const disconnect = async (c) => {
    const ok = await showConfirm(`CueSync will stop using ${c.mailbox.email} and remove its access from that Google account.`,
      { title: `Disconnect ${c.name}'s Gmail?`, confirmLabel: "Disconnect", variant: "warn" });
    if (ok) run(c.id, async () => { await api.disconnectClientMailbox(c.id); load(); });
  };

  const remove = async (c) => {
    const ok = await showConfirm(`Remove ${c.name} from the client list?`, { title: "Delete Client", confirmLabel: "Delete" });
    if (ok) run(c.id, async () => { await api.deleteClient(c.id); load(); });
  };

  const link = (clientId, g) => run(`legacy:${g.label}`, async () => {
    const { linked } = await api.linkClientNames(clientId, g.names);
    pushToast({ kind: "success", title: `Linked ${linked} entr${linked === 1 ? "y" : "ies"}`, body: `"${g.label}" now shows as ${clients.find((c) => c.id === clientId)?.name}.` });
    load();
  });

  const addFromLegacy = (g) => run(`legacy:${g.label}`, async () => {
    const c = await api.createClient({ name: g.label });
    if (g.names.length) await api.linkClientNames(c.id, g.names);
    pushToast({ kind: "success", title: `${c.name} added`, body: "Add its Gmail address with Edit, then connect Gmail." });
    load();
  });

  const needle = q.trim().toLowerCase();
  const shown = clients.filter((c) => !needle || c.name.toLowerCase().includes(needle) || (c.email || "").toLowerCase().includes(needle));
  const count = (status) => clients.filter((c) => c.is_active && (c.mailbox?.status || "none") === status).length;

  if (loading) return <div className="p-8 text-center text-sm" style={{ color: C.sub }}>Loading…</div>;

  return (
    <div className="space-y-5">
      {editing && <ClientForm initial={editing === "new" ? null : editing} onSave={save} onClose={() => setEditing(null)} />}

      {config && !config.ready && (
        <div className="rounded-xl border px-4 py-3 flex items-start gap-3" style={{ background: T.amberBg, borderColor: T.amberBorder }}>
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" style={{ color: T.orange }} />
          <div className="text-xs" style={{ color: C.dark }}>
            <div className="font-semibold mb-0.5">Gmail connection is not set up on the server yet</div>
            Clients can be added now; connecting Gmail needs these server settings first: <b>{config.missing.join(", ")}</b>.
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-48 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: C.sub }} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search clients…"
            className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border focus:outline-none"
            style={{ borderColor: alpha(C.mint1, "44"), background: C.white, color: C.dark }} />
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs" style={{ color: C.sub }}>
          <MailboxPill status="connected" /> {count("connected")}
          <MailboxPill status="reconnect_needed" /> {count("reconnect_needed")}
          <MailboxPill status="none" /> {count("none")}
        </div>
        <button onClick={() => setEditing("new")}
          className="ml-auto inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium"
          style={{ background: C.dark, color: C.mint4 }}>
          <Plus className="w-4 h-4" /> Add Client
        </button>
      </div>

      <div className="rounded-2xl border overflow-hidden" style={{ background: C.white, borderColor: alpha(C.mint1, "44") }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: alpha(C.mint4, "33"), color: C.sub }}>
              <th className={TH}>Client</th>
              <th className={TH}>Gmail</th>
              <th className={TH}>Connection</th>
              <th className={TH}>Used in</th>
              <th className={`${TH} text-right`}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 && (
              <tr><td colSpan={5} className="px-5 py-10 text-center text-sm" style={{ color: C.sub }}>
                {clients.length ? `No clients match "${q}".` : "No clients yet. Add the first one to start connecting their Gmail."}
              </td></tr>
            )}
            {shown.map((c) => {
              const mb = c.mailbox;
              const status = mb?.status || "none";
              const off = busy === c.id;
              const cantConnect = !config?.ready ? "Gmail connection is not set up on the server yet"
                : !c.email ? "Add the client's Gmail address first (Edit)"
                : !c.is_active ? "Client is deactivated" : null;
              return (
                <tr key={c.id} className="border-t align-top" style={{ borderColor: alpha(C.mint4, "88"), opacity: c.is_active ? 1 : 0.55 }}>
                  <td className="px-4 py-3">
                    <div className="font-semibold flex items-center gap-2" style={{ color: C.dark }}>
                      {c.name}
                      {!c.is_active && <span className="text-[0.625rem] px-1.5 py-0.5 rounded font-semibold" style={{ background: T.grayBg, color: T.grayMid }}>Inactive</span>}
                    </div>
                    {c.notes && <div className="text-[0.6875rem] mt-0.5" style={{ color: C.sub }}>{c.notes}</div>}
                  </td>
                  <td className="px-4 py-3 text-xs" style={{ color: c.email ? C.dark : C.sub }}>
                    {c.email || "—"}
                  </td>
                  <td className="px-4 py-3">
                    <MailboxPill status={status} />
                    {mb && (
                      <div className="text-[0.6875rem] mt-1 max-w-64" style={{ color: status === "connected" ? C.sub : T.orange }}>
                        {status === "connected"
                          ? `by ${mb.connected_by_name || "—"} · ${fmtDateTime(mb.connected_at)}`
                          : mb.last_error}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs whitespace-nowrap" style={{ color: C.sub }}>
                    {c.delegations} delegation{c.delegations !== 1 ? "s" : ""}<br />
                    {c.submissions} submission{c.submissions !== 1 ? "s" : ""}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1.5 flex-wrap">
                      {status === "none" && (
                        <RowButton primary disabled={off || !!cantConnect} title={cantConnect || undefined} onClick={() => connect(c)}>
                          <Mail className="w-3 h-3" /> Connect Gmail
                        </RowButton>
                      )}
                      {status === "reconnect_needed" && (
                        <RowButton primary disabled={off || !!cantConnect} title={cantConnect || undefined} onClick={() => connect(c)}>
                          <RefreshCw className="w-3 h-3" /> Reconnect
                        </RowButton>
                      )}
                      {status === "connected" && (
                        <RowButton disabled={off} onClick={() => check(c)} title="Check that CueSync can still use this mailbox">
                          <RefreshCw className={`w-3 h-3 ${off ? "animate-spin" : ""}`} /> Check
                        </RowButton>
                      )}
                      {mb && (
                        <RowButton disabled={off} onClick={() => disconnect(c)} title="Stop using this mailbox">
                          <Unlink className="w-3 h-3" /> Disconnect
                        </RowButton>
                      )}
                      <RowButton disabled={off} onClick={() => setEditing(c)} title="Edit client">
                        <Edit2 className="w-3 h-3" />
                      </RowButton>
                      {canDelete && (
                        <RowButton danger disabled={off} onClick={() => remove(c)} title="Delete client">
                          <Trash2 className="w-3 h-3" />
                        </RowButton>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <LegacyNames groups={legacy} clients={clients} onLink={link} onCreate={addFromLegacy} />
    </div>
  );
}
