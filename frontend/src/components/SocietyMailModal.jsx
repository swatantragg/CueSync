import { useEffect, useState } from "react";
import { X, Send, AlertTriangle, CheckCircle2, Download, Paperclip } from "lucide-react";
import { C, FONTS, alpha, T } from "../styles/palette";
import EmailChips from "./EmailChips";
import { api } from "../utils/api";
import { fmtDateTime } from "../utils/format";
import { showAlert } from "./Dialog";

/**
 * Send to Society: preview of the email from the client's Gmail to the society. Everything is
 * editable; nothing is recorded until Gmail confirms the email was sent.
 * `request` = { project_id, episode_from, episode_to, client_id, society_id }.
 */
export default function SocietyMailModal({ request, onClose, onSent }) {
  const [draft, setDraft]     = useState(null);
  const [error, setError]     = useState("");
  const [mail, setMail]       = useState(null);
  const [resend, setResend]   = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    api.previewSocietyMail(request)
      .then((d) => {
        setDraft(d);
        setMail({
          to: d.to, cc: d.cc, bcc: d.bcc, subject: d.subject, body: d.body,
          attachments: d.attachments.filter((a) => a.selected).map((a) => a.key),
        });
      })
      .catch((ex) => setError(ex.message));
  }, [request]);

  const set = (patch) => setMail((m) => ({ ...m, ...patch }));
  const toggle = (key, on) => set({ attachments: on ? [...mail.attachments, key] : mail.attachments.filter((k) => k !== key) });

  const download = async (a) => {
    try { await api.downloadBulkExport(request.project_id, a.key, request.episode_from, request.episode_to, a.filename); }
    catch (ex) { await showAlert(ex.message, { title: "Download failed", variant: "error" }); }
  };

  const send = async () => {
    setSending(true);
    try {
      const row = await api.sendSocietyMail({ ...request, ...mail, resend });
      onSent(row);
      onClose();
    } catch (ex) {
      await showAlert(ex.message, { title: "Not sent", variant: "error" });
    } finally { setSending(false); }
  };

  const blocked = draft && !draft.ready;
  const needsResend = draft?.already_sent?.length > 0 && !resend;
  const missing = mail && (!mail.to.length ? "Add at least one To address." : !mail.subject.trim() ? "Add a subject."
    : !mail.body.trim() ? "Write the message." : !mail.attachments.length ? "Attach at least one file." : "");

  const inp = "w-full px-3 py-2 rounded-lg text-sm focus:outline-none";
  const inpStyle = { background: C.mid, color: C.mint4, border: `1px solid ${alpha(C.mint1, "33")}` };
  const label = "block text-xs font-medium mb-1";

  return (
    <div className="cs-backdrop fixed inset-0 z-50 flex items-center justify-center">
      <div className="cs-dark cs-glass rounded-2xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[94vh]">
        <div className="px-6 py-4 border-b flex items-center justify-between" style={{ borderColor: C.mid }}>
          <div>
            <h3 className="font-semibold text-lg" style={{ fontFamily: FONTS.serif, color: C.mint4 }}>
              Send to {draft?.society?.name || "Society"}
            </h3>
            {draft && <div className="text-xs mt-0.5" style={{ color: C.muted }}>{draft.project_title} · {draft.episodes}</div>}
          </div>
          <button onClick={onClose} style={{ color: C.muted }}><X className="w-4 h-4" /></button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto">
          {!draft && !error && <div className="text-sm py-8 text-center" style={{ color: C.muted }}>Preparing the email…</div>}
          {error && <div className="text-sm rounded-lg px-4 py-3" style={{ background: "#5A1E1E", color: "#FFD6D6" }}>{error}</div>}

          {blocked && (
            <div className="rounded-lg px-4 py-3 text-sm space-y-1.5" style={{ background: "#4A3511", color: "#FFE3B3" }}>
              <div className="font-semibold flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> This can't be sent yet</div>
              {draft.problems.map((p) => <div key={p}>• {p}</div>)}
            </div>
          )}

          {draft && !blocked && mail && (
            <>
              <div>
                <label className={label} style={{ color: C.muted }}>From</label>
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm" style={{ ...inpStyle, opacity: 0.9 }}>
                  <span>{draft.from.name} &lt;{draft.from.email}&gt;</span>
                  <span className="ml-auto inline-flex items-center gap-1 text-[0.625rem] px-2 py-0.5 rounded-full font-semibold" style={{ background: "#1D3A27", color: "#7DD487" }}>
                    <CheckCircle2 className="w-3 h-3" /> Gmail connected
                  </span>
                </div>
              </div>
              <div>
                <label className={label} style={{ color: C.muted }}>To</label>
                <EmailChips tone="dark" value={mail.to} onChange={(v) => set({ to: v })} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={label} style={{ color: C.muted }}>CC</label>
                  <EmailChips tone="dark" value={mail.cc} onChange={(v) => set({ cc: v })} placeholder="Add people to copy" />
                </div>
                <div>
                  <label className={label} style={{ color: C.muted }}>BCC</label>
                  <EmailChips tone="dark" value={mail.bcc} onChange={(v) => set({ bcc: v })} placeholder="Hidden copies" />
                </div>
              </div>
              <div>
                <label className={label} style={{ color: C.muted }}>Subject</label>
                <input value={mail.subject} onChange={(e) => set({ subject: e.target.value })} className={inp} style={inpStyle} />
              </div>
              <div>
                <label className={label} style={{ color: C.muted }}>Message</label>
                <textarea value={mail.body} onChange={(e) => set({ body: e.target.value })} rows={8} className={`${inp} resize-y`} style={inpStyle} />
              </div>
              <div>
                <label className={label} style={{ color: C.muted }}>Attachments (made by CueSync for {draft.episodes})</label>
                <div className="rounded-lg divide-y" style={{ border: `1px solid ${alpha(C.mint1, "33")}`, borderColor: alpha(C.mint1, "33") }}>
                  {draft.attachments.map((a) => (
                    <div key={a.key} className="flex items-center gap-3 px-3 py-2 text-sm" style={{ borderColor: alpha(C.mint1, "22"), opacity: a.available ? 1 : 0.5 }}>
                      <input type="checkbox" disabled={!a.available} checked={mail.attachments.includes(a.key)} onChange={(e) => toggle(a.key, e.target.checked)} />
                      <Paperclip className="w-3.5 h-3.5 shrink-0" style={{ color: C.muted }} />
                      <span style={{ color: C.mint4 }}>{a.filename}</span>
                      <span className="text-xs" style={{ color: C.muted }}>{a.available ? a.label : `${a.label} — none uploaded`}</span>
                      {a.available && (
                        <button type="button" onClick={() => download(a)} title="Download to check it"
                          className="ml-auto inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md hover:opacity-80" style={{ background: C.mid, color: C.mint4 }}>
                          <Download className="w-3 h-3" /> Check
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
              {draft.already_sent.length > 0 && (
                <div className="rounded-lg px-4 py-3 text-sm" style={{ background: "#4A3511", color: "#FFE3B3" }}>
                  <div className="font-semibold flex items-center gap-2 mb-1"><AlertTriangle className="w-4 h-4" /> Already sent to {draft.society.name}</div>
                  {draft.already_sent.map((s) => (
                    <div key={s.id} className="text-xs">• {s.episodes} on {fmtDateTime(s.sent_at)}{s.sent_by ? ` by ${s.sent_by}` : ""} from {s.mail_from}</div>
                  ))}
                  <label className="flex items-center gap-2 mt-2 cursor-pointer">
                    <input type="checkbox" checked={resend} onChange={(e) => setResend(e.target.checked)} /> Send again anyway
                  </label>
                </div>
              )}
            </>
          )}
        </div>

        <div className="px-6 py-4 border-t flex items-center gap-3" style={{ borderColor: C.mid }}>
          <span className="text-xs" style={{ color: C.muted }}>
            {draft && !blocked && (missing || (needsResend ? "Tick “Send again anyway” to send this range again." : "Recorded in Submitted Cue only after Gmail sends it."))}
          </span>
          <button type="button" onClick={onClose} className="ml-auto px-4 py-2 rounded-lg text-sm" style={{ color: C.muted }}>
            {blocked || error ? "Close" : "Cancel"}
          </button>
          {draft && !blocked && (
            <button type="button" onClick={send} disabled={sending || !!missing || needsResend}
              className="inline-flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold whitespace-nowrap disabled:opacity-40"
              style={{ background: C.mint1, color: C.dark }}>
              <Send className="w-4 h-4" /> {sending ? "Sending…" : `Send from ${draft.from.email}`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
