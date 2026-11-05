import { useEffect, useState } from "react";
import {
  AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, Clock, Eye, Inbox, Layers, Mail, RefreshCw, Send, X,
} from "lucide-react";
import { C, FONTS, alpha, T } from "../../styles/palette";
import Select from "../../components/Select";
import NotifyEditorModal from "../../components/NotifyEditorModal";
import { useApp } from "../../context/AppContext";
import { api } from "../../utils/api";
import { fmtDateTime, timeAgo } from "../../utils/format";

// Admin Dashboard: the whole office at a glance. Numbers come from /api/insights (services/insights.py);
// "sent" always means emailed to a society from the client's Gmail. Weeks run Monday–Saturday.
// The Work Delegator Dashboard (WDInsights.jsx) reuses the exported pieces.

export const PERIODS = [{ key: "week", label: "Week" }, { key: "month", label: "Month" }, { key: "year", label: "Year" }];
const SHORT_PERIODS = PERIODS.slice(0, 2);
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_FULL = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const QUARTERS = [[1, 2, 3], [4, 5, 6], [7, 8, 9], [10, 11, 12]];
export const BAR = C.mid; // the one hue every ranking chart uses
export const NUM = { fontVariantNumeric: "tabular-nums" };
export const LINE = alpha(C.mint1, "44");

export const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
export const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "—");
const days = (hours) => (hours == null ? "—" : hours < 24 ? `${Math.round(hours)} h` : `${(hours / 24).toFixed(1)} days`);

// 0…top in 3–5 whole-number steps of 1/2/5 × 10ⁿ.
export function niceTicks(max) {
  const raw = Math.max(1, max);
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [mag / 10, mag, mag * 10].flatMap((m) => [m, 2 * m, 5 * m]).filter((s) => s >= 1).find((s) => raw / s <= 4) || mag * 10;
  const top = Math.ceil(raw / step) * step;
  return Array.from({ length: top / step + 1 }, (_, i) => i * step);
}

// ─── building blocks ─────────────────────────────────────────────────────────
export function Card({ title, note, controls, children, className = "" }) {
  return (
    <section className={`rounded-xl border flex flex-col min-w-0 ${className}`} style={{ background: C.white, borderColor: LINE }}>
      <header className="px-4 pt-3.5 pb-2">
        <div className="flex items-start justify-between gap-3">
          <h4 className="text-base leading-tight pt-0.5 min-w-0" style={{ fontFamily: FONTS.serif, color: C.dark }}>{title}</h4>
          {controls && <div className="flex flex-col items-end gap-1 shrink-0">{controls}</div>}
        </div>
        {note && <div className="text-[0.6875rem] mt-1" style={{ color: C.sub }}>{note}</div>}
      </header>
      <div className="px-4 pb-4 flex-1 flex flex-col">{children}</div>
    </section>
  );
}

export function Toggle({ value, onChange, options }) {
  return (
    <div className="flex p-0.5 rounded-lg" style={{ background: C.mint4 }} role="tablist">
      {options.map((o) => (
        <button key={o.key} role="tab" aria-selected={value === o.key} onClick={() => onChange(o.key)}
          className="px-2.5 py-1 rounded-md text-[0.6875rem] font-semibold transition whitespace-nowrap"
          style={{ background: value === o.key ? C.dark : "transparent", color: value === o.key ? C.mint4 : C.sub }}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Empty({ children, ok }) {
  const Icon = ok ? CheckCircle2 : Inbox;
  return (
    <div className="flex-1 min-h-32 flex flex-col items-center justify-center gap-1.5 text-xs text-center px-4" style={{ color: C.sub }}>
      <Icon className="w-5 h-5" style={{ color: ok ? C.ok : C.muted }} />
      {children}
    </div>
  );
}

// Ranked horizontal bars, one hue, value at the tip, axis underneath, details on hover/focus.
function RankBars({ rows, value, unit, tip, empty, showZero = false, limit = 5 }) {
  const [hover, setHover] = useState(null);
  const shown = rows.filter((r) => showZero || value(r) > 0).slice(0, limit);
  if (!shown.length) return <Empty>{empty}</Empty>;
  const ticks = niceTicks(Math.max(...shown.map(value)));
  const top = ticks[ticks.length - 1];
  const pct = (v) => `${(v / top) * 100}%`;
  return (
    <div className="mt-1">
      <ol>
        {shown.map((r, i) => {
          const v = value(r);
          return (
            <li key={r.id ?? r.key} tabIndex={0} aria-label={`${i + 1}. ${r.name}: ${v} ${unit.toLowerCase()}`}
              className="flex items-center gap-2 h-8 outline-none rounded focus-visible:ring-2"
              onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(i)} onBlur={() => setHover(null)}>
              <span className="w-3 text-[0.625rem] font-semibold text-right shrink-0" style={{ color: C.muted, ...NUM }}>{i + 1}</span>
              <span className="w-24 truncate text-xs shrink-0" style={{ color: C.dark }} title={r.name}>{r.name}</span>
              <div className="relative flex-1 h-full mr-8">
                {ticks.map((t) => (
                  <span key={t} className="absolute inset-y-0 w-px" style={{ left: pct(t), background: alpha(C.mint1, "44") }} />
                ))}
                <div className="absolute left-0 top-1/2 -translate-y-1/2 h-3.5 transition-opacity"
                  style={{ width: pct(v), background: BAR, borderRadius: "0 4px 4px 0", opacity: hover === null || hover === i ? 1 : 0.4 }} />
                <span className="absolute top-1/2 -translate-y-1/2 pl-1.5 text-xs font-semibold" style={{ left: pct(v), color: C.dark, ...NUM }}>{v}</span>
                {hover === i && tip && (
                  <div className="absolute z-20 bottom-full mb-1 px-2.5 py-1.5 rounded-lg shadow-lg text-[0.6875rem] leading-snug whitespace-nowrap pointer-events-none"
                    style={{ left: `min(${pct(v)}, 45%)`, background: C.dark, color: C.white }}>
                    <div className="font-semibold">{r.name}</div>
                    {tip(r).filter(Boolean).map((line) => <div key={line}>{line}</div>)}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      <div className="flex gap-2">
        <span className="w-3 shrink-0" /><span className="w-24 shrink-0" />
        <div className="relative flex-1 h-4 mr-8 border-t" style={{ borderColor: alpha(C.mint1, "99") }}>
          {ticks.map((t) => (
            <span key={t} className="absolute top-0.5 -translate-x-1/2 text-[0.625rem]" style={{ left: pct(t), color: C.muted, ...NUM }}>{t}</span>
          ))}
        </div>
      </div>
      <div className="text-center text-[0.625rem] mt-1" style={{ color: C.sub }}>{unit}</div>
    </div>
  );
}

export function Kpi({ Icon, tone, label, value, sub, onClick }) {
  return (
    <button onClick={onClick} disabled={!onClick}
      className="text-left rounded-xl border px-4 py-3 transition enabled:hover:shadow-sm disabled:cursor-default"
      style={{ background: C.white, borderColor: LINE }}>
      <div className="flex items-center gap-1.5 text-[0.6875rem] font-medium" style={{ color: C.sub }}>
        <Icon className="w-3.5 h-3.5 shrink-0" style={{ color: tone }} /> {label}
      </div>
      <div className="text-2xl font-semibold mt-1" style={{ color: C.dark }}>{value}</div>
      {sub && <div className="text-[0.6875rem] mt-0.5" style={{ color: C.sub }}>{sub}</div>}
    </button>
  );
}

// ─── charts ──────────────────────────────────────────────────────────────────
export function EditorsChart({ data }) {
  const [period, setPeriod] = useState("week");
  return (
    <Card title="Top 5 editors" note={`Episodes approved by reviewers · ${data.periods[period].label}`}
      controls={<Toggle value={period} onChange={setPeriod} options={PERIODS} />}>
      <RankBars rows={data.editors[period]} value={(r) => r.approved} unit="Episodes approved"
        tip={(r) => [`${plural(r.approved, "episode")} approved`, `${r.submitted} submitted · ${r.rejected} rejected`]}
        empty={`No approved episodes this ${period} yet.`} />
    </Card>
  );
}

export function ClientOrdersChart({ data }) {
  const [period, setPeriod] = useState("month");
  return (
    <Card title="Top ordering clients" note={`Serials and movies allotted · ${data.periods[period].label}`}
      controls={<Toggle value={period} onChange={setPeriod} options={PERIODS} />}>
      <RankBars rows={data.orders[period]} value={(r) => r.projects} unit="Serials / movies ordered"
        tip={(r) => [`${plural(r.serials, "serial")} · ${plural(r.movies, "movie")}`, `${plural(r.episodes, "episode")} allotted`]}
        empty={`No work allotted this ${period} yet.`} />
    </Card>
  );
}

const REVIEW_METRICS = [{ key: "approved", label: "Approved" }, { key: "sent", label: "Sent to society" }];

function ReviewersChart({ data }) {
  const [period, setPeriod] = useState("week");
  const [metric, setMetric] = useState("approved");
  const sent = metric === "sent";
  const rows = [...data.reviewers[period]].sort((a, b) => sent ? b.sent_episodes - a.sent_episodes : b.approved - a.approved);
  return (
    <Card title="Reviewers"
      note={`${sent ? "Episodes emailed to societies" : "Episodes approved"} · ${data.periods[period].label}`}
      controls={<>
        <Toggle value={period} onChange={setPeriod} options={PERIODS} />
        <Toggle value={metric} onChange={setMetric} options={REVIEW_METRICS} />
      </>}>
      <RankBars rows={rows} value={(r) => (sent ? r.sent_episodes : r.approved)}
        unit={sent ? "Episodes emailed to societies" : "Episodes approved"}
        tip={(r) => [
          `${r.approved} approved · ${r.rejected} rejected · ${r.suggested} changes asked`,
          `${plural(r.sent_reports, "email")} to societies (${plural(r.sent_episodes, "episode")})`,
          r.avg_review_hours != null && `Average ${days(r.avg_review_hours)} from submit to review`,
        ]}
        empty={sent ? `Nothing emailed to a society this ${period} yet.` : `No approvals this ${period} yet.`} />
    </Card>
  );
}

function AllocatorsChart({ data }) {
  const [period, setPeriod] = useState("week");
  return (
    <Card title="Work Delegators" note={`Serials and movies allotted to editors · ${data.periods[period].label}`}
      controls={<Toggle value={period} onChange={setPeriod} options={PERIODS} />}>
      <RankBars rows={data.allocators[period]} value={(r) => r.projects} showZero limit={6} unit="Serials / movies allotted"
        tip={(r) => [
          `${plural(r.delegations, "allotment")} · ${plural(r.episodes, "episode")}`,
          `${plural(r.editors, "editor")} · ${plural(r.clients, "client")}`,
        ]}
        empty="No Work Delegators yet." />
    </Card>
  );
}

// ─── clients ─────────────────────────────────────────────────────────────────
export const TH = "text-left text-[0.625rem] uppercase tracking-wider font-semibold px-3 py-2 whitespace-nowrap";

export function ClientDetail({ c }) {
  return (
    <div className="grid md:grid-cols-2 gap-4 px-4 py-3" style={{ background: alpha(C.mint4, "55") }}>
      <div>
        <div className="text-[0.625rem] uppercase tracking-wider font-semibold mb-1.5" style={{ color: C.sub }}>Pending serials / movies</div>
        {c.pending_projects.length === 0 ? <div className="text-xs" style={{ color: C.sub }}>Nothing pending.</div> : (
          <ul className="space-y-1.5">
            {c.pending_projects.map((p) => (
              <li key={p.project_id} className="text-xs">
                <span className="font-semibold" style={{ color: C.dark }}>{p.title}</span>
                {p.type === "MOVIE" && <span style={{ color: C.sub }}> · movie</span>}
                <span style={{ color: C.sub }}> · {p.editors.join(", ") || "no editor"}</span>
                <div style={{ color: C.sub, ...NUM }}>
                  {p.allotted ? `${p.allotted} allotted · ${p.in_editing} in editing · ${p.awaiting_send} ready to send · ${p.sent} sent` : "Episode range not set"}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div>
        <div className="text-[0.625rem] uppercase tracking-wider font-semibold mb-1.5" style={{ color: C.sub }}>Latest emails to societies</div>
        {c.recent.length === 0 ? <div className="text-xs" style={{ color: C.sub }}>No cue sheets emailed yet.</div> : (
          <ul className="space-y-1.5">
            {c.recent.map((r, i) => (
              <li key={i} className="text-xs">
                <span className="font-semibold" style={{ color: C.dark }}>{r.serial} {r.episodes}</span>
                <span style={{ color: C.sub }}> → {r.society || "Society"}{r.status === "replied" ? " · replied" : ""}</span>
                <div style={{ color: C.sub }}>{fmtDateTime(r.sent_at)} · {r.sent_by}</div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function ClientsTable({ rows }) {
  const [open, setOpen] = useState(null);
  return (
    <Card title="Clients" className="md:col-span-2"
      note="Cue sheets emailed to societies, and serials / movies with episodes not sent yet (in editing, or approved and ready to send). Click a client for details.">
      {rows.length === 0 ? <Empty>No clients yet. Add them under Clients.</Empty> : (
        <div className="-mx-4 overflow-auto max-h-[480px]">
          <table className="w-full text-xs">
            <thead className="sticky top-0 z-10" style={{ background: C.white }}>
              <tr className="border-b" style={{ borderColor: LINE, color: C.sub }}>
                <th className={`${TH} pl-4`}>Client</th>
                <th className={TH}>Sent to societies</th>
                <th className={`${TH} text-right`}>Episodes sent</th>
                <th className={`${TH} text-right`} title="Serials / movies with episodes not sent yet">Pending</th>
                <th className={`${TH} text-right`} title="Episodes not approved yet">In editing</th>
                <th className={`${TH} text-right`} title="Episodes approved but not emailed to a society">Ready to send</th>
                <th className={`${TH} pr-4`}>Last sent</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => {
                const isOpen = open === c.key;
                const Chevron = isOpen ? ChevronDown : ChevronRight;
                return [
                  <tr key={c.key} onClick={() => setOpen(isOpen ? null : c.key)}
                    className="border-b cursor-pointer transition hover:bg-black/[0.03]" style={{ borderColor: alpha(C.mint4, "99") }}>
                    <td className="pl-4 pr-3 py-2">
                      <div className="flex items-center gap-1.5 font-semibold" style={{ color: C.dark }}>
                        <Chevron className="w-3.5 h-3.5 shrink-0" style={{ color: C.muted }} /> {c.name}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-semibold whitespace-nowrap" style={{ color: C.dark, ...NUM }}>{plural(c.reports, "report")}</div>
                      {c.by_society.length > 0 && (
                        <div className="whitespace-nowrap" style={{ color: C.sub }}>{c.by_society.map((s) => `${s.society} ${s.reports}`).join(" · ")}</div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right" style={{ color: C.dark, ...NUM }}>{c.episodes_sent}</td>
                    <td className="px-3 py-2 text-right font-semibold" style={{ color: c.pending_count ? C.dark : C.muted, ...NUM }}>{c.pending_count}</td>
                    <td className="px-3 py-2 text-right" style={{ color: c.in_editing ? C.dark : C.muted, ...NUM }}>{c.in_editing}</td>
                    <td className="px-3 py-2 text-right" style={{ color: c.awaiting_send ? C.dark : C.muted, ...NUM }}>{c.awaiting_send}</td>
                    <td className="pl-3 pr-4 py-2 whitespace-nowrap" style={{ color: C.sub }}>{fmtDate(c.last_sent_at)}</td>
                  </tr>,
                  isOpen && <tr key={`${c.key}-detail`}><td colSpan={7} className="p-0 border-b" style={{ borderColor: alpha(C.mint4, "99") }}><ClientDetail c={c} /></td></tr>,
                ];
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

// ─── who needs attention ─────────────────────────────────────────────────────
function Attention({ title, note, rows, period, onPeriod, metrics, emptyText, action }) {
  return (
    <Card title={title} note={note} controls={<Toggle value={period} onChange={onPeriod} options={SHORT_PERIODS} />}>
      {rows.length === 0 ? <Empty ok>{emptyText}</Empty> : (
        <ul className="divide-y overflow-auto max-h-[340px] -mx-4" style={{ borderColor: LINE }}>
          {rows.map((r) => (
            <li key={r.id} className="px-4 py-2.5" style={{ borderColor: alpha(C.mint4, "99") }}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-semibold truncate" style={{ color: C.dark }}>{r.name}</span>
                <span className="text-[0.6875rem] shrink-0" style={{ color: C.sub, ...NUM }}>{metrics(r)}</span>
              </div>
              <ul className="mt-1 space-y-0.5">
                {r.flags.map((f) => (
                  <li key={f} className="flex items-start gap-1.5 text-[0.6875rem]" style={{ color: C.dark }}>
                    <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" style={{ color: C.warn }} /> {f}
                  </li>
                ))}
              </ul>
              {action?.(r)}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function EditorsAttention({ data }) {
  const [period, setPeriod] = useState("week");
  const [notify, setNotify] = useState(null);
  const [notified, setNotified] = useState({}); // emails sent since the dashboard loaded
  return (
    <>
      <Attention title="Editors needing attention" period={period} onPeriod={setPeriod}
        note={`Behind target, nothing submitted, not working on a serial, or a low approval rate · ${data.periods[period].label}`}
        rows={data.underperformers[period].editors}
        metrics={(r) => `${r.approved} approved${r.weekly_target ? ` · target ${r.weekly_target}/week` : ""}`}
        emptyText={`Every editor is on track this ${period}.`}
        action={(r) => {
          const last = notified[r.id] || (r.last_notified_at && { sent_at: r.last_notified_at, sent_by: r.last_notified_by, read: r.last_notice_read });
          return (
            <div className="flex flex-wrap items-center justify-between gap-2 mt-2">
              <span className="text-[0.625rem] min-w-0" style={{ color: C.sub }}>
                {last && `${last.sent_by} emailed ${timeAgo(last.sent_at)} · ${last.read ? "read" : "not read yet"}`}
              </span>
              <button onClick={() => setNotify(r.id)}
                className="inline-flex items-center gap-1 ml-auto px-2.5 py-1 rounded-lg text-[0.6875rem] font-semibold hover:opacity-90"
                style={{ background: C.dark, color: C.mint4 }}>
                <Mail className="w-3 h-3" /> Notify
              </button>
            </div>
          );
        }} />
      {notify && (
        <NotifyEditorModal editorId={notify} period={period} onClose={() => setNotify(null)}
          onSent={(last) => setNotified((prev) => ({ ...prev, [notify]: last }))} />
      )}
    </>
  );
}

function ReviewersAttention({ data }) {
  const [period, setPeriod] = useState("week");
  return (
    <Attention title="Reviewers needing attention" period={period} onPeriod={setPeriod}
      note={`Below the team average, slow, or with bounced emails · ${data.periods[period].label}`}
      rows={data.underperformers[period].reviewers}
      metrics={(r) => `${r.reviewed} reviewed · ${r.sent_episodes} sent`}
      emptyText={`Every reviewer is on track this ${period}.`} />
  );
}

// ─── weekly email reports ────────────────────────────────────────────────────
const REPORT_ROLES = [
  { value: "editor", label: "Editor" }, { value: "work_delegator", label: "Work Delegator" },
  { value: "reviewer", label: "Reviewer" }, { value: "admin", label: "Admin" },
];

function Switch({ checked, disabled, label, onChange }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={onChange}
      className="relative inline-block align-middle w-9 h-5 rounded-full transition-colors disabled:opacity-50" style={{ background: checked ? C.ok : C.muted }}>
      <span className="absolute top-0.5 w-4 h-4 rounded-full transition-all" style={{ left: checked ? "1.125rem" : "0.125rem", background: C.white }} />
    </button>
  );
}

// Super admin only: the API refuses everyone else, and other admins never see this section.
function ReportRecipients() {
  const [rows, setRows] = useState(null);
  const [saving, setSaving] = useState({});
  const [error, setError] = useState("");

  useEffect(() => { api.reportRecipients().then(setRows).catch((e) => setError(e.message)); }, []);

  const roleLabel = (u) => REPORT_ROLES.find((r) => r.value === u.role)?.label;

  const flip = async (u) => {
    setSaving((s) => ({ ...s, [u.id]: true })); setError("");
    try {
      const saved = await api.setReportRecipient(u.id, !u.enabled);
      setRows((all) => all.map((x) => (x.id === saved.id ? saved : x)));
    } catch (e) {
      setError(`${u.full_name}: ${e.message}`);
    } finally {
      setSaving((s) => ({ ...s, [u.id]: false }));
    }
  };

  return (
    <div className="mt-3 pt-3 border-t" style={{ borderColor: LINE }}>
      <div className="text-xs font-semibold" style={{ color: C.dark }}>
        Who receives it{rows ? `: ${rows.filter((u) => u.enabled).length} of ${rows.length}` : ""}
      </div>
      <div className="text-[0.6875rem] mt-0.5" style={{ color: C.sub }}>
        Only you can see and change this. Anyone switched off is skipped from the next send. Other emails aren't affected.
      </div>
      {error && <div className="text-xs mt-2 break-words" style={{ color: C.danger }}>{error}</div>}
      {rows && (
        <div className="mt-2 max-h-80 overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 z-10" style={{ background: C.white }}>
              <tr className="border-b" style={{ borderColor: LINE, color: C.sub }}>
                <th className={`${TH} pl-0`}>Person</th>
                <th className={`${TH} hidden sm:table-cell`}>Role</th>
                <th className={`${TH} pr-1 text-right`}>Report</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((u) => (
                <tr key={u.id} className="border-b last:border-b-0" style={{ borderColor: LINE }}>
                  <td className="py-1.5 pr-3 min-w-0">
                    <div className="font-semibold [overflow-wrap:anywhere]" style={{ color: u.enabled ? C.dark : C.sub }}>{u.full_name}</div>
                    <div className="[overflow-wrap:anywhere]" style={{ color: C.sub }}>{u.email}</div>
                    <div className="sm:hidden" style={{ color: C.sub }}>{roleLabel(u)}</div>
                  </td>
                  <td className="hidden sm:table-cell py-1.5 px-3 whitespace-nowrap" style={{ color: C.sub }}>{roleLabel(u)}</td>
                  <td className="py-1.5 pl-3 pr-1 text-right">
                    <Switch checked={u.enabled} disabled={!!saving[u.id]} label={`Weekly report for ${u.full_name}`} onChange={() => flip(u)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function WeeklyReports() {
  const { pushToast, isSuperAdmin } = useApp();
  const [status, setStatus] = useState(null);
  const [role, setRole] = useState("editor");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => { api.reportStatus().then(setStatus).catch((e) => setError(e.message)); }, []);

  const run = async (fn) => {
    setBusy(true); setError("");
    try { await fn(); } catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  if (!status) return error ? <Card title="Weekly email reports"><div className="text-xs" style={{ color: C.danger }}>{error}</div></Card> : null;
  const on = status.enabled && !status.missing.length && !status.problem && status.sending_enabled === true;
  const off = status.problem
    || (status.missing.length ? `Brevo isn't set up: fill in ${status.missing.join(", ")}.`
      : status.brevo_error ? `Brevo can't be checked: ${status.brevo_error}`
      : status.sending_enabled === false ? "Brevo has sending turned off on this account, so nothing would be delivered. Authenticate your domain in Brevo and ask their support to activate transactional email."
      : !status.enabled ? "Off: set REPORT_ENABLED=true to start sending." : "");
  const canSend = !status.missing.length && status.sending_enabled !== false;
  const last = status.last;
  return (
    <>
      <Card title="Weekly email reports" note="Last week's numbers for each editor, Work Delegator, reviewer and admin, through Brevo. Change the day and time in .env (REPORT_DAY, REPORT_TIME).">
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3 text-xs" style={{ color: C.dark }}>
          <div className="space-y-1 min-w-0">
            <div className="flex items-center gap-1.5 font-semibold">
              {on ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0" style={{ color: C.ok }} /> : <AlertTriangle className="w-3.5 h-3.5 shrink-0" style={{ color: C.warn }} />}
              {on ? `On: next ${fmtDateTime(status.next_run)}` : off}
            </div>
            <div style={{ color: C.sub }}>Every {status.day} at {status.time} ({status.timezone}){status.sender ? ` from ${status.sender_name} <${status.sender}>` : ""}</div>
            {status.delivery && (
              <div style={{ color: C.sub, ...NUM }}>
                Brevo, last {status.delivery.days} days: {status.delivery.delivered} delivered of {status.delivery.requests}, {status.delivery.bounced} bounced, {status.delivery.errors} not sent
              </div>
            )}
            {last && (
              <div style={{ color: C.sub }}>
                Last run {last.week}: {last.sent} handed to Brevo{last.failed ? `, ${last.failed} failed` : ""}
                {last.errors.map((e) => <div key={e.email} className="break-words" style={{ color: C.danger }}>{e.email}: {e.error}</div>)}
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={role} onChange={(e) => setRole(e.target.value)} className="px-2.5 py-1.5 rounded-lg text-xs border min-w-36"
              style={{ borderColor: LINE, background: C.white, color: C.dark }}>
              {REPORT_ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </Select>
            <button disabled={busy} onClick={() => run(async () => setPreview(await api.previewReport(role)))}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold hover:opacity-80 disabled:opacity-50" style={{ background: C.mint4, color: C.dark }}>
              <Eye className="w-3.5 h-3.5" /> Preview
            </button>
            <button disabled={busy || !canSend} title={canSend ? "Sends a sample to your own email only" : "Brevo isn't ready to send yet"}
              onClick={() => run(async () => { const r = await api.testReport(role); pushToast({ kind: "success", title: "Test report sent", body: `To ${r.to}` }); })}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold hover:opacity-90 disabled:opacity-50" style={{ background: C.dark, color: C.mint4 }}>
              <Send className="w-3.5 h-3.5" /> Send test to me
            </button>
          </div>
        </div>
        {error && <div className="text-xs mt-2 break-words" style={{ color: C.danger }}>{error}</div>}
        {isSuperAdmin && <ReportRecipients />}
      </Card>
      {preview && (
        <div className="cs-backdrop fixed inset-0 z-50 flex items-center justify-center">
          <div className="cs-glass w-full max-w-3xl rounded-2xl overflow-hidden flex flex-col h-[90vh]" role="dialog" aria-modal="true" aria-label="Report preview">
            <div className="px-4 py-3 border-b flex items-center justify-between gap-3" style={{ borderColor: LINE }}>
              <div className="min-w-0">
                <div className="text-sm font-semibold truncate" style={{ color: C.dark }}>{preview.subject}</div>
                <div className="text-[0.6875rem]" style={{ color: C.sub }}>Sample for {preview.for_name}</div>
              </div>
              <button onClick={() => setPreview(null)} aria-label="Close" style={{ color: C.sub }}><X className="w-4 h-4" /></button>
            </div>
            <iframe title="Report preview" srcDoc={preview.html} sandbox="" className="flex-1 w-full border-0" style={{ background: "#FFFFFF" }} />
          </div>
        </div>
      )}
    </>
  );
}

// ─── pipeline ────────────────────────────────────────────────────────────────
export function Pipeline({ data, links }) {
  const p = data.pipeline;
  const ep = p.episodes;
  const parts = [
    { label: "Not submitted yet",   value: ep.pending || 0,                                    color: T.grayLight },
    { label: "Changes asked",       value: ep.edited || 0,                                     color: T.orange },
    { label: "Rejected",            value: ep.rejected || 0,                                   color: C.danger },
    { label: "Waiting for review",  value: ep.submitted || 0,                                  color: T.purple },
    { label: "Approved, ready to send", value: p.approved_not_sent,                                color: T.blue },
    { label: "Sent to a society",   value: Math.max(0, (ep.approved || 0) - p.approved_not_sent), color: C.ok },
  ];
  const total = parts.reduce((a, x) => a + x.value, 0);
  return (
    <Card title="Work pipeline" note={`All ${plural(total, "episode")}, by where they are now`}>
      {total === 0 ? <Empty>No episodes yet.</Empty> : (
        <>
          <div className="flex gap-0.5 h-2 mt-1" role="img"
            aria-label={parts.map((x) => `${x.label} ${x.value}`).join(", ")}>
            {parts.filter((x) => x.value > 0).map((x) => (
              <span key={x.label} className="h-full rounded-full" title={`${x.label}: ${x.value}`}
                style={{ width: `${(x.value / total) * 100}%`, background: x.color, minWidth: 4 }} />
            ))}
          </div>
          <ul className="mt-3 space-y-1">
            {parts.map((x) => (
              <li key={x.label} className="flex items-center gap-2 text-xs">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: x.color }} />
                <span className="flex-1" style={{ color: C.dark }}>{x.label}</span>
                <span className="font-semibold" style={{ color: C.dark, ...NUM }}>{x.value}</span>
                <span className="w-9 text-right" style={{ color: C.muted, ...NUM }}>{Math.round((x.value / total) * 100)}%</span>
              </li>
            ))}
          </ul>
        </>
      )}
      <div className="mt-auto pt-3 flex flex-wrap gap-x-3 gap-y-1 text-[0.6875rem] border-t" style={{ borderColor: LINE }}>
        {links(p).map((l) => (
          <button key={l.label} className="hover:underline" style={{ color: C.sub }} onClick={l.onClick}>{l.label}</button>
        ))}
      </div>
    </Card>
  );
}

// ─── quarterly calendar ──────────────────────────────────────────────────────
// `config` decides what is counted and shown; the layout, filters and month selection are shared.
export const MONTH_NAMES = MONTHS;
export const MONTH_NAMES_FULL = MONTHS_FULL;

const ALLOTTED_CALENDAR = {
  title: "Quarterly calendar",
  note: (societyName) => `Episodes per month${societyName ? ` · sent and pending count ${societyName} only` : ""}. Click a month for clients and societies.`,
  load: (year, clientId, societyId) => api.insightsCalendar(year, clientId, societyId),
  gridClass: "grid-cols-[repeat(auto-fit,minmax(min(100%,14.5rem),1fr))]",
  cols: [
    { key: "allotted", label: "Allotted" },
    { key: "approved", label: "Approved" },
    { key: "sent_episodes", label: "Sent", title: (x) => (x.sent_reports ? plural(x.sent_reports, "email") : undefined) },
    { key: "pending", label: "Pending" },
  ],
  progress: (q) => (q.allotted ? Math.round(((q.allotted - q.pending) / q.allotted) * 100) : null),
  progressNote: (q, done) => (done == null ? "Nothing allotted this quarter" : `${done}% of episodes allotted this quarter sent · ${plural(q.sent_reports, "email")}`),
  summary: (x) => `${x.allotted} allotted · ${x.approved} approved · ${x.sent_episodes} sent in ${plural(x.sent_reports, "email")} · ${x.pending} pending`,
  detail: (x) => (
    <div className="grid md:grid-cols-3 gap-4 p-3">
      <SocietySplit societies={x.societies} />
      <NamedTable className="md:col-span-2" title="By client" rows={x.clients} empty="No work this month."
        cols={[["allotted", "Allotted"], ["approved", "Approved"], ["sent", "Sent"], ["pending", "Pending"]]} />
    </div>
  ),
  legend: [
    ["Allotted", "episodes given to editors that month"],
    ["Approved", "episodes approved by reviewers that month"],
    ["Sent", "episodes emailed to a society from the client's Gmail"],
    ["Pending", "of that month's allotted episodes, not sent yet"],
  ],
};

export function SocietySplit({ societies, className = "" }) {
  const names = Object.entries(societies || {});
  return (
    <div className={className}>
      <div className="text-[0.625rem] uppercase tracking-wider font-semibold mb-1.5" style={{ color: C.sub }}>Sent by society</div>
      {names.length === 0 ? <div className="text-xs" style={{ color: C.sub }}>Nothing emailed this month.</div> : (
        <ul className="space-y-1">
          {names.map(([name, n]) => (
            <li key={name} className="flex justify-between text-xs"><span style={{ color: C.dark }}>{name}</span><span className="font-semibold" style={{ color: C.dark, ...NUM }}>{plural(n, "ep", "eps")}</span></li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function NamedTable({ title, rows, cols, empty, first = "Client", nameKey = "name", className = "" }) {
  return (
    <div className={`overflow-x-auto ${className}`}>
      <div className="text-[0.625rem] uppercase tracking-wider font-semibold mb-1.5" style={{ color: C.sub }}>{title}</div>
      {rows.length === 0 ? <div className="text-xs" style={{ color: C.sub }}>{empty}</div> : (
        <table className="w-full text-xs">
          <thead>
            <tr style={{ color: C.sub }}>
              <th className="text-left font-semibold text-[0.625rem] uppercase tracking-wide pb-1">{first}</th>
              {cols.map(([k, h]) => <th key={k} className="text-right font-semibold text-[0.625rem] uppercase tracking-wide pb-1 pl-3">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c[nameKey]} className="border-t" style={{ borderColor: alpha(C.mint4, "99") }}>
                <td className="py-1.5 whitespace-nowrap" style={{ color: C.dark }}>{c[nameKey]}</td>
                {cols.map(([k]) => <td key={k} className="text-right py-1.5 pl-3" style={{ color: c[k] ? C.dark : C.muted, ...NUM }}>{c[k] || 0}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export function QuarterCalendar({ reloadKey, config = ALLOTTED_CALENDAR }) {
  const thisYear = new Date().getFullYear();
  const years = Array.from({ length: Math.max(1, thisYear - 2026 + 1) }, (_, i) => 2026 + i);
  const [year, setYear] = useState(Math.max(thisYear, 2026));
  const [clientId, setClientId] = useState("");
  const [societyId, setSocietyId] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sel, setSel] = useState(null);

  useEffect(() => {
    let live = true;
    setLoading(true);
    config.load(year, clientId, societyId)
      .then((d) => { if (live) setData(d); })
      .catch(() => { if (live) setData(null); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [year, clientId, societyId, reloadKey, config]);

  const month = (m) => data?.months?.[String(m)] || {};
  // Totals of every number a month carries, for the quarter row and the progress line.
  const sum = (ms) => ms.reduce((a, m) => {
    Object.entries(month(m)).forEach(([k, v]) => { if (typeof v === "number") a[k] = (a[k] || 0) + v; });
    return a;
  }, {});
  const now = new Date();
  const isNow = (m) => year === now.getFullYear() && m === now.getMonth() + 1;
  const societyName = data?.societies?.find((s) => String(s.id) === societyId)?.name;
  const selMonth = sel ? month(sel) : null;
  const box = "px-2.5 py-1.5 rounded-lg text-xs border min-w-40";
  const boxStyle = { borderColor: LINE, color: C.dark, background: C.white };

  return (
    <section className="rounded-xl border" style={{ background: C.white, borderColor: LINE }}>
      <header className="px-4 pt-3.5 pb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="text-base leading-tight" style={{ fontFamily: FONTS.serif, color: C.dark }}>{config.title}</h4>
          <div className="text-[0.6875rem] mt-0.5" style={{ color: C.sub }}>{config.note(societyName)}</div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={clientId} onChange={(e) => { setClientId(e.target.value); setSel(null); }} className={box} style={boxStyle}>
            <option value="">All clients</option>
            {(data?.clients || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <Select value={societyId} onChange={(e) => { setSocietyId(e.target.value); setSel(null); }} className={box} style={boxStyle}>
            <option value="">All societies</option>
            {(data?.societies || []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
          {years.length > 1 && <Toggle value={String(year)} onChange={(y) => { setYear(+y); setSel(null); }}
            options={years.map((y) => ({ key: String(y), label: String(y) }))} />}
        </div>
      </header>

      <div className={`px-4 pb-4 transition-opacity ${loading ? "opacity-50" : ""}`}>
        {!loading && !data ? <Empty>Couldn't load the calendar.</Empty> : (
          <div className={`grid gap-3 ${config.gridClass}`}>
            {QUARTERS.map((ms, qi) => {
              const q = sum(ms);
              const done = config.progress(q);
              return (
                <div key={qi} className="rounded-lg border min-w-0" style={{ borderColor: LINE }}>
                  <div className="px-3 py-2 flex items-baseline justify-between border-b" style={{ borderColor: LINE, background: alpha(C.mint4, "55") }}>
                    <span className="text-sm font-bold" style={{ color: C.dark }}>Q{qi + 1}</span>
                    <span className="text-[0.6875rem]" style={{ color: C.sub }}>{MONTHS[ms[0] - 1]} – {MONTHS[ms[2] - 1]} {year}</span>
                  </div>
                  <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr style={{ color: C.sub }}>
                        <th className="text-left font-semibold text-[0.625rem] pl-3 py-1.5">Month</th>
                        {config.cols.map((c) => <th key={c.key} className="text-right font-semibold text-[0.625rem] px-1 py-1.5 last:pr-3 whitespace-nowrap" title={c.hint}>{c.label}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {ms.map((m) => {
                        const x = month(m);
                        const active = sel === m;
                        return (
                          <tr key={m} onClick={() => setSel(active ? null : m)} className="cursor-pointer transition hover:bg-black/[0.03]"
                            style={{ background: active ? alpha(C.mint1, "55") : undefined }}>
                            <td className="pl-3 py-1.5 font-semibold whitespace-nowrap" style={{ color: C.dark }}>
                              {MONTHS[m - 1]}
                              {isNow(m) && <span className="ml-1 inline-block w-1.5 h-1.5 rounded-full align-middle" style={{ background: C.ok }} title="This month" />}
                            </td>
                            {config.cols.map((c) => (
                              <td key={c.key} className="text-right px-1 py-1.5 last:pr-3" style={{ color: x[c.key] ? C.dark : C.muted, ...NUM }}
                                title={c.title?.(x)}>
                                {x[c.key] || 0}
                              </td>
                            ))}
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="border-t" style={{ borderColor: LINE }}>
                        <td className="pl-3 py-1.5 font-bold text-[0.6875rem]" style={{ color: C.dark }}>Total</td>
                        {config.cols.map((c) => (
                          <td key={c.key} className="text-right px-1 py-1.5 font-bold last:pr-3" style={{ color: C.dark, ...NUM }}>{q[c.key] || 0}</td>
                        ))}
                      </tr>
                    </tfoot>
                  </table>
                  </div>
                  <div className="px-3 pb-2.5 pt-1">
                    <div className="h-1.5 rounded-full overflow-hidden" style={{ background: alpha(C.mid, "22") }}>
                      <div className="h-full rounded-full" style={{ width: `${Math.min(100, done ?? 0)}%`, background: C.mid }} />
                    </div>
                    <div className="text-[0.625rem] mt-1" style={{ color: C.sub }}>{config.progressNote(q, done)}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {selMonth && (
          <div className="mt-3 rounded-lg border" style={{ borderColor: LINE }}>
            <div className="px-3 py-2 flex flex-wrap items-baseline justify-between gap-2 border-b" style={{ borderColor: LINE, background: alpha(C.mint4, "55") }}>
              <span className="text-sm font-semibold" style={{ color: C.dark }}>{MONTHS_FULL[sel - 1]} {year}</span>
              <span className="text-[0.6875rem]" style={{ color: C.sub, ...NUM }}>{config.summary(selMonth)}</span>
            </div>
            {config.detail(selMonth)}
          </div>
        )}

        <div className="mt-3 pt-3 border-t grid gap-x-6 gap-y-1 sm:grid-cols-2 lg:grid-cols-4 text-[0.6875rem]" style={{ borderColor: LINE, color: C.sub }}>
          {config.legend.map(([name, text]) => <div key={name}><b style={{ color: C.dark }}>{name}</b> — {text}</div>)}
        </div>
      </div>
    </section>
  );
}

// ─── page ────────────────────────────────────────────────────────────────────
export default function AdminInsights({ navigate }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    api.adminInsights()
      .then((d) => { setData(d); setError(""); })
      .catch((e) => setError(e.message || "Failed to load the dashboard"))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  if (!data) {
    return loading
      ? <div className="p-8 text-center text-sm" style={{ color: C.sub }}>Loading…</div>
      : <div className="p-8 text-center text-sm" style={{ color: C.danger }}>{error}</div>;
  }

  const k = data.kpis;
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 text-[0.6875rem]" style={{ color: C.sub }}>
        <span>This week: {data.periods.week.label}</span>
        <button onClick={load} disabled={loading} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-semibold hover:opacity-80 disabled:opacity-50"
          style={{ background: C.mint4, color: C.dark }}>
          <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      <div className="grid gap-3 grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
        <Kpi Icon={Layers} tone={C.sub} label="Allotted this week" value={k.allotted_projects}
          sub={`serials / movies · ${plural(k.allotted_episodes, "episode")}`} onClick={() => navigate("delegations")} />
        <Kpi Icon={CheckCircle2} tone={C.ok} label="Approved this week" value={k.approved}
          sub="episodes" onClick={() => navigate("activity", { activityTab: "reviewers" })} />
        <Kpi Icon={Send} tone={C.blue} label="Sent to societies" value={k.sent_episodes}
          sub={`episodes in ${plural(k.sent_reports, "email")} this week`} onClick={() => navigate("activity", { activityTab: "submissions" })} />
        <Kpi Icon={Clock} tone={C.warn} label="Waiting for review" value={k.waiting_review}
          sub={k.oldest_wait_days != null ? `oldest ${plural(k.oldest_wait_days, "day")}` : "episodes"} onClick={() => navigate("projects")} />
        <Kpi Icon={Inbox} tone={T.purple} label="Ready to send" value={k.awaiting_society}
          sub={`approved episodes not emailed yet · ${plural(k.awaiting_society_projects, "serial / movie", "serials / movies")}`} />
        <Kpi Icon={Mail} tone={k.bounced ? C.danger : C.sub} label="Emails to act on" value={k.society_replies + k.bounced}
          sub={`${plural(k.society_replies, "society reply", "society replies")} · ${k.bounced} bounced`} />
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <EditorsChart data={data} />
        <ClientOrdersChart data={data} />
        <ReviewersChart data={data} />
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <ClientsTable rows={data.clients} />
        <AllocatorsChart data={data} />
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <EditorsAttention data={data} />
        <ReviewersAttention data={data} />
        <Pipeline data={data} links={(p) => [
          { label: plural(p.serials, "serial"), onClick: () => navigate("projects", { projectSubTab: "serial" }) },
          { label: plural(p.movies, "movie"), onClick: () => navigate("projects", { projectSubTab: "movie" }) },
          { label: plural(Object.values(p.users_by_role).reduce((a, b) => a + b, 0), "active user"), onClick: () => navigate("users") },
        ]} />
      </div>

      <QuarterCalendar />
      <WeeklyReports />
    </div>
  );
}
