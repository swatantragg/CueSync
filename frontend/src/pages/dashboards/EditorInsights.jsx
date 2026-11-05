import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, Clock, ExternalLink, Layers, Mail, RefreshCw, Send, XCircle,
} from "lucide-react";
import { C, FONTS, alpha, T } from "../../styles/palette";
import { api } from "../../utils/api";
import { fmtDateTime } from "../../utils/format";
import { WorkList } from "../../components/NotifyEditorModal";
import { useApp } from "../../context/AppContext";
import { Card, Empty, Kpi, LINE, NUM, PERIODS, TH, Toggle, niceTicks, plural } from "./AdminInsights";

// Editor Dashboard (/api/insights/editor-dashboard): the work allotted client by client, progress by week / month /
// year and the emails the Work Delegator sent. Completed = approved by a reviewer. On time = submitted before the date
// the weekly target sets (target episodes per 7 days from the allotment); work without a target isn't timed.

const SUBMITTED = { key: "submitted", label: "Submitted", color: T.chartSubmitted };
const APPROVED = { key: "approved", label: "Approved", color: T.chartApproved };
const REJECTED = { key: "rejected", label: "Rejected", color: T.chartRejected };

const RATING_TONE = {
  good: { fg: T.green, bg: T.greenBg, Icon: CheckCircle2 },
  decent: { fg: T.blue, bg: T.blueBg, Icon: Clock },
  under: { fg: T.red, bg: T.redBg, Icon: AlertTriangle },
  none: { fg: T.gray, bg: T.grayBg, Icon: Clock },
};

function RatingBanner({ rating, label }) {
  const { fg, bg, Icon } = RATING_TONE[rating.key];
  return (
    <div className="rounded-xl px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-1" style={{ background: bg }}>
      <span className="inline-flex items-center gap-1.5 text-sm font-semibold" style={{ color: fg }}>
        <Icon className="w-4 h-4 shrink-0" /> {rating.label}
      </span>
      <span className="text-[0.6875rem]" style={{ color: C.sub }}>This week: {label}</span>
      {rating.reasons.length > 0 && (
        <ul className="w-full space-y-0.5 mt-1">
          {rating.reasons.map((r) => <li key={r} className="text-xs" style={{ color: C.dark }}>{r}</li>)}
        </ul>
      )}
    </div>
  );
}

// Grouped columns on one axis, one series colour each; every value is on hover/focus and under "Show numbers".
function Columns({ rows, series, unit, empty }) {
  useApp(); // re-render when the font size changes: the label thinning below depends on it
  const plot = useRef(null);
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState(null);
  const total = (s) => rows.reduce((a, r) => a + r[s.key], 0);
  const hasData = series.some((s) => total(s) > 0);

  useLayoutEffect(() => {
    if (!plot.current || typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(plot.current);
    return () => ro.disconnect();
  }, [hasData]);

  if (!hasData) return <Empty>{empty}</Empty>;

  const ticks = niceTicks(Math.max(...rows.flatMap((r) => series.map((s) => r[s.key]))));
  const top = ticks[ticks.length - 1];
  // Show every Nth axis label when they'd collide on a narrow card or at a large font.
  const fontPx = parseFloat(getComputedStyle(document.documentElement).fontSize) * 0.625;
  const labelPx = Math.max(...rows.map((r) => r.label.length)) * fontPx * 0.62 + 4;
  const every = width ? Math.max(1, Math.ceil(labelPx / (width / rows.length))) : 1;

  return (
    <div className="mt-1">
      <div className="flex flex-wrap gap-x-4 gap-y-1 mb-2 text-[0.6875rem]" style={{ color: C.sub }}>
        {series.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: s.color }} /> {s.label}
            <span className="font-semibold" style={{ color: C.dark, ...NUM }}>{total(s)}</span>
          </span>
        ))}
      </div>
      <div className="flex gap-1.5">
        <div className="relative w-6 h-36 shrink-0" aria-hidden="true">
          {ticks.map((t) => (
            <span key={t} className="absolute right-0 -translate-y-1/2 text-[0.625rem]" style={{ top: `${100 - (t / top) * 100}%`, color: C.muted, ...NUM }}>{t}</span>
          ))}
        </div>
        <div className="flex-1 min-w-0">
          <div ref={plot} className="relative h-36 border-b" style={{ borderColor: alpha(C.mint1, "99") }}>
            {ticks.slice(1).map((t) => (
              <span key={t} className="absolute inset-x-0 h-px" style={{ top: `${100 - (t / top) * 100}%`, background: alpha(C.mint1, "44") }} />
            ))}
            <div className="absolute inset-0 flex" onMouseLeave={() => setHover(null)}>
              {rows.map((r, i) => (
                <div key={r.label} tabIndex={0} className="relative flex-1 min-w-0 h-full flex items-end justify-center gap-0.5 px-px outline-none rounded focus-visible:ring-2"
                  aria-label={`${r.label}: ${series.map((s) => `${s.label} ${r[s.key]}`).join(", ")}`}
                  onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} onBlur={() => setHover(null)}>
                  {series.map((s) => (
                    <span key={s.key} className="block flex-1 transition-opacity" style={{
                      maxWidth: 24, height: `${(r[s.key] / top) * 100}%`, minHeight: r[s.key] ? 3 : 0, background: s.color,
                      borderRadius: "4px 4px 0 0", opacity: hover === null || hover === i ? 1 : 0.4,
                    }} />
                  ))}
                  {hover === i && (
                    <div className="absolute z-20 bottom-full mb-1 px-2.5 py-1.5 rounded-lg shadow-lg text-[0.6875rem] leading-snug whitespace-nowrap pointer-events-none"
                      style={{ background: C.dark, color: C.white, ...(i < rows.length / 2 ? { left: 0 } : { right: 0 }) }}>
                      <div className="font-semibold">{r.label}</div>
                      {series.map((s) => (
                        <div key={s.key} className="flex items-center gap-1.5">
                          <span className="w-2.5 h-0.5 shrink-0" style={{ background: s.color }} />
                          <span className="font-semibold" style={NUM}>{r[s.key]}</span> {s.label.toLowerCase()}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
          <div className="flex mt-0.5" aria-hidden="true">
            {rows.map((r, i) => (
              <span key={r.label} className="flex-1 min-w-0 text-center text-[0.625rem] whitespace-nowrap" style={{ color: C.muted, ...NUM, overflow: "visible" }}>
                {i % every === 0 ? r.label : ""}
              </span>
            ))}
          </div>
        </div>
      </div>
      <div className="text-center text-[0.625rem] mt-1" style={{ color: C.sub }}>{unit}</div>
      <details className="mt-2 text-[0.6875rem]" style={{ color: C.sub }}>
        <summary className="cursor-pointer select-none">Show numbers</summary>
        <div className="overflow-x-auto mt-1">
          <table className="w-full">
            <thead>
              <tr className="border-b" style={{ borderColor: LINE }}>
                <th className="text-left font-semibold py-1 pr-2" />
                {series.map((s) => <th key={s.key} className="text-right font-semibold py-1 pl-2">{s.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.label} className="border-b" style={{ borderColor: alpha(C.mint4, "99") }}>
                  <td className="py-1 pr-2 whitespace-nowrap" style={{ color: C.dark }}>{r.label}</td>
                  {series.map((s) => <td key={s.key} className="text-right py-1 pl-2" style={{ color: C.dark, ...NUM }}>{r[s.key]}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

function OnTime({ stats }) {
  const parts = [
    { label: "On time", value: stats.on_time, color: T.chartApproved },
    { label: "Late", value: stats.late, color: T.chartRejected },
    { label: "No weekly target", value: stats.no_target, color: T.grayLight },
  ];
  const timed = stats.on_time + stats.late;
  if (!stats.approved) return <Empty>Nothing completed in this period yet.</Empty>;
  return (
    <div className="mt-1">
      <div className="flex items-baseline gap-2">
        <span className="text-3xl font-semibold" style={{ color: C.dark, ...NUM }}>{timed ? `${Math.round((stats.on_time / timed) * 100)}%` : stats.approved}</span>
        <span className="text-xs" style={{ color: C.sub }}>{timed ? "of timed work on time" : plural(stats.approved, "episode") + " completed"}</span>
      </div>
      <div className="flex gap-0.5 h-2 mt-3" role="img" aria-label={parts.map((x) => `${x.label} ${x.value}`).join(", ")}>
        {parts.filter((x) => x.value > 0).map((x) => (
          <span key={x.label} className="h-full rounded-full" title={`${x.label}: ${x.value}`} style={{ width: `${(x.value / stats.approved) * 100}%`, background: x.color, minWidth: 4 }} />
        ))}
      </div>
      <ul className="mt-3 space-y-1">
        {parts.map((x) => (
          <li key={x.label} className="flex items-center gap-2 text-xs">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: x.color }} />
            <span className="flex-1" style={{ color: C.dark }}>{x.label}</span>
            <span className="font-semibold" style={{ color: C.dark, ...NUM }}>{x.value}</span>
          </li>
        ))}
      </ul>
      <div className="text-[0.6875rem] mt-3" style={{ color: C.sub }}>{plural(stats.approved, "episode")} completed. Rate: {stats.approval_rate == null ? "—" : `${stats.approval_rate}% approved of reviewed`}.</div>
    </div>
  );
}

// ─── client-wise work ────────────────────────────────────────────────────────
function Split({ c }) {
  const parts = [
    { key: "approved", label: "Completed", color: T.chartApproved },
    { key: "waiting", label: "In review", color: T.chartSubmitted },
    { key: "rest", label: "With you", color: T.grayLight, value: c.to_do + c.rejected + c.changes },
  ];
  if (!c.allotted) return <span className="text-[0.6875rem]" style={{ color: C.muted }}>—</span>;
  return (
    <div className="w-28">
      <div className="flex gap-0.5 h-1.5" role="img" aria-label={parts.map((p) => `${p.label} ${p.value ?? c[p.key]}`).join(", ")}>
        {parts.filter((p) => (p.value ?? c[p.key]) > 0).map((p) => (
          <span key={p.key} className="h-full rounded-full" style={{ width: `${((p.value ?? c[p.key]) / c.allotted) * 100}%`, background: p.color, minWidth: 3 }} />
        ))}
      </div>
      <div className="text-[0.625rem] mt-0.5" style={{ color: C.sub, ...NUM }}>{Math.round((c.approved / c.allotted) * 100)}% completed</div>
    </div>
  );
}

function ClientWork({ clients, onOpenSerial }) {
  const [open, setOpen] = useState(null);
  const cell = (v) => ({ color: v ? C.dark : C.muted, ...NUM });
  const COLS = [
    ["allotted", "Allotted", "Episodes given to you"], ["approved", "Completed", "Approved by a reviewer"],
    ["waiting", "In review", "Submitted, waiting for a reviewer"], ["to_do", "To do", "Not submitted yet"],
    ["rejected", "Rejected", "Fix and submit again"], ["changes", "Changes", "A reviewer asked for changes"],
    ["overdue", "Overdue", "Still with you, past the date your weekly target sets"],
  ];
  return (
    <Card title="Work allotted, client by client" note="Click a client for its serials and movies.">
      {clients.length === 0 ? <Empty>No work allotted yet.</Empty> : (
        <div className="-mx-4 overflow-auto max-h-[560px]">
          <table className="w-full text-xs">
            <thead className="sticky top-0 z-10" style={{ background: C.white }}>
              <tr className="border-b" style={{ borderColor: LINE, color: C.sub }}>
                <th className={`${TH} pl-4`}>Client</th>
                <th className={TH}>Progress</th>
                {COLS.map(([k, label, hint], i) => <th key={k} className={`${TH} text-right ${i === COLS.length - 1 ? "pr-4" : ""}`} title={hint}>{label}</th>)}
              </tr>
            </thead>
            <tbody>
              {clients.map((c) => {
                const isOpen = open === c.key;
                const Chevron = isOpen ? ChevronDown : ChevronRight;
                return [
                  <tr key={c.key} onClick={() => setOpen(isOpen ? null : c.key)} className="border-b cursor-pointer transition hover:bg-black/[0.03]" style={{ borderColor: alpha(C.mint4, "99") }}>
                    <td className="pl-4 pr-3 py-2">
                      <div className="flex items-center gap-1.5 font-semibold whitespace-nowrap" style={{ color: C.dark }}>
                        <Chevron className="w-3.5 h-3.5 shrink-0" style={{ color: C.muted }} /> {c.name}
                      </div>
                      <div className="pl-5 text-[0.625rem] whitespace-nowrap" style={{ color: C.sub }}>{plural(c.projects.length, "serial / movie", "serials / movies")}</div>
                    </td>
                    <td className="px-3 py-2"><Split c={c} /></td>
                    {COLS.map(([k], i) => (
                      <td key={k} className={`px-3 py-2 text-right ${i === COLS.length - 1 ? "pr-4" : ""} ${k === "overdue" && c[k] ? "font-semibold" : ""}`} style={cell(c[k])}>{c[k]}</td>
                    ))}
                  </tr>,
                  isOpen && c.projects.map((p) => (
                    <tr key={`${c.key}-${p.project_id}`} className="border-b" style={{ borderColor: alpha(C.mint4, "99"), background: alpha(C.mint4, "55") }}>
                      <td className="pl-9 pr-3 py-2" colSpan={2}>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold" style={{ color: C.dark }}>{p.title}</span>
                          <button onClick={() => onOpenSerial(p.project_id)} className="inline-flex items-center gap-1 text-[0.625rem] font-semibold hover:underline" style={{ color: C.sub }}>
                            <ExternalLink className="w-3 h-3" /> Open
                          </button>
                        </div>
                        <div className="text-[0.625rem]" style={{ color: C.sub }}>
                          {[p.type === "movie" ? "Movie" : p.episode_range ? `Episodes ${p.episode_range}` : "All episodes",
                            p.week_target && `target ${p.week_target}/week`, `by ${p.assigned_by}`, !p.open && "marked completed"].filter(Boolean).join(" · ")}
                        </div>
                        {p.to_do_eps && <div className="text-[0.625rem]" style={{ color: C.sub }}>To do: {p.to_do_eps}</div>}
                        {p.overdue_eps && <div className="text-[0.625rem] font-semibold" style={{ color: T.red }}>Overdue: {p.overdue_eps}</div>}
                      </td>
                      {COLS.map(([k], i) => <td key={k} className={`px-3 py-2 text-right ${i === COLS.length - 1 ? "pr-4" : ""}`} style={cell(p[k])}>{p[k]}</td>)}
                    </tr>
                  )),
                ];
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

// ─── emails from the Work Delegator ──────────────────────────────────────────
function Notice({ n, onRead }) {
  const [open, setOpen] = useState(!n.read_at);
  return (
    <li className="rounded-xl border overflow-hidden" style={{ background: C.white, borderColor: n.read_at ? LINE : T.orange }}>
      <button onClick={() => setOpen((o) => !o)} className="w-full flex items-start gap-3 px-4 py-3 text-left">
        <Mail className="w-4 h-4 mt-0.5 shrink-0" style={{ color: n.read_at ? C.muted : T.orange }} />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold break-words" style={{ color: C.dark }}>{n.subject}</div>
          <div className="text-[0.6875rem] break-words" style={{ color: C.sub }}>From {n.sent_by} &lt;{n.from_email}&gt; · {fmtDateTime(n.sent_at)}</div>
        </div>
        {!n.read_at && <span className="text-[0.625rem] font-bold px-1.5 py-0.5 rounded shrink-0" style={{ background: T.orangeBg, color: T.orange }}>New</span>}
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-3">
          <p className="text-sm whitespace-pre-wrap break-words" style={{ color: C.dark }}>{n.message}</p>
          {n.work.length > 0 && <WorkList work={n.work} />}
          {!n.read_at && (
            <button onClick={() => onRead(n.id)} className="px-3 py-1.5 rounded-lg text-xs font-semibold hover:opacity-90" style={{ background: C.dark, color: C.mint4 }}>Mark as read</button>
          )}
        </div>
      )}
    </li>
  );
}

function Notices({ notices, onRead }) {
  if (!notices.length) return null;
  const unread = notices.filter((n) => !n.read_at).length;
  return (
    <section>
      <h4 className="text-base mb-2" style={{ fontFamily: FONTS.serif, color: C.dark }}>
        Emails from your Work Delegator{unread > 0 && <span className="text-xs font-semibold ml-2" style={{ color: T.orange, fontFamily: FONTS.sans }}>{unread} new</span>}
      </h4>
      <ul className="space-y-2">{notices.map((n) => <Notice key={n.id} n={n} onRead={onRead} />)}</ul>
    </section>
  );
}

// ─── page ────────────────────────────────────────────────────────────────────
export default function EditorInsights({ onOpenSerial }) {
  const { notifications, fetchNotifications } = useApp();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState("week");

  const load = () => {
    setLoading(true);
    api.editorInsights()
      .then((d) => { setData(d); setError(""); })
      .catch((e) => setError(e.message || "Failed to load the dashboard"))
      .finally(() => setLoading(false));
  };
  // A new email from the Work Delegator appears without a refresh.
  const noticeCount = notifications.filter((n) => n.entity_type === "editor_notice").length;
  useEffect(load, [noticeCount]);

  const markRead = async (id) => {
    const row = await api.markEditorNoticeRead(id);
    setData((d) => ({ ...d, notices: d.notices.map((n) => (n.id === id ? row : n)) }));
    fetchNotifications?.({ silent: true });
  };

  if (!data) {
    return loading
      ? <div className="p-8 text-center text-sm" style={{ color: C.sub }}>Loading…</div>
      : <div className="p-8 text-center text-sm" style={{ color: C.danger }}>{error}</div>;
  }

  const t = data.totals;
  const stats = data.stats[period];
  const rows = data.series[period];
  return (
    <div className="space-y-4">
      <RatingBanner rating={data.rating} label={data.periods.week.label} />
      <Notices notices={data.notices} onRead={markRead} />

      <div className="grid gap-3 grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
        <Kpi Icon={Layers} tone={C.sub} label="Allotted" value={t.allotted} sub={data.weekly_target ? `target ${data.weekly_target}/week` : "episodes"} />
        <Kpi Icon={CheckCircle2} tone={T.chartApproved} label="Completed" value={t.approved} sub={t.allotted ? `${Math.round((t.approved / t.allotted) * 100)}% of allotted` : "approved"} />
        <Kpi Icon={Send} tone={T.chartSubmitted} label="In review" value={t.waiting} sub="waiting for a reviewer" />
        <Kpi Icon={Clock} tone={C.sub} label="To do" value={t.to_do} sub="not submitted yet" />
        <Kpi Icon={XCircle} tone={T.chartRejected} label="To fix" value={t.rejected + t.changes} sub={`${t.rejected} rejected · ${plural(t.changes, "change")}`} />
        <Kpi Icon={AlertTriangle} tone={t.overdue ? T.red : C.muted} label="Overdue" value={t.overdue} sub="past the target date" />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <Toggle value={period} onChange={setPeriod} options={PERIODS} />
          <span className="text-[0.6875rem]" style={{ color: C.sub }}>{data.periods[period].label}</span>
        </div>
        <button onClick={load} disabled={loading} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[0.6875rem] font-semibold hover:opacity-80 disabled:opacity-50"
          style={{ background: C.mint4, color: C.dark }}>
          <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Card title="Your progress" note="Episodes you submitted and episodes approved">
          <Columns rows={rows} series={[SUBMITTED, APPROVED]} unit="Episodes" empty={`Nothing submitted or approved this ${period} yet.`} />
        </Card>
        <Card title="Approved vs rejected" note="Reviewers' decisions on your cue sheets">
          <Columns rows={rows} series={[APPROVED, REJECTED]} unit="Cue sheets" empty={`No cue sheet reviewed this ${period} yet.`} />
        </Card>
        <Card title="Completed and on time" note="Submitted before the date your weekly target sets">
          <OnTime stats={stats} />
        </Card>
      </div>

      <ClientWork clients={data.clients} onOpenSerial={onOpenSerial} />
    </div>
  );
}
