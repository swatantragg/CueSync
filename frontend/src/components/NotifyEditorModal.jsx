import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Mail, Send, X } from "lucide-react";
import { C, FONTS, alpha } from "../styles/palette";
import { api, API_ORIGIN } from "../utils/api";
import { fmtDateTime, timeAgo } from "../utils/format";
import { useApp } from "../context/AppContext";
import { showConfirm } from "./Dialog";

// The pending-work list as it goes into the email. `tone="dark"` inside the dark modal.
export function WorkList({ work, tone }) {
  const ink = tone === "dark" ? C.mint4 : C.dark;
  const sub = tone === "dark" ? C.muted : C.sub;
  const line = alpha(C.mint1, tone === "dark" ? "33" : "44");
  if (!work.length) return <div className="text-xs py-2" style={{ color: sub }}>Nothing pending.</div>;
  const clients = [...new Set(work.map((r) => r.client))];
  return (
    <div className="rounded-lg divide-y" style={{ border: `1px solid ${line}`, borderColor: line }}>
      {clients.map((client) => (
        <div key={client} className="px-3 py-2.5" style={{ borderColor: line }}>
          <div className="text-[0.625rem] uppercase tracking-wider font-semibold mb-1.5" style={{ color: sub }}>{client}</div>
          <ul className="space-y-2">
            {work.filter((r) => r.client === client).map((r) => (
              <li key={r.project_id} className="text-xs min-w-0">
                <div className="font-semibold" style={{ color: ink }}>{r.title}</div>
                {[["To do", r.to_do_eps], ["Rejected", r.rejected_eps], ["Changes asked", r.changes_eps], ["Overdue", r.overdue_eps]]
                  .filter(([, eps]) => eps)
                  .map(([label, eps]) => <div key={label} className="break-words" style={{ color: sub }}><span className="font-medium">{label}:</span> {eps}</div>)}
                {r.notes.map((n) => <div key={n.episode} className="italic break-words" style={{ color: sub }}>Ep {n.episode}: {n.note}</div>)}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

// Notify Editor: an email from the Work Delegator's own Gmail with the reasons and the pending work.
export default function NotifyEditorModal({ editorId, period = "week", onClose, onSent }) {
  const { pushToast } = useApp();
  const [draft, setDraft] = useState(null);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    api.previewEditorNotice(editorId, period)
      .then((d) => { setDraft(d); setSubject(d.subject); setMessage(d.message); })
      .catch((e) => setError(e.message));
  }, [editorId, period]);

  const refreshMailbox = useCallback(() => {
    api.myMailbox().then((mailbox) => setDraft((d) => (d ? { ...d, mailbox } : d))).catch(() => {});
  }, []);

  // The Google popup reports from the callback's host; coming back to the tab also refreshes.
  const redirectUri = draft?.mailbox?.redirect_uri;
  useEffect(() => {
    const callbackOrigin = (() => { try { return new URL(redirectUri).origin; } catch { return null; } })();
    const onMessage = (e) => {
      if (e.data?.type !== "cuesync-user-mailbox" || ![API_ORIGIN, window.location.origin, callbackOrigin].includes(e.origin)) return;
      if (!e.data.ok) setError(e.data.message); else setError("");
      refreshMailbox();
    };
    window.addEventListener("message", onMessage);
    window.addEventListener("focus", refreshMailbox);
    return () => { window.removeEventListener("message", onMessage); window.removeEventListener("focus", refreshMailbox); };
  }, [redirectUri, refreshMailbox]);

  const connect = async () => {
    const popup = window.open("", "cuesync-user-gmail", "width=520,height=720");
    try {
      const { url } = await api.connectMyMailbox();
      if (popup) popup.location.href = url; else window.location.href = url;
    } catch (ex) { popup?.close(); setError(ex.message); }
  };

  const disconnect = async () => {
    const ok = await showConfirm(`CueSync will no longer be able to send from ${draft.mailbox.email}.`,
      { title: "Disconnect your Gmail?", confirmLabel: "Disconnect", variant: "danger" });
    if (!ok) return;
    try { setDraft({ ...draft, mailbox: await api.disconnectMyMailbox() }); } catch (ex) { setError(ex.message); }
  };

  const send = async () => {
    setSending(true); setError("");
    try {
      const res = await api.sendEditorNotice({ editor_id: editorId, period, subject, message });
      pushToast({ kind: "success", title: `Email sent to ${draft.editor.name}`, body: `From ${draft.mailbox.email}` });
      onSent?.(res.last_notice);
      onClose();
    } catch (ex) {
      setError(ex.message);
      refreshMailbox();
    } finally { setSending(false); }
  };

  const mailbox = draft?.mailbox;
  const label = "text-[0.625rem] uppercase tracking-widest block mb-1.5";
  const inp = "w-full rounded-lg px-3 py-2 text-sm focus:outline-none";
  const inpStyle = { background: alpha(C.mint4, "12"), color: C.mint4, border: `1px solid ${alpha(C.mint1, "33")}` };

  return (
    <div className="cs-backdrop fixed inset-0 z-50 flex items-center justify-center">
      <div className="cs-dark cs-glass rounded-2xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[94vh]" role="dialog" aria-modal="true" aria-label="Notify editor">
        <div className="px-4 sm:px-6 py-4 border-b flex items-center justify-between gap-3" style={{ borderColor: C.mid }}>
          <div className="min-w-0">
            <h3 className="font-semibold text-lg truncate" style={{ fontFamily: FONTS.serif, color: C.mint4 }}>Notify {draft?.editor.name || "editor"}</h3>
            {draft && <div className="text-xs mt-0.5" style={{ color: C.muted }}>{draft.period_label}</div>}
          </div>
          <button onClick={onClose} aria-label="Close" style={{ color: C.muted }}><X className="w-4 h-4" /></button>
        </div>

        <div className="p-4 sm:p-6 space-y-4 overflow-y-auto cs-scroll">
          {!draft && !error && <div className="text-sm py-8 text-center" style={{ color: C.muted }}>Preparing the email…</div>}
          {error && <div className="text-sm rounded-lg px-4 py-3 break-words" style={{ background: "#5A1E1E", color: "#FFD6D6" }}>{error}</div>}

          {draft && (
            <>
              {draft.last_notice && (
                <div className="rounded-lg px-4 py-2.5 text-xs" style={{ background: "#4A3511", color: "#FFE3B3" }}>
                  {draft.last_notice.sent_by} already emailed {draft.editor.name} {timeAgo(draft.last_notice.sent_at)} ({fmtDateTime(draft.last_notice.sent_at)}){draft.last_notice.read ? "; they have read it." : "; not read yet."}
                </div>
              )}

              <div>
                <label className={label} style={{ color: C.muted }}>From</label>
                {mailbox.connected ? (
                  <div className="flex flex-wrap items-center gap-2 px-3 py-2 rounded-lg text-sm" style={{ ...inpStyle, opacity: 0.9 }}>
                    <span className="min-w-0 break-all">{draft.from.name} &lt;{mailbox.email}&gt;</span>
                    <span className="ml-auto inline-flex items-center gap-1 text-[0.625rem] px-2 py-0.5 rounded-full font-semibold" style={{ background: "#1D3A27", color: "#7DD487" }}>
                      <CheckCircle2 className="w-3 h-3" /> Gmail connected
                    </span>
                    <button type="button" onClick={disconnect} className="text-[0.625rem] underline" style={{ color: C.muted }}>Disconnect</button>
                  </div>
                ) : (
                  <div className="rounded-lg px-4 py-3 text-sm space-y-2" style={{ background: "#4A3511", color: "#FFE3B3" }}>
                    <div className="font-semibold flex items-center gap-2"><Mail className="w-4 h-4 shrink-0" />
                      {mailbox.status === "reconnect_needed" ? "Your Gmail connection stopped working" : "Connect your Gmail to send this"}
                    </div>
                    {mailbox.configured ? (
                      <>
                        <div className="text-xs break-words">The email goes from your own account, {draft.from.email}. Choose that account on Google's page; CueSync can only send from it, never read it.</div>
                        <button type="button" onClick={connect} className="px-4 py-2 rounded-lg text-xs font-semibold hover:opacity-90" style={{ background: C.mint1, color: C.dark }}>
                          Connect {draft.from.email}
                        </button>
                      </>
                    ) : (
                      <div className="text-xs">Gmail sending isn't set up on the server yet. Ask your administrator to fill in the Google settings.</div>
                    )}
                  </div>
                )}
              </div>

              <div>
                <label className={label} style={{ color: C.muted }}>To</label>
                <div className="px-3 py-2 rounded-lg text-sm break-all" style={{ ...inpStyle, opacity: 0.9 }}>{draft.editor.name} &lt;{draft.editor.email}&gt;</div>
              </div>

              {draft.reasons.length > 0 && (
                <div>
                  <label className={label} style={{ color: C.muted }}>Why they're flagged</label>
                  <ul className="space-y-1">
                    {draft.reasons.map((r) => (
                      <li key={r} className="flex items-start gap-1.5 text-xs" style={{ color: C.mint4 }}>
                        <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" style={{ color: "#F2A65A" }} /> {r}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div>
                <label className={label} style={{ color: C.muted }}>Subject</label>
                <input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={300} className={inp} style={inpStyle} />
              </div>
              <div>
                <label className={label} style={{ color: C.muted }}>Message</label>
                <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={8} maxLength={10000} className={`${inp} resize-y`} style={inpStyle} />
              </div>
              <div>
                <label className={label} style={{ color: C.muted }}>Pending work (added below your message)</label>
                <WorkList work={draft.work} tone="dark" />
              </div>
            </>
          )}
        </div>

        <div className="px-4 sm:px-6 py-4 border-t flex flex-wrap items-center gap-3" style={{ borderColor: C.mid }}>
          <button type="button" onClick={onClose} className="ml-auto px-4 py-2 rounded-lg text-sm" style={{ color: C.muted }}>Cancel</button>
          {draft && (
            <button type="button" onClick={send} disabled={sending || !mailbox.connected || !subject.trim() || !message.trim()}
              className="inline-flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold disabled:opacity-40 min-w-0"
              style={{ background: C.mint1, color: C.dark }}>
              <Send className="w-4 h-4 shrink-0" /> <span className="truncate">{sending ? "Sending…" : mailbox.connected ? `Send from ${mailbox.email}` : "Send"}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
