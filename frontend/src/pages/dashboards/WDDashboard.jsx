import { useEffect, useState, useRef } from "react";
import {
  Plus, Trash2, Search, Edit2, X, ChevronLeft, ChevronRight,
  FileText, ArrowLeft, CalendarDays, History, Layers, ChevronDown, Film, Users,
} from "lucide-react";
import { C, FONTS } from "../../styles/palette";
import DashboardShell from "./DashboardShell";
import ProjectsTab from "./ProjectsTab";
import { api } from "../../utils/api";
import { showAlert, showConfirm } from "../../components/Dialog";
import { useApp } from "../../context/AppContext";

const WORK_TYPES = ["TV Cue Sheet", "Movie Cue Sheet", "Album", "Other"];
const STATUSES = ["pending", "in_progress", "completed"];
const STATUS_STYLE = {
  pending:     { bg: "#FFF3E0", color: "#E65100", label: "Pending" },
  in_progress: { bg: "#E3F2FD", color: "#1565C0", label: "In Progress" },
  completed:   { bg: "#E8F5E9", color: "#2E7D32", label: "Completed" },
};
const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const MONTH_FULL  = ["January","February","March","April","May","June","July","August","September","October","November","December"];

function StatusBadge({ status }) {
  const s = STATUS_STYLE[status] || STATUS_STYLE.pending;
  return (
    <span className="text-[10px] px-2 py-0.5 rounded font-medium" style={{ background: s.bg, color: s.color }}>
      {s.label}
    </span>
  );
}

// ─── Delegation form ──────────────────────────────────────────────────────────
function DelegationForm({ editors, onSave, onClose, initial = null }) {
  const [form, setForm] = useState({
    serial_name:  initial?.serial_name  || "",
    work_type:    initial?.work_type    || "TV Cue Sheet",
    client:       initial?.client       || "",
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
    try {
      await onSave({ ...form, week_target: form.week_target ? parseInt(form.week_target) : null, assigned_to: parseInt(form.assigned_to) });
      onClose();
    } catch (ex) {
      await showAlert(ex.message, { title: "Save Failed", variant: "error" });
    } finally { setSaving(false); }
  };

  const inp = "w-full px-3 py-2 rounded-lg text-sm focus:outline-none";
  const inpStyle = { background: C.mid, color: C.mint4, border: `1px solid ${C.mint1}33` };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.55)" }}>
      <div className="rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden" style={{ background: C.dark }}>
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
              <div className="absolute left-0 right-0 z-50 rounded-lg shadow-xl mt-1 overflow-hidden" style={{ background: C.mid, border: `1px solid ${C.mint1}44` }}>
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
              <div className="mt-1.5 flex items-center gap-1.5 text-xs px-2 py-1 rounded-lg w-fit" style={{ background: "#FFF3E0", color: "#E65100" }}>
                <Plus className="w-3 h-3" /> New serial — will be auto-created
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: C.muted }}>Work Type</label>
              <select value={form.work_type} onChange={(e) => setForm((f) => ({ ...f, work_type: e.target.value, episode_range: e.target.value === "Movie Cue Sheet" ? "" : f.episode_range }))} className={inp} style={inpStyle}>
                {WORK_TYPES.map((t) => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: C.muted }}>Assign To *</label>
              <select value={form.assigned_to} onChange={(e) => setForm((f) => ({ ...f, assigned_to: e.target.value }))} className={inp} style={inpStyle}>
                <option value="">Select editor…</option>
                {editors.map((e) => <option key={e.id} value={e.id}>{e.full_name}</option>)}
              </select>
            </div>
          </div>

          <div className={`grid gap-4 ${form.work_type === "Movie Cue Sheet" ? "grid-cols-1" : "grid-cols-2"}`}>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: C.muted }}>Client</label>
              <input value={form.client} onChange={(e) => setForm((f) => ({ ...f, client: e.target.value }))} placeholder="Client name" className={inp} style={inpStyle} />
            </div>
            {form.work_type !== "Movie Cue Sheet" && (
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: C.muted }}>Channel</label>
                <input value={form.channel} onChange={(e) => setForm((f) => ({ ...f, channel: e.target.value }))} placeholder="TV channel" className={inp} style={inpStyle} />
              </div>
            )}
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: form.work_type === "Movie Cue Sheet" ? C.muted + "55" : C.muted }}>Episode Range</label>
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
              <select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))} className={inp} style={inpStyle}>
                {STATUSES.map((s) => <option key={s} value={s}>{STATUS_STYLE[s].label}</option>)}
              </select>
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

// ─── Calendar Activity tab ────────────────────────────────────────────────────
function CalendarActivity({ delegations = [] }) {
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: Math.max(1, currentYear - 2026 + 1) }, (_, i) => 2026 + i);

  const [selectedYear, setSelectedYear] = useState(currentYear >= 2026 ? currentYear : 2026);
  const [calData, setCalData]           = useState(null);
  const [loading, setLoading]           = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(null);

  // Build per-month and per-week target maps from delegation created_at dates.
  // targetByMonth[year][month] = sum of week_targets for delegations created that month.
  // targetByWeek[year][month][weekOfMonth] = same, split by week.
  const targetByMonth = {};
  const targetByWeek  = {};
  for (const d of delegations) {
    if (!d.created_at || !d.week_target) continue;
    const dt  = new Date(d.created_at);
    const y   = dt.getFullYear();
    const mo  = dt.getMonth() + 1;
    const wk  = String(Math.ceil(dt.getDate() / 7));
    const tgt = Number(d.week_target) || 0;

    if (!targetByMonth[y])       targetByMonth[y]       = {};
    if (!targetByWeek[y])        targetByWeek[y]        = {};
    if (!targetByWeek[y][mo])    targetByWeek[y][mo]    = {};

    targetByMonth[y][mo]      = (targetByMonth[y][mo]      || 0) + tgt;
    targetByWeek[y][mo][wk]   = (targetByWeek[y][mo][wk]  || 0) + tgt;
  }

  useEffect(() => {
    setLoading(true);
    setSelectedMonth(null);
    api.activityCalendar(selectedYear)
      .then(setCalData)
      .catch(() => setCalData(null))
      .finally(() => setLoading(false));
  }, [selectedYear]);

  // per-month aggregates: target (from delegation created_at), submitted, approved.
  // Pending = Target − Submitted  (work assigned but editor hasn't submitted yet).
  const mTotal = (m) => {
    const d      = calData?.months?.[String(m)];
    const sub    = d ? (d.submitted || 0) : 0;
    const app    = d ? (d.approved  || 0) : 0;
    const target = (targetByMonth[selectedYear] || {})[m] || 0;
    return { target, sub, app, pending: Math.max(0, target - sub) };
  };

  const qTotal = (months) =>
    months.reduce(
      (acc, m) => { const t = mTotal(m); return { target: acc.target + t.target, sub: acc.sub + t.sub, app: acc.app + t.app, pending: acc.pending + t.pending }; },
      { target: 0, sub: 0, app: 0, pending: 0 }
    );

  const quarters  = [[1,2,3,4],[5,6,7,8],[9,10,11,12]];
  const selData   = selectedMonth ? (calData?.months?.[String(selectedMonth)] ?? {}) : null;
  const selTarget = selectedMonth ? ((targetByMonth[selectedYear] || {})[selectedMonth] || 0) : 0;
  const selSub    = selData?.submitted || 0;
  const selApp    = selData?.approved  || 0;
  const selPend   = Math.max(0, selTarget - selSub);

  // compact metric widget used inside month cells
  const Metric = ({ val, label, color, dark }) => (
    <div>
      <div className="text-lg font-bold leading-none" style={{ color: color }}>{val}</div>
      <div className="text-[9px] mt-0.5 font-medium uppercase tracking-wide" style={{ color: dark ? color + "cc" : color + "99" }}>{label}</div>
    </div>
  );

  return (
    <div className="flex gap-5">
      {/* Year sidebar */}
      <div className="w-16 shrink-0">
        <div className="text-[10px] uppercase tracking-wider font-semibold mb-2 text-center" style={{ color: C.sub }}>Year</div>
        <div className="rounded-xl border overflow-hidden" style={{ background: C.white, borderColor: C.mint1 + "44" }}>
          {years.map((y) => (
            <button key={y} onClick={() => setSelectedYear(y)}
              className="w-full py-2.5 text-sm font-semibold border-b last:border-0 transition"
              style={{ borderColor: C.mint4 + "55", background: selectedYear === y ? C.dark : "transparent", color: selectedYear === y ? C.mint4 : C.dark }}>
              {y}
            </button>
          ))}
        </div>
      </div>

      {/* Calendar grid + detail */}
      <div className="flex-1 min-w-0">
        {loading ? (
          <div className="p-10 text-center text-sm" style={{ color: C.sub }}>Loading…</div>
        ) : (
          <div className="space-y-3">
            {quarters.map((qMonths, qi) => {
              const qt = qTotal(qMonths);
              return (
                <div key={qi} className="flex gap-2 items-stretch">
                  {qMonths.map((m) => {
                    const mt             = mTotal(m);
                    const isSel          = selectedMonth === m;
                    const isCurrent      = selectedYear === new Date().getFullYear() && m === new Date().getMonth() + 1;
                    const hasActivity    = mt.sub > 0 || mt.app > 0;
                    return (
                      <button key={m} onClick={() => setSelectedMonth(isSel ? null : m)}
                        className="flex-1 rounded-xl border p-3 text-left transition-all hover:shadow-md"
                        style={{
                          background:  isSel ? C.dark : isCurrent ? C.mint4 + "cc" : C.white,
                          borderColor: isSel ? C.mint1 : isCurrent ? C.mint1 : hasActivity ? C.mint1 + "88" : C.mint1 + "33",
                          borderWidth: isCurrent && !isSel ? 2 : 1,
                        }}>
                        <div className="flex items-center justify-between mb-2">
                          <div className="text-[10px] font-bold uppercase tracking-widest" style={{ color: isSel ? C.mint1 : C.sub }}>
                            {MONTH_NAMES[m - 1]}
                          </div>
                          {isCurrent && !isSel && (
                            <span className="text-[8px] font-bold uppercase px-1.5 py-0.5 rounded-full" style={{ background: C.mint1, color: C.dark }}>Now</span>
                          )}
                        </div>
                        <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                          <div>
                            <div className="text-base font-bold leading-none" style={{ color: isSel ? "#fde68a" : "#E65100" }}>{mt.target}</div>
                            <div className="text-[9px] mt-0.5 uppercase tracking-wide" style={{ color: isSel ? "#fde68a88" : "#E6510077" }}>Target</div>
                          </div>
                          <div>
                            <div className="text-base font-bold leading-none" style={{ color: isSel ? "#fca5a5" : C.danger }}>{mt.pending}</div>
                            <div className="text-[9px] mt-0.5 uppercase tracking-wide" style={{ color: isSel ? "#fca5a588" : C.danger + "77" }}>Pending</div>
                          </div>
                          <div>
                            <div className="text-base font-bold leading-none" style={{ color: isSel ? C.mint4 : C.dark }}>{mt.sub}</div>
                            <div className="text-[9px] mt-0.5 uppercase tracking-wide" style={{ color: isSel ? C.muted : C.sub }}>Submitted</div>
                          </div>
                          <div>
                            <div className="text-base font-bold leading-none" style={{ color: isSel ? "#86efac" : C.ok }}>{mt.app}</div>
                            <div className="text-[9px] mt-0.5 uppercase tracking-wide" style={{ color: isSel ? "#86efac88" : C.ok + "88" }}>Approved</div>
                          </div>
                        </div>
                      </button>
                    );
                  })}

                  {/* Quarter total */}
                  <div className="w-24 shrink-0 rounded-xl border p-3 flex flex-col justify-center"
                    style={{ background: C.mint4 + "33", borderColor: C.mint4 + "55" }}>
                    <div className="text-[10px] font-bold uppercase tracking-widest mb-2 text-center" style={{ color: C.sub }}>Q{qi + 1}</div>
                    <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-center">
                      <div>
                        <div className="text-sm font-bold" style={{ color: "#E65100" }}>{qt.target}</div>
                        <div className="text-[8px] uppercase" style={{ color: "#E6510077" }}>Target</div>
                      </div>
                      <div>
                        <div className="text-sm font-bold" style={{ color: C.danger }}>{qt.pending}</div>
                        <div className="text-[8px] uppercase" style={{ color: C.danger + "77" }}>Pending</div>
                      </div>
                      <div>
                        <div className="text-sm font-bold" style={{ color: C.dark }}>{qt.sub}</div>
                        <div className="text-[8px] uppercase" style={{ color: C.sub }}>Sub</div>
                      </div>
                      <div>
                        <div className="text-sm font-bold" style={{ color: C.ok }}>{qt.app}</div>
                        <div className="text-[8px] uppercase" style={{ color: C.ok + "88" }}>App</div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Month detail — week breakdown only, no "By Editor" */}
        {selectedMonth && selData !== null && (
          <div className="mt-5 rounded-xl border overflow-hidden" style={{ background: C.white, borderColor: C.mint1 + "44" }}>
            {/* Header with 4 totals */}
            <div className="px-5 py-3 border-b flex items-center gap-6 flex-wrap"
              style={{ borderColor: C.mint4, background: C.mint4 + "33" }}>
              <div className="font-semibold text-sm" style={{ fontFamily: FONTS.serif, color: C.dark }}>
                {MONTH_FULL[selectedMonth - 1]} {selectedYear}
              </div>
              <div className="flex gap-5 ml-auto">
                {[
                  { label: "Target",    val: selTarget,   color: "#E65100" },
                  { label: "Submitted", val: selSub,      color: C.dark    },
                  { label: "Approved",  val: selApp,      color: C.ok      },
                  { label: "Pending",   val: selPend,     color: C.danger  },
                ].map(({ label, val, color }) => (
                  <div key={label} className="text-center">
                    <div className="text-lg font-bold leading-none" style={{ color }}>{val}</div>
                    <div className="text-[10px] mt-0.5 uppercase tracking-wide" style={{ color: color + "88" }}>{label}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Weekly breakdown table */}
            <div className="p-4">
              <div className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: C.sub }}>Weekly Breakdown</div>
              {Object.entries(selData.weeks || {}).length === 0 ? (
                <div className="text-xs py-4 text-center" style={{ color: C.sub }}>No weekly data</div>
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b" style={{ borderColor: C.mint4 + "88" }}>
                      {["Week", "Target", "Submitted", "Approved", "Pending"].map((h) => (
                        <th key={h} className="text-left pb-2 pr-6 font-semibold uppercase tracking-wide"
                          style={{ color: C.sub }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(selData.weeks || {})
                      .sort(([a], [b]) => parseInt(a) - parseInt(b))
                      .map(([wk, wd]) => {
                        const wSub    = wd.submitted || 0;
                        const wApp    = wd.approved  || 0;
                        const wTarget = (targetByWeek[selectedYear]?.[selectedMonth] || {})[wk] || 0;
                        const wPend   = Math.max(0, wTarget - wSub);
                        return (
                          <tr key={wk} className="border-b last:border-0" style={{ borderColor: C.mint4 + "44" }}>
                            <td className="py-2.5 pr-6 font-semibold" style={{ color: C.dark }}>Week {wk}</td>
                            <td className="py-2.5 pr-6 font-bold" style={{ color: "#E65100" }}>{wTarget || "—"}</td>
                            <td className="py-2.5 pr-6 font-bold" style={{ color: C.dark }}>{wSub}</td>
                            <td className="py-2.5 pr-6 font-bold" style={{ color: C.ok }}>{wApp}</td>
                            <td className="py-2.5 font-bold" style={{ color: wPend > 0 ? C.danger : C.ok }}>{wPend}</td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Activity Panel (Editor Activity tab) ─────────────────────────────────────
const PAGE_SIZE = 25;

const EP_STATUS_COLOR = {
  approved:  { bg: "#E8F5E9", color: "#2E7D32" },
  submitted: { bg: "#E3F2FD", color: "#1565C0" },
  rejected:  { bg: "#FFEBEE", color: "#C62828" },
  pending:   { bg: "#F3F4F6", color: "#6B7280" },
  unknown:   { bg: "#F3F4F6", color: "#6B7280" },
};

function MiniPager({ entries, children, pageSize = PAGE_SIZE }) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(entries.length / pageSize));
  const paged = entries.slice((page - 1) * pageSize, page * pageSize);
  return (
    <>
      {children(paged, (page - 1) * pageSize)}
      {totalPages > 1 && (
        <div className="px-4 py-2 border-t flex items-center justify-between" style={{ borderColor: C.mint4 + "44" }}>
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

  const thStyle   = { background: C.mint4 + "33", color: C.sub, borderColor: C.mint4 };
  const TH        = "text-[10px] uppercase tracking-wider font-semibold px-4 py-2";
  const rowBorder = { borderColor: C.mint4 + "44" };

  return (
    <div className="grid grid-cols-3 gap-6">
      {/* Editor list */}
      <div className="rounded-xl border overflow-hidden self-start" style={{ background: C.white, borderColor: C.mint1 + "44" }}>
        <div className="px-4 py-3 border-b text-[10px] font-bold uppercase tracking-widest"
          style={{ borderColor: C.mint4, background: C.mint4 + "66", color: C.sub }}>Editors</div>
        {editors.length === 0
          ? <div className="p-6 text-sm text-center" style={{ color: C.sub }}>No editors found</div>
          : editors.map((e) => (
            <button key={e.id} onClick={() => { onSelect(e.id); setSelectedSerial(null); setSelectedMovie(null); }}
              className="w-full text-left px-4 py-3 border-b last:border-0 text-sm hover:bg-green-50/40 transition"
              style={{ borderColor: C.mint4 + "55", background: selected === e.id ? C.mint4 + "99" : undefined, color: C.dark }}>
              <div className="font-medium">{e.full_name}</div>
              <div className="text-xs" style={{ color: C.sub }}>{e.email}</div>
            </button>
          ))}
      </div>

      {/* Right panel */}
      <div className="col-span-2">
        {!selected && <div className="rounded-xl border p-10 text-center text-sm" style={{ background: C.white, borderColor: C.mint1 + "44", color: C.sub }}>Select an editor to view their activity</div>}
        {selected && loading && <div className="rounded-xl border p-10 text-center text-sm" style={{ background: C.white, borderColor: C.mint1 + "44", color: C.sub }}>Loading…</div>}

        {selected && !loading && log && (
          <>
            {/* Summary header */}
            <div className="mb-4 rounded-xl border px-5 py-3 flex items-center gap-6" style={{ background: C.mint4 + "22", borderColor: C.mint4 + "44" }}>
              <div>
                <div className="text-xs font-bold uppercase tracking-widest" style={{ color: C.sub }}>{log.user?.full_name}</div>
                <div className="text-sm mt-0.5" style={{ color: C.dark }}>
                  <strong>{currentMonthSubmitted}</strong> cue sheet{currentMonthSubmitted !== 1 ? "s" : ""} submitted in {MONTH_FULL[now.getMonth()]}
                </div>
              </div>
              <div className="ml-auto flex gap-4 text-center flex-wrap justify-end">
                {[
                  { val: allSerialsList.length,  label: "Serials",   color: C.dark    },
                  { val: allMoviesList.length,   label: "Movies",    color: "#7B1FA2" },
                  { val: editorTarget,           label: "Target",    color: "#E65100" },
                  { val: allSubmitted,           label: "Submitted", color: C.dark    },
                  { val: Object.values(episodeStats).reduce((s, v) => s + (v.approved || 0), 0), label: "Approved", color: C.ok },
                  { val: editorPending,          label: "Pending",   color: C.danger  },
                  { val: totalRejected,          label: "Rejected",  color: "#C62828" },
                ].map(({ val, label, color }) => (
                  <div key={label}>
                    <div className="text-lg font-bold leading-none" style={{ color }}>{val}</div>
                    <div className="text-[10px] uppercase tracking-wider mt-0.5" style={{ color: color + "88" }}>{label}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Panel tabs: Serials / Movies / History */}
            <div className="flex gap-1 mb-4 p-1 rounded-xl" style={{ background: C.mint4 + "99" }}>
              {[
                { key: "serials", label: "Serials", icon: CalendarDays },
                { key: "movies",  label: "Movies",  icon: Film },
                { key: "history", label: "History", icon: History },
              ].map(({ key, label, icon: Icon }) => (
                <button key={key} onClick={() => { setPanelTab(key); setSelectedSerial(null); setSelectedMovie(null); setHistoryYear(null); setActivityEpisode(null); }}
                  className="flex-1 flex items-center justify-center gap-2 py-1.5 rounded-lg text-xs font-medium transition-all"
                  style={{ background: panelTab === key ? C.dark : "transparent", color: panelTab === key ? C.mint4 : C.sub }}>
                  <Icon className="w-3.5 h-3.5" />{label}
                </button>
              ))}
            </div>

            {/* ── Serials list ── */}
            {panelTab === "serials" && !selectedSerial && (
              <div className="rounded-xl border overflow-hidden" style={{ background: C.white, borderColor: C.mint1 + "44" }}>
                {allSerialsList.length === 0
                  ? <div className="p-8 text-center text-sm" style={{ color: C.sub }}>No serials assigned yet</div>
                  : allSerialsList.map((serial) => {
                    const deleg = delegMap[serial] || null;
                    const group = bySerialMap[serial] || { count: 0 };
                    const done  = episodeStats[serial]?.approved ?? deleg?.completed ?? 0;
                    return (
                      <button key={serial} onClick={() => { setSelectedSerial(serial); setSerialSubTab("submitted"); }}
                        className="w-full text-left px-4 py-3 border-b last:border-0 hover:bg-green-50/30 transition flex items-center gap-4"
                        style={{ borderColor: C.mint4 + "44" }}>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm truncate" style={{ color: C.dark }}>{serial}</div>
                          <div className="flex items-center gap-2 mt-0.5">
                            {deleg && <StatusBadge status={deleg.status} />}
                            {deleg?.episode_range && <span className="text-[10px]" style={{ color: C.sub }}>{deleg.episode_range}</span>}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-xs font-medium" style={{ color: C.sub }}>
                            {group.count > 0 ? `${group.count} action${group.count !== 1 ? "s" : ""}` : "No audit log"}
                          </div>
                          {deleg && <div className="text-[10px] mt-0.5" style={{ color: C.sub }}>Target: {deleg.week_target ?? "—"} · Done: {done}</div>}
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
                    <div className="mb-3 rounded-xl border overflow-hidden" style={{ background: C.white, borderColor: C.mint1 + "44" }}>
                      <div className="px-4 py-3 border-b flex items-center gap-3" style={{ borderColor: C.mint4 + "55", background: C.mint4 + "22" }}>
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
                      <div className="grid grid-cols-5 divide-x text-center py-3" style={{ borderColor: C.mint4 + "44" }}>
                        {[
                          { label: "Target",   val: sTarget,   color: "#E65100" },
                          { label: "Submitted",val: sSub,      color: C.dark    },
                          { label: "Approved", val: sApproved, color: C.ok      },
                          { label: "Pending",  val: sPending,  color: C.danger  },
                          { label: "Rejected", val: sRejected, color: "#C62828" },
                        ].map(({ label, val, color }) => (
                          <div key={label} className="px-3">
                            <div className="text-xl font-bold leading-none" style={{ color }}>{val}</div>
                            <div className="text-[10px] uppercase tracking-wide mt-1" style={{ color: color + "88" }}>{label}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}
                <div className="flex gap-1 mb-3 p-1 rounded-xl" style={{ background: C.mint4 + "66" }}>
                  {[
                    { key: "submitted", label: `Submitted (${serialSubmitted.length})` },
                    { key: "approved",  label: `Approved (${serialStat?.approved ?? 0})` },
                    { key: "activity",  label: `Activity Log (${serialAllEntries.length})` },
                  ].map((t) => (
                    <button key={t.key} onClick={() => { setSerialSubTab(t.key); setActivityEpisode(null); }}
                      className="flex-1 py-1.5 rounded-lg text-xs font-medium transition-all"
                      style={{ background: serialSubTab === t.key ? C.dark : "transparent", color: serialSubTab === t.key ? C.mint4 : C.sub }}>
                      {t.label}
                    </button>
                  ))}
                </div>

                {serialSubTab === "submitted" && (
                  <div className="rounded-xl border overflow-hidden" style={{ background: C.white, borderColor: C.mint1 + "44" }}>
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
                  <div className="rounded-xl border overflow-hidden" style={{ background: C.white, borderColor: C.mint1 + "44" }}>
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
                            <td className="px-4 py-3 text-center text-lg font-bold" style={{ color: "#7B1FA2" }}>{serialStat.submitted || 0}</td>
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
                    <div className="rounded-xl border overflow-hidden" style={{ background: C.white, borderColor: C.mint1 + "44" }}>
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
                                          <span className="text-[10px] px-1.5 py-0.5 rounded font-medium capitalize" style={{ background: sc.bg, color: sc.color }}>{ep.status}</span>
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
                      <div className="mb-2 px-3 py-1 rounded-lg inline-flex items-center gap-2" style={{ background: C.mint4 + "44" }}>
                        <span className="text-xs font-semibold" style={{ color: C.dark }}>Episode {String(activityEpisode).padStart(2,"0")}</span>
                      </div>
                      <div className="rounded-xl border overflow-hidden" style={{ background: C.white, borderColor: C.mint1 + "44" }}>
                        {(() => {
                          const epLog = serialAllEntries.filter((e) => e.episode_number === activityEpisode);
                          return epLog.length === 0
                            ? <div className="p-8 text-center text-sm" style={{ color: C.sub }}>No activity for this episode</div>
                            : (
                              <MiniPager entries={epLog} pageSize={20}>
                                {(paged, offset) => (
                                  <table className="w-full text-sm">
                                    <thead>
                                      <tr className="border-b" style={thStyle}>
                                        <th className={`text-left ${TH}`}>#</th>
                                        <th className={`text-left ${TH}`}>Action</th>
                                        <th className={`text-left ${TH}`}>Details</th>
                                        <th className={`text-right ${TH}`}>Date</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {paged.map((e, i) => (
                                        <tr key={e.id} className="border-b last:border-0 hover:bg-green-50/20" style={rowBorder}>
                                          <td className="px-4 py-2.5 font-mono text-xs" style={{ color: C.sub }}>{offset + i + 1}</td>
                                          <td className="px-4 py-2.5"><span className="capitalize font-medium text-xs" style={{ color: C.dark }}>{e.action}</span></td>
                                          <td className="px-4 py-2.5 text-xs" style={{ color: C.sub }}>{e.details || "—"}</td>
                                          <td className="px-4 py-2.5 text-right text-xs" style={{ color: C.sub }}>{e.at ? new Date(e.at).toLocaleString() : "—"}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                )}
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
              <div className="rounded-xl border overflow-hidden" style={{ background: C.white, borderColor: C.mint1 + "44" }}>
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
                        style={{ borderColor: C.mint4 + "44" }}>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm truncate" style={{ color: C.dark }}>{movie}</div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                              style={{ background: isSubmitted ? "#E3F2FD" : "#F3F4F6", color: isSubmitted ? "#1565C0" : C.sub }}>
                              {isSubmitted ? "Submitted" : "Not Submitted"}
                            </span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                              style={{ background: isApproved ? "#E8F5E9" : "#FFF3E0", color: isApproved ? "#2E7D32" : "#E65100" }}>
                              {isApproved ? "Approved" : "Pending"}
                            </span>
                          </div>
                        </div>
                        <div className="text-right shrink-0 text-xs font-medium" style={{ color: C.sub }}>
                          {group.count > 0 ? `${group.count} action${group.count !== 1 ? "s" : ""}` : "No audit log"}
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
                <div className="mb-3 px-4 py-3 rounded-xl border flex items-center gap-4" style={{ background: C.mint4 + "22", borderColor: C.mint4 + "44" }}>
                  <div className="flex-1">
                    <div className="font-semibold text-sm" style={{ color: C.dark }}>{selectedMovie}</div>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                        style={{ background: (movieStat?.submitted > 0 || movieStat?.approved > 0) ? "#E3F2FD" : "#F3F4F6", color: (movieStat?.submitted > 0 || movieStat?.approved > 0) ? "#1565C0" : C.sub }}>
                        {(movieStat?.submitted > 0 || movieStat?.approved > 0) ? "Submitted" : "Not Submitted"}
                      </span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                        style={{ background: movieStat?.approved > 0 ? "#E8F5E9" : "#FFF3E0", color: movieStat?.approved > 0 ? "#2E7D32" : "#E65100" }}>
                        {movieStat?.approved > 0 ? "Approved" : "Pending Approval"}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="rounded-xl border overflow-hidden" style={{ background: C.white, borderColor: C.mint1 + "44" }}>
                  <div className="px-4 py-2 border-b text-[10px] font-bold uppercase tracking-widest"
                    style={{ borderColor: C.mint4, background: C.mint4 + "33", color: C.sub }}>Activity Log</div>
                  {movieEntries.length === 0
                    ? <div className="p-8 text-center text-sm" style={{ color: C.sub }}>No activity log</div>
                    : (
                      <MiniPager entries={movieEntries}>
                        {(paged, offset) => (
                          <table className="w-full text-sm">
                            <thead><tr className="border-b" style={thStyle}><th className={`text-left ${TH}`}>#</th><th className={`text-left ${TH}`}>Action</th><th className={`text-left ${TH}`}>Details</th><th className={`text-right ${TH}`}>Date</th></tr></thead>
                            <tbody>
                              {paged.map((e, i) => (
                                <tr key={e.id} className="border-b last:border-0 hover:bg-green-50/20" style={rowBorder}>
                                  <td className="px-4 py-2.5 font-mono text-xs" style={{ color: C.sub }}>{offset + i + 1}</td>
                                  <td className="px-4 py-2.5"><span className="capitalize font-medium text-xs" style={{ color: C.dark }}>{e.action}</span></td>
                                  <td className="px-4 py-2.5 text-xs" style={{ color: C.sub }}>{e.details || "—"}</td>
                                  <td className="px-4 py-2.5 text-right text-xs" style={{ color: C.sub }}>{e.at ? new Date(e.at).toLocaleString() : "—"}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </MiniPager>
                    )}
                </div>
              </div>
            )}

            {/* ── History tab ── */}
            {panelTab === "history" && (
              <div className="flex gap-4">
                <div className="w-20 shrink-0">
                  <div className="rounded-xl border overflow-hidden" style={{ background: C.white, borderColor: C.mint1 + "44" }}>
                    {historyYears.length === 0
                      ? <div className="p-4 text-xs text-center" style={{ color: C.sub }}>No data</div>
                      : historyYears.map((y) => (
                        <button key={y} onClick={() => setHistoryYear(y)}
                          className="w-full py-2.5 text-sm font-semibold border-b last:border-0 transition"
                          style={{ borderColor: C.mint4 + "55", background: historyYear === y ? C.dark : "transparent", color: historyYear === y ? C.mint4 : C.dark }}>
                          {y}
                        </button>
                      ))}
                  </div>
                </div>
                <div className="flex-1">
                  {!historyYear
                    ? <div className="rounded-xl border p-8 text-center text-sm" style={{ background: C.white, borderColor: C.mint1 + "44", color: C.sub }}>Select a year to see monthly breakdown</div>
                    : (
                      <div className="rounded-xl border overflow-hidden" style={{ background: C.white, borderColor: C.mint1 + "44" }}>
                        <div className="px-4 py-3 border-b text-[10px] font-bold uppercase tracking-widest"
                          style={{ borderColor: C.mint4, background: C.mint4 + "33", color: C.sub }}>{historyYear} — Monthly Breakdown</div>
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
      style={{ background: "#fff", borderColor: C.mint1 + "44" }}>
      <button onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 border-b"
        style={{ borderColor: C.mint4 + "44", background: C.mint4 + "22" }}>
        <div className="flex items-center gap-2">
          <Layers className="w-3.5 h-3.5" style={{ color: C.mint1 }} />
          <span className="font-semibold text-sm" style={{ color: C.dark }}>{group.project_title}</span>
          <span className="text-[10px] px-2 py-0.5 rounded-full"
            style={{ background: C.mint1 + "33", color: C.sub }}>
            {group.items.length} submission{group.items.length !== 1 ? "s" : ""}
          </span>
        </div>
        <ChevronDown className="w-4 h-4 transition-transform"
          style={{ color: C.sub, transform: open ? "rotate(180deg)" : "" }} />
      </button>
      {open && (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider border-b"
              style={{ borderColor: C.mint4 + "44", color: C.sub, background: C.mint4 + "11" }}>
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
                style={{ borderColor: C.mint4 + "33" }}>
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
      <div className="flex gap-1 mb-5 p-1 rounded-xl w-fit" style={{ background: C.mint4 + "66" }}>
        {[{ key: "serial", label: "Serials" }, { key: "movie", label: "Movies" }].map(({ key, label }) => (
          <button key={key} onClick={() => setSubTab(key)}
            className="px-5 py-1.5 rounded-lg text-xs font-medium transition-all"
            style={{ background: subTab === key ? C.dark : "transparent", color: subTab === key ? C.mint4 : C.sub }}>
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
  const thStyle = { background: C.mint4 + "33", color: C.sub, borderColor: C.mint4 };
  const TH = "text-[10px] uppercase tracking-wider font-semibold px-4 py-2.5";

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
        <div className="mb-4 rounded-xl border overflow-hidden" style={{ background: C.white, borderColor: C.mint1 + "44" }}>
          <div className="px-5 py-3 border-b flex items-center gap-3 flex-wrap"
            style={{ borderColor: C.mint4 + "55", background: C.mint4 + "22" }}>
            <Users className="w-4 h-4 shrink-0" style={{ color: C.mint1 }} />
            <span className="font-semibold text-sm" style={{ color: C.dark }}>{selected}</span>
            <span className="text-xs" style={{ color: C.sub }}>{allRows.length} total delegation{allRows.length !== 1 ? "s" : ""}</span>
            {allEditors.length > 0 && (
              <span className="text-xs ml-auto" style={{ color: C.sub }}>Editors: {allEditors.join(", ")}</span>
            )}
          </div>
          <div className="grid grid-cols-3 divide-x text-center py-3" style={{ borderColor: C.mint4 + "44" }}>
            {[
              { label: "Total Target",   val: totTarget, color: "#E65100" },
              { label: "Submitted/Done", val: totDone,   color: C.ok      },
              { label: "Pending",        val: totPend,   color: C.danger  },
            ].map(({ label, val, color }) => (
              <div key={label} className="px-4">
                <div className="text-2xl font-bold leading-none" style={{ color }}>{val}</div>
                <div className="text-[10px] uppercase tracking-wide mt-1" style={{ color: color + "88" }}>{label}</div>
              </div>
            ))}
          </div>
        </div>
        {/* Serial / Movie tabs — only in detail view */}
        <div className="flex gap-1 mb-4 p-1 rounded-xl w-fit" style={{ background: C.mint4 + "66" }}>
          {[
            { key: "serial", label: `Serials (${serialRows.length})` },
            { key: "movie",  label: `Movies (${movieRows.length})`   },
          ].map(({ key, label }) => (
            <button key={key} onClick={() => setClientSubTab(key)}
              className="px-4 py-1.5 rounded-lg text-xs font-medium transition-all"
              style={{ background: clientSubTab === key ? C.dark : "transparent", color: clientSubTab === key ? C.mint4 : C.sub }}>
              {label}
            </button>
          ))}
        </div>
        <div className="rounded-xl border overflow-hidden" style={{ background: C.white, borderColor: C.mint1 + "44" }}>
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
                    style={{ borderColor: C.mint4 + "44" }}>
                    <td className="px-4 py-3">
                      <div className="font-medium text-sm" style={{ color: C.dark }}>{d.serial_name}</div>
                      {d.channel && <div className="text-[10px]" style={{ color: C.sub }}>{d.channel}</div>}
                    </td>
                    <td className="px-4 py-3 text-xs" style={{ color: C.dark }}>{d.assigned_to_name || "—"}</td>
                    {clientSubTab === "serial" && <td className="px-4 py-3 text-xs" style={{ color: C.sub }}>{d.episode_range || "—"}</td>}
                    <td className="px-4 py-3 text-center font-bold" style={{ color: "#E65100" }}>{d.week_target ?? "—"}</td>
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
        <div className="rounded-xl border p-12 text-center" style={{ background: C.white, borderColor: C.mint1 + "44" }}>
          <div className="text-4xl mb-3">🏢</div>
          <div className="font-semibold mb-1" style={{ fontFamily: FONTS.serif }}>No clients yet</div>
          <p className="text-sm" style={{ color: C.sub }}>Add a client name when creating delegations.</p>
        </div>
      ) : (
        <div className="rounded-xl border overflow-hidden" style={{ background: C.white, borderColor: C.mint1 + "44" }}>
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
                    style={{ borderColor: C.mint4 + "44" }}
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
                    <td className="px-4 py-3 text-center font-medium" style={{ color: "#7B1FA2" }}>{movieCnt}</td>
                    <td className="px-4 py-3 text-center font-bold" style={{ color: "#E65100" }}>{totTarget || "—"}</td>
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


// ─── Main WDDashboard ─────────────────────────────────────────────────────────
export default function WDDashboard() {
  const { currentUser } = useApp();
  const [tab, setTab]               = useState("delegations");
  const [delegations, setDelegations] = useState([]);
  const [editors, setEditors]         = useState([]);
  const [showForm, setShowForm]       = useState(false);
  const [editTarget, setEditTarget]   = useState(null);
  const [selectedEditor, setSelectedEditor] = useState(null);
  const [loading, setLoading]         = useState(true);
  const [searchQ, setSearchQ]         = useState("");
  const [delTab, setDelTab]           = useState("serials");
  const [projectSubTab, setProjectSubTab] = useState("serial");

  useEffect(() => {
    Promise.all([api.listDelegations(), api.listEditors()])
      .then(([d, e]) => { setDelegations(d); setEditors(e); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleCreate = async (payload) => {
    const d = await api.createDelegation(payload);
    setDelegations((prev) => [d, ...prev]);
  };
  const handleUpdate = async (payload) => {
    const d = await api.updateDelegation(editTarget.id, payload);
    setDelegations((prev) => prev.map((x) => (x.id === d.id ? d : x)));
  };
  const handleDelete = async (id) => {
    const ok = await showConfirm("Delete this delegation?", { variant: "danger", confirmLabel: "Delete" });
    if (!ok) return;
    await api.deleteDelegation(id);
    setDelegations((prev) => prev.filter((x) => x.id !== id));
  };
  const handleStatusChange = async (id, status) => {
    const d = await api.updateDelegation(id, { status });
    setDelegations((prev) => prev.map((x) => (x.id === d.id ? d : x)));
  };

  const filteredDelegations = (() => {
    const q = searchQ.trim().toLowerCase();
    if (!q) return delegations;
    return delegations.filter((d) =>
      (d.serial_name || "").toLowerCase().includes(q) ||
      (d.assigned_to_name || "").toLowerCase().includes(q)
    );
  })();

  const tabs = [
    { key: "delegations",  label: "Work Delegations" },
    { key: "serials",      label: "Projects" },
    { key: "calendar",     label: "Activity" },
    { key: "activity",     label: "Editor Activity" },
    { key: "clients",      label: "Clients" },
    { key: "submissions",  label: "Submissions" },
  ];

  return (
    <DashboardShell title="Work Delegation" subtitle="Assign and track editor workload" tabs={tabs} activeTab={tab} onTab={setTab}>
      {tab === "delegations" && (() => {
        const serialFiltered = filteredDelegations.filter((d) => d.work_type !== "Movie Cue Sheet");
        const movieFiltered  = filteredDelegations.filter((d) => d.work_type === "Movie Cue Sheet");
        const tabFiltered    = delTab === "movies" ? movieFiltered : serialFiltered;
        const isMovie        = delTab === "movies";
        const colSpan        = isMovie ? 8 : 9;
        const thStyle        = { borderColor: C.mint4, color: C.sub, background: C.mint4 + "33" };
        const TH             = "text-left px-4 py-3 text-[10px] uppercase tracking-wider";
        return (
          <div>
            {/* Top bar: tabs + search + new */}
            <div className="flex items-center gap-3 mb-4 flex-wrap">
              <div className="flex gap-1 p-1 rounded-xl" style={{ background: C.mint4 + "66" }}>
                {[
                  { key: "serials", label: "Serials", count: delegations.filter((d) => d.work_type !== "Movie Cue Sheet").length },
                  { key: "movies",  label: "Movies",  count: delegations.filter((d) => d.work_type === "Movie Cue Sheet").length  },
                ].map(({ key, label, count }) => (
                  <button key={key} onClick={() => setDelTab(key)}
                    className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-medium transition-all"
                    style={{ background: delTab === key ? C.dark : "transparent", color: delTab === key ? C.mint4 : C.sub }}>
                    {label} <span className="text-[10px] opacity-70">({count})</span>
                  </button>
                ))}
              </div>
              <div className="relative max-w-xs flex-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: C.sub }} />
                <input
                  type="text" value={searchQ} onChange={(e) => setSearchQ(e.target.value)}
                  placeholder={`Search ${isMovie ? "movie" : "serial"} or editor…`}
                  className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border focus:outline-none"
                  style={{ borderColor: C.mint1 + "44", background: C.white, color: C.dark }}
                />
                {searchQ && (
                  <button onClick={() => setSearchQ("")} className="absolute right-2 top-1/2 -translate-y-1/2">
                    <X className="w-3 h-3" style={{ color: C.sub }} />
                  </button>
                )}
              </div>
              <span className="text-xs" style={{ color: C.sub }}>
                {tabFiltered.length}{searchQ ? ` of ${(isMovie ? movieFiltered : serialFiltered).length}` : ""} {isMovie ? "movie" : "serial"}{tabFiltered.length !== 1 ? "s" : ""}
              </span>
              <button onClick={() => { setEditTarget(null); setShowForm(true); }}
                className="ml-auto flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium hover:opacity-90"
                style={{ background: C.dark, color: C.mint4 }}>
                <Plus className="w-4 h-4" />New Delegation
              </button>
            </div>

            {showForm && (
              <DelegationForm
                editors={editors} initial={editTarget}
                onSave={editTarget ? handleUpdate : handleCreate}
                onClose={() => { setShowForm(false); setEditTarget(null); }}
              />
            )}

            <div className="rounded-2xl border overflow-hidden" style={{ background: C.white, borderColor: C.mint1 + "44" }}>
              {loading ? (
                <div className="px-4 py-8 text-center text-sm" style={{ color: C.sub }}>Loading…</div>
              ) : tabFiltered.length === 0 ? (
                <div className="px-4 py-10 text-center text-sm" style={{ color: C.sub }}>
                  {searchQ ? `No results for "${searchQ}"` : `No ${isMovie ? "movie" : "serial"} delegations yet. Create one to assign work to editors.`}
                </div>
              ) : (
                <MiniPager entries={tabFiltered} pageSize={20}>
                  {(paged) => (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b" style={thStyle}>
                          <th className={TH}>{isMovie ? "Movie" : "Serial"}</th>
                          <th className={TH}>Assigned To</th>
                          <th className={TH}>Client</th>
                          {!isMovie && <th className={TH}>Ep Range</th>}
                          <th className="text-center px-4 py-3 text-[10px] uppercase tracking-wider">Target</th>
                          <th className="text-center px-4 py-3 text-[10px] uppercase tracking-wider">Done</th>
                          <th className="text-center px-4 py-3 text-[10px] uppercase tracking-wider">Balance</th>
                          <th className={TH}>Status</th>
                          <th className="text-right px-4 py-3 text-[10px] uppercase tracking-wider">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paged.map((d) => (
                          <tr key={d.id} className="border-b last:border-0 hover:bg-green-50/30 transition" style={{ borderColor: C.mint4 + "55" }}>
                            <td className="px-4 py-3">
                              <div className="font-medium" style={{ color: C.dark }}>{d.serial_name}</div>
                              {d.channel && <div className="text-[10px]" style={{ color: C.sub }}>{d.channel}</div>}
                            </td>
                            <td className="px-4 py-3 text-sm" style={{ color: C.dark }}>{d.assigned_to_name || "—"}</td>
                            <td className="px-4 py-3 text-xs" style={{ color: C.sub }}>{d.client || "—"}</td>
                            {!isMovie && <td className="px-4 py-3 text-xs" style={{ color: C.sub }}>{d.episode_range || "—"}</td>}
                            <td className="px-4 py-3 text-center text-sm font-medium" style={{ color: C.dark }}>{d.week_target ?? "—"}</td>
                            <td className="px-4 py-3 text-center text-sm font-medium" style={{ color: C.ok }}>{d.completed}</td>
                            <td className="px-4 py-3 text-center text-sm font-medium" style={{ color: d.balance > 0 ? C.warn : C.ok }}>{d.balance}</td>
                            <td className="px-4 py-3">
                              <select value={d.status} onChange={(e) => handleStatusChange(d.id, e.target.value)}
                                className="text-xs px-2 py-1 rounded-lg focus:outline-none"
                                style={{ background: STATUS_STYLE[d.status]?.bg, color: STATUS_STYLE[d.status]?.color, border: "none" }}
                                onClick={(e) => e.stopPropagation()}>
                                {STATUSES.map((s) => <option key={s} value={s}>{STATUS_STYLE[s].label}</option>)}
                              </select>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <div className="flex items-center justify-end gap-1">
                                <button onClick={() => { setEditTarget(d); setShowForm(true); }} className="p-1.5 rounded-lg hover:bg-gray-100" title="Edit">
                                  <Edit2 className="w-3.5 h-3.5" style={{ color: C.sub }} />
                                </button>
                                <button onClick={() => handleDelete(d.id)} className="p-1.5 rounded-lg hover:bg-red-50" title="Delete">
                                  <Trash2 className="w-3.5 h-3.5" style={{ color: C.danger }} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </MiniPager>
              )}
            </div>
          </div>
        );
      })()}

      {tab === "serials" && (() => {
        // derive project ID sets from delegation work_type — this is the source of truth
        const movieProjIds  = new Set(delegations.filter((d) => d.work_type === "Movie Cue Sheet" && d.project_id).map((d) => d.project_id));
        const serialProjIds = new Set(delegations.filter((d) => d.work_type !== "Movie Cue Sheet" && d.project_id).map((d) => d.project_id));
        return (
          <div>
            <div className="flex gap-1 mb-5 p-1 rounded-xl w-fit" style={{ background: C.mint4 + "66" }}>
              {[{ key: "serial", label: "Serials" }, { key: "movie", label: "Movies" }].map(({ key, label }) => (
                <button key={key} onClick={() => setProjectSubTab(key)}
                  className="px-5 py-1.5 rounded-lg text-xs font-medium transition-all"
                  style={{ background: projectSubTab === key ? C.dark : "transparent", color: projectSubTab === key ? C.mint4 : C.sub }}>
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

      {tab === "calendar" && <CalendarActivity delegations={delegations} />}

      {tab === "activity" && (
        <ActivityPanel editors={editors} selected={selectedEditor} onSelect={setSelectedEditor} />
      )}

      {tab === "clients"     && <ClientsTab delegations={delegations} />}
      {tab === "submissions" && <SubmissionsTab />}
    </DashboardShell>
  );
}
