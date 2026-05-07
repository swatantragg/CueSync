import { useEffect, useState, useRef } from "react";
import {
  Plus, Trash2, Search, Edit2, X, ChevronLeft, ChevronRight,
  FileText, ArrowLeft, CalendarDays, History,
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
                    {s.title} <span className="text-xs opacity-60">({s.type})</span>
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
              <select value={form.work_type} onChange={(e) => setForm((f) => ({ ...f, work_type: e.target.value }))} className={inp} style={inpStyle}>
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

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: C.muted }}>Client</label>
              <input value={form.client} onChange={(e) => setForm((f) => ({ ...f, client: e.target.value }))} placeholder="Client name" className={inp} style={inpStyle} />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: C.muted }}>Channel</label>
              <input value={form.channel} onChange={(e) => setForm((f) => ({ ...f, channel: e.target.value }))} placeholder="TV channel" className={inp} style={inpStyle} />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: C.muted }}>Episode Range</label>
              <input value={form.episode_range} onChange={(e) => setForm((f) => ({ ...f, episode_range: e.target.value }))} placeholder="e.g. Ep 601-800" className={inp} style={inpStyle} />
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
function CalendarActivity() {
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: Math.max(1, currentYear - 2026 + 1) }, (_, i) => 2026 + i);

  const [selectedYear, setSelectedYear] = useState(currentYear >= 2026 ? currentYear : 2026);
  const [calData, setCalData]   = useState(null);
  const [loading, setLoading]   = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(null);

  useEffect(() => {
    setLoading(true);
    setSelectedMonth(null);
    api.activityCalendar(selectedYear)
      .then(setCalData)
      .catch(() => setCalData(null))
      .finally(() => setLoading(false));
  }, [selectedYear]);

  const mTotal = (m) => {
    const d = calData?.months?.[String(m)];
    return d ? { sub: d.submitted || 0, app: d.approved || 0 } : { sub: 0, app: 0 };
  };
  const qTotal = (months) =>
    months.reduce((acc, m) => { const t = mTotal(m); return { sub: acc.sub + t.sub, app: acc.app + t.app }; }, { sub: 0, app: 0 });

  const quarters = [[1,2,3,4],[5,6,7,8],[9,10,11,12]];
  const selData = selectedMonth ? calData?.months?.[String(selectedMonth)] : null;

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

      {/* Calendar area */}
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
                    const mt = mTotal(m);
                    const isSel = selectedMonth === m;
                    return (
                      <button key={m} onClick={() => setSelectedMonth(isSel ? null : m)}
                        className="flex-1 rounded-xl border p-3 text-left transition-all hover:shadow-md"
                        style={{
                          background: isSel ? C.dark : C.white,
                          borderColor: isSel ? C.mint1 : C.mint1 + "44",
                        }}>
                        <div className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: isSel ? C.mint4 : C.sub }}>
                          {MONTH_NAMES[m - 1]}
                        </div>
                        <div className="flex gap-3 items-end">
                          <div>
                            <div className="text-xl font-bold leading-none" style={{ color: isSel ? C.mint4 : C.dark }}>{mt.sub}</div>
                            <div className="text-[10px] mt-0.5" style={{ color: isSel ? C.muted : C.sub }}>↑ Sub</div>
                          </div>
                          <div>
                            <div className="text-xl font-bold leading-none" style={{ color: isSel ? "#86efac" : C.ok }}>{mt.app}</div>
                            <div className="text-[10px] mt-0.5" style={{ color: isSel ? "#86efac" : C.ok }}>✓ App</div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                  {/* Quarter totals */}
                  <div className="w-20 shrink-0 rounded-xl border p-3 flex flex-col justify-center text-center"
                    style={{ background: C.mint4 + "33", borderColor: C.mint4 + "55" }}>
                    <div className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: C.sub }}>Q{qi + 1}</div>
                    <div className="flex justify-center gap-2">
                      <div>
                        <div className="text-base font-bold leading-none" style={{ color: C.dark }}>{qt.sub}</div>
                        <div className="text-[10px] mt-0.5" style={{ color: C.sub }}>↑ Sub</div>
                      </div>
                      <div>
                        <div className="text-base font-bold leading-none" style={{ color: C.ok }}>{qt.app}</div>
                        <div className="text-[10px] mt-0.5" style={{ color: C.ok }}>✓ App</div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Month detail */}
        {selectedMonth && selData && (
          <div className="mt-5 rounded-xl border overflow-hidden" style={{ background: C.white, borderColor: C.mint1 + "44" }}>
            <div className="px-4 py-3 border-b flex items-center justify-between"
              style={{ borderColor: C.mint4, background: C.mint4 + "33" }}>
              <div className="font-semibold text-sm" style={{ color: C.dark }}>
                {MONTH_FULL[selectedMonth - 1]} {selectedYear}
                <span className="ml-3 text-xs font-normal" style={{ color: C.sub }}>
                  {(selData.submitted || 0) + (selData.approved || 0)} total
                </span>
              </div>
              <div className="flex gap-4 text-xs" style={{ color: C.sub }}>
                <span>Submitted: <strong style={{ color: C.dark }}>{selData.submitted || 0}</strong></span>
                <span>Approved: <strong style={{ color: C.ok }}>{selData.approved || 0}</strong></span>
              </div>
            </div>

            <div className="grid grid-cols-2">
              {/* Weekly breakdown */}
              <div className="p-4 border-r" style={{ borderColor: C.mint4 + "44" }}>
                <div className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: C.sub }}>Weekly Breakdown</div>
                {Object.entries(selData.weeks || {}).length === 0 ? (
                  <div className="text-xs" style={{ color: C.sub }}>No weekly data</div>
                ) : (
                  Object.entries(selData.weeks || {})
                    .sort(([a], [b]) => parseInt(a) - parseInt(b))
                    .map(([wk, wd]) => (
                      <div key={wk} className="py-2 border-b last:border-0" style={{ borderColor: C.mint4 + "33" }}>
                        <div className="flex items-center gap-3 text-xs">
                          <span className="w-12 font-semibold" style={{ color: C.sub }}>Week {wk}</span>
                          <span style={{ color: C.dark }}>{wd.submitted || 0} sub</span>
                          <span style={{ color: C.ok }}>{wd.approved || 0} app</span>
                        </div>
                        {(wd.editors || []).length > 0 && (
                          <div className="text-[10px] mt-1 ml-12" style={{ color: C.muted }}>
                            {wd.editors.join(" · ")}
                          </div>
                        )}
                      </div>
                    ))
                )}
              </div>

              {/* Editor breakdown */}
              <div className="p-4">
                <div className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: C.sub }}>By Editor</div>
                {Object.entries(selData.editors || {}).length === 0 ? (
                  <div className="text-xs" style={{ color: C.sub }}>No editor data</div>
                ) : (
                  Object.entries(selData.editors || {})
                    .sort(([, a], [, b]) => (b.submitted + b.approved) - (a.submitted + a.approved))
                    .map(([name, stats]) => (
                      <div key={name} className="flex items-center gap-2 py-2 border-b last:border-0 text-xs" style={{ borderColor: C.mint4 + "33" }}>
                        <span className="flex-1 font-medium" style={{ color: C.dark }}>{name}</span>
                        <span style={{ color: C.dark }}>{stats.submitted || 0}↑</span>
                        <span style={{ color: C.ok }}>{stats.approved || 0}✓</span>
                      </div>
                    ))
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Activity Panel (Editor Activity tab) ─────────────────────────────────────
const PAGE_SIZE = 25;

function MiniPager({ entries, children }) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(entries.length / PAGE_SIZE));
  const paged = entries.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  return (
    <>
      {children(paged, (page - 1) * PAGE_SIZE)}
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
  const [log, setLog]         = useState(null);
  const [loading, setLoading] = useState(false);
  const [panelTab, setPanelTab]         = useState("serials");
  const [selectedSerial, setSelectedSerial]   = useState(null);
  const [serialSubTab, setSerialSubTab]       = useState("submitted");
  const [historyYear, setHistoryYear]         = useState(null);

  useEffect(() => {
    if (!selected) { setLog(null); return; }
    setPanelTab("serials");
    setSelectedSerial(null);
    setHistoryYear(null);
    setLoading(true);
    api.editorActivity(selected).then(setLog).catch(() => setLog(null)).finally(() => setLoading(false));
  }, [selected]);

  // Derived
  const delegMap    = Object.fromEntries((log?.delegations || []).map((d) => [d.serial_name, d]));
  const bySerialMap = Object.fromEntries((log?.by_serial || []).map((g) => [g.serial, g]));
  const episodeStats = log?.episode_stats || {};

  const allSerials = log ? [
    ...new Set([
      ...(log.by_serial || []).map((g) => g.serial),
      ...(log.delegations || []).map((d) => d.serial_name),
    ]),
  ] : [];

  // Monthly summary (current month submissions)
  const now = new Date();
  const currentMonthSubmitted = (log?.by_serial || [])
    .flatMap((g) => g.entries)
    .filter((e) => {
      if (e.action !== "submit" || !e.at) return false;
      const d = new Date(e.at);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }).length;

  // History grouping: year → month → {sub, app}
  const allEntries = (log?.by_serial || []).flatMap((g) =>
    g.entries.map((e) => ({ ...e, serial: g.serial }))
  );
  const historyData = {};
  for (const e of allEntries) {
    if (!e.at) continue;
    const d = new Date(e.at);
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    if (!historyData[y]) historyData[y] = {};
    if (!historyData[y][m]) historyData[y][m] = { sub: 0, app: 0 };
    if (e.action === "submit")  historyData[y][m].sub++;
    if (e.action === "approve") historyData[y][m].app++;
  }
  const historyYears = Object.keys(historyData).map(Number).sort((a, b) => b - a);

  // Serial detail
  const serialGroup = selectedSerial ? (bySerialMap[selectedSerial] || { serial: selectedSerial, count: 0, entries: [] }) : null;
  const serialDeleg = selectedSerial ? delegMap[selectedSerial] : null;
  const serialStat  = selectedSerial ? (episodeStats[selectedSerial] || null) : null;
  const serialSubmitted = (serialGroup?.entries || []).filter((e) => e.action === "submit");
  const serialAllEntries = serialGroup?.entries || [];

  const thStyle = { background: C.mint4 + "33", color: C.sub, borderColor: C.mint4 };
  const TH = "text-[10px] uppercase tracking-wider font-semibold px-4 py-2";
  const rowBorder = { borderColor: C.mint4 + "44" };

  return (
    <div className="grid grid-cols-3 gap-6">
      {/* Editor list */}
      <div className="rounded-xl border overflow-hidden self-start" style={{ background: C.white, borderColor: C.mint1 + "44" }}>
        <div className="px-4 py-3 border-b text-[10px] font-bold uppercase tracking-widest"
          style={{ borderColor: C.mint4, background: C.mint4 + "66", color: C.sub }}>Editors</div>
        {editors.length === 0 ? (
          <div className="p-6 text-sm text-center" style={{ color: C.sub }}>No editors found</div>
        ) : editors.map((e) => (
          <button key={e.id} onClick={() => { onSelect(e.id); setSelectedSerial(null); }}
            className="w-full text-left px-4 py-3 border-b last:border-0 text-sm hover:bg-green-50/40 transition"
            style={{ borderColor: C.mint4 + "55", background: selected === e.id ? C.mint4 + "99" : undefined, color: C.dark }}>
            <div className="font-medium">{e.full_name}</div>
            <div className="text-xs" style={{ color: C.sub }}>{e.email}</div>
          </button>
        ))}
      </div>

      {/* Right panel */}
      <div className="col-span-2">
        {!selected && (
          <div className="rounded-xl border p-10 text-center text-sm" style={{ background: C.white, borderColor: C.mint1 + "44", color: C.sub }}>
            Select an editor to view their activity
          </div>
        )}
        {selected && loading && (
          <div className="rounded-xl border p-10 text-center text-sm" style={{ background: C.white, borderColor: C.mint1 + "44", color: C.sub }}>Loading…</div>
        )}

        {selected && !loading && log && (
          <>
            {/* Summary header */}
            <div className="mb-4 rounded-xl border px-5 py-3 flex items-center gap-6"
              style={{ background: C.mint4 + "22", borderColor: C.mint4 + "44" }}>
              <div>
                <div className="text-xs font-bold uppercase tracking-widest" style={{ color: C.sub }}>{log.user?.full_name}</div>
                <div className="text-sm mt-0.5" style={{ color: C.dark }}>
                  <strong>{currentMonthSubmitted}</strong> cue sheet{currentMonthSubmitted !== 1 ? "s" : ""} submitted in {MONTH_FULL[now.getMonth()]}
                </div>
              </div>
              <div className="ml-auto flex gap-6 text-center">
                <div>
                  <div className="text-lg font-bold" style={{ color: C.dark }}>{allSerials.length}</div>
                  <div className="text-[10px] uppercase tracking-wider" style={{ color: C.sub }}>Serials</div>
                </div>
                <div>
                  <div className="text-lg font-bold" style={{ color: C.ok }}>
                    {Object.values(episodeStats).reduce((s, v) => s + (v.approved || 0), 0)}
                  </div>
                  <div className="text-[10px] uppercase tracking-wider" style={{ color: C.sub }}>Approved</div>
                </div>
                <div>
                  <div className="text-lg font-bold" style={{ color: C.dark }}>
                    {(log.by_serial || []).flatMap((g) => g.entries).filter((e) => e.action === "submit").length}
                  </div>
                  <div className="text-[10px] uppercase tracking-wider" style={{ color: C.sub }}>Submitted</div>
                </div>
              </div>
            </div>

            {/* Panel sub-tabs: Serials / History */}
            <div className="flex gap-1 mb-4 p-1 rounded-xl" style={{ background: C.mint4 + "99" }}>
              {[
                { key: "serials", label: "Serials", icon: CalendarDays },
                { key: "history", label: "History", icon: History },
              ].map(({ key, label, icon: Icon }) => (
                <button key={key} onClick={() => { setPanelTab(key); setSelectedSerial(null); setHistoryYear(null); }}
                  className="flex-1 flex items-center justify-center gap-2 py-1.5 rounded-lg text-xs font-medium transition-all"
                  style={{ background: panelTab === key ? C.dark : "transparent", color: panelTab === key ? C.mint4 : C.sub }}>
                  <Icon className="w-3.5 h-3.5" />{label}
                </button>
              ))}
            </div>

            {/* ── Serials tab ── */}
            {panelTab === "serials" && !selectedSerial && (
              <div className="rounded-xl border overflow-hidden" style={{ background: C.white, borderColor: C.mint1 + "44" }}>
                {allSerials.length === 0 ? (
                  <div className="p-8 text-center text-sm" style={{ color: C.sub }}>No serials assigned yet</div>
                ) : allSerials.map((serial) => {
                  const deleg = delegMap[serial] || null;
                  const group = bySerialMap[serial] || { count: 0 };
                  const s = STATUS_STYLE[deleg?.status] || STATUS_STYLE.pending;
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
                        {deleg && (
                          <div className="text-[10px] mt-0.5" style={{ color: C.sub }}>
                            Done: {deleg.completed ?? 0} / {deleg.week_target ?? "?"}
                          </div>
                        )}
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
                <button onClick={() => setSelectedSerial(null)}
                  className="flex items-center gap-1.5 text-xs mb-3 hover:opacity-70"
                  style={{ color: C.sub }}>
                  <ArrowLeft className="w-3.5 h-3.5" /> Back to serials
                </button>

                {/* Serial header */}
                <div className="mb-3 px-4 py-3 rounded-xl border flex items-center gap-4"
                  style={{ background: C.mint4 + "22", borderColor: C.mint4 + "44" }}>
                  <div className="flex-1">
                    <div className="font-semibold text-sm" style={{ color: C.dark }}>{selectedSerial}</div>
                    {serialDeleg && (
                      <div className="flex items-center gap-3 mt-1 text-xs" style={{ color: C.sub }}>
                        <StatusBadge status={serialDeleg.status} />
                        <span>Range: {serialDeleg.episode_range || "—"}</span>
                        <span>Target: {serialDeleg.week_target ?? "—"}</span>
                        <span>Done: {serialDeleg.completed ?? 0}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Serial sub-tabs */}
                <div className="flex gap-1 mb-3 p-1 rounded-xl" style={{ background: C.mint4 + "66" }}>
                  {[
                    { key: "submitted", label: `Submitted (${serialSubmitted.length})` },
                    { key: "approved",  label: `Approved (${serialStat?.approved ?? 0})` },
                    { key: "activity",  label: `Activity Log (${serialAllEntries.length})` },
                  ].map((t) => (
                    <button key={t.key} onClick={() => setSerialSubTab(t.key)}
                      className="flex-1 py-1.5 rounded-lg text-xs font-medium transition-all"
                      style={{ background: serialSubTab === t.key ? C.dark : "transparent", color: serialSubTab === t.key ? C.mint4 : C.sub }}>
                      {t.label}
                    </button>
                  ))}
                </div>

                {/* Submitted */}
                {serialSubTab === "submitted" && (
                  <div className="rounded-xl border overflow-hidden" style={{ background: C.white, borderColor: C.mint1 + "44" }}>
                    {serialSubmitted.length === 0 ? (
                      <div className="p-8 text-center text-sm" style={{ color: C.sub }}>No submissions for this serial</div>
                    ) : (
                      <MiniPager entries={serialSubmitted}>
                        {(paged, offset) => (
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b" style={thStyle}>
                                <th className={`text-left ${TH}`}>#</th>
                                <th className={`text-center ${TH}`}>Ep #</th>
                                <th className={`text-right ${TH}`}>Date</th>
                              </tr>
                            </thead>
                            <tbody>
                              {paged.map((e, i) => (
                                <tr key={e.id} className="border-b last:border-0 hover:bg-green-50/20" style={rowBorder}>
                                  <td className="px-4 py-2.5 font-mono text-xs" style={{ color: C.sub }}>{offset + i + 1}</td>
                                  <td className="px-4 py-2.5 text-center font-mono text-xs" style={{ color: C.dark }}>
                                    {e.episode_number != null ? String(e.episode_number).padStart(2, "0") : "—"}
                                  </td>
                                  <td className="px-4 py-2.5 text-right text-xs" style={{ color: C.sub }}>
                                    {e.at ? new Date(e.at).toLocaleString() : "—"}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </MiniPager>
                    )}
                  </div>
                )}

                {/* Approved */}
                {serialSubTab === "approved" && (
                  <div className="rounded-xl border overflow-hidden" style={{ background: C.white, borderColor: C.mint1 + "44" }}>
                    {!serialStat ? (
                      <div className="p-8 text-center text-sm" style={{ color: C.sub }}>No episode data for this serial</div>
                    ) : (
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b" style={thStyle}>
                            <th className={`text-center ${TH}`}>Approved</th>
                            <th className={`text-center ${TH}`}>In Review</th>
                            <th className={`text-center ${TH}`}>Rejected</th>
                            <th className={`text-center ${TH}`}>Pending</th>
                            <th className={`text-center ${TH}`}>Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            <td className="px-4 py-3 text-center text-lg font-bold" style={{ color: C.ok }}>{serialStat.approved || 0}</td>
                            <td className="px-4 py-3 text-center text-lg font-bold" style={{ color: "#7B1FA2" }}>{serialStat.submitted || 0}</td>
                            <td className="px-4 py-3 text-center text-lg font-bold" style={{ color: C.danger }}>{serialStat.rejected || 0}</td>
                            <td className="px-4 py-3 text-center text-lg font-bold" style={{ color: C.warn }}>{serialStat.pending || 0}</td>
                            <td className="px-4 py-3 text-center text-lg font-bold" style={{ color: C.dark }}>{serialStat.total || 0}</td>
                          </tr>
                        </tbody>
                      </table>
                    )}
                  </div>
                )}

                {/* Activity Log */}
                {serialSubTab === "activity" && (
                  <div className="rounded-xl border overflow-hidden" style={{ background: C.white, borderColor: C.mint1 + "44" }}>
                    {serialAllEntries.length === 0 ? (
                      <div className="p-8 text-center text-sm" style={{ color: C.sub }}>No activity log for this serial</div>
                    ) : (
                      <MiniPager entries={serialAllEntries}>
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
                                  <td className="px-4 py-2.5">
                                    <span className="capitalize font-medium text-xs" style={{ color: C.dark }}>{e.action}</span>
                                    {e.episode_number != null && (
                                      <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded" style={{ background: C.mint4 + "44", color: C.sub }}>
                                        Ep {e.episode_number}
                                      </span>
                                    )}
                                  </td>
                                  <td className="px-4 py-2.5 text-xs" style={{ color: C.sub }}>{e.details || "—"}</td>
                                  <td className="px-4 py-2.5 text-right text-xs" style={{ color: C.sub }}>
                                    {e.at ? new Date(e.at).toLocaleString() : "—"}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </MiniPager>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ── History tab ── */}
            {panelTab === "history" && (
              <div className="flex gap-4">
                {/* Year list */}
                <div className="w-20 shrink-0">
                  <div className="rounded-xl border overflow-hidden" style={{ background: C.white, borderColor: C.mint1 + "44" }}>
                    {historyYears.length === 0 ? (
                      <div className="p-4 text-xs text-center" style={{ color: C.sub }}>No data</div>
                    ) : historyYears.map((y) => (
                      <button key={y} onClick={() => setHistoryYear(y)}
                        className="w-full py-2.5 text-sm font-semibold border-b last:border-0 transition"
                        style={{ borderColor: C.mint4 + "55", background: historyYear === y ? C.dark : "transparent", color: historyYear === y ? C.mint4 : C.dark }}>
                        {y}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Monthly breakdown */}
                <div className="flex-1">
                  {!historyYear ? (
                    <div className="rounded-xl border p-8 text-center text-sm" style={{ background: C.white, borderColor: C.mint1 + "44", color: C.sub }}>
                      Select a year to see monthly breakdown
                    </div>
                  ) : (
                    <div className="rounded-xl border overflow-hidden" style={{ background: C.white, borderColor: C.mint1 + "44" }}>
                      <div className="px-4 py-3 border-b text-[10px] font-bold uppercase tracking-widest"
                        style={{ borderColor: C.mint4, background: C.mint4 + "33", color: C.sub }}>{historyYear} — Monthly Breakdown</div>
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b" style={thStyle}>
                            <th className={`text-left ${TH}`}>Month</th>
                            <th className={`text-center ${TH}`}>Submitted</th>
                            <th className={`text-center ${TH}`}>Approved</th>
                            <th className={`text-center ${TH}`}>Total</th>
                          </tr>
                        </thead>
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
    { key: "delegations", label: "Work Delegations" },
    { key: "serials",     label: "All Serials" },
    { key: "calendar",    label: "Activity" },
    { key: "activity",    label: "Editor Activity" },
  ];

  return (
    <DashboardShell title="Work Delegation" subtitle="Assign and track editor workload" tabs={tabs} activeTab={tab} onTab={setTab}>
      {tab === "delegations" && (
        <div>
          <div className="flex items-center gap-3 mb-4">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: C.sub }} />
              <input
                type="text" value={searchQ} onChange={(e) => setSearchQ(e.target.value)}
                placeholder="Search by serial or editor…"
                className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border focus:outline-none"
                style={{ borderColor: C.mint1 + "44", background: C.white, color: C.dark }}
              />
              {searchQ && (
                <button onClick={() => setSearchQ("")} className="absolute right-2 top-1/2 -translate-y-1/2">
                  <X className="w-3 h-3" style={{ color: C.sub }} />
                </button>
              )}
            </div>
            <span className="text-sm" style={{ color: C.sub }}>
              {filteredDelegations.length}{searchQ ? ` of ${delegations.length}` : ""} delegation{filteredDelegations.length !== 1 ? "s" : ""}
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
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-[10px] uppercase tracking-wider"
                  style={{ borderColor: C.mint4, color: C.sub, background: C.mint4 + "33" }}>
                  <th className="text-left px-4 py-3">Serial Name</th>
                  <th className="text-left px-4 py-3">Type</th>
                  <th className="text-left px-4 py-3">Assigned To</th>
                  <th className="text-left px-4 py-3">Client</th>
                  <th className="text-left px-4 py-3">Ep Range</th>
                  <th className="text-center px-4 py-3">Target</th>
                  <th className="text-center px-4 py-3">Done</th>
                  <th className="text-center px-4 py-3">Balance</th>
                  <th className="text-left px-4 py-3">Status</th>
                  <th className="text-right px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading && <tr><td colSpan={10} className="px-4 py-8 text-center text-sm" style={{ color: C.sub }}>Loading…</td></tr>}
                {!loading && delegations.length === 0 && (
                  <tr><td colSpan={10} className="px-4 py-8 text-center text-sm" style={{ color: C.sub }}>No delegations yet. Create one to assign work to editors.</td></tr>
                )}
                {!loading && delegations.length > 0 && filteredDelegations.length === 0 && (
                  <tr><td colSpan={10} className="px-4 py-8 text-center text-sm" style={{ color: C.sub }}>No results for "{searchQ}"</td></tr>
                )}
                {filteredDelegations.map((d) => (
                  <tr key={d.id} className="border-b last:border-0 hover:bg-green-50/30 transition" style={{ borderColor: C.mint4 + "55" }}>
                    <td className="px-4 py-3">
                      <div className="font-medium" style={{ color: C.dark }}>{d.serial_name}</div>
                      {d.channel && <div className="text-[10px]" style={{ color: C.sub }}>{d.channel}</div>}
                    </td>
                    <td className="px-4 py-3 text-xs" style={{ color: C.sub }}>{d.work_type}</td>
                    <td className="px-4 py-3 text-sm" style={{ color: C.dark }}>{d.assigned_to_name || "—"}</td>
                    <td className="px-4 py-3 text-xs" style={{ color: C.sub }}>{d.client || "—"}</td>
                    <td className="px-4 py-3 text-xs" style={{ color: C.sub }}>{d.episode_range || "—"}</td>
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
          </div>
        </div>
      )}

      {tab === "serials" && <ProjectsTab hideHeader showCreateBtn />}

      {tab === "calendar" && <CalendarActivity />}

      {tab === "activity" && (
        <ActivityPanel editors={editors} selected={selectedEditor} onSelect={setSelectedEditor} />
      )}
    </DashboardShell>
  );
}
