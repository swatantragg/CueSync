import { useCallback, useEffect, useState } from "react";
import {
  AlarmClock, BellRing, ChevronRight, Clapperboard, ExternalLink, History, List, Mail, MailCheck, MailWarning, Plug, Plus, RefreshCw, Search, Tv, Unplug, X,
} from "lucide-react";
import { C, FONTS, alpha, T } from "../styles/palette";
import Select from "./Select";
import Timeline from "./Timeline";
import { NewWorkTiles, StageBadge } from "./NewWorkSummary";
import { showAlert, showConfirm } from "./Dialog";
import { api, API_ORIGIN } from "../utils/api";
import { fmtDateTime, timeAgo } from "../utils/format";
import { GROUPS, PENDING_OPTIONS, RELEASE_OPTIONS, STAGES, assignees, daysLabel, filterWorks, fmtDate, safeLink, workClients } from "../utils/newWork";
import { useApp } from "../context/AppContext";

// The New Work tab of the Work Delegator and Admin dashboards: the numbers, the list with its filters, the
// reminders that are due, the tracking log, and the mailbox the fingerprinting service's emails arrive on.
// Opening or adding a work is the parent's job (`onOpen`, `onAdd`), which shows NewWorkModal.

const LINE = alpha(C.mint1, "44");
const TH = "text-left text-[0.625rem] uppercase tracking-wider font-semibold px-3 py-2.5 whitespace-nowrap";
const box = "px-2.5 py-1.5 rounded-lg text-xs border";
const boxStyle = { borderColor: LINE, color: C.dark, background: C.white };
const NO_FILTERS = { q: "", type: "", status: "", person: "", pending: "", client: "", release: "" };
const LOG_PAGE = 50;
const fmtDay = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "—");

function Btn({ kind = "plain", children, ...rest }) {
  const style = kind === "dark" ? { background: C.dark, color: C.mint4 } : kind === "danger" ? { background: T.redBg, color: T.red } : { background: C.mint4, color: C.dark };
  return (
    <button type="button" {...rest} style={style}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap hover:opacity-85 disabled:opacity-40">
      {children}
    </button>
  );
}

function Empty({ children }) {
  return <div className="px-4 py-10 text-center text-sm" style={{ color: C.sub }}>{children}</div>;
}

// ─── list ────────────────────────────────────────────────────────────────────
function Filters({ works, filters, setFilters, shown }) {
  const set = (k) => (e) => setFilters((f) => ({ ...f, [k]: e.target.value }));
  const people = assignees(works);
  const clients = workClients(works);
  const active = Object.values(filters).some(Boolean);
  return (
    <div className="px-4 py-3 flex flex-wrap items-center gap-2 border-b" style={{ borderColor: LINE }}>
      <div className="relative w-56 max-w-full">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: C.sub }} />
        <input value={filters.q} onChange={set("q")} placeholder="Search name, client, person or remarks…" aria-label="Search new works"
          className={`${box} w-full pl-8 focus:outline-none`} style={boxStyle} />
      </div>
      <Select value={filters.type} onChange={set("type")} className={`${box} min-w-32`} style={boxStyle}>
        <option value="">All work types</option>
        <option value="movie">Movie</option>
        <option value="tv_show">TV Show</option>
      </Select>
      <Select value={filters.status} onChange={set("status")} className={`${box} min-w-48`} style={boxStyle}>
        <option value="">All statuses</option>
        <optgroup label="Current status">
          {STAGES.map(([key, text]) => <option key={key} value={key}>{text}</option>)}
        </optgroup>
        <optgroup label="Groups">
          {GROUPS.map(([key, text]) => <option key={key} value={key}>{text}</option>)}
        </optgroup>
      </Select>
      <Select value={filters.person} onChange={set("person")} className={`${box} min-w-40`} style={boxStyle}>
        <option value="">Anyone assigned</option>
        {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </Select>
      <Select value={filters.pending} onChange={set("pending")} className={`${box} min-w-36`} style={boxStyle} title="Days since the work was added, while its cue sheet work is still not allotted">
        <option value="">Any pending time</option>
        {PENDING_OPTIONS.map(([key, text]) => <option key={key} value={key}>Pending {text}</option>)}
      </Select>
      <Select value={filters.client} onChange={set("client")} className={`${box} min-w-36`} style={boxStyle} searchable searchPlaceholder="Search clients…">
        <option value="" data-keep>All clients</option>
        {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </Select>
      <Select value={filters.release} onChange={set("release")} className={`${box} min-w-40`} style={boxStyle}>
        <option value="">Any release date</option>
        {RELEASE_OPTIONS.map(([key, text]) => <option key={key} value={key}>{text}</option>)}
      </Select>
      {active && (
        <button onClick={() => setFilters(NO_FILTERS)} className="inline-flex items-center gap-1 text-xs font-semibold hover:underline" style={{ color: C.sub }}>
          <X className="w-3 h-3" /> Clear
        </button>
      )}
      <span className="ml-auto text-[0.6875rem]" style={{ color: C.sub }}>{shown} of {works.length}</span>
    </div>
  );
}

function WorkTable({ rows, onOpen }) {
  const yes = (state) => (state === "received" ? ["Yes", T.green] : state === "skipped" ? ["Skipped", T.grayMid] : ["No", T.orange]);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b" style={{ borderColor: LINE, color: C.sub, background: alpha(C.mint4, "33") }}>
            <th className={`${TH} pl-4`}>Movie / TV show</th>
            <th className={TH}>Client</th>
            <th className={TH} title="An update comes on the release day and 7 days after, for a date still ahead when it was entered">Release</th>
            <th className={TH}>Date added</th>
            <th className={TH}>BGM received</th>
            <th className={TH}>Fingerprinting</th>
            <th className={TH}>Cue sheet</th>
            <th className={TH}>Current status</th>
            <th className={TH} title="How long it has waited at this step; and since it was added, while cue sheet work is not allotted">Pending</th>
            <th className={TH}>Last updated</th>
            <th className={`${TH} pr-4`} />
          </tr>
        </thead>
        <tbody>
          {rows.map((w) => {
            const [bgm, bgmTone] = yes(w.bgm.state);
            const TypeIcon = w.work_type === "tv_show" ? Tv : Clapperboard;
            const level = w.reminder?.level || 0;
            return (
              <tr key={w.id} onClick={() => onOpen(w.id)} className="border-b last:border-0 cursor-pointer transition hover:bg-black/[0.03] align-top"
                style={{ borderColor: alpha(C.mint4, "99") }}>
                <td className="pl-4 pr-3 py-2.5 max-w-64">
                  <div className="font-semibold text-sm break-words" style={{ color: C.dark }}>{w.title}</div>
                  <div className="flex items-center gap-1 text-[0.625rem]" style={{ color: C.sub }}><TypeIcon className="w-3 h-3" /> {w.work_type_label}</div>
                  {w.remarks && <div className="text-[0.625rem] mt-0.5 line-clamp-2 break-words" style={{ color: C.sub }} title={w.remarks}>{w.remarks}</div>}
                </td>
                <td className="px-3 py-2.5 max-w-40">
                  {w.client_name ? <div className="break-words" style={{ color: C.dark }}>{w.client_name}</div> : <div style={{ color: T.orange }}>Not set</div>}
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap">
                  {w.release ? (
                    <>
                      <div className="font-semibold" style={{ color: w.release.upcoming ? T.blue : C.dark }}>{fmtDate(w.release.date)}</div>
                      <div className="text-[0.625rem]" style={{ color: C.sub }}>{w.release_type_label ? `${w.release_type_label} · ` : ""}{w.release.label}</div>
                    </>
                  ) : w.release_type_label ? <div className="text-[0.625rem]" style={{ color: C.sub }}>{w.release_type_label}</div> : <span style={{ color: C.muted }}>—</span>}
                  {w.video?.waiting && (
                    <div className="text-[0.625rem] font-semibold" style={{ color: w.video.overdue ? T.red : T.blue }}
                      title={w.video.next_check ? `CueSync asks again on ${fmtDate(w.video.next_check)}` : undefined}>
                      Video: waiting{w.video.expected_ott ? ` · OTT ${w.video.estimated ? "~" : ""}${fmtDate(w.video.expected_ott)}` : ""}
                    </div>
                  )}
                  {safeLink(w.video_link) && (
                    <a href={safeLink(w.video_link)} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} title={w.video_link}
                      className="inline-flex items-center gap-1 text-[0.625rem] font-semibold hover:underline mt-0.5" style={{ color: C.mid }}>
                      <ExternalLink className="w-3 h-3" /> Video
                    </a>
                  )}
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap" style={{ color: C.sub }}>{fmtDay(w.created_at)}</td>
                <td className="px-3 py-2.5 whitespace-nowrap">
                  <div className="font-semibold" style={{ color: bgmTone }}>{bgm}</div>
                  {w.bgm.at && <div className="text-[0.625rem]" style={{ color: C.sub }}>{fmtDay(w.bgm.at)}</div>}
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap">
                  <div className="font-semibold" style={{ color: C.dark }}>{w.fingerprint.status_label}</div>
                  <div className="text-[0.625rem]" style={{ color: C.sub }}>
                    {w.fingerprint.assigned_to_name || (w.locked.fingerprint ? "Locked" : "Nobody assigned")}
                    {w.fingerprint.mail && w.fingerprint.status !== "completed" ? " · email in" : ""}
                  </div>
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap">
                  <div className="font-semibold" style={{ color: C.dark }}>{w.cue.status_label}</div>
                  <div className="text-[0.625rem]" style={{ color: C.sub }}>{w.cue.assigned_to_name || (w.locked.cue ? "Locked" : "Nobody assigned")}</div>
                </td>
                <td className="px-3 py-2.5"><StageBadge work={w} /></td>
                <td className="px-3 py-2.5 whitespace-nowrap">
                  {w.days_in_stage == null ? <span style={{ color: C.muted }}>—</span> : (
                    <>
                      <div className="font-semibold" style={{ color: level >= 30 ? T.red : level ? T.orange : C.dark, fontVariantNumeric: "tabular-nums" }}>
                        {daysLabel(w.days_in_stage)}{w.days_in_stage ? " at this step" : ""}
                      </div>
                      {w.days_open != null && <div className="text-[0.625rem]" style={{ color: C.sub }}>added {w.days_open ? `${daysLabel(w.days_open)} ago` : "today"}</div>}
                    </>
                  )}
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap" style={{ color: C.sub }} title={fmtDateTime(w.updated_at)}>{timeAgo(w.updated_at)}</td>
                <td className="pl-3 pr-4 py-2.5 text-right"><ChevronRight className="w-4 h-4 inline" style={{ color: C.muted }} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── reminders that are due ──────────────────────────────────────────────────
function Reminders({ works, every, onOpen }) {
  const due = works.filter((w) => w.reminder?.due).sort((a, b) => b.days_open - a.days_open);
  if (!due.length) return <Empty>No follow-up is due. A reminder appears here when a step has waited {every} days, and stays until that step is done.</Empty>;
  return (
    <ul className="divide-y" style={{ borderColor: alpha(C.mint4, "99") }}>
      {due.map((w) => {
        const r = w.reminder;
        const tone = r.level >= 30 ? T.red : r.level ? T.orange : C.sub;
        return (
          <li key={w.id} className="px-4 py-3 flex flex-wrap items-start gap-3">
            <AlarmClock className="w-4 h-4 mt-0.5 shrink-0" style={{ color: tone }} />
            <div className="flex-1 min-w-56">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold break-words" style={{ color: C.dark }}>{w.title}</span>
                <StageBadge work={w} />
                {r.level > 0 && <span className="text-[0.625rem] font-bold px-1.5 py-0.5 rounded" style={{ background: r.level >= 30 ? T.redBg : T.orangeBg, color: tone }}>Pending {r.level}+ days</span>}
              </div>
              <div className="text-xs mt-1" style={{ color: C.dark }}>{r.long_message || r.message}</div>
              <div className="text-[0.625rem] mt-1" style={{ color: C.sub }}>
                {r.last_sent_at ? `Last reminder sent ${timeAgo(r.last_sent_at)}` : "First reminder goes out within the hour"}
                {r.next_at ? ` · next one ${fmtDay(r.next_at)}` : ""} · stops by itself when this step is done
              </div>
            </div>
            <Btn onClick={() => onOpen(w.id)}>Open <ChevronRight className="w-3.5 h-3.5" /></Btn>
          </li>
        );
      })}
    </ul>
  );
}

// ─── tracking log ────────────────────────────────────────────────────────────
function TrackingLog({ reloadKey }) {
  const [rows, setRows] = useState(null);
  const [who, setWho] = useState("");
  const [count, setCount] = useState(LOG_PAGE);
  const [error, setError] = useState("");
  useEffect(() => { api.newWorkActivity().then(setRows).catch((e) => setError(e.message)); }, [reloadKey]);
  if (!rows) return <Empty>{error || "Loading…"}</Empty>;
  const shown = rows.filter((r) => !who || (who === "auto") === r.automated)
    .map((r) => ({ ...r, details: [r.work_title || "Removed work", r.details].filter(Boolean).join(" · ") }));
  return (
    <>
      <div className="px-4 py-3 flex flex-wrap items-center gap-2 border-b" style={{ borderColor: LINE }}>
        <Select value={who} onChange={(e) => { setWho(e.target.value); setCount(LOG_PAGE); }} className={`${box} min-w-48`} style={boxStyle}>
          <option value="">Manual and automatic entries</option>
          <option value="manual">Manual entries only</option>
          <option value="auto">Automatic entries only</option>
        </Select>
        <span className="text-[0.6875rem]" style={{ color: C.sub }}>
          Every step taken on a new work: who ticked, assigned or skipped what, and what CueSync did by itself (emails matched, reminders sent).
        </span>
      </div>
      {shown.length === 0 ? <Empty>Nothing logged yet.</Empty> : <Timeline rows={shown.slice(0, count)} />}
      {shown.length > count && (
        <div className="px-4 py-3 border-t text-center" style={{ borderColor: LINE }}>
          <Btn onClick={() => setCount((n) => n + LOG_PAGE)}>Show {Math.min(LOG_PAGE, shown.length - count)} more of {shown.length}</Btn>
        </div>
      )}
    </>
  );
}

// ─── the fingerprinting service's mailbox ────────────────────────────────────
function MailboxCard({ mail, works, onReload, onOpen }) {
  const { isAdmin, pushToast } = useApp();
  const [busy, setBusy] = useState(false);
  const [links, setLinks] = useState({});
  const waiting = works.filter((w) => !w.locked.fingerprint && ["not_assigned", "assigned", "in_progress"].includes(w.fingerprint.status));
  const callbackOrigin = (() => { try { return new URL(mail.redirect_uri).origin; } catch { return null; } })();

  // The Google sign-in popup posts its result from the callback's host.
  useEffect(() => {
    const onMessage = (e) => {
      if (e.data?.type !== "cuesync-fingerprint-mailbox" || ![API_ORIGIN, window.location.origin, callbackOrigin].includes(e.origin)) return;
      pushToast({ kind: e.data.ok ? "success" : "error", title: e.data.ok ? "Mailbox connected" : "Mailbox not connected", body: e.data.message, duration: e.data.ok ? undefined : 9000 });
      onReload();
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [callbackOrigin, onReload, pushToast]);

  const run = async (fn) => {
    setBusy(true);
    try { await fn(); } catch (ex) { await showAlert(ex.message, { title: "Failed", variant: "error" }); } finally { setBusy(false); }
  };
  const connect = async () => {
    const ok = await showConfirm(
      `A Google sign-in window opens next.\n\n1. Sign in as ${mail.mailbox}.\n2. If Google says "Google hasn't verified this app", click Advanced → Go to CueSync.\n3. Allow "View your email messages and settings" and click Continue.\n\nCueSync only reads this mailbox, to see the emails from ${mail.sender}. The window closes by itself when the connection is saved.`,
      { title: "Connect the fingerprinting mailbox", confirmLabel: "Open Google sign-in", variant: "info" },
    );
    if (!ok) return;
    const popup = window.open("", "cuesync-fp-gmail", "width=520,height=720");
    await run(async () => {
      try {
        const { url } = await api.connectNewWorkMail();
        if (popup) popup.location.href = url; else window.location.href = url;
      } catch (ex) { popup?.close(); throw ex; }
    });
  };
  const disconnect = async () => {
    const ok = await showConfirm(`CueSync will stop reading ${mail.email}. Emails already found stay listed; new ones won't be seen until it is connected again.`,
      { title: "Disconnect the mailbox?", confirmLabel: "Disconnect", variant: "warn" });
    if (ok) run(async () => { await api.disconnectNewWorkMail(); onReload(); });
  };
  const check = () => run(async () => {
    const { result } = await api.syncNewWorkMail();
    pushToast(!result ? { kind: "info", title: "Already checking", body: "Another check is running. Try again in a moment." }
      : result.error ? { kind: "error", title: "Could not read the mailbox", body: result.error }
      : { kind: "success", title: "Mailbox checked", body: `${result.found} new email${result.found === 1 ? "" : "s"} · ${result.linked} matched to a work` });
    onReload();
  });
  const link = (m) => run(async () => { await api.newWorkLinkMail(Number(links[m.id]), m.id); onReload(); });

  const lost = mail.status === "reconnect_needed";
  const StatusIcon = mail.connected ? MailCheck : MailWarning;
  return (
    <div className="p-4 space-y-4">
      <div className="rounded-xl border p-4 flex flex-wrap items-start gap-3" style={{ borderColor: mail.connected ? T.greenBorder : T.amberBorder, background: mail.connected ? T.greenBg : T.amberBg }}>
        <StatusIcon className="w-5 h-5 mt-0.5 shrink-0" style={{ color: mail.connected ? T.green : T.orange }} />
        <div className="flex-1 min-w-56 text-xs" style={{ color: C.dark }}>
          <div className="text-sm font-semibold break-words">
            {mail.connected ? `Connected: ${mail.email}` : lost ? `${mail.email} needs reconnecting` : `${mail.mailbox} is not connected`}
          </div>
          <div className="mt-1" style={{ color: C.sub }}>
            When {mail.sender_name} &lt;{mail.sender}&gt; emails {mail.mailbox} about a title on the New Work List, the Fingerprinting Completed box of that work is enabled.
            {mail.connected ? ` Checked every few minutes${mail.last_checked_at ? `, last ${timeAgo(mail.last_checked_at)}` : ""}.` : " Until it is connected, completion needs a note of where the fingerprinting came from."}
          </div>
          {mail.connected && mail.connected_by_name && <div className="mt-0.5" style={{ color: C.sub }}>Connected by {mail.connected_by_name} on {fmtDateTime(mail.connected_at)}. CueSync can only read it.</div>}
          {mail.last_error && <div className="mt-1 break-words" style={{ color: T.red }}>{mail.last_error}</div>}
          {!mail.configured && <div className="mt-1" style={{ color: T.red }}>Gmail connections are not set up on the server yet (Google client ID, secret and MAIL_TOKEN_KEY).</div>}
          {!mail.connected && !isAdmin && <div className="mt-1 font-semibold">Ask an Admin to connect it here.</div>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {mail.connected && <Btn disabled={busy} onClick={check}><RefreshCw className={`w-3.5 h-3.5 ${busy ? "animate-spin" : ""}`} /> Check now</Btn>}
          {isAdmin && !mail.connected && <Btn kind="dark" disabled={busy || !mail.configured} onClick={connect}><Plug className="w-3.5 h-3.5" /> {lost ? "Reconnect" : "Connect mailbox"}</Btn>}
          {isAdmin && mail.status && <Btn kind="danger" disabled={busy} onClick={disconnect}><Unplug className="w-3.5 h-3.5" /> Disconnect</Btn>}
        </div>
      </div>

      <div>
        <div className="text-sm font-semibold" style={{ color: C.dark }}>Emails not matched to a work ({mail.unlinked.length})</div>
        <div className="text-[0.6875rem] mt-0.5 mb-2" style={{ color: C.sub }}>
          An email is matched by itself when it names the title. If one belongs to a work but doesn't name it, link it here; that enables the work's Fingerprinting Completed box.
        </div>
        {mail.unlinked.length === 0 ? <div className="text-xs" style={{ color: C.sub }}>None.</div> : (
          <ul className="space-y-2">
            {mail.unlinked.map((m) => (
              <li key={m.id} className="rounded-xl border p-3 flex flex-wrap items-start gap-3" style={{ borderColor: LINE, background: C.white }}>
                <Mail className="w-4 h-4 mt-0.5 shrink-0" style={{ color: C.sub }} />
                <div className="flex-1 min-w-56 text-xs">
                  <div className="font-semibold break-words" style={{ color: C.dark }}>{m.subject}</div>
                  <div style={{ color: C.sub }}>{fmtDateTime(m.received_at)} · {m.from}</div>
                  {m.snippet && <div className="mt-1 line-clamp-2 break-words" style={{ color: C.sub }}>{m.snippet}</div>}
                  {m.attachments && <div className="mt-0.5 break-words" style={{ color: C.sub }}>Attached: {m.attachments}</div>}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Select value={links[m.id] || ""} onChange={(e) => setLinks((l) => ({ ...l, [m.id]: e.target.value }))} className={`${box} min-w-48`} style={boxStyle}
                    placeholder={waiting.length ? "Belongs to…" : "No work is waiting"} disabled={!waiting.length}>
                    {waiting.map((w) => <option key={w.id} value={w.id}>{w.title}</option>)}
                  </Select>
                  <Btn disabled={busy || !links[m.id]} onClick={() => link(m)}>Link</Btn>
                  {links[m.id] && <button onClick={() => onOpen(Number(links[m.id]))} className="text-[0.6875rem] font-semibold hover:underline" style={{ color: C.sub }}>Open work</button>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ─── the tab ─────────────────────────────────────────────────────────────────
export default function NewWorkPanel({ reloadKey, focus, onOpen, onAdd }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState("list");
  const [filters, setFilters] = useState(NO_FILTERS);

  const load = useCallback(() => {
    setLoading(true);
    api.listNewWorks()
      .then((d) => { setData(d); setError(""); })
      .catch((e) => setError(e.message || "Couldn't load the New Work List"))
      .finally(() => setLoading(false));
  }, []);
  useEffect(load, [load, reloadKey]);

  // A dashboard tile was clicked: show the list filtered to what it counts.
  useEffect(() => {
    if (!focus) return;
    setFilters({ ...NO_FILTERS, status: focus.status || "", pending: focus.pending || "" });
    setView(focus.view || "list");
  }, [focus]);

  if (!data) return <Empty>{loading ? "Loading…" : <span style={{ color: C.danger }}>{error}</span>}</Empty>;

  const { works, summary, mail } = data;
  const rows = filterWorks(works, filters);
  const pick = ({ status, pending }) => { setFilters({ ...NO_FILTERS, status: status || "", pending: pending || "" }); setView("list"); };
  const views = [
    { key: "list", label: "New Work List", Icon: List, count: works.length },
    { key: "reminders", label: "Reminders", Icon: BellRing, count: summary.reminders, alert: summary.reminders > 0 },
    { key: "log", label: "Tracking log", Icon: History },
    { key: "mail", label: "BMAT emails", Icon: Mail, count: mail.unlinked.length, alert: !mail.connected },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-xl leading-tight" style={{ fontFamily: FONTS.serif, color: C.dark }}>New Work List</h3>
          <div className="text-xs mt-0.5" style={{ color: C.sub }}>
            Upcoming movies and TV shows, tracked from the day the name arrives: BGM received, fingerprinting, then cue sheet work.
            A pending step is chased every {data.reminder_days} days.
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Btn disabled={loading} onClick={load}><RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh</Btn>
          <Btn kind="dark" onClick={onAdd}><Plus className="w-3.5 h-3.5" /> New Work</Btn>
        </div>
      </div>

      <NewWorkTiles summary={summary} onPick={pick} />

      <div className="flex flex-wrap gap-1 p-1 rounded-xl w-fit max-w-full" style={{ background: C.mint4, border: `1px solid ${alpha(C.mint1, "66")}` }}>
        {views.map(({ key, label, Icon, count, alert }) => (
          <button key={key} onClick={() => setView(key)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all"
            style={{ background: view === key ? C.dark : "transparent", color: view === key ? C.mint4 : C.mid }}>
            <Icon className="w-3.5 h-3.5" /> {label}
            {count > 0 && (
              <span className="text-[0.625rem] px-1.5 rounded-full font-bold"
                style={alert ? { background: C.danger, color: C.white } : { background: alpha(C.mint1, "66"), color: view === key ? C.mint4 : C.dark }}>{count}</span>
            )}
            {!count && alert && <span className="w-1.5 h-1.5 rounded-full" style={{ background: C.danger }} title="Needs attention" />}
          </button>
        ))}
      </div>

      <div className="rounded-xl border overflow-hidden" style={{ background: C.white, borderColor: LINE }}>
        {view === "list" && (
          <>
            <Filters works={works} filters={filters} setFilters={setFilters} shown={rows.length} />
            {works.length === 0
              ? <Empty>No new work yet. Click New Work when the name of a movie or TV show arrives, even before its BGM.</Empty>
              : rows.length === 0 ? <Empty>No work matches these filters.</Empty>
              : <WorkTable rows={rows} onOpen={onOpen} />}
          </>
        )}
        {view === "reminders" && <Reminders works={works} every={data.reminder_days} onOpen={onOpen} />}
        {view === "log" && <TrackingLog reloadKey={reloadKey} />}
        {view === "mail" && <MailboxCard mail={mail} works={works} onReload={load} onOpen={onOpen} />}
      </div>
    </div>
  );
}
