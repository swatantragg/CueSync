import { useEffect, useState, useRef } from "react";
import { Plus, Trash2, Search, ChevronDown, Edit2, X, Clock, CheckCircle2, AlertCircle, ChevronLeft, ChevronRight, FileText } from "lucide-react";
import { C, FONTS } from "../../styles/palette";
import DashboardShell from "./DashboardShell";
import ProjectsTab from "./ProjectsTab";
import { api } from "../../utils/api";
import { showAlert, showConfirm } from "../../components/Dialog";
import { useApp } from "../../context/AppContext";

const WORK_TYPES = ["TV Cue Sheet", "Movie Cue Sheet", "Album", "Other"];
const STATUSES = ["pending", "in_progress", "completed"];
const STATUS_STYLE = {
  pending: { bg: "#FFF3E0", color: "#E65100", label: "Pending" },
  in_progress: { bg: "#E3F2FD", color: "#1565C0", label: "In Progress" },
  completed: { bg: "#E8F5E9", color: "#2E7D32", label: "Completed" },
};

function StatusBadge({ status }) {
  const s = STATUS_STYLE[status] || STATUS_STYLE.pending;
  return <span className="text-[10px] px-2 py-0.5 rounded font-medium" style={{ background: s.bg, color: s.color }}>{s.label}</span>;
}

function DelegationForm({ editors, onSave, onClose, initial = null }) {
  const [form, setForm] = useState({
    serial_name: initial?.serial_name || "",
    work_type: initial?.work_type || "TV Cue Sheet",
    client: initial?.client || "",
    channel: initial?.channel || "",
    episode_range: initial?.episode_range || "",
    week_target: initial?.week_target || "",
    completed: initial?.completed || 0,
    status: initial?.status || "pending",
    notes: initial?.notes || "",
    assigned_to: initial?.assigned_to || "",
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
      const exact = rows.some((r) => r.title.toLowerCase() === q.trim().toLowerCase());
      setIsNewSerial(!exact);
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
    } finally {
      setSaving(false);
    }
  };

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
          {/* Serial name with project suggestions */}
          <div className="relative" ref={suggestRef}>
            <label className="block text-xs font-medium mb-1" style={{ color: C.muted }}>Serial / Movie Name *</label>
            <input
              value={form.serial_name}
              onChange={(e) => { setForm((f) => ({ ...f, serial_name: e.target.value })); searchProjects(e.target.value); }}
              onFocus={() => form.serial_name && searchProjects(form.serial_name)}
              onBlur={() => setTimeout(() => setShowSuggest(false), 150)}
              placeholder="Start typing to see existing serials…"
              className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none"
              style={{ background: C.mid, color: C.mint4, border: `1px solid ${C.mint1}33` }}
            />
            {showSuggest && (
              <div className="absolute left-0 right-0 z-50 rounded-lg shadow-xl mt-1 overflow-hidden" style={{ background: C.mid, border: `1px solid ${C.mint1}44` }}>
                {suggestions.map((s) => (
                  <button key={s.id} type="button" onMouseDown={() => { setForm((f) => ({ ...f, serial_name: s.title })); setShowSuggest(false); setIsNewSerial(false); }}
                    className="w-full text-left px-4 py-2.5 hover:opacity-80 text-sm" style={{ color: C.mint4 }}>
                    {s.title} <span className="text-xs opacity-60">({s.type})</span>
                  </button>
                ))}
              </div>
            )}
            {isNewSerial && !showSuggest && form.serial_name.trim() && (
              <div className="mt-1.5 flex items-center gap-1.5 text-xs px-2 py-1 rounded-lg w-fit"
                style={{ background: "#FFF3E0", color: "#E65100" }}>
                <Plus className="w-3 h-3" />
                New serial — will be auto-created
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: C.muted }}>Work Type</label>
              <select value={form.work_type} onChange={(e) => setForm((f) => ({ ...f, work_type: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none" style={{ background: C.mid, color: C.mint4, border: `1px solid ${C.mint1}33` }}>
                {WORK_TYPES.map((t) => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: C.muted }}>Assign To *</label>
              <select value={form.assigned_to} onChange={(e) => setForm((f) => ({ ...f, assigned_to: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none" style={{ background: C.mid, color: C.mint4, border: `1px solid ${C.mint1}33` }}>
                <option value="">Select editor…</option>
                {editors.map((e) => <option key={e.id} value={e.id}>{e.full_name}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: C.muted }}>Client</label>
              <input value={form.client} onChange={(e) => setForm((f) => ({ ...f, client: e.target.value }))}
                placeholder="Client name" className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none"
                style={{ background: C.mid, color: C.mint4, border: `1px solid ${C.mint1}33` }} />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: C.muted }}>Channel</label>
              <input value={form.channel} onChange={(e) => setForm((f) => ({ ...f, channel: e.target.value }))}
                placeholder="TV channel" className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none"
                style={{ background: C.mid, color: C.mint4, border: `1px solid ${C.mint1}33` }} />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: C.muted }}>Episode Range</label>
              <input value={form.episode_range} onChange={(e) => setForm((f) => ({ ...f, episode_range: e.target.value }))}
                placeholder="e.g. Ep 601-800" className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none"
                style={{ background: C.mid, color: C.mint4, border: `1px solid ${C.mint1}33` }} />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: C.muted }}>Week Target</label>
              <input type="number" value={form.week_target} onChange={(e) => setForm((f) => ({ ...f, week_target: e.target.value }))}
                placeholder="0" className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none"
                style={{ background: C.mid, color: C.mint4, border: `1px solid ${C.mint1}33` }} />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: C.muted }}>Status</label>
              <select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none" style={{ background: C.mid, color: C.mint4, border: `1px solid ${C.mint1}33` }}>
                {STATUSES.map((s) => <option key={s} value={s}>{STATUS_STYLE[s].label}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: C.muted }}>Notes</label>
            <textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              rows={2} placeholder="Optional notes…"
              className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none resize-none"
              style={{ background: C.mid, color: C.mint4, border: `1px solid ${C.mint1}33` }} />
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

const PAGE_SIZE = 25;

function ActivityLogModal({ serial, entries, deleg, onClose }) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(entries.length / PAGE_SIZE));
  const start = (page - 1) * PAGE_SIZE;
  const pageEntries = entries.slice(start, start + PAGE_SIZE);
  const s = STATUS_STYLE[deleg?.status] || STATUS_STYLE.pending;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.55)" }}>
      <div className="rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col" style={{ background: C.dark, maxHeight: "85vh" }}>
        {/* Header */}
        <div className="px-6 py-4 border-b shrink-0 flex items-start justify-between gap-4" style={{ borderColor: C.mid }}>
          <div>
            <h3 className="font-semibold" style={{ fontFamily: FONTS.serif, color: C.mint4 }}>{serial}</h3>
            <div className="flex items-center gap-3 mt-1">
              {deleg && (
                <span className="text-[10px] px-2 py-0.5 rounded font-medium" style={{ background: s.bg, color: s.color }}>{s.label}</span>
              )}
              {deleg && (
                <span className="text-xs" style={{ color: C.muted }}>
                  Target: {deleg.week_target ?? "—"} · Done: {deleg.completed} · Balance: {deleg.balance}
                </span>
              )}
              <span className="text-xs" style={{ color: C.muted }}>{entries.length} action{entries.length !== 1 ? "s" : ""}</span>
            </div>
          </div>
          <button onClick={onClose} style={{ color: C.muted }}><X className="w-4 h-4" /></button>
        </div>

        {/* Entries */}
        <div className="overflow-y-auto flex-1">
          {entries.length === 0 ? (
            <div className="p-12 text-center text-sm" style={{ color: C.muted }}>No activity logged for this serial yet</div>
          ) : (
            pageEntries.map((a, i) => (
              <div key={a.id} className="flex items-start justify-between px-6 py-3 border-b" style={{ borderColor: C.mid }}>
                <div className="flex items-start gap-3">
                  <span className="text-xs font-mono mt-0.5 w-6 text-right shrink-0" style={{ color: C.muted }}>{start + i + 1}</span>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="capitalize font-medium text-sm" style={{ color: C.mint4 }}>{a.action}</span>
                      <span className="text-xs capitalize px-1.5 py-0.5 rounded" style={{ background: C.mid, color: C.muted }}>{a.entity}{a.entity_id ? ` #${a.entity_id}` : ""}</span>
                    </div>
                    {a.details && <div className="text-xs mt-0.5" style={{ color: C.muted }}>{a.details}</div>}
                  </div>
                </div>
                <span className="text-[10px] shrink-0 ml-4 mt-0.5" style={{ color: C.muted }}>
                  {a.at ? new Date(a.at).toLocaleString() : ""}
                </span>
              </div>
            ))
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-6 py-3 border-t shrink-0 flex items-center justify-between" style={{ borderColor: C.mid }}>
            <span className="text-xs" style={{ color: C.muted }}>
              Page {page} of {totalPages} · {entries.length} entries
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(1)} disabled={page === 1}
                className="px-2 py-1 rounded text-xs disabled:opacity-30 hover:bg-white/10" style={{ color: C.muted }}>«</button>
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
                className="p-1 rounded disabled:opacity-30 hover:bg-white/10" style={{ color: C.muted }}>
                <ChevronLeft className="w-4 h-4" />
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter((n) => n === 1 || n === totalPages || Math.abs(n - page) <= 2)
                .reduce((acc, n, idx, arr) => {
                  if (idx > 0 && n - arr[idx - 1] > 1) acc.push("…");
                  acc.push(n);
                  return acc;
                }, [])
                .map((item, idx) =>
                  item === "…" ? (
                    <span key={`ellipsis-${idx}`} className="px-1 text-xs" style={{ color: C.muted }}>…</span>
                  ) : (
                    <button key={item} onClick={() => setPage(item)}
                      className="w-7 h-7 rounded text-xs font-medium"
                      style={{ background: page === item ? C.mint1 : "transparent", color: page === item ? C.dark : C.muted }}>
                      {item}
                    </button>
                  )
                )}
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                className="p-1 rounded disabled:opacity-30 hover:bg-white/10" style={{ color: C.muted }}>
                <ChevronRight className="w-4 h-4" />
              </button>
              <button
                onClick={() => setPage(totalPages)} disabled={page === totalPages}
                className="px-2 py-1 rounded text-xs disabled:opacity-30 hover:bg-white/10" style={{ color: C.muted }}>»</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ActivityPanel({ editors, selected, onSelect }) {
  const [log, setLog] = useState(null);
  const [loading, setLoading] = useState(false);
  const [modalSerial, setModalSerial] = useState(null);
  const [epSubTab, setEpSubTab] = useState("submitted");

  useEffect(() => {
    if (!selected) { setLog(null); setModalSerial(null); return; }
    setEpSubTab("submitted");
    setLoading(true);
    api.editorActivity(selected).then(setLog).catch(() => setLog(null)).finally(() => setLoading(false));
  }, [selected]);

  const auditSerials = log?.by_serial?.map((g) => g.serial) || [];
  const delegMap = Object.fromEntries((log?.delegations || []).map((d) => [d.serial_name, d]));
  const extraDelegSerials = (log?.delegations || [])
    .filter((d) => !auditSerials.includes(d.serial_name))
    .map((d) => d.serial_name);
  const allSerials = [...auditSerials, ...extraDelegSerials];

  const modalGroup = modalSerial
    ? (log?.by_serial?.find((g) => g.serial === modalSerial) || { serial: modalSerial, count: 0, entries: [] })
    : null;

  const submittedEntries = (log?.by_serial || [])
    .flatMap((g) => g.entries.filter((e) => e.action === "submit").map((e) => ({ ...e, serial: g.serial })))
    .sort((a, b) => new Date(b.at) - new Date(a.at));

  const episodeStats = log?.episode_stats || {};
  const totalApproved = Object.values(episodeStats).reduce((s, v) => s + (v.approved || 0), 0);

  const thStyle = { borderColor: C.mint4, background: C.mint4 + "33", color: C.sub };
  const rowStyle = { borderColor: C.mint4 + "55" };
  const TH = "text-[10px] uppercase tracking-wider font-semibold";

  return (
    <>
      {modalGroup && (
        <ActivityLogModal
          serial={modalGroup.serial}
          entries={modalGroup.entries}
          deleg={delegMap[modalGroup.serial] || null}
          onClose={() => setModalSerial(null)}
        />
      )}

      <div className="grid grid-cols-3 gap-6">
        {/* Editor list */}
        <div className="rounded-xl border overflow-hidden" style={{ background: C.white, borderColor: C.mint1 + "44" }}>
          <div className="px-4 py-3 border-b text-xs font-semibold uppercase tracking-wider"
            style={{ borderColor: C.mint4, background: C.mint4 + "66", color: C.sub }}>Editors</div>
          {editors.length === 0 && (
            <div className="p-6 text-sm text-center" style={{ color: C.sub }}>No editors found</div>
          )}
          {editors.map((e) => (
            <button key={e.id} onClick={() => onSelect(e.id)}
              className="w-full text-left px-4 py-3 border-b last:border-0 text-sm hover:bg-green-50/40 transition"
              style={{ borderColor: C.mint4 + "55", background: selected === e.id ? C.mint4 + "99" : undefined, color: C.dark }}>
              <div className="font-medium">{e.full_name}</div>
              <div className="text-xs" style={{ color: C.sub }}>{e.email}</div>
            </button>
          ))}
        </div>

        {/* Right: 3-tab detail */}
        <div className="col-span-2">
          <div className="mb-3 text-xs font-semibold uppercase tracking-wider" style={{ color: C.sub }}>
            {log?.user ? `Activity — ${log.user.full_name}` : "Select an editor"}
          </div>

          {!selected && (
            <div className="rounded-xl border p-10 text-center text-sm" style={{ background: C.white, borderColor: C.mint1 + "44", color: C.sub }}>
              Select an editor to view their activity
            </div>
          )}
          {selected && loading && (
            <div className="rounded-xl border p-10 text-center text-sm" style={{ background: C.white, borderColor: C.mint1 + "44", color: C.sub }}>Loading…</div>
          )}

          {selected && !loading && log && (
            <div>
              {/* Sub-tab switcher */}
              <div className="flex gap-1 mb-4 p-1 rounded-xl" style={{ background: C.mint4 + "99" }}>
                {[
                  { key: "submitted", label: `Submitted (${submittedEntries.length})` },
                  { key: "approved",  label: `Approved (${totalApproved})` },
                  { key: "activity",  label: "Activity Log" },
                ].map((t) => (
                  <button key={t.key} onClick={() => setEpSubTab(t.key)}
                    className="flex-1 py-1.5 rounded-lg text-xs font-medium transition-all"
                    style={{ background: epSubTab === t.key ? C.dark : "transparent", color: epSubTab === t.key ? C.mint4 : C.sub }}>
                    {t.label}
                  </button>
                ))}
              </div>

              {/* Submitted tab */}
              {epSubTab === "submitted" && (
                <div className="rounded-xl border overflow-hidden" style={{ background: C.white, borderColor: C.mint1 + "44" }}>
                  {submittedEntries.length === 0 ? (
                    <div className="p-8 text-center text-sm" style={{ color: C.sub }}>No submissions yet</div>
                  ) : (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b" style={thStyle}>
                          <th className={`text-left px-4 py-2 ${TH}`}>Serial</th>
                          <th className={`text-center px-4 py-2 ${TH}`}>Ep #</th>
                          <th className={`text-right px-4 py-2 ${TH}`}>Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {submittedEntries.map((e) => (
                          <tr key={e.id} className="border-b last:border-0 hover:bg-green-50/20" style={rowStyle}>
                            <td className="px-4 py-2.5 font-medium" style={{ color: C.dark }}>{e.serial}</td>
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
                </div>
              )}

              {/* Approved tab */}
              {epSubTab === "approved" && (
                <div className="rounded-xl border overflow-hidden" style={{ background: C.white, borderColor: C.mint1 + "44" }}>
                  {Object.keys(episodeStats).length === 0 ? (
                    <div className="p-8 text-center text-sm" style={{ color: C.sub }}>No episode data available</div>
                  ) : (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b" style={thStyle}>
                          <th className={`text-left px-4 py-2 ${TH}`}>Serial</th>
                          <th className={`text-center px-4 py-2 ${TH}`}>Approved</th>
                          <th className={`text-center px-4 py-2 ${TH}`}>In Review</th>
                          <th className={`text-center px-4 py-2 ${TH}`}>Rejected</th>
                          <th className={`text-center px-4 py-2 ${TH}`}>Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(episodeStats).map(([serial, stats]) => (
                          <tr key={serial} className="border-b last:border-0 hover:bg-green-50/20" style={rowStyle}>
                            <td className="px-4 py-2.5 font-medium" style={{ color: C.dark }}>{serial}</td>
                            <td className="px-4 py-2.5 text-center font-bold" style={{ color: C.ok }}>{stats.approved || 0}</td>
                            <td className="px-4 py-2.5 text-center" style={{ color: "#7B1FA2" }}>{stats.submitted || 0}</td>
                            <td className="px-4 py-2.5 text-center" style={{ color: C.danger }}>{stats.rejected || 0}</td>
                            <td className="px-4 py-2.5 text-center" style={{ color: C.sub }}>{stats.total || 0}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              {/* Activity Log tab */}
              {epSubTab === "activity" && (
                allSerials.length === 0 ? (
                  <div className="rounded-xl border p-8 text-center text-sm" style={{ background: C.white, borderColor: C.mint1 + "44", color: C.sub }}>
                    No activity yet
                  </div>
                ) : (
                  <div className="rounded-xl border overflow-hidden" style={{ background: C.white, borderColor: C.mint1 + "44" }}>
                    <div className="px-4 py-3 border-b grid grid-cols-5 gap-2 text-[10px] font-semibold uppercase tracking-wider" style={thStyle}>
                      <span className="col-span-2">Serial / Work</span>
                      <span className="text-center">Target</span>
                      <span className="text-center">Done</span>
                      <span className="text-right">Log</span>
                    </div>
                    {allSerials.map((serial) => {
                      const group = log?.by_serial?.find((g) => g.serial === serial) || { serial, count: 0, entries: [] };
                      const deleg = delegMap[serial] || null;
                      const s = STATUS_STYLE[deleg?.status] || STATUS_STYLE.pending;
                      return (
                        <div key={serial} className="px-4 py-3 border-b last:border-0 grid grid-cols-5 gap-2 items-center hover:bg-green-50/20 transition" style={rowStyle}>
                          <div className="col-span-2">
                            <div className="font-medium text-sm" style={{ color: C.dark }}>{serial}</div>
                            <div className="flex items-center gap-2 mt-0.5">
                              {deleg && <span className="text-[10px] px-1.5 py-0.5 rounded font-medium" style={{ background: s.bg, color: s.color }}>{s.label}</span>}
                              {deleg?.episode_range && <span className="text-[10px]" style={{ color: C.sub }}>{deleg.episode_range}</span>}
                            </div>
                          </div>
                          <div className="text-center text-sm font-medium" style={{ color: C.dark }}>{deleg?.week_target ?? "—"}</div>
                          <div className="text-center text-sm font-medium" style={{ color: C.ok }}>{deleg?.completed ?? "—"}</div>
                          <div className="text-right">
                            <button
                              onClick={() => setModalSerial(serial)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium hover:opacity-90"
                              style={{ background: C.dark, color: C.mint4 }}
                            >
                              <FileText className="w-3 h-3" />
                              Log {group.count > 0 && <span className="opacity-70">({group.count})</span>}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export default function WDDashboard() {
  const { currentUser } = useApp();
  const [tab, setTab] = useState("delegations");
  const [delegations, setDelegations] = useState([]);
  const [editors, setEditors] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [selectedEditor, setSelectedEditor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [searchQ, setSearchQ] = useState("");

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
    setDelegations((prev) => prev.map((x) => x.id === d.id ? d : x));
  };

  const handleDelete = async (id) => {
    const ok = await showConfirm("Delete this delegation?", { variant: "danger", confirmLabel: "Delete" });
    if (!ok) return;
    await api.deleteDelegation(id);
    setDelegations((prev) => prev.filter((x) => x.id !== id));
  };

  const handleStatusChange = async (id, status) => {
    const d = await api.updateDelegation(id, { status });
    setDelegations((prev) => prev.map((x) => x.id === d.id ? d : x));
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
    { key: "serials", label: "All Serials" },
    { key: "activity", label: "Editor Activity" },
  ];

  return (
    <DashboardShell title="Work Delegation" subtitle="Assign and track editor workload" tabs={tabs} activeTab={tab} onTab={setTab}>
      {tab === "delegations" && (
        <div>
          <div className="flex items-center gap-3 mb-4">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: C.sub }} />
              <input
                type="text"
                value={searchQ}
                onChange={(e) => setSearchQ(e.target.value)}
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
              className="ml-auto flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium hover:opacity-90" style={{ background: C.dark, color: C.mint4 }}>
              <Plus className="w-4 h-4" />New Delegation
            </button>
          </div>

          {showForm && (
            <DelegationForm
              editors={editors}
              initial={editTarget}
              onSave={editTarget ? handleUpdate : handleCreate}
              onClose={() => { setShowForm(false); setEditTarget(null); }}
            />
          )}

          <div className="rounded-2xl border overflow-hidden" style={{ background: C.white, borderColor: C.mint1 + "44" }}>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-[10px] uppercase tracking-wider" style={{ borderColor: C.mint4, color: C.sub, background: C.mint4 + "33" }}>
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
                    <td className="px-4 py-3">
                      <div className="text-sm" style={{ color: C.dark }}>{d.assigned_to_name || "—"}</div>
                    </td>
                    <td className="px-4 py-3 text-xs" style={{ color: C.sub }}>{d.client || "—"}</td>
                    <td className="px-4 py-3 text-xs" style={{ color: C.sub }}>{d.episode_range || "—"}</td>
                    <td className="px-4 py-3 text-center text-sm font-medium" style={{ color: C.dark }}>{d.week_target ?? "—"}</td>
                    <td className="px-4 py-3 text-center text-sm font-medium" style={{ color: C.ok }}>{d.completed}</td>
                    <td className="px-4 py-3 text-center text-sm font-medium" style={{ color: d.balance > 0 ? C.warn : C.ok }}>{d.balance}</td>
                    <td className="px-4 py-3">
                      <select
                        value={d.status}
                        onChange={(e) => handleStatusChange(d.id, e.target.value)}
                        className="text-xs px-2 py-1 rounded-lg focus:outline-none"
                        style={{ background: STATUS_STYLE[d.status]?.bg, color: STATUS_STYLE[d.status]?.color, border: "none" }}
                        onClick={(e) => e.stopPropagation()}
                      >
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

      {tab === "activity" && (
        <ActivityPanel editors={editors} selected={selectedEditor} onSelect={setSelectedEditor} />
      )}
    </DashboardShell>
  );
}
