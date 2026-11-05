import { useCallback, useEffect, useState } from "react";
import {
  RefreshCw, Mail, Reply, AlertTriangle, CheckCircle2, Clock, ExternalLink, Send, Inbox, X,
} from "lucide-react";
import { C, FONTS, alpha, T } from "../styles/palette";
import Select from "./Select";
import SocietyMailModal from "./SocietyMailModal";
import { api } from "../utils/api";
import { fmtDateTime, timeAgo } from "../utils/format";
import { showAlert, showConfirm } from "./Dialog";
import { useApp } from "../context/AppContext";

const EMAILED = ["gmail", "gmail_detected"];
const DEAD = ["bounced", "resent"];
const LATE_DAYS = 21;

const eps = (s) => (s.project_type === "MOVIE" ? "Movie" : s.episode_from === s.episode_to ? `Ep ${s.episode_from}` : `Ep ${s.episode_from}–${s.episode_to}`);
const daysSince = (iso) => (iso ? Math.floor((Date.now() - new Date(iso)) / 86400000) : 0);
const TH = "text-left text-[0.625rem] uppercase tracking-wider font-semibold px-4 py-2.5";

function Stat({ label, value, color, bg, Icon }) {
  return (
    <div className="rounded-xl border px-4 py-3" style={{ background: bg, borderColor: alpha(C.mint1, "33") }}>
      <div className="flex items-center gap-1.5 text-[0.625rem] uppercase tracking-wider font-semibold" style={{ color }}>
        <Icon className="w-3.5 h-3.5" /> {label}
      </div>
      <div className="text-3xl mt-1" style={{ fontFamily: FONTS.serif, color }}>{value}</div>
    </div>
  );
}

function Btn({ onClick, disabled, kind = "plain", children, href, title }) {
  const style = kind === "green" ? { background: T.green, color: C.white }
    : kind === "dark" ? { background: C.dark, color: C.mint4 }
    : { background: C.mint4, color: C.dark };
  const cls = "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap hover:opacity-90 disabled:opacity-40";
  if (href) return <a href={href} target="_blank" rel="noreferrer" className={cls} style={style} title={title}>{children}</a>;
  return <button onClick={onClick} disabled={disabled} className={cls} style={style} title={title}>{children}</button>;
}

function Card({ tone, Icon, title, meta, children, actions }) {
  return (
    <div className="rounded-xl border p-4" style={{ background: C.white, borderColor: alpha(C.mint1, "44"), borderLeft: `4px solid ${tone}` }}>
      <div className="flex items-start gap-3">
        <Icon className="w-4 h-4 mt-0.5 shrink-0" style={{ color: tone }} />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold" style={{ color: C.dark }}>{title}</div>
          {meta && <div className="text-[0.6875rem] mt-0.5" style={{ color: C.sub }}>{meta}</div>}
          {children}
        </div>
        {actions && <div className="flex flex-wrap items-center justify-end gap-1.5 shrink-0">{actions}</div>}
      </div>
    </div>
  );
}

// An email found in a client's Sent folder: the Reviewer checks the guesses and confirms or dismisses.
function DetectedCard({ d, projects, societies, onDone }) {
  const [form, setForm] = useState({
    project_id: d.project_id ? String(d.project_id) : "",
    episode_from: d.episode_from ?? "", episode_to: d.episode_to ?? "",
    society_id: d.society_id ? String(d.society_id) : "",
  });
  const [busy, setBusy] = useState(false);
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const box = "px-2.5 py-1.5 rounded-lg text-xs border focus:outline-none";
  const boxStyle = { borderColor: alpha(C.mint1, "44"), color: C.dark, background: C.white };

  const confirm = async () => {
    const a = parseInt(form.episode_from, 10), b = parseInt(form.episode_to, 10);
    if (!form.project_id || !form.society_id || !a || !b || a > b) {
      await showAlert("Pick the serial, the society and a valid episode range.", { variant: "warn" }); return;
    }
    setBusy(true);
    try {
      await api.confirmDetectedMail(d.id, { project_id: parseInt(form.project_id), episode_from: a, episode_to: b, society_id: parseInt(form.society_id) });
      onDone(`Recorded: email from ${d.mailbox}`);
    } catch (ex) { await showAlert(ex.message, { title: "Failed", variant: "error" }); }
    finally { setBusy(false); }
  };
  const dismiss = async () => {
    const ok = await showConfirm(`Not a cue sheet submission? It won't be shown again.\n\n“${d.subject || "(no subject)"}”`,
      { title: "Dismiss email", confirmLabel: "Dismiss", variant: "warn" });
    if (!ok) return;
    setBusy(true);
    try { await api.dismissDetectedMail(d.id); onDone("Email dismissed"); }
    catch (ex) { await showAlert(ex.message, { title: "Failed", variant: "error" }); }
    finally { setBusy(false); }
  };

  return (
    <Card tone={T.orange} Icon={Inbox}
      title={`Sent outside CueSync · ${d.client || d.mailbox}`}
      meta={`${d.mailbox} → ${d.to}${d.cc ? ` (CC ${d.cc})` : ""} · ${fmtDateTime(d.sent_at)}`}
      actions={<>
        {d.gmail_link && <Btn href={d.gmail_link} title="Opens in the client's Gmail if you're signed in to it"><ExternalLink className="w-3 h-3" /> Gmail</Btn>}
        <Btn onClick={dismiss} disabled={busy}><X className="w-3 h-3" /> Not a cue sheet</Btn>
        <Btn kind="dark" onClick={confirm} disabled={busy}><CheckCircle2 className="w-3 h-3" /> Confirm</Btn>
      </>}>
      <div className="text-xs mt-1.5" style={{ color: C.dark }}>“{d.subject || "(no subject)"}”</div>
      <div className="text-[0.6875rem] mt-0.5" style={{ color: C.sub }}>Files: {d.attachments || "—"}</div>
      <div className="flex flex-wrap items-center gap-2 mt-2.5">
        <Select value={form.project_id} onChange={(e) => set({ project_id: e.target.value })} className={`${box} min-w-48`} style={boxStyle}>
          <option value="">Serial / movie…</option>
          {projects.map((p) => <option key={p.project_id} value={p.project_id}>{p.project_title}</option>)}
        </Select>
        <input type="number" value={form.episode_from} onChange={(e) => set({ episode_from: e.target.value })} placeholder="Ep from" className={`${box} w-24`} style={boxStyle} />
        <input type="number" value={form.episode_to} onChange={(e) => set({ episode_to: e.target.value })} placeholder="Ep to" className={`${box} w-24`} style={boxStyle} />
        <Select value={form.society_id} onChange={(e) => set({ society_id: e.target.value })} className={`${box} min-w-36`} style={boxStyle}>
          <option value="">Society…</option>
          {societies.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </Select>
        <span className="text-[0.6875rem]" style={{ color: C.sub }}>Filled in from the email — check before confirming.</span>
      </div>
    </Card>
  );
}

// ─── Reviewer Dashboard: emails to the societies and their responses ──────────
export default function SocietyDashboard({ onAttention, pendingReviews }) {
  const { pushToast } = useApp();
  const [subs, setSubs]           = useState([]);
  const [overview, setOverview]   = useState(null);
  const [societies, setSocieties] = useState([]);
  const [projects, setProjects]   = useState([]);
  const [loading, setLoading]     = useState(true);
  const [syncing, setSyncing]     = useState(false);
  const [busy, setBusy]           = useState(null);
  const [resend, setResend]       = useState(null);

  const load = useCallback(() => {
    Promise.all([api.listSubmissions(), api.mailOverview(), api.listSocieties(), api.reviewerSerials(), api.reviewerMovies()])
      .then(([s, o, soc, ser, mov]) => { setSubs(s); setOverview(o); setSocieties(soc); setProjects([...ser, ...mov]); })
      .catch((ex) => pushToast({ kind: "error", title: "Could not load the dashboard", body: ex.message }))
      .finally(() => setLoading(false));
  }, [pushToast]);

  useEffect(() => { load(); }, [load]);

  const emailed  = subs.filter((s) => EMAILED.includes(s.sent_via));
  const live     = emailed.filter((s) => !DEAD.includes(s.mail_status));
  const replied  = live.filter((s) => s.mail_status === "replied" && !s.accepted_by_iprs);
  const awaiting = live.filter((s) => s.mail_status === "sent" && !s.accepted_by_iprs)
    .sort((a, b) => new Date(a.mail_sent_at) - new Date(b.mail_sent_at));
  const accepted = live.filter((s) => s.accepted_by_iprs);
  const failed   = emailed.filter((s) => s.mail_status === "bounced");
  const detected = overview?.detected || [];
  const attention = replied.length + failed.length + detected.length;

  useEffect(() => { onAttention?.(attention); }, [attention, onAttention]);

  const checkNow = async () => {
    setSyncing(true);
    try {
      const r = await api.syncMail();
      const found = [r.replies && `${r.replies} repl${r.replies === 1 ? "y" : "ies"}`, r.bounces && `${r.bounces} bounce${r.bounces === 1 ? "" : "s"}`,
        r.detected && `${r.detected} email${r.detected === 1 ? "" : "s"} sent outside CueSync`].filter(Boolean);
      pushToast({ kind: r.errors.length ? "error" : "success", title: found.length ? `Found ${found.join(", ")}` : "Nothing new",
        body: r.errors.length ? r.errors.join(" · ") : `Checked ${r.mailboxes} mailbox${r.mailboxes === 1 ? "" : "es"}.` });
      load();
    } catch (ex) { await showAlert(ex.message, { title: "Check failed", variant: "error" }); }
    finally { setSyncing(false); }
  };

  const act = async (id, fn, done) => {
    setBusy(id);
    try { await fn(); if (done) pushToast({ kind: "success", title: done }); load(); }
    catch (ex) { await showAlert(ex.message, { title: "Failed", variant: "error" }); }
    finally { setBusy(null); }
  };

  const accept = async (s) => {
    const ok = await showConfirm(`Mark ${s.project_title} ${eps(s)} as accepted by ${s.society_name}?\n\nThis stops the follow-up reminders.`,
      { title: "Accepted by Society", confirmLabel: "Yes, accepted", variant: "success" });
    if (ok) act(s.id, () => api.markAcceptedByIprs(s.id), `${s.society_name} accepted ${s.project_title} ${eps(s)}`);
  };

  const societyRows = (() => {
    const names = [...new Set([...societies.map((s) => s.name), ...emailed.map((s) => s.society_name).filter(Boolean)])];
    return names.map((name) => {
      const mine = (list) => list.filter((s) => s.society_name === name).length;
      return { name, emailed: mine(live), awaiting: mine(awaiting), replied: mine(replied), accepted: mine(accepted), failed: mine(failed) };
    }).filter((r) => r.emailed || r.failed || societies.some((s) => s.name === r.name && s.is_active));
  })();

  if (loading) return <div className="p-8 text-center text-sm" style={{ color: C.sub }}>Loading…</div>;

  return (
    <div className="space-y-6">
      {resend && (
        <SocietyMailModal request={resend} onClose={() => setResend(null)}
          onSent={(row) => { pushToast({ kind: "success", title: `Resent to ${row.society_name}`, body: `${row.project_title} · from ${row.mail_from}` }); load(); }} />
      )}

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <h3 className="text-xl" style={{ fontFamily: FONTS.serif, color: C.dark }}>Society emails</h3>
          <p className="text-xs mt-0.5" style={{ color: C.sub }}>
            Episodes waiting for review, cue sheets emailed to IPRS, PRS and ASCAP from the clients' Gmail, and what the societies answered.
          </p>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-[0.6875rem]" style={{ color: C.sub }}>
            {overview?.last_sync ? `Mailboxes checked ${timeAgo(overview.last_sync)}` : "Mailboxes not checked yet"} · automatically every {overview?.sync_minutes || 10} min
          </span>
          <Btn kind="dark" onClick={checkNow} disabled={syncing || !overview?.configured}>
            <RefreshCw className={`w-3.5 h-3.5 ${syncing ? "animate-spin" : ""}`} /> {syncing ? "Checking…" : "Check now"}
          </Btn>
        </div>
      </div>

      {overview && !overview.configured && (
        <div className="rounded-xl border px-4 py-3 text-xs" style={{ background: T.amberBg, borderColor: T.amberBorder, color: C.dark }}>
          Gmail connection is not set up on the server, so replies and bounces can't be read yet.
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <Stat label="Emailed" value={live.length} color={C.dark} bg={C.white} Icon={Send} />
        <Stat label="Awaiting reply" value={awaiting.length} color={T.blue} bg={T.blueBg} Icon={Clock} />
        <Stat label="Replied" value={replied.length} color={T.purple} bg={T.purpleBg} Icon={Reply} />
        <Stat label="Accepted" value={accepted.length} color={T.green} bg={T.greenBg} Icon={CheckCircle2} />
        <Stat label="Failed" value={failed.length} color={T.red} bg={T.redBg} Icon={AlertTriangle} />
        <Stat label="Sent outside CueSync" value={detected.length} color={T.orange} bg={T.orangeBg} Icon={Inbox} />
      </div>

      {societyRows.length > 0 && (
        <div className="rounded-2xl border overflow-hidden" style={{ background: C.white, borderColor: alpha(C.mint1, "44") }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: alpha(C.mint4, "33"), color: C.sub }}>
                <th className={TH}>Society</th><th className={TH}>Emailed</th><th className={TH}>Awaiting reply</th>
                <th className={TH}>Replied</th><th className={TH}>Accepted</th><th className={TH}>Failed</th>
              </tr>
            </thead>
            <tbody>
              {societyRows.map((r) => (
                <tr key={r.name} className="border-t" style={{ borderColor: alpha(C.mint4, "88") }}>
                  <td className="px-4 py-2.5 font-semibold" style={{ color: C.dark }}>{r.name}</td>
                  <td className="px-4 py-2.5" style={{ color: C.dark }}>{r.emailed}</td>
                  <td className="px-4 py-2.5" style={{ color: r.awaiting ? T.blue : C.sub }}>{r.awaiting}</td>
                  <td className="px-4 py-2.5" style={{ color: r.replied ? T.purple : C.sub }}>{r.replied}</td>
                  <td className="px-4 py-2.5" style={{ color: r.accepted ? T.green : C.sub }}>{r.accepted}</td>
                  <td className="px-4 py-2.5" style={{ color: r.failed ? T.red : C.sub }}>{r.failed}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pendingReviews}

      <section className="space-y-3">
        <h4 className="text-sm font-semibold" style={{ fontFamily: FONTS.serif, color: C.dark }}>
          Needs your action {attention > 0 && <span className="ml-1 text-[0.625rem] px-2 py-0.5 rounded-full font-bold" style={{ background: C.danger, color: C.white }}>{attention}</span>}
        </h4>
        {attention === 0 && <div className="text-sm rounded-xl border px-4 py-6 text-center" style={{ color: C.sub, borderColor: alpha(C.mint1, "44"), background: C.white }}>Nothing to do. Replies, bounces and emails sent outside CueSync show up here.</div>}

        {replied.map((s) => (
          <Card key={`r${s.id}`} tone={T.purple} Icon={Reply}
            title={`${s.society_name} replied · ${s.project_title} · ${eps(s)}`}
            meta={`${s.reply_from} · ${fmtDateTime(s.reply_at)} · sent from ${s.mail_from} on ${fmtDateTime(s.mail_sent_at)}`}
            actions={<>
              {s.gmail_link && <Btn href={s.gmail_link} title="Opens the conversation in the client's Gmail if you're signed in to it"><ExternalLink className="w-3 h-3" /> Read in Gmail</Btn>}
              <Btn onClick={() => act(s.id, () => api.keepWaiting(s.id), "Waiting for another reply")} disabled={busy === s.id} title="The reply was a question, not the acceptance">Keep waiting</Btn>
              <Btn kind="green" onClick={() => accept(s)} disabled={busy === s.id}><CheckCircle2 className="w-3 h-3" /> Accepted by Society</Btn>
            </>}>
            <div className="text-xs mt-2 px-3 py-2 rounded-lg italic" style={{ background: T.purpleBg, color: C.dark }}>
              {s.reply_subject && <div className="not-italic font-semibold mb-0.5">{s.reply_subject}</div>}
              “{s.reply_snippet || "(no text)"}”
            </div>
          </Card>
        ))}

        {failed.map((s) => (
          <Card key={`f${s.id}`} tone={T.red} Icon={AlertTriangle}
            title={`Email to ${s.society_name} bounced · ${s.project_title} · ${eps(s)}`}
            meta={`Sent from ${s.mail_from} to ${s.mail_to} on ${fmtDateTime(s.mail_sent_at)}`}
            actions={<>
              {s.gmail_link && <Btn href={s.gmail_link}><ExternalLink className="w-3 h-3" /> Gmail</Btn>}
              <Btn kind="dark" disabled={!s.client_id || !s.society_id} title="Check the society's address under Societies first if it was wrong"
                onClick={() => setResend({ project_id: s.project_id, episode_from: s.episode_from, episode_to: s.episode_to, client_id: s.client_id, society_id: s.society_id })}>
                <Mail className="w-3 h-3" /> Resend
              </Btn>
            </>}>
            <div className="text-xs mt-2 px-3 py-2 rounded-lg" style={{ background: T.redBg, color: C.dark }}>{s.bounce_reason}</div>
          </Card>
        ))}

        {detected.map((d) => (
          <DetectedCard key={`d${d.id}`} d={d} projects={projects} societies={societies.filter((s) => s.is_active)}
            onDone={(title) => { pushToast({ kind: "success", title }); load(); }} />
        ))}
      </section>

      <section className="space-y-3">
        <h4 className="text-sm font-semibold" style={{ fontFamily: FONTS.serif, color: C.dark }}>
          Waiting for the society ({awaiting.length})
        </h4>
        <div className="rounded-2xl border overflow-hidden" style={{ background: C.white, borderColor: alpha(C.mint1, "44") }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: alpha(C.mint4, "33"), color: C.sub }}>
                <th className={TH}>Serial / movie</th><th className={TH}>Episodes</th><th className={TH}>Society</th>
                <th className={TH}>Sent from</th><th className={TH}>Sent</th><th className={TH}>Waiting</th><th className={TH}></th>
              </tr>
            </thead>
            <tbody>
              {awaiting.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-6 text-center text-sm" style={{ color: C.sub }}>No emails waiting for a response.</td></tr>
              )}
              {awaiting.map((s) => {
                const days = daysSince(s.mail_sent_at);
                return (
                  <tr key={s.id} className="border-t" style={{ borderColor: alpha(C.mint4, "88") }}>
                    <td className="px-4 py-2.5 font-medium" style={{ color: C.dark }}>{s.project_title}</td>
                    <td className="px-4 py-2.5 text-xs" style={{ color: C.dark }}>{eps(s)}</td>
                    <td className="px-4 py-2.5 text-xs" style={{ color: C.dark }}>{s.society_name}</td>
                    <td className="px-4 py-2.5 text-xs" style={{ color: C.sub }}>{s.client}<div className="text-[0.625rem]">{s.mail_from}</div></td>
                    <td className="px-4 py-2.5 text-xs" style={{ color: C.sub }}>{fmtDateTime(s.mail_sent_at)}</td>
                    <td className="px-4 py-2.5 text-xs font-semibold" style={{ color: days >= LATE_DAYS ? T.orange : C.sub }}>
                      {days === 0 ? "today" : `${days} day${days === 1 ? "" : "s"}`}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="flex justify-end gap-1.5">
                        {s.gmail_link && <Btn href={s.gmail_link}><ExternalLink className="w-3 h-3" /> Gmail</Btn>}
                        <Btn onClick={() => accept(s)} disabled={busy === s.id} title="The society confirmed outside this email thread">
                          <CheckCircle2 className="w-3 h-3" /> Accepted
                        </Btn>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
