import { useEffect, useState, useRef } from "react";
import {
  Plus, Trash2, Search, Edit2, X, ChevronLeft, ChevronRight,
  ArrowLeft, CalendarDays, History, Layers, ChevronDown, Film, Mail, Users,
} from "lucide-react";
import { C, FONTS, alpha, T } from "../../styles/palette";
import Select from "../../components/Select";
import DashboardShell from "./DashboardShell";
import ProjectsTab from "./ProjectsTab";
import WDInsights from "./WDInsights";
import { QuarterCalendar } from "./AdminInsights";
import { api } from "../../utils/api";
import { fmtDateTime, timeAgo } from "../../utils/format";
import { showAlert, showConfirm } from "../../components/Dialog";
import Timeline from "../../components/Timeline";
import NotifyEditorModal from "../../components/NotifyEditorModal";
import { useApp } from "../../context/AppContext";

const WORK_TYPES = ["TV Cue Sheet", "Movie Cue Sheet", "Album", "Other"];
const STATUSES = ["pending", "in_progress", "completed"];
const STATUS_STYLE = {
  pending:     { bg: T.orangeBg, color: T.orange, label: "Pending" },
  in_progress: { bg: T.blueBg, color: T.blue, label: "In Progress" },
  completed:   { bg: T.greenBg, color: T.green, label: "Completed" },
};
const MONTH_FULL  = ["January","February","March","April","May","June","July","August","September","October","November","December"];

function StatusBadge({ status }) {
  const s = STATUS_STYLE[status] || STATUS_STYLE.pending;
  return (
    <span className="text-[0.625rem] px-2 py-0.5 rounded font-medium" style={{ background: s.bg, color: s.color }}>
      {s.label}
    </span>
  );
}

// Client select value for an old delegation whose typed client name isn't linked to the client list.
const KEEP_OLD_CLIENT = "__keep__";

// ─── Delegation form ──────────────────────────────────────────────────────────
function DelegationForm({ editors, onSave, onClose, initial = null }) {
  const [form, setForm] = useState({
    serial_name:  initial?.serial_name  || "",
    work_type:    initial?.work_type    || "TV Cue Sheet",
    client_id:    initial?.client_id ? String(initial.client_id) : initial?.client ? KEEP_OLD_CLIENT : "",
    channel:      initial?.channel      || "",
    episode_range:initial?.episode_range|| "",
    week_target:  initial?.week_target  || "",
    completed:    initial?.completed    || 0,
    status:       initial?.status       || "pending",
    notes:        initial?.notes        || "",
    assigned_to:  initial?.assigned_to  || "",
  });
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggest, setShowSuggest] = useState(false);
  const [isNewSerial, setIsNewSerial] = useState(false);
  const [saving, setSaving] = useState(false);
  const suggestRef = useRef(null);
  const [clients, setClients] = useState([]);

  useEffect(() => { api.listClients().then(setClients).catch(() => {}); }, []);

  const clientOptions = clients.filter((c) => c.is_active || c.id === initial?.client_id);

  const searchProjects = async (q) => {
    if (!q.trim()) { setSuggestions([]); setShowSuggest(false); setIsNewSerial(false); return; }
    try {
      const rows = await api.suggestProjects(q);
      setSuggestions(rows);
      setShowSuggest(rows.length > 0);
      setIsNewSerial(!rows.some((r) => r.title.toLowerCase() === q.trim().toLowerCase()));
    } catch (_) {}
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.serial_name.trim() || !form.assigned_to) {
      await showAlert("Serial name and assigned editor are required.", { variant: "warn" });
      return;
    }
    setSaving(true);
    const { client_id, ...rest } = form;
    // Leaving an old typed client name untouched sends no client fields, so the server keeps it.
    const client = client_id === KEEP_OLD_CLIENT ? {} : { client_id: client_id ? parseInt(client_id) : null };
    try {
      await onSave({ ...rest, ...client, week_target: form.week_target ? parseInt(form.week_target) : null, assigned_to: parseInt(form.assigned_to) });
      onClose();
    } catch (ex) {
      await showAlert(ex.message, { title: "Save Failed", variant: "error" });
    } finally { setSaving(false); }
  };

  const inp = "w-full px-3 py-2 rounded-lg text-sm focus:outline-none";
  const inpStyle = { background: C.mid, color: C.mint4, border: `1px solid ${alpha(C.mint1, "33")}` };

  return (
    <div className="cs-backdrop fixed inset-0 z-50 flex items-center justify-center">
      <div className="cs-dark cs-glass rounded-2xl w-full max-w-xl overflow-hidden">
        <div className="px-6 py-4 border-b flex items-center justify-between" style={{ borderColor: C.mid }}>
          <h3 className="font-semibold text-lg" style={{ fontFamily: FONTS.serif, color: C.mint4 }}>
            {initial ? "Edit Delegation" : "New Delegation"}
          </h3>
          <button onClick={onClose} style={{ color: C.muted }}><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="relative" ref={suggestRef}>
            <label className="block text-xs font-medium mb-1" style={{ color: C.muted }}>Serial / Movie Name *</label>
            <input
              value={form.serial_name}
              onChange={(e) => { setForm((f) => ({ ...f, serial_name: e.target.value })); searchProjects(e.target.value); }}
              onFocus={() => form.serial_name && searchProjects(form.serial_name)}
              onBlur={() => setTimeout(() => setShowSuggest(false), 150)}
              placeholder="Start typing to see existing serials…"
              className={inp} style={inpStyle}
            />
            {showSuggest && (
              <div className="absolute left-0 right-0 z-50 rounded-lg shadow-xl mt-1 overflow-hidden" style={{ background: C.mid, border: `1px solid ${alpha(C.mint1, "44")}` }}>
                {suggestions.map((s) => (
                  <button key={s.id} type="button"
                    onMouseDown={() => { setForm((f) => ({ ...f, serial_name: s.title })); setShowSuggest(false); setIsNewSerial(false); }}
                    className="w-full text-left px-4 py-2.5 hover:opacity-80 text-sm" style={{ color: C.mint4 }}>
                    {s.title} <span className="text-xs opacity-60">({s.type === "movie" ? "MOVIE" : "SERIAL"})</span>
                  </button>
                ))}
              </div>
            )}
            {isNewSerial && !showSuggest && form.serial_name.trim() && (
              <div className="mt-1.5 flex items-center gap-1.5 text-xs px-2 py-1 rounded-lg w-fit" style={{ background: T.orangeBg, color: T.orange }}>
                <Plus className="w-3 h-3" /> New serial — will be auto-created
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: C.muted }}>Work Type</label>
              <Select tone="dark" value={form.work_type} onChange={(e) => setForm((f) => ({ ...f, work_type: e.target.value, episode_range: e.target.value === "Movie Cue Sheet" ? "" : f.episode_range }))} className={inp} style={inpStyle}>
                {WORK_TYPES.map((t) => <option key={t}>{t}</option>)}
              </Select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: C.muted }}>Assign To *</label>
              <Select tone="dark" value={form.assigned_to} onChange={(e) => setForm((f) => ({ ...f, assigned_to: e.target.value }))} className={inp} style={inpStyle}>
                <option value="">Select editor…</option>
                {editors.map((e) => <option key={e.id} value={e.id}>{e.full_name}</option>)}
              </Select>
            </div>
          </div>

          <div className={`grid gap-4 ${form.work_type === "Movie Cue Sheet" ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2"}`}>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: C.muted }}>Client</label>
              <Select tone="dark" value={form.client_id} onChange={(e) => setForm((f) => ({ ...f, client_id: e.target.value }))} className={inp} style={inpStyle}>
                <option value="">No client</option>
                {initial?.client && !initial.client_id && (
                  <option value={KEEP_OLD_CLIENT}>{initial.client} (old name, not in client list)</option>
                )}
                {clientOptions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
              <p className="text-[0.6875rem] mt-1" style={{ color: C.muted }}>
                Missing a client? An Admin or Reviewer adds it under Clients.
              </p>
            </div>
            {form.work_type !== "Movie Cue Sheet" && (
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: C.muted }}>Channel</label>
                <input value={form.channel} onChange={(e) => setForm((f) => ({ ...f, channel: e.target.value }))} placeholder="TV channel" className={inp} style={inpStyle} />
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: form.work_type === "Movie Cue Sheet" ? alpha(C.muted, "55") : C.muted }}>Episode Range</label>
              <input
                value={form.episode_range}
                onChange={(e) => setForm((f) => ({ ...f, episode_range: e.target.value }))}
                placeholder={form.work_type === "Movie Cue Sheet" ? "N/A for movies" : "e.g. Ep 601-800"}
                className={inp}
                style={{ ...inpStyle, opacity: form.work_type === "Movie Cue Sheet" ? 0.4 : 1, cursor: form.work_type === "Movie Cue Sheet" ? "not-allowed" : "auto" }}
                disabled={form.work_type === "Movie Cue Sheet"}
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: C.muted }}>Week Target</label>
              <input type="number" value={form.week_target} onChange={(e) => setForm((f) => ({ ...f, week_target: e.target.value }))} placeholder="0" className={inp} style={inpStyle} />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: C.muted }}>Status</label>
              <Select tone="dark" value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))} className={inp} style={inpStyle}>
                {STATUSES.map((s) => <option key={s} value={s}>{STATUS_STYLE[s].label}</option>)}
              </Select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: C.muted }}>Notes</label>
            <textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              rows={2} placeholder="Optional notes…" className={`${inp} resize-none`} style={inpStyle} />
          </div>

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

// ─── Activity Panel (Editor Activity tab) ─────────────────────────────────────
const PAGE_SIZE = 25;

const EP_STATUS_COLOR = {
  approved:  { bg: T.greenBg, color: T.green },
  submitted: { bg: T.blueBg, color: T.blue },
  rejected:  { bg: T.redBg, color: T.red },
  pending:   { bg: T.grayBg, color: T.grayMid },
  unknown:   { bg: T.grayBg, color: T.grayMid },
};

function MiniPager({ entries, children, pageSize = PAGE_SIZE }) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(entries.length / pageSize));
  const paged = entries.slice((page - 1) * pageSize, page * pageSize);
  return (
    <>
      {children(paged, (page - 1) * pageSize)}
      {totalPages > 1 && (
        <div className="px-4 py-2 border-t flex items-center justify-between" style={{ borderColor: alpha(C.mint4, "44") }}>
          <span className="text-xs" style={{ color: C.sub }}>Page {page}/{totalPages} · {entries.length} entries</span>
          <div className="flex gap-1">
            <button onClick={() => setPage(1)} disabled={page === 1} className="px-1.5 py-0.5 text-xs rounded disabled:opacity-30 hover:bg-black/5" style={{ color: C.sub }}>«</button>
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="p-1 rounded disabled:opacity-30 hover:bg-black/5" style={{ color: C.sub }}><ChevronLeft className="w-3.5 h-3.5" /></button>
            <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="p-1 rounded disabled:opacity-30 hover:bg-black/5" style={{ color: C.sub }}><ChevronRight className="w-3.5 h-3.5" /></button>
            <button onClick={() => setPage(totalPages)} disabled={page === totalPages} className="px-1.5 py-0.5 text-xs rounded disabled:opacity-30 hover:bg-black/5" style={{ color: C.sub }}>»</button>
          </div>
        </div>
      )}
    </>
  );
}

function ActivityPanel({ editors, selected, onSelect }) {
  const [log, setLog]                       = useState(null);
  const [loading, setLoading]               = useState(false);
  const [panelTab, setPanelTab]             = useState("serials");
  const [selectedSerial, setSelectedSerial] = useState(null);
  const [selectedMovie, setSelectedMovie]   = useState(null);
  const [serialSubTab, setSerialSubTab]     = useState("submitted");
  const [historyYear, setHistoryYear]       = useState(null);
  const [activityEpisode, setActivityEpisode] = useState(null);

  useEffect(() => {
    if (!selected) { setLog(null); return; }
    setPanelTab("serials"); setSelectedSerial(null); setSelectedMovie(null); setHistoryYear(null); setActivityEpisode(null);
    setLoading(true);
    api.editorActivity(selected).then(setLog).catch(() => setLog(null)).finally(() => setLoading(false));
  }, [selected]);

  const delegMap        = Object.fromEntries((log?.delegations || []).map((d) => [d.serial_name, d]));
  const bySerialMap     = Object.fromEntries((log?.by_serial || []).map((g) => [g.serial, g]));
  const episodeStats    = log?.episode_stats || {};
  const episodesBySerial = log?.episodes_by_serial || {};

  const isMovieProject = (serial) => {
    const g = bySerialMap[serial];
    if (g?.project_type) return g.project_type === "MOVIE";
    return delegMap[serial]?.work_type === "Movie Cue Sheet";
  };

  const allProjects    = log ? [...new Set([...(log.by_serial || []).map((g) => g.serial), ...(log.delegations || []).map((d) => d.serial_name)])] : [];
  const allSerialsList = allProjects.filter((s) => !isMovieProject(s));
  const allMoviesList  = allProjects.filter((s) => isMovieProject(s));

  const now = new Date();
  const currentMonthSubmitted = (log?.by_serial || []).flatMap((g) => g.entries).filter((e) => {
    if (e.action !== "submit" || !e.at) return false;
    const d = new Date(e.at);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;

  const allEntries = (log?.by_serial || []).flatMap((g) => g.entries.map((e) => ({ ...e, serial: g.serial })));
  const historyData = {};
  for (const e of allEntries) {
    if (!e.at) continue;
    const d = new Date(e.at); const y = d.getFullYear(); const m = d.getMonth() + 1;
    if (!historyData[y]) historyData[y] = {};
    if (!historyData[y][m]) historyData[y][m] = { sub: 0, app: 0 };
    if (e.action === "submit")  historyData[y][m].sub++;
    if (e.action === "approve") historyData[y][m].app++;
  }
  const historyYears = Object.keys(historyData).map(Number).sort((a, b) => b - a);

  const serialGroup      = selectedSerial ? (bySerialMap[selectedSerial] || { entries: [] }) : null;
  const serialDeleg      = selectedSerial ? delegMap[selectedSerial] : null;
  const serialStat       = selectedSerial ? (episodeStats[selectedSerial] || null) : null;
  const serialSubmitted  = (serialGroup?.entries || []).filter((e) => e.action === "submit");
  const serialAllEntries = serialGroup?.entries || [];

  const serialEpisodes = (() => {
    if (!selectedSerial) return [];
    const fromApi = episodesBySerial[selectedSerial] || [];
    const knownNums = new Set(fromApi.map((e) => e.episode_number));
    const extra = [];
    for (const e of serialAllEntries) {
      if (e.episode_number != null && !knownNums.has(e.episode_number)) {
        knownNums.add(e.episode_number);
        extra.push({ id: null, episode_number: e.episode_number, title: "", status: "unknown" });
      }
    }
    return [...fromApi, ...extra].sort((a, b) => a.episode_number - b.episode_number);
  })();

  const movieGroup   = selectedMovie ? (bySerialMap[selectedMovie] || { entries: [] }) : null;
  const movieStat    = selectedMovie ? (episodeStats[selectedMovie] || null) : null;

  // ── Editor-level aggregates ─────────────────────────────────────────────────
  const editorTarget  = (log?.delegations || []).reduce((s, d) => s + (Number(d.week_target) || 0), 0);
  const allSubmitted  = (log?.by_serial || []).flatMap((g) => g.entries).filter((e) => e.action === "submit").length;
  const editorPending = Math.max(0, editorTarget - allSubmitted);
  const totalRejected = Object.values(episodeStats).reduce((s, v) => s + (v.rejected || 0), 0);
  const movieEntries = movieGroup?.entries || [];

  const thStyle   = { background: alpha(C.mint4, "33"), color: C.sub, borderColor: C.mint4 };
  const TH        = "text-[0.625rem] uppercase tracking-wider font-semibold px-4 py-2";
  const rowBorder = { borderColor: alpha(C.mint4, "44") };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Editor list */}
      <div className="rounded-xl border overflow-hidden self-start" style={{ background: C.white, borderColor: alpha(C.mint1, "44") }}>
        <div className="px-4 py-3 border-b text-[0.625rem] font-bold uppercase tracking-widest"
          style={{ borderColor: C.mint4, background: alpha(C.mint4, "66"), color: C.sub }}>Editors</div>
        {editors.length === 0
          ? <div className="p-6 text-sm text-center" style={{ color: C.sub }}>No editors found</div>
          : editors.map((e) => (
            <button key={e.id} onClick={() => { onSelect(e.id); setSelectedSerial(null); setSelectedMovie(null); }}
              className="w-full text-left px-4 py-3 border-b last:border-0 text-sm hover:bg-green-50/40 transition"
              style={{ borderColor: alpha(C.mint4, "55"), background: selected === e.id ? alpha(C.mint4, "99") : undefined, color: C.dark }}>
              <div className="font-medium">{e.full_name}</div>
              <div className="text-xs" style={{ color: C.sub }}>{e.email}</div>
            </button>
          ))}
      </div>

      {/* Right panel */}
      <div className="lg:col-span-2 min-w-0">
        {!selected && <div className="rounded-xl border p-10 text-center text-sm" style={{ background: C.white, borderColor: alpha(C.mint1, "44"), color: C.sub }}>Select an editor to view their activity</div>}
        {selected && loading && <div className="rounded-xl border p-10 text-center text-sm" style={{ background: C.white, borderColor: alpha(C.mint1, "44"), color: C.sub }}>Loading…</div>}

        {selected && !loading && log && (
          <>
            {/* Summary header */}
            <div className="mb-4 rounded-xl border px-5 py-3 flex items-center gap-6" style={{ background: alpha(C.mint4, "22"), borderColor: alpha(C.mint4, "44") }}>
              <div>
                <div className="text-xs font-bold uppercase tracking-widest" style={{ color: C.sub }}>{log.user?.full_name}</div>
                <div className="text-sm mt-0.5" style={{ color: C.dark }}>
                  <strong>{currentMonthSubmitted}</strong> cue sheet{currentMonthSubmitted !== 1 ? "s" : ""} submitted in {MONTH_FULL[now.getMonth()]}
                </div>
              </div>
              <div className="ml-auto flex gap-4 text-center flex-wrap justify-end">
                {[
                  { val: allSerialsList.length,  label: "Serials",   color: C.dark    },
                  { val: allMoviesList.length,   label: "Movies",    color: T.purple },
                  { val: editorTarget,           label: "Target",    color: T.orange },
                  { val: allSubmitted,           label: "Submitted", color: C.dark    },
                  { val: Object.values(episodeStats).reduce((s, v) => s + (v.approved || 0), 0), label: "Approved", color: C.ok },
                  { val: editorPending,          label: "Pending",   color: C.danger  },
                  { val: totalRejected,          label: "Rejected",  color: T.red },
                ].map(({ val, label, color }) => (
                  <div key={label}>
                    <div className="text-lg font-bold leading-none" style={{ color }}>{val}</div>
                    <div className="text-[0.625rem] uppercase tracking-wider mt-0.5" style={{ color: alpha(color, "88") }}>{label}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Panel tabs: Serials / Movies / History */}
            <div className="flex gap-1 mb-4 p-1 rounded-xl" style={{ background: C.mint4, border: `1px solid ${alpha(C.mint1, "66")}` }}>
              {[
                { key: "serials", label: "Serials", icon: CalendarDays },
                { key: "movies",  label: "Movies",  icon: Film },
                { key: "history", label: "History", icon: History },
              ].map(({ key, label, icon: Icon }) => (
                <button key={key} onClick={() => { setPanelTab(key); setSelectedSerial(null); setSelectedMovie(null); setHistoryYear(null); setActivityEpisode(null); }}
                  className="flex-1 flex items-center justify-center gap-2 py-1.5 rounded-lg text-xs font-semibold transition-all"
                  style={{ background: panelTab === key ? C.dark : "transparent", color: panelTab === key ? C.mint4 : C.mid }}>
                  <Icon className="w-3.5 h-3.5" />{label}
                </button>
              ))}
            </div>

            {/* ── Serials list ── */}
            {panelTab === "serials" && !selectedSerial && (
              <div className="rounded-xl border overflow-hidden" style={{ background: C.white, borderColor: alpha(C.mint1, "44") }}>
                {allSerialsList.length === 0
                  ? <div className="p-8 text-center text-sm" style={{ color: C.sub }}>No serials assigned yet</div>
                  : allSerialsList.map((serial) => {
                    const deleg = delegMap[serial] || null;
                    const group = bySerialMap[serial] || { count: 0 };
                    const done  = episodeStats[serial]?.approved ?? deleg?.completed ?? 0;
                    return (
                      <button key={serial} onClick={() => { setSelectedSerial(serial); setSerialSubTab("submitted"); }}
                        className="w-full text-left px-4 py-3 border-b last:border-0 hover:bg-green-50/30 transition flex items-center gap-4"
                        style={{ borderColor: alpha(C.mint4, "44") }}>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm truncate" style={{ color: C.dark }}>{serial}</div>
                          <div className="flex items-center gap-2 mt-0.5">
                            {deleg && <StatusBadge status={deleg.status} />}
                            {deleg?.episode_range && <span className="text-[0.625rem]" style={{ color: C.sub }}>{deleg.episode_range}</span>}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-xs font-medium" style={{ color: C.sub }}>
                            {group.count > 0
                              ? <span title={fmtDateTime(group.entries?.[0]?.at)}>Last activity {timeAgo(group.entries?.[0]?.at)} · {group.count} action{group.count !== 1 ? "s" : ""}</span>
                              : "No activity yet"}
                          </div>
                          {deleg && <div className="text-[0.625rem] mt-0.5" style={{ color: C.sub }}>Target: {deleg.week_target ?? "—"} · Done: {done}</div>}
                        </div>
                        <ChevronRight className="w-4 h-4 shrink-0" style={{ color: C.muted }} />
                      </button>
                    );
                  })}
              </div>
            )}

            {/* ── Serial detail ── */}
            {panelTab === "serials" && selectedSerial && (
              <div>
                <button onClick={() => { setSelectedSerial(null); setActivityEpisode(null); }} className="flex items-center gap-1.5 text-xs mb-3 hover:opacity-70" style={{ color: C.sub }}>
                  <ArrowLeft className="w-3.5 h-3.5" /> Back to serials
                </button>
                {(() => {
                  const sTarget   = Number(serialDeleg?.week_target) || 0;
                  const sSub      = serialSubmitted.length;
                  const sApproved = serialStat?.approved || 0;
                  const sPending  = Math.max(0, sTarget - sSub);
                  const sRejected = serialStat?.rejected || 0;
                  return (
                    <div className="mb-3 rounded-xl border overflow-hidden" style={{ background: C.white, borderColor: alpha(C.mint1, "44") }}>
                      <div className="px-4 py-3 border-b flex items-center gap-3" style={{ borderColor: alpha(C.mint4, "55"), background: alpha(C.mint4, "22") }}>
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-sm" style={{ color: C.dark }}>{selectedSerial}</div>
                          {serialDeleg && (
                            <div className="flex items-center gap-3 mt-1 text-xs" style={{ color: C.sub }}>
                              <StatusBadge status={serialDeleg.status} />
                              {serialDeleg.episode_range && <span>Range: {serialDeleg.episode_range}</span>}
                              {serialDeleg.client && <span>Client: {serialDeleg.client}</span>}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="grid grid-cols-3 sm:grid-cols-5 divide-x text-center py-3" style={{ borderColor: alpha(C.mint4, "44") }}>
                        {[
                          { label: "Target",   val: sTarget,   color: T.orange },
                          { label: "Submitted",val: sSub,      color: C.dark    },
                          { label: "Approved", val: sApproved, color: C.ok      },
                          { label: "Pending",  val: sPending,  color: C.danger  },
                          { label: "Rejected", val: sRejected, color: T.red },
                        ].map(({ label, val, color }) => (
                          <div key={label} className="px-3">
                            <div className="text-xl font-bold leading-none" style={{ color }}>{val}</div>
                            <div className="text-[0.625rem] uppercase tracking-wide mt-1" style={{ color: alpha(color, "88") }}>{label}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}
                <div className="flex gap-1 mb-3 p-1 rounded-xl" style={{ background: C.mint4, border: `1px solid ${alpha(C.mint1, "66")}` }}>
                  {[
                    { key: "submitted", label: `Submitted (${serialSubmitted.length})` },
                    { key: "approved",  label: `Approved (${serialStat?.approved ?? 0})` },
                    { key: "activity",  label: `Activity Log (${serialAllEntries.length})` },
                  ].map((t) => (
                    <button key={t.key} onClick={() => { setSerialSubTab(t.key); setActivityEpisode(null); }}
                      className="flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all"
                      style={{ background: serialSubTab === t.key ? C.dark : "transparent", color: serialSubTab === t.key ? C.mint4 : C.mid }}>
                      {t.label}
                    </button>
                  ))}
                </div>

                {serialSubTab === "submitted" && (
                  <div className="rounded-xl border overflow-hidden" style={{ background: C.white, borderColor: alpha(C.mint1, "44") }}>
                    {serialSubmitted.length === 0
                      ? <div className="p-8 text-center text-sm" style={{ color: C.sub }}>No submissions for this serial</div>
                      : (
                        <MiniPager entries={serialSubmitted}>
                          {(paged, offset) => (
                            <table className="w-full text-sm">
                              <thead><tr className="border-b" style={thStyle}><th className={`text-left ${TH}`}>#</th><th className={`text-center ${TH}`}>Ep #</th><th className={`text-right ${TH}`}>Date</th></tr></thead>
                              <tbody>
                                {paged.map((e, i) => (
                                  <tr key={e.id} className="border-b last:border-0 hover:bg-green-50/20" style={rowBorder}>
                                    <td className="px-4 py-2.5 font-mono text-xs" style={{ color: C.sub }}>{offset + i + 1}</td>
                                    <td className="px-4 py-2.5 text-center font-mono text-xs" style={{ color: C.dark }}>{e.episode_number != null ? String(e.episode_number).padStart(2,"0") : "—"}</td>
                                    <td className="px-4 py-2.5 text-right text-xs" style={{ color: C.sub }}>{e.at ? new Date(e.at).toLocaleString() : "—"}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </MiniPager>
                      )}
                  </div>
                )}
                {serialSubTab === "approved" && (
                  <div className="rounded-xl border overflow-hidden" style={{ background: C.white, borderColor: alpha(C.mint1, "44") }}>
                    {!serialStat
                      ? <div className="p-8 text-center text-sm" style={{ color: C.sub }}>No episode data for this serial</div>
                      : (
                        <table className="w-full text-sm">
                          <thead><tr className="border-b" style={thStyle}>
                            <th className={`text-center ${TH}`}>Approved</th><th className={`text-center ${TH}`}>In Review</th>
                            <th className={`text-center ${TH}`}>Rejected</th><th className={`text-center ${TH}`}>Pending</th><th className={`text-center ${TH}`}>Total</th>
                          </tr></thead>
                          <tbody><tr>
                            <td className="px-4 py-3 text-center text-lg font-bold" style={{ color: C.ok }}>{serialStat.approved || 0}</td>
                            <td className="px-4 py-3 text-center text-lg font-bold" style={{ color: T.purple }}>{serialStat.submitted || 0}</td>
                            <td className="px-4 py-3 text-center text-lg font-bold" style={{ color: C.danger }}>{serialStat.rejected || 0}</td>
                            <td className="px-4 py-3 text-center text-lg font-bold" style={{ color: C.warn }}>{serialStat.pending || 0}</td>
                            <td className="px-4 py-3 text-center text-lg font-bold" style={{ color: C.dark }}>{serialStat.total || 0}</td>
                          </tr></tbody>
                        </table>
                      )}
                  </div>
                )}
                {/* Activity log: episode list → episode detail */}
                {serialSubTab === "activity" && (
                  !activityEpisode ? (
                    <div className="rounded-xl border overflow-hidden" style={{ background: C.white, borderColor: alpha(C.mint1, "44") }}>
                      {serialEpisodes.length === 0
                        ? <div className="p-8 text-center text-sm" style={{ color: C.sub }}>No episodes found</div>
                        : (
                          <MiniPager entries={serialEpisodes} pageSize={20}>
                            {(paged) => (
                              <table className="w-full text-sm">
                                <thead>
                                  <tr className="border-b" style={thStyle}>
                                    <th className={`text-center ${TH}`}>Ep #</th>
                                    <th className={`text-left ${TH}`}>Title</th>
                                    <th className={`text-left ${TH}`}>Status</th>
                                    <th className="px-4 py-2"></th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {paged.map((ep) => {
                                    const sc = EP_STATUS_COLOR[ep.status] || EP_STATUS_COLOR.unknown;
                                    return (
                                      <tr key={ep.episode_number} className="border-b last:border-0 hover:bg-green-50/20 cursor-pointer" style={rowBorder}
                                        onClick={() => setActivityEpisode(ep.episode_number)}>
                                        <td className="px-4 py-2.5 text-center font-mono text-xs" style={{ color: C.dark }}>{String(ep.episode_number).padStart(2,"0")}</td>
                                        <td className="px-4 py-2.5 text-xs" style={{ color: C.dark }}>{ep.title || "—"}</td>
                                        <td className="px-4 py-2.5">
                                          <span className="text-[0.625rem] px-1.5 py-0.5 rounded font-medium capitalize" style={{ background: sc.bg, color: sc.color }}>{ep.status}</span>
                                        </td>
                                        <td className="px-4 py-2.5 text-right"><ChevronRight className="w-4 h-4 inline" style={{ color: C.muted }} /></td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            )}
                          </MiniPager>
                        )
                      }
                    </div>
                  ) : (
                    <div>
                      <button onClick={() => setActivityEpisode(null)} className="flex items-center gap-1.5 text-xs mb-3 hover:opacity-70" style={{ color: C.sub }}>
                        <ArrowLeft className="w-3.5 h-3.5" /> Back to episodes
                      </button>
                      <div className="mb-2 px-3 py-1 rounded-lg inline-flex items-center gap-2" style={{ background: alpha(C.mint4, "44") }}>
                        <span className="text-xs font-semibold" style={{ color: C.dark }}>Episode {String(activityEpisode).padStart(2,"0")}</span>
                      </div>
                      <div className="rounded-xl border overflow-hidden" style={{ background: C.white, borderColor: alpha(C.mint1, "44") }}>
                        {(() => {
                          const epLog = serialAllEntries.filter((e) => e.episode_number === activityEpisode);
                          return epLog.length === 0
                            ? <div className="p-8 text-center text-sm" style={{ color: C.sub }}>No activity for this episode</div>
                            : (
                              <MiniPager entries={epLog} pageSize={20}>
                                {(paged) => <Timeline rows={paged} who={log.user?.full_name} />}
                              </MiniPager>
                            );
                        })()}
                      </div>
                    </div>
                  )
                )}
              </div>
            )}

            {/* ── Movies list ── */}
            {panelTab === "movies" && !selectedMovie && (
              <div className="rounded-xl border overflow-hidden" style={{ background: C.white, borderColor: alpha(C.mint1, "44") }}>
                {allMoviesList.length === 0
                  ? <div className="p-8 text-center text-sm" style={{ color: C.sub }}>No movies assigned yet</div>
                  : allMoviesList.map((movie) => {
                    const group       = bySerialMap[movie] || { count: 0 };
                    const stat        = episodeStats[movie] || null;
                    const isSubmitted = stat ? (stat.submitted > 0 || stat.approved > 0) : false;
                    const isApproved  = stat ? stat.approved > 0 : false;
                    return (
                      <button key={movie} onClick={() => setSelectedMovie(movie)}
                        className="w-full text-left px-4 py-3 border-b last:border-0 hover:bg-green-50/30 transition flex items-center gap-4"
                        style={{ borderColor: alpha(C.mint4, "44") }}>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm truncate" style={{ color: C.dark }}>{movie}</div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[0.625rem] px-1.5 py-0.5 rounded font-medium"
                              style={{ background: isSubmitted ? T.blueBg : T.grayBg, color: isSubmitted ? T.blue : C.sub }}>
                              {isSubmitted ? "Submitted" : "Not Submitted"}
                            </span>
                            <span className="text-[0.625rem] px-1.5 py-0.5 rounded font-medium"
                              style={{ background: isApproved ? T.greenBg : T.orangeBg, color: isApproved ? T.green : T.orange }}>
                              {isApproved ? "Approved" : "Pending"}
                            </span>
                          </div>
                        </div>
                        <div className="text-right shrink-0 text-xs font-medium" style={{ color: C.sub }}>
                          {group.count > 0
                              ? <span title={fmtDateTime(group.entries?.[0]?.at)}>Last activity {timeAgo(group.entries?.[0]?.at)} · {group.count} action{group.count !== 1 ? "s" : ""}</span>
                              : "No activity yet"}
                        </div>
                        <ChevronRight className="w-4 h-4 shrink-0" style={{ color: C.muted }} />
                      </button>
                    );
                  })}
              </div>
            )}

            {/* ── Movie detail ── */}
            {panelTab === "movies" && selectedMovie && (
              <div>
                <button onClick={() => setSelectedMovie(null)} className="flex items-center gap-1.5 text-xs mb-3 hover:opacity-70" style={{ color: C.sub }}>
                  <ArrowLeft className="w-3.5 h-3.5" /> Back to movies
                </button>
                <div className="mb-3 px-4 py-3 rounded-xl border flex items-center gap-4" style={{ background: alpha(C.mint4, "22"), borderColor: alpha(C.mint4, "44") }}>
                  <div className="flex-1">
                    <div className="font-semibold text-sm" style={{ color: C.dark }}>{selectedMovie}</div>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-[0.625rem] px-1.5 py-0.5 rounded font-medium"
                        style={{ background: (movieStat?.submitted > 0 || movieStat?.approved > 0) ? T.blueBg : T.grayBg, color: (movieStat?.submitted > 0 || movieStat?.approved > 0) ? T.blue : C.sub }}>
                        {(movieStat?.submitted > 0 || movieStat?.approved > 0) ? "Submitted" : "Not Submitted"}
                      </span>
                      <span className="text-[0.625rem] px-1.5 py-0.5 rounded font-medium"
                        style={{ background: movieStat?.approved > 0 ? T.greenBg : T.orangeBg, color: movieStat?.approved > 0 ? T.green : T.orange }}>
                        {movieStat?.approved > 0 ? "Approved" : "Pending Approval"}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="rounded-xl border overflow-hidden" style={{ background: C.white, borderColor: alpha(C.mint1, "44") }}>
                  <div className="px-4 py-2 border-b text-[0.625rem] font-bold uppercase tracking-widest"
                    style={{ borderColor: C.mint4, background: alpha(C.mint4, "33"), color: C.sub }}>Activity Log</div>
                  {movieEntries.length === 0
                    ? <div className="p-8 text-center text-sm" style={{ color: C.sub }}>No activity log</div>
                    : (
                      <MiniPager entries={movieEntries}>
                        {(paged) => <Timeline rows={paged} who={log.user?.full_name} />}
                      </MiniPager>
                    )}
                </div>
              </div>
            )}

            {/* ── History tab ── */}
            {panelTab === "history" && (
              <div className="flex gap-4">
                <div className="w-20 shrink-0">
                  <div className="rounded-xl border overflow-hidden" style={{ background: C.white, borderColor: alpha(C.mint1, "44") }}>
                    {historyYears.length === 0
                      ? <div className="p-4 text-xs text-center" style={{ color: C.sub }}>No data</div>
                      : historyYears.map((y) => (
                        <button key={y} onClick={() => setHistoryYear(y)}
                          className="w-full py-2.5 text-sm font-semibold border-b last:border-0 transition"
                          style={{ borderColor: alpha(C.mint4, "55"), background: historyYear === y ? C.dark : "transparent", color: historyYear === y ? C.mint4 : C.dark }}>
                          {y}
                        </button>
                      ))}
                  </div>
                </div>
                <div className="flex-1">
                  {!historyYear
                    ? <div className="rounded-xl border p-8 text-center text-sm" style={{ background: C.white, borderColor: alpha(C.mint1, "44"), color: C.sub }}>Select a year to see monthly breakdown</div>
                    : (
                      <div className="rounded-xl border overflow-hidden" style={{ background: C.white, borderColor: alpha(C.mint1, "44") }}>
                        <div className="px-4 py-3 border-b text-[0.625rem] font-bold uppercase tracking-widest"
                          style={{ borderColor: C.mint4, background: alpha(C.mint4, "33"), color: C.sub }}>{historyYear} — Monthly Breakdown</div>
                        <table className="w-full text-sm">
                          <thead><tr className="border-b" style={thStyle}>
                            <th className={`text-left ${TH}`}>Month</th>
                            <th className={`text-center ${TH}`}>Submitted</th>
                            <th className={`text-center ${TH}`}>Approved</th>
                            <th className={`text-center ${TH}`}>Total</th>
                          </tr></thead>
                          <tbody>
                            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
                              const d = historyData[historyYear]?.[m] || { sub: 0, app: 0 };
                              const total = d.sub + d.app;
                              return (
                                <tr key={m} className="border-b last:border-0" style={rowBorder}>
                                  <td className="px-4 py-2.5 font-medium text-xs" style={{ color: C.dark }}>{MONTH_FULL[m - 1]}</td>
                                  <td className="px-4 py-2.5 text-center text-sm font-medium" style={{ color: total > 0 ? C.dark : C.muted }}>{d.sub}</td>
                                  <td className="px-4 py-2.5 text-center text-sm font-medium" style={{ color: d.app > 0 ? C.ok : C.muted }}>{d.app}</td>
                                  <td className="px-4 py-2.5 text-center text-sm font-bold" style={{ color: total > 0 ? C.dark : C.muted }}>{total}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Society Submissions tab ───────────────────────────────────────────────────
function WDSubmissionGroup({ group }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="rounded-xl border overflow-hidden"
      style={{ background: C.white, borderColor: alpha(C.mint1, "44") }}>
      <button onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 border-b"
        style={{ borderColor: alpha(C.mint4, "44"), background: alpha(C.mint4, "22") }}>
        <div className="flex items-center gap-2">
          <Layers className="w-3.5 h-3.5" style={{ color: C.mint1 }} />
          <span className="font-semibold text-sm" style={{ color: C.dark }}>{group.project_title}</span>
          <span className="text-[0.625rem] px-2 py-0.5 rounded-full"
            style={{ background: alpha(C.mint1, "33"), color: C.sub }}>
            {group.items.length} submission{group.items.length !== 1 ? "s" : ""}
          </span>
        </div>
        <ChevronDown className="w-4 h-4 transition-transform"
          style={{ color: C.sub, transform: open ? "rotate(180deg)" : "" }} />
      </button>
      {open && (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[0.625rem] uppercase tracking-wider border-b"
              style={{ borderColor: alpha(C.mint4, "44"), color: C.sub, background: alpha(C.mint4, "11") }}>
              <th className="text-left px-4 py-2">Episodes</th>
              <th className="text-left px-4 py-2">Client</th>
              <th className="text-left px-4 py-2">Notes</th>
              <th className="text-left px-4 py-2">Submitted By</th>
              <th className="text-left px-4 py-2">Date</th>
            </tr>
          </thead>
          <tbody>
            {group.items.map((item) => (
              <tr key={item.id} className="border-b last:border-0"
                style={{ borderColor: alpha(C.mint4, "33") }}>
                <td className="px-4 py-2.5 font-medium" style={{ color: C.dark }}>
                  Ep {item.episode_from}–{item.episode_to}
                </td>
                <td className="px-4 py-2.5 text-xs" style={{ color: C.sub }}>{item.client || "—"}</td>
                <td className="px-4 py-2.5 text-xs max-w-[200px] truncate" style={{ color: C.sub }}>
                  {item.notes || "—"}
                </td>
                <td className="px-4 py-2.5 text-xs" style={{ color: C.sub }}>
                  {item.submitted_by_name || "—"}
                </td>
                <td className="px-4 py-2.5 text-xs" style={{ color: C.sub }}>
                  {item.submitted_at ? new Date(item.submitted_at).toLocaleDateString() : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function SubmissionsTab() {
  const [submissions, setSubmissions] = useState([]);
  const [delegations, setDelegations] = useState([]);
  const [loading, setLoading]         = useState(true);
  const [subTab, setSubTab]           = useState("serial");

  useEffect(() => {
    Promise.all([api.listSubmissions(), api.listDelegations()])
      .then(([subs, dels]) => { setSubmissions(subs); setDelegations(dels); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // derive type from delegation work_type — Movie Cue Sheet → movie, else serial
  const movieProjIds = new Set(delegations.filter((d) => d.work_type === "Movie Cue Sheet" && d.project_id).map((d) => d.project_id));

  const grouped = submissions.reduce((acc, s) => {
    if (!acc[s.project_id]) acc[s.project_id] = {
      project_id: s.project_id,
      project_title: s.project_title,
      items: [],
      project_type: movieProjIds.has(s.project_id) ? "movie" : "serial",
    };
    acc[s.project_id].items.push(s);
    return acc;
  }, {});
  const allGroups = Object.values(grouped);
  const groups = allGroups.filter((g) => subTab === "movie" ? g.project_type === "movie" : g.project_type !== "movie");

  if (loading) return <div className="p-8 text-center text-sm" style={{ color: C.sub }}>Loading…</div>;

  return (
    <div>
      <div className="flex flex-wrap gap-1 mb-5 p-1 rounded-xl w-fit max-w-full" style={{ background: C.mint4, border: `1px solid ${alpha(C.mint1, "66")}` }}>
        {[{ key: "serial", label: "Serials" }, { key: "movie", label: "Movies" }].map(({ key, label }) => (
          <button key={key} onClick={() => setSubTab(key)}
            className="px-5 py-1.5 rounded-lg text-xs font-semibold transition-all"
            style={{ background: subTab === key ? C.dark : "transparent", color: subTab === key ? C.mint4 : C.mid }}>
            {label}
          </button>
        ))}
      </div>
      <div className="space-y-4">
        {groups.length === 0 ? (
          <div className="py-10 text-center text-sm" style={{ color: C.sub }}>No {subTab === "movie" ? "movie" : "serial"} submissions yet.</div>
        ) : (
          groups.map((g) => <WDSubmissionGroup key={g.project_id} group={g} />)
        )}
      </div>
    </div>
  );
}

// ─── Clients tab ─────────────────────────────────────────────────────────────
function ClientsTab({ delegations }) {
  const [selected, setSelected]         = useState(null);
  const [clientSubTab, setClientSubTab] = useState("serial");

  const isMovie = (d) => d.work_type === "Movie Cue Sheet";

  const clientMap = {};
  for (const d of delegations) {
    const key = (d.client || "").trim() || "No Client";
    if (!clientMap[key]) clientMap[key] = [];
    clientMap[key].push(d);
  }
  const clients = Object.entries(clientMap).sort(([a], [b]) => a.localeCompare(b));
  const thStyle = { background: alpha(C.mint4, "33"), color: C.sub, borderColor: C.mint4 };
  const TH = "text-[0.625rem] uppercase tracking-wider font-semibold px-4 py-2.5";

  // ── Client detail view ──────────────────────────────────────────────────────
  if (selected) {
    const allRows    = clientMap[selected] || [];
    const serialRows = allRows.filter((d) => !isMovie(d));
    const movieRows  = allRows.filter((d) =>  isMovie(d));
    const rows       = clientSubTab === "movie" ? movieRows : serialRows;
    const totTarget  = rows.reduce((s, d) => s + (Number(d.week_target) || 0), 0);
    const totDone    = rows.reduce((s, d) => s + (Number(d.completed)   || 0), 0);
    const totPend    = rows.reduce((s, d) => s + (Number(d.balance)     || 0), 0);
    const allEditors = [...new Set(allRows.map((d) => d.assigned_to_name).filter(Boolean))];
    return (
      <div>
        <button onClick={() => setSelected(null)}
          className="flex items-center gap-1.5 text-xs mb-4 hover:opacity-70" style={{ color: C.sub }}>
          <ArrowLeft className="w-3.5 h-3.5" /> Back to clients
        </button>
        <div className="mb-4 rounded-xl border overflow-hidden" style={{ background: C.white, borderColor: alpha(C.mint1, "44") }}>
          <div className="px-5 py-3 border-b flex items-center gap-3 flex-wrap"
            style={{ borderColor: alpha(C.mint4, "55"), background: alpha(C.mint4, "22") }}>
            <Users className="w-4 h-4 shrink-0" style={{ color: C.mint1 }} />
            <span className="font-semibold text-sm" style={{ color: C.dark }}>{selected}</span>
            <span className="text-xs" style={{ color: C.sub }}>{allRows.length} total delegation{allRows.length !== 1 ? "s" : ""}</span>
            {allEditors.length > 0 && (
              <span className="text-xs ml-auto" style={{ color: C.sub }}>Editors: {allEditors.join(", ")}</span>
            )}
          </div>
          <div className="grid grid-cols-3 divide-x text-center py-3" style={{ borderColor: alpha(C.mint4, "44") }}>
            {[
              { label: "Total Target",   val: totTarget, color: T.orange },
              { label: "Submitted/Done", val: totDone,   color: C.ok      },
              { label: "Pending",        val: totPend,   color: C.danger  },
            ].map(({ label, val, color }) => (
              <div key={label} className="px-4">
                <div className="text-2xl font-bold leading-none" style={{ color }}>{val}</div>
                <div className="text-[0.625rem] uppercase tracking-wide mt-1" style={{ color: alpha(color, "88") }}>{label}</div>
              </div>
            ))}
          </div>
        </div>
        {/* Serial / Movie tabs — only in detail view */}
        <div className="flex flex-wrap gap-1 mb-4 p-1 rounded-xl w-fit max-w-full" style={{ background: C.mint4, border: `1px solid ${alpha(C.mint1, "66")}` }}>
          {[
            { key: "serial", label: `Serials (${serialRows.length})` },
            { key: "movie",  label: `Movies (${movieRows.length})`   },
          ].map(({ key, label }) => (
            <button key={key} onClick={() => setClientSubTab(key)}
              className="px-4 py-1.5 rounded-lg text-xs font-semibold transition-all"
              style={{ background: clientSubTab === key ? C.dark : "transparent", color: clientSubTab === key ? C.mint4 : C.mid }}>
              {label}
            </button>
          ))}
        </div>
        <div className="rounded-xl border overflow-hidden" style={{ background: C.white, borderColor: alpha(C.mint1, "44") }}>
          {rows.length === 0 ? (
            <div className="p-10 text-center text-sm" style={{ color: C.sub }}>
              No {clientSubTab === "movie" ? "movie" : "serial"} delegations for this client.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b" style={thStyle}>
                  <th className={`text-left ${TH}`}>{clientSubTab === "movie" ? "Movie" : "Serial"}</th>
                  <th className={`text-left ${TH}`}>Editor</th>
                  {clientSubTab === "serial" && <th className={`text-left ${TH}`}>Ep Range</th>}
                  <th className={`text-center ${TH}`}>Target</th>
                  <th className={`text-center ${TH}`}>Done</th>
                  <th className={`text-center ${TH}`}>Pending</th>
                  <th className={`text-left ${TH}`}>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((d) => (
                  <tr key={d.id} className="border-b last:border-0 hover:bg-green-50/20 transition"
                    style={{ borderColor: alpha(C.mint4, "44") }}>
                    <td className="px-4 py-3">
                      <div className="font-medium text-sm" style={{ color: C.dark }}>{d.serial_name}</div>
                      {d.channel && <div className="text-[0.625rem]" style={{ color: C.sub }}>{d.channel}</div>}
                    </td>
                    <td className="px-4 py-3 text-xs" style={{ color: C.dark }}>{d.assigned_to_name || "—"}</td>
                    {clientSubTab === "serial" && <td className="px-4 py-3 text-xs" style={{ color: C.sub }}>{d.episode_range || "—"}</td>}
                    <td className="px-4 py-3 text-center font-bold" style={{ color: T.orange }}>{d.week_target ?? "—"}</td>
                    <td className="px-4 py-3 text-center font-bold" style={{ color: C.ok }}>{d.completed || 0}</td>
                    <td className="px-4 py-3 text-center font-bold" style={{ color: (d.balance||0) > 0 ? C.danger : C.ok }}>{d.balance || 0}</td>
                    <td className="px-4 py-3"><StatusBadge status={d.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    );
  }

  // ── Client list (no sub-tabs; combined totals for all types) ─────────────────
  return (
    <div>
      {clients.length === 0 ? (
        <div className="rounded-xl border p-12 text-center" style={{ background: C.white, borderColor: alpha(C.mint1, "44") }}>
          <div className="text-4xl mb-3">🏢</div>
          <div className="font-semibold mb-1" style={{ fontFamily: FONTS.serif }}>No clients yet</div>
          <p className="text-sm" style={{ color: C.sub }}>Add a client name when creating delegations.</p>
        </div>
      ) : (
        <div className="rounded-xl border overflow-hidden" style={{ background: C.white, borderColor: alpha(C.mint1, "44") }}>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b" style={thStyle}>
                <th className={`text-left ${TH}`}>Client</th>
                <th className={`text-left ${TH}`}>Editors</th>
                <th className={`text-center ${TH}`}>Serials</th>
                <th className={`text-center ${TH}`}>Movies</th>
                <th className={`text-center ${TH}`}>Total Target</th>
                <th className={`text-center ${TH}`}>Done</th>
                <th className={`text-center ${TH}`}>Pending</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {clients.map(([client, rows]) => {
                const totTarget = rows.reduce((s, d) => s + (Number(d.week_target) || 0), 0);
                const totDone   = rows.reduce((s, d) => s + (Number(d.completed)   || 0), 0);
                const totPend   = rows.reduce((s, d) => s + (Number(d.balance)     || 0), 0);
                const editors   = [...new Set(rows.map((d) => d.assigned_to_name).filter(Boolean))];
                const serialCnt = rows.filter((d) => !isMovie(d)).length;
                const movieCnt  = rows.filter((d) =>  isMovie(d)).length;
                return (
                  <tr key={client}
                    className="border-b last:border-0 hover:bg-green-50/30 transition cursor-pointer"
                    style={{ borderColor: alpha(C.mint4, "44") }}
                    onClick={() => { setSelected(client); setClientSubTab("serial"); }}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Users className="w-3.5 h-3.5 shrink-0" style={{ color: C.mint1 }} />
                        <span className="font-semibold" style={{ color: C.dark }}>{client}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs" style={{ color: C.sub }}>{editors.join(", ") || "—"}</td>
                    <td className="px-4 py-3 text-center font-medium" style={{ color: C.dark }}>{serialCnt}</td>
                    <td className="px-4 py-3 text-center font-medium" style={{ color: T.purple }}>{movieCnt}</td>
                    <td className="px-4 py-3 text-center font-bold" style={{ color: T.orange }}>{totTarget || "—"}</td>
                    <td className="px-4 py-3 text-center font-bold" style={{ color: C.ok }}>{totDone}</td>
                    <td className="px-4 py-3 text-center font-bold" style={{ color: totPend > 0 ? C.danger : C.ok }}>{totPend}</td>
                    <td className="px-4 py-3 text-right"><ChevronRight className="w-4 h-4 inline" style={{ color: C.muted }} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}


// ─── Editors and the serials allotted to them (Dashboard) ─────────────────────
function EditorWork({ editors, delegations, loading, onEdit, onDelete, onStatus }) {
  const [notify, setNotify] = useState(null);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(null);

  const rows = (() => {
    const byEditor = new Map(editors.map((e) => [e.id, { id: e.id, name: e.full_name, items: [] }]));
    for (const d of delegations) {
      if (!byEditor.has(d.assigned_to)) byEditor.set(d.assigned_to, { id: d.assigned_to, name: d.assigned_to_name || "Unknown", inactive: true, items: [] });
      byEditor.get(d.assigned_to).items.push(d);
    }
    const order = (d) => (d.status === "completed" ? 1 : 0);
    const all = [...byEditor.values()]
      .map((r) => ({ ...r, items: [...r.items].sort((a, b) => order(a) - order(b) || a.serial_name.localeCompare(b.serial_name)) }))
      .sort((a, b) => a.name.localeCompare(b.name));
    const needle = q.trim().toLowerCase();
    if (!needle) return all;
    return all.flatMap((r) => {
      if (r.name.toLowerCase().includes(needle)) return [r];
      const items = r.items.filter((d) => (d.serial_name || "").toLowerCase().includes(needle) || (d.client || "").toLowerCase().includes(needle));
      return items.length ? [{ ...r, items }] : [];
    });
  })();

  const TH = "text-left text-[0.625rem] uppercase tracking-wider font-semibold px-3 py-2 whitespace-nowrap";
  const chip = (d) => {
    const done = d.status === "completed";
    const isMovie = d.work_type === "Movie Cue Sheet";
    const tip = [isMovie ? "Movie" : d.episode_range ? `Episodes ${d.episode_range}` : "All episodes", d.client,
      d.week_target ? `Target ${d.week_target}/week` : null, `${d.completed} approved`, STATUS_STYLE[d.status]?.label].filter(Boolean).join(" · ");
    return (
      <button key={d.id} title={`${tip}\nClick to edit`} onClick={(e) => { e.stopPropagation(); onEdit(d); }}
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[0.6875rem] font-medium border hover:opacity-80 max-w-full"
        style={done
          ? { background: "transparent", borderColor: alpha(C.mint1, "44"), color: C.muted, textDecoration: "line-through" }
          : { background: alpha(C.mint4, "88"), borderColor: alpha(C.mint1, "66"), color: C.dark }}>
        {isMovie && <Film className="w-3 h-3 shrink-0" />}
        <span className="truncate">{d.serial_name}</span>
        {!isMovie && d.episode_range && <span className="shrink-0" style={{ color: C.sub }}>{d.episode_range.replace(/^ep\.?\s*/i, "")}</span>}
      </button>
    );
  };

  return (
    <section className="rounded-xl border" style={{ background: C.white, borderColor: alpha(C.mint1, "44") }}>
      <header className="px-4 pt-3.5 pb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="text-base leading-tight" style={{ fontFamily: FONTS.serif, color: C.dark }}>Editors and their serials</h4>
          <div className="text-[0.6875rem] mt-0.5" style={{ color: C.sub }}>
            Every serial and movie allotted to each editor; finished ones are struck through. Click a serial to edit it, or an editor to change status or delete.
          </div>
        </div>
        <div className="relative w-64 max-w-full">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: C.sub }} />
          <input type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search editor, serial or client…"
            className="w-full pl-8 pr-7 py-1.5 text-xs rounded-lg border focus:outline-none"
            style={{ borderColor: alpha(C.mint1, "44"), background: C.white, color: C.dark }} />
          {q && (
            <button onClick={() => setQ("")} className="absolute right-2 top-1/2 -translate-y-1/2" title="Clear">
              <X className="w-3 h-3" style={{ color: C.sub }} />
            </button>
          )}
        </div>
      </header>

      {loading ? (
        <div className="px-4 py-8 text-center text-sm" style={{ color: C.sub }}>Loading…</div>
      ) : rows.length === 0 ? (
        <div className="px-4 py-8 text-center text-sm" style={{ color: C.sub }}>
          {q ? `No editor, serial or client matches "${q}".` : "No editors yet."}
        </div>
      ) : (
        <div className="overflow-auto max-h-[560px] border-t" style={{ borderColor: alpha(C.mint1, "44") }}>
          <table className="w-full text-xs">
            <thead className="sticky top-0 z-10" style={{ background: C.white }}>
              <tr className="border-b" style={{ borderColor: alpha(C.mint1, "44"), color: C.sub }}>
                <th className={`${TH} pl-4 w-48`}>Editor</th>
                <th className={TH}>Serials / movies allotted</th>
                <th className={`${TH} text-right`} title="Allotments not completed yet">Active</th>
                <th className={`${TH} text-right`} title="Weekly target of active allotments">Target / week</th>
                <th className={`${TH} text-right pr-4`} title="Approved episodes inside the allotted ranges">Approved</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const active = r.items.filter((d) => d.status !== "completed");
                const isOpen = open === r.id && r.items.length > 0;
                const Chevron = isOpen ? ChevronDown : ChevronRight;
                const num = (v) => ({ color: v ? C.dark : C.muted, fontVariantNumeric: "tabular-nums" });
                return [
                  <tr key={r.id} onClick={() => setOpen(isOpen ? null : r.id)}
                    className={`border-b align-top transition ${r.items.length ? "cursor-pointer hover:bg-black/[0.03]" : ""}`}
                    style={{ borderColor: alpha(C.mint4, "99") }}>
                    <td className="pl-4 pr-3 py-2.5">
                      <div className="flex items-center gap-1.5 font-semibold" style={{ color: C.dark }}>
                        <Chevron className="w-3.5 h-3.5 shrink-0" style={{ color: r.items.length ? C.muted : "transparent" }} />
                        <span className="truncate">{r.name}</span>
                      </div>
                      {r.inactive && <div className="pl-5 text-[0.625rem]" style={{ color: C.sub }}>No longer active</div>}
                      {!r.inactive && active.length > 0 && (
                        <button onClick={(e) => { e.stopPropagation(); setNotify(r.id); }}
                          className="ml-5 mt-1 inline-flex items-center gap-1 text-[0.625rem] font-semibold hover:underline" style={{ color: C.sub }}>
                          <Mail className="w-3 h-3" /> Notify
                        </button>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {r.items.length === 0
                        ? <span style={{ color: C.muted }}>Nothing allotted</span>
                        : <div className="flex flex-wrap gap-1">{r.items.map(chip)}</div>}
                    </td>
                    <td className="px-3 py-2.5 text-right font-semibold" style={num(active.length)}>{active.length}</td>
                    <td className="px-3 py-2.5 text-right" style={num(1)}>{active.reduce((a, d) => a + (d.week_target || 0), 0) || "—"}</td>
                    <td className="pl-3 pr-4 py-2.5 text-right" style={num(1)}>{r.items.reduce((a, d) => a + (d.completed || 0), 0)}</td>
                  </tr>,
                  isOpen && (
                    <tr key={`${r.id}-detail`}>
                      <td colSpan={5} className="p-0 border-b" style={{ borderColor: alpha(C.mint4, "99"), background: alpha(C.mint4, "55") }}>
                        <table className="w-full text-xs">
                          <thead>
                            <tr style={{ color: C.sub }}>
                              <th className={`${TH} pl-10`}>Serial / movie</th>
                              <th className={TH}>Client</th>
                              <th className={TH}>Episodes</th>
                              <th className={`${TH} text-right`}>Target</th>
                              <th className={`${TH} text-right`}>Done</th>
                              <th className={`${TH} text-right`}>Balance</th>
                              <th className={TH}>Status</th>
                              <th className={`${TH} text-right pr-4`}></th>
                            </tr>
                          </thead>
                          <tbody>
                            {r.items.map((d) => (
                              <tr key={d.id} className="border-t" style={{ borderColor: alpha(C.mint1, "33") }}>
                                <td className="pl-10 pr-3 py-2">
                                  <div className="font-medium" style={{ color: C.dark }}>{d.serial_name}</div>
                                  {d.channel && <div className="text-[0.625rem]" style={{ color: C.sub }}>{d.channel}</div>}
                                </td>
                                <td className="px-3 py-2" style={{ color: C.sub }}>{d.client || "—"}</td>
                                <td className="px-3 py-2" style={{ color: C.sub }}>{d.work_type === "Movie Cue Sheet" ? "Movie" : d.episode_range || "All"}</td>
                                <td className="px-3 py-2 text-right font-medium" style={{ color: C.dark }}>{d.week_target ?? "—"}</td>
                                <td className="px-3 py-2 text-right font-medium" style={{ color: C.ok }}>{d.completed}</td>
                                <td className="px-3 py-2 text-right font-medium" style={{ color: d.balance > 0 ? C.warn : C.ok }}>{d.balance}</td>
                                <td className="px-3 py-1.5">
                                  <Select value={d.status} onChange={(e) => onStatus(d.id, e.target.value)}
                                    className="text-xs px-2.5 py-1 rounded-lg focus:outline-none"
                                    style={{ background: STATUS_STYLE[d.status]?.bg, color: STATUS_STYLE[d.status]?.color, border: `1px solid ${alpha(STATUS_STYLE[d.status]?.color, "33")}`, fontWeight: 600 }}>
                                    {STATUSES.map((s) => <option key={s} value={s}>{STATUS_STYLE[s].label}</option>)}
                                  </Select>
                                </td>
                                <td className="pl-3 pr-4 py-1.5 text-right">
                                  <div className="flex items-center justify-end gap-1">
                                    <button onClick={() => onEdit(d)} className="p-1.5 rounded-lg hover:bg-black/5" title="Edit">
                                      <Edit2 className="w-3.5 h-3.5" style={{ color: C.sub }} />
                                    </button>
                                    <button onClick={() => onDelete(d.id)} className="p-1.5 rounded-lg hover:bg-red-50" title="Delete">
                                      <Trash2 className="w-3.5 h-3.5" style={{ color: C.danger }} />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  ),
                ];
              })}
            </tbody>
          </table>
        </div>
      )}
      {notify && <NotifyEditorModal editorId={notify} onClose={() => setNotify(null)} />}
    </section>
  );
}

// ─── Main WDDashboard ─────────────────────────────────────────────────────────
const allocationBody = (d) => [d.work_type, d.episode_range && `Episodes ${d.episode_range}`, d.week_target && `Target ${d.week_target}`]
  .filter(Boolean).join(" · ");

export default function WDDashboard() {
  const { pushToast, fetchNotifications } = useApp();
  const [tab, setTab]               = useState("dashboard");
  const [delegations, setDelegations] = useState([]);
  const [editors, setEditors]         = useState([]);
  const [showForm, setShowForm]       = useState(false);
  const [editTarget, setEditTarget]   = useState(null);
  const [selectedEditor, setSelectedEditor] = useState(null);
  const [loading, setLoading]         = useState(true);
  const [projectSubTab, setProjectSubTab] = useState("serial");
  const [reloadKey, setReloadKey]     = useState(0);   // refreshes the dashboard numbers after a change

  useEffect(() => {
    Promise.all([api.listDelegations(), api.listEditors()])
      .then(([d, e]) => { setDelegations(d); setEditors(e); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const changed = () => setReloadKey((k) => k + 1);

  // The server also stores this as a notification, so refresh silently (no duplicate popup).
  const announceAllocation = (d) => {
    pushToast({ kind: "success", title: `${d.serial_name} allocated to ${d.assigned_to_name || "editor"}`, body: allocationBody(d) });
    fetchNotifications({ silent: true });
  };
  const handleCreate = async (payload) => {
    const d = await api.createDelegation(payload);
    setDelegations((prev) => [d, ...prev]);
    announceAllocation(d);
    changed();
  };
  const handleUpdate = async (payload) => {
    const reassigned = payload.assigned_to && payload.assigned_to !== editTarget.assigned_to;
    const d = await api.updateDelegation(editTarget.id, payload);
    setDelegations((prev) => prev.map((x) => (x.id === d.id ? d : x)));
    if (reassigned) announceAllocation(d);
    changed();
  };
  const handleDelete = async (id) => {
    const ok = await showConfirm("Delete this delegation?", { variant: "danger", confirmLabel: "Delete" });
    if (!ok) return;
    await api.deleteDelegation(id);
    setDelegations((prev) => prev.filter((x) => x.id !== id));
    changed();
  };
  const handleStatusChange = async (id, status) => {
    const d = await api.updateDelegation(id, { status });
    setDelegations((prev) => prev.map((x) => (x.id === d.id ? d : x)));
    changed();
  };

  const tabs = [
    { key: "dashboard",    label: "Dashboard" },
    { key: "serials",      label: "Projects" },
    { key: "activity",     label: "Editor Activity" },
    { key: "clients",      label: "Clients" },
    { key: "submissions",  label: "Submissions" },
  ];

  return (
    <DashboardShell title="Work Delegation" subtitle="Assign and track editor workload" tabs={tabs} activeTab={tab} onTab={setTab}
      actions={(
        <button onClick={() => { setEditTarget(null); setShowForm(true); }}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium hover:opacity-90"
          style={{ background: C.dark, color: C.mint4 }}>
          <Plus className="w-4 h-4" />New Delegation
        </button>
      )}>
      {showForm && (
        <DelegationForm
          editors={editors} initial={editTarget}
          onSave={editTarget ? handleUpdate : handleCreate}
          onClose={() => { setShowForm(false); setEditTarget(null); }}
        />
      )}

      {tab === "dashboard" && (
        <div className="space-y-4">
          <WDInsights reloadKey={reloadKey} onProjects={(type) => { setProjectSubTab(type); setTab("serials"); }} />
          <EditorWork editors={editors} delegations={delegations} loading={loading}
            onEdit={(d) => { setEditTarget(d); setShowForm(true); }}
            onDelete={handleDelete} onStatus={handleStatusChange} />
          <QuarterCalendar reloadKey={reloadKey} />
        </div>
      )}

      {tab === "serials" && (() => {
        // derive project ID sets from delegation work_type — this is the source of truth
        const movieProjIds  = new Set(delegations.filter((d) => d.work_type === "Movie Cue Sheet" && d.project_id).map((d) => d.project_id));
        const serialProjIds = new Set(delegations.filter((d) => d.work_type !== "Movie Cue Sheet" && d.project_id).map((d) => d.project_id));
        return (
          <div>
            <div className="flex flex-wrap gap-1 mb-5 p-1 rounded-xl w-fit max-w-full" style={{ background: C.mint4, border: `1px solid ${alpha(C.mint1, "66")}` }}>
              {[{ key: "serial", label: "Serials" }, { key: "movie", label: "Movies" }].map(({ key, label }) => (
                <button key={key} onClick={() => setProjectSubTab(key)}
                  className="px-5 py-1.5 rounded-lg text-xs font-semibold transition-all"
                  style={{ background: projectSubTab === key ? C.dark : "transparent", color: projectSubTab === key ? C.mint4 : C.mid }}>
                  {label}
                </button>
              ))}
            </div>
            <ProjectsTab
              hideHeader
              showCreateBtn
              filterProjectIds={projectSubTab === "movie" ? movieProjIds : serialProjIds}
              projectType={projectSubTab}
            />
          </div>
        );
      })()}

      {tab === "activity" && (
        <ActivityPanel editors={editors} selected={selectedEditor} onSelect={setSelectedEditor} />
      )}

      {tab === "clients"     && <ClientsTab delegations={delegations} />}
      {tab === "submissions" && <SubmissionsTab />}
    </DashboardShell>
  );
}
