import { useEffect, useState } from "react";
import { Users, Tv, CheckCircle2, Clock, Search, X, Trash2, UserCog, Music2, FileText, ChevronLeft, ChevronRight } from "lucide-react";
import { C, FONTS } from "../../styles/palette";
import DashboardShell from "./DashboardShell";
import ProjectsTab from "./ProjectsTab";
import { api, tokenStore } from "../../utils/api";
import { showAlert, showConfirm } from "../../components/Dialog";

const ROLES = ["admin", "work_delegator", "reviewer", "editor", "viewer"];
const ROLE_LABEL = { admin: "Admin", work_delegator: "Work Delegator", reviewer: "Reviewer", editor: "Editor", viewer: "Viewer" };
const ROLE_COLOR = { admin: { bg: "#EDE7F6", color: "#4527A0" }, work_delegator: { bg: "#E3F2FD", color: "#1565C0" }, reviewer: { bg: "#E8F5E9", color: "#2E7D32" }, editor: { bg: "#FFF3E0", color: "#E65100" }, viewer: { bg: "#F3F4F6", color: "#374151" } };

function StatCard({ icon: Icon, label, value, sub, color }) {
  return (
    <div className="rounded-xl border p-5 flex items-start gap-4" style={{ background: C.white, borderColor: C.mint1 + "44" }}>
      <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: (color || C.mint4) + "33" }}>
        <Icon className="w-5 h-5" style={{ color: color || C.dark }} />
      </div>
      <div>
        <div className="text-2xl font-bold" style={{ color: C.dark }}>{value}</div>
        <div className="text-sm font-medium" style={{ color: C.dark }}>{label}</div>
        {sub && <div className="text-xs mt-0.5" style={{ color: C.sub }}>{sub}</div>}
      </div>
    </div>
  );
}

function OverviewTab() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.projectStats().then(setStats).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="p-8 text-center text-sm" style={{ color: C.sub }}>Loading…</div>;
  if (!stats) return <div className="p-8 text-center text-sm" style={{ color: C.danger }}>Failed to load stats</div>;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={Tv} label="Total Serials" value={stats.total_projects} />
        <StatCard icon={CheckCircle2} label="Approved" value={stats.episodes.approved} sub="episodes" color={C.ok} />
        <StatCard icon={Clock} label="Pending Review" value={stats.episodes.submitted} sub="episodes" color={C.warn} />
        <StatCard icon={Users} label="Total Users" value={Object.values(stats.users_by_role).reduce((a, b) => a + b, 0)} />
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div className="rounded-xl border p-5" style={{ background: C.white, borderColor: C.mint1 + "44" }}>
          <h4 className="font-semibold mb-4" style={{ fontFamily: FONTS.serif }}>Episodes by Status</h4>
          {[
            { label: "Approved", val: stats.episodes.approved, color: C.ok },
            { label: "Submitted", val: stats.episodes.submitted, color: "#7B1FA2" },
            { label: "Rejected", val: stats.episodes.rejected, color: C.danger },
            { label: "Pending", val: stats.episodes.pending, color: C.sub },
          ].map((r) => (
            <div key={r.label} className="flex items-center justify-between py-2 border-b last:border-0" style={{ borderColor: C.mint4 + "55" }}>
              <span className="text-sm" style={{ color: C.dark }}>{r.label}</span>
              <span className="font-bold" style={{ color: r.color }}>{r.val}</span>
            </div>
          ))}
        </div>
        <div className="rounded-xl border p-5" style={{ background: C.white, borderColor: C.mint1 + "44" }}>
          <h4 className="font-semibold mb-4" style={{ fontFamily: FONTS.serif }}>Users by Role</h4>
          {ROLES.map((r) => (
            <div key={r} className="flex items-center justify-between py-2 border-b last:border-0" style={{ borderColor: C.mint4 + "55" }}>
              <span className="text-sm px-2 py-0.5 rounded text-xs" style={{ background: ROLE_COLOR[r]?.bg, color: ROLE_COLOR[r]?.color }}>{ROLE_LABEL[r]}</span>
              <span className="font-bold" style={{ color: C.dark }}>{stats.users_by_role[r] || 0}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function UsersTab() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQ, setSearchQ] = useState("");
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ email: "", full_name: "", password: "", role: "editor" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.listUsers().then(setUsers).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const handleRoleChange = async (uid, role) => {
    try {
      const u = await api.updateUserRole(uid, role);
      setUsers((prev) => prev.map((x) => x.id === uid ? u : x));
    } catch (ex) { await showAlert(ex.message, { variant: "error" }); }
  };

  const handleToggleActive = async (uid, is_active) => {
    try {
      const u = await api.toggleUserActive(uid, is_active);
      setUsers((prev) => prev.map((x) => x.id === uid ? u : x));
    } catch (ex) { await showAlert(ex.message, { variant: "error" }); }
  };

  const handleDelete = async (uid, name) => {
    const ok = await showConfirm(`Delete user "${name}"?`, { variant: "danger", confirmLabel: "Delete" });
    if (!ok) return;
    try {
      await api.deleteUser(uid);
      setUsers((prev) => prev.filter((x) => x.id !== uid));
    } catch (ex) { await showAlert(ex.message, { variant: "error" }); }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.email || !form.full_name || !form.password) return;
    setSaving(true);
    try {
      const res = await fetch(`${api.base || ""}/api/users/`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenStore.get()}` },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `${res.status} ${res.statusText}`);
      }
      const newU = await res.json();
      setUsers((prev) => [...prev, newU]);
      setForm({ email: "", full_name: "", password: "", role: "editor" });
      setCreating(false);
    } catch (ex) { await showAlert(ex.message || "Create failed", { variant: "error" }); }
    finally { setSaving(false); }
  };

  const filtered = users.filter((u) => {
    const q = searchQ.trim().toLowerCase();
    return !q || u.full_name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q) || u.role.includes(q);
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="relative max-w-xs flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: C.sub }} />
          <input type="text" value={searchQ} onChange={(e) => setSearchQ(e.target.value)}
            placeholder="Search users…" className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border focus:outline-none"
            style={{ borderColor: C.mint1 + "44", background: C.white, color: C.dark }} />
          {searchQ && <button onClick={() => setSearchQ("")} className="absolute right-2 top-1/2 -translate-y-1/2"><X className="w-3 h-3" style={{ color: C.sub }} /></button>}
        </div>
        <button onClick={() => setCreating(true)} className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium hover:opacity-90" style={{ background: C.dark, color: C.mint4 }}>
          <UserCog className="w-4 h-4" />Add User
        </button>
      </div>

      {creating && (
        <div className="rounded-xl border p-5 mb-4" style={{ background: C.white, borderColor: C.mint1 + "44" }}>
          <h4 className="font-semibold mb-3" style={{ fontFamily: FONTS.serif }}>New User</h4>
          <form onSubmit={handleCreate} className="grid grid-cols-2 gap-3">
            <input value={form.full_name} onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
              placeholder="Full name" className="px-3 py-2 rounded-lg text-sm border focus:outline-none"
              style={{ borderColor: C.mint1 + "44", color: C.dark }} />
            <input value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              placeholder="Email" type="email" className="px-3 py-2 rounded-lg text-sm border focus:outline-none"
              style={{ borderColor: C.mint1 + "44", color: C.dark }} />
            <input value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              placeholder="Password" type="password" className="px-3 py-2 rounded-lg text-sm border focus:outline-none"
              style={{ borderColor: C.mint1 + "44", color: C.dark }} />
            <select value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
              className="px-3 py-2 rounded-lg text-sm border focus:outline-none"
              style={{ borderColor: C.mint1 + "44", color: C.dark }}>
              {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
            </select>
            <div className="col-span-2 flex gap-2 justify-end">
              <button type="button" onClick={() => setCreating(false)} className="px-4 py-2 text-sm rounded-lg" style={{ color: C.sub }}>Cancel</button>
              <button type="submit" disabled={saving} className="px-4 py-2 text-sm rounded-lg font-medium disabled:opacity-50" style={{ background: C.dark, color: C.mint4 }}>
                {saving ? "Creating…" : "Create"}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="rounded-2xl border overflow-hidden" style={{ background: C.white, borderColor: C.mint1 + "44" }}>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-[10px] uppercase tracking-wider" style={{ borderColor: C.mint4, color: C.sub, background: C.mint4 + "33" }}>
              <th className="text-left px-5 py-3">User</th>
              <th className="text-left px-5 py-3">Email</th>
              <th className="text-left px-5 py-3">Role</th>
              <th className="text-center px-5 py-3">Active</th>
              <th className="text-right px-5 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={5} className="px-5 py-8 text-center text-sm" style={{ color: C.sub }}>Loading…</td></tr>}
            {filtered.map((u) => (
              <tr key={u.id} className="border-b last:border-0 hover:bg-green-50/30" style={{ borderColor: C.mint4 + "55" }}>
                <td className="px-5 py-3 font-medium" style={{ color: C.dark }}>{u.full_name}</td>
                <td className="px-5 py-3 text-xs" style={{ color: C.sub }}>{u.email}</td>
                <td className="px-5 py-3">
                  <select
                    value={u.role}
                    onChange={(e) => handleRoleChange(u.id, e.target.value)}
                    className="text-xs px-2 py-1 rounded-lg focus:outline-none"
                    style={{ background: ROLE_COLOR[u.role]?.bg, color: ROLE_COLOR[u.role]?.color, border: "none" }}>
                    {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                  </select>
                </td>
                <td className="px-5 py-3 text-center">
                  <button onClick={() => handleToggleActive(u.id, !u.is_active)}
                    className="w-8 h-5 rounded-full transition-colors relative"
                    style={{ background: u.is_active ? C.ok : "#d1d5db" }}>
                    <div className="w-3 h-3 bg-white rounded-full absolute top-1 transition-all" style={{ left: u.is_active ? "calc(100% - 16px)" : "4px" }} />
                  </button>
                </td>
                <td className="px-5 py-3 text-right">
                  <button onClick={() => handleDelete(u.id, u.full_name)} className="p-1.5 rounded-lg hover:bg-red-50" title="Delete user">
                    <Trash2 className="w-3.5 h-3.5" style={{ color: C.danger }} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function BGComposerTab() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const search = async () => {
    if (!q.trim()) return;
    setLoading(true);
    try {
      const r = await api.searchByBgComposer(q);
      setResults(r);
      setSearched(true);
    } catch (_) {}
    finally { setLoading(false); }
  };

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <div className="relative flex-1 max-w-md">
          <Music2 className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: C.sub }} />
          <input
            type="text" value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && search()}
            placeholder="Search by BG music composer name…"
            className="w-full pl-9 pr-3 py-2.5 text-sm rounded-xl border focus:outline-none"
            style={{ borderColor: C.mint1 + "44", background: C.white, color: C.dark }} />
        </div>
        <button onClick={search} disabled={loading} className="px-5 py-2.5 rounded-xl text-sm font-medium disabled:opacity-50" style={{ background: C.dark, color: C.mint4 }}>
          {loading ? "Searching…" : "Search"}
        </button>
      </div>

      {searched && (
        <div className="rounded-2xl border overflow-hidden" style={{ background: C.white, borderColor: C.mint1 + "44" }}>
          <div className="px-4 py-3 border-b text-xs font-semibold uppercase tracking-wider" style={{ borderColor: C.mint4, background: C.mint4 + "66", color: C.sub }}>
            {results.length} result{results.length !== 1 ? "s" : ""} for "{q}"
          </div>
          {results.length === 0 ? (
            <div className="p-8 text-center text-sm" style={{ color: C.sub }}>No serials found with this BG music composer.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-[10px] uppercase tracking-wider" style={{ borderColor: C.mint4, color: C.sub, background: C.mint4 + "22" }}>
                  <th className="text-left px-5 py-2">Serial / Movie</th>
                  <th className="text-left px-5 py-2">BG Composer</th>
                  <th className="text-left px-5 py-2">Language · Channel</th>
                  <th className="text-center px-5 py-2">Episodes</th>
                  <th className="text-center px-5 py-2">Approved</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r) => (
                  <tr key={r.id} className="border-b last:border-0" style={{ borderColor: C.mint4 + "55" }}>
                    <td className="px-5 py-3 font-medium" style={{ color: C.dark }}>{r.title} <span className="text-xs font-normal" style={{ color: C.sub }}>({r.type})</span></td>
                    <td className="px-5 py-3" style={{ color: C.dark }}>{r.bg_music_composer}</td>
                    <td className="px-5 py-3 text-xs" style={{ color: C.sub }}>{[r.language, r.channel_name].filter(Boolean).join(" · ") || "—"}</td>
                    <td className="px-5 py-3 text-center" style={{ color: C.dark }}>{r.total_episodes}</td>
                    <td className="px-5 py-3 text-center font-medium" style={{ color: C.ok }}>{r.approved_episodes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

function DelegationsTab() {
  const [delegations, setDelegations] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.listDelegations().then(setDelegations).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const STATUS_STYLE = {
    pending: { bg: "#FFF3E0", color: "#E65100" },
    in_progress: { bg: "#E3F2FD", color: "#1565C0" },
    completed: { bg: "#E8F5E9", color: "#2E7D32" },
  };

  if (loading) return <div className="p-8 text-center text-sm" style={{ color: C.sub }}>Loading…</div>;

  return (
    <div className="rounded-2xl border overflow-hidden" style={{ background: C.white, borderColor: C.mint1 + "44" }}>
      <div className="px-4 py-3 border-b text-xs font-semibold uppercase tracking-wider" style={{ borderColor: C.mint4, background: C.mint4 + "66", color: C.sub }}>
        All Delegations ({delegations.length})
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-[10px] uppercase tracking-wider" style={{ borderColor: C.mint4, color: C.sub, background: C.mint4 + "22" }}>
            <th className="text-left px-4 py-2">Serial</th>
            <th className="text-left px-4 py-2">Assigned To</th>
            <th className="text-left px-4 py-2">Client</th>
            <th className="text-left px-4 py-2">Range</th>
            <th className="text-center px-4 py-2">Target</th>
            <th className="text-center px-4 py-2">Done</th>
            <th className="text-left px-4 py-2">Status</th>
          </tr>
        </thead>
        <tbody>
          {delegations.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-sm" style={{ color: C.sub }}>No delegations yet</td></tr>}
          {delegations.map((d) => (
            <tr key={d.id} className="border-b last:border-0 hover:bg-green-50/30" style={{ borderColor: C.mint4 + "55" }}>
              <td className="px-4 py-3 font-medium" style={{ color: C.dark }}>{d.serial_name}</td>
              <td className="px-4 py-3" style={{ color: C.dark }}>{d.assigned_to_name || "—"}</td>
              <td className="px-4 py-3 text-xs" style={{ color: C.sub }}>{d.client || "—"}</td>
              <td className="px-4 py-3 text-xs" style={{ color: C.sub }}>{d.episode_range || "—"}</td>
              <td className="px-4 py-3 text-center" style={{ color: C.dark }}>{d.week_target ?? "—"}</td>
              <td className="px-4 py-3 text-center font-medium" style={{ color: C.ok }}>{d.completed}</td>
              <td className="px-4 py-3">
                <span className="text-[10px] px-2 py-0.5 rounded font-medium" style={{ background: STATUS_STYLE[d.status]?.bg, color: STATUS_STYLE[d.status]?.color }}>
                  {d.status}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Activity Tab ──────────────────────────────────────────────────────────────

const ACT_STATUS = {
  pending:     { bg: "#FFF3E0", color: "#E65100",  label: "Pending"     },
  in_progress: { bg: "#E3F2FD", color: "#1565C0",  label: "In Progress" },
  completed:   { bg: "#E8F5E9", color: "#2E7D32",  label: "Completed"   },
};
const ACT_ACTION = {
  approve: { bg: "#E8F5E9", color: "#2E7D32" },
  reject:  { bg: "#FFEBEE", color: "#C62828" },
  suggest: { bg: "#E3F2FD", color: "#1565C0" },
};

function SerialLogModal({ serial, entries, deleg, onClose }) {
  const [page, setPage] = useState(1);
  const PG = 25;
  const total = Math.max(1, Math.ceil(entries.length / PG));
  const start = (page - 1) * PG;
  const s = ACT_STATUS[deleg?.status] || ACT_STATUS.pending;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.55)" }}>
      <div className="rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col" style={{ background: C.dark, maxHeight: "85vh" }}>
        <div className="px-6 py-4 border-b shrink-0 flex items-start justify-between gap-4" style={{ borderColor: "#374151" }}>
          <div>
            <h3 className="font-semibold" style={{ fontFamily: FONTS.serif, color: C.mint4 }}>{serial}</h3>
            <div className="flex items-center gap-3 mt-1">
              {deleg && <span className="text-[10px] px-2 py-0.5 rounded font-medium" style={{ background: s.bg, color: s.color }}>{s.label}</span>}
              {deleg && <span className="text-xs" style={{ color: "#9ca3af" }}>Target: {deleg.week_target ?? "—"} · Done: {deleg.completed} · Balance: {deleg.balance}</span>}
              <span className="text-xs" style={{ color: "#9ca3af" }}>{entries.length} entries</span>
            </div>
          </div>
          <button onClick={onClose} style={{ color: "#9ca3af" }}><X className="w-4 h-4" /></button>
        </div>
        <div className="overflow-y-auto flex-1">
          {entries.length === 0 ? (
            <div className="p-12 text-center text-sm" style={{ color: "#9ca3af" }}>No activity logged yet</div>
          ) : entries.slice(start, start + PG).map((a, i) => (
            <div key={a.id} className="flex items-start justify-between px-6 py-3 border-b" style={{ borderColor: "#374151" }}>
              <div className="flex items-start gap-3">
                <span className="text-xs font-mono mt-0.5 w-6 text-right shrink-0" style={{ color: "#9ca3af" }}>{start + i + 1}</span>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="capitalize font-medium text-sm" style={{ color: C.mint4 }}>{a.action}</span>
                    <span className="text-xs capitalize px-1.5 py-0.5 rounded" style={{ background: "#374151", color: "#9ca3af" }}>
                      {a.entity}{a.entity_id ? ` #${a.entity_id}` : ""}
                    </span>
                  </div>
                  {a.details && <div className="text-xs mt-0.5" style={{ color: "#9ca3af" }}>{a.details}</div>}
                </div>
              </div>
              <span className="text-[10px] shrink-0 ml-4 mt-0.5" style={{ color: "#9ca3af" }}>
                {a.at ? new Date(a.at).toLocaleString() : ""}
              </span>
            </div>
          ))}
        </div>
        {total > 1 && (
          <div className="px-6 py-3 border-t shrink-0 flex items-center justify-between" style={{ borderColor: "#374151" }}>
            <span className="text-xs" style={{ color: "#9ca3af" }}>Page {page} of {total} · {entries.length} entries</span>
            <div className="flex items-center gap-1">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
                className="p-1 rounded disabled:opacity-30 hover:bg-white/10" style={{ color: "#9ca3af" }}>
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button onClick={() => setPage((p) => Math.min(total, p + 1))} disabled={page === total}
                className="p-1 rounded disabled:opacity-30 hover:bg-white/10" style={{ color: "#9ca3af" }}>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function EditorActivitySubTab({ editors, delegations }) {
  const [selected, setSelected] = useState(null);
  const [log, setLog] = useState(null);
  const [fetching, setFetching] = useState(false);
  const [modalSerial, setModalSerial] = useState(null);
  const [epSubTab, setEpSubTab] = useState("submitted");

  const handleSelect = async (uid) => {
    if (selected === uid) { setSelected(null); setLog(null); return; }
    setSelected(uid);
    setLog(null);
    setEpSubTab("submitted");
    setFetching(true);
    try { setLog(await api.editorActivity(uid)); } catch (_) {}
    finally { setFetching(false); }
  };

  const auditSerials = log?.by_serial?.map((g) => g.serial) || [];
  const delegMap = Object.fromEntries((log?.delegations || []).map((d) => [d.serial_name, d]));
  const extraSerials = (log?.delegations || []).filter((d) => !auditSerials.includes(d.serial_name)).map((d) => d.serial_name);
  const allSerials = [...auditSerials, ...extraSerials];
  const modalGroup = modalSerial
    ? (log?.by_serial?.find((g) => g.serial === modalSerial) || { serial: modalSerial, count: 0, entries: [] })
    : null;

  const submittedEntries = (log?.by_serial || [])
    .flatMap((g) => g.entries.filter((e) => e.action === "submit").map((e) => ({ ...e, serial: g.serial })))
    .sort((a, b) => new Date(b.at) - new Date(a.at));

  const episodeStats = log?.episode_stats || {};
  const totalApproved = Object.values(episodeStats).reduce((s, v) => s + (v.approved || 0), 0);

  const TH = "text-[10px] uppercase tracking-wider font-semibold";
  const thStyle = { borderColor: C.mint4, background: C.mint4 + "33", color: C.sub };
  const rowStyle = { borderColor: C.mint4 + "55" };

  return (
    <>
      {modalGroup && (
        <SerialLogModal serial={modalGroup.serial} entries={modalGroup.entries}
          deleg={delegMap[modalGroup.serial] || null} onClose={() => setModalSerial(null)} />
      )}
      <div className="grid grid-cols-3 gap-6">
        {/* Left: editor list */}
        <div className="rounded-xl border overflow-hidden" style={{ background: C.white, borderColor: C.mint1 + "44" }}>
          <div className="px-4 py-3 border-b text-xs font-semibold uppercase tracking-wider"
            style={{ borderColor: C.mint4, background: C.mint4 + "66", color: C.sub }}>
            Editors ({editors.length})
          </div>
          {editors.length === 0 && <div className="p-6 text-sm text-center" style={{ color: C.sub }}>No editors</div>}
          {editors.map((e) => (
            <button key={e.id} onClick={() => handleSelect(e.id)}
              className="w-full text-left px-4 py-3 border-b last:border-0 text-sm hover:bg-green-50/40 transition"
              style={{ borderColor: C.mint4 + "55", background: selected === e.id ? C.mint4 + "99" : undefined, color: C.dark }}>
              <div className="font-medium">{e.full_name}</div>
              <div className="text-xs" style={{ color: C.sub }}>{e.email}</div>
              <div className="text-xs mt-0.5" style={{ color: C.sub }}>
                {delegations.filter((d) => d.assigned_to === e.id).length} assigned
              </div>
            </button>
          ))}
        </div>

        {/* Right: 3-tab detail */}
        <div className="col-span-2">
          <div className="mb-3 text-xs font-semibold uppercase tracking-wider" style={{ color: C.sub }}>
            {log?.user ? `Activity — ${log.user.full_name}` : "Select an editor to view activity"}
          </div>

          {!selected && (
            <div className="rounded-xl border p-10 text-center text-sm" style={{ background: C.white, borderColor: C.mint1 + "44", color: C.sub }}>
              Select an editor from the list
            </div>
          )}
          {selected && fetching && (
            <div className="rounded-xl border p-10 text-center text-sm" style={{ background: C.white, borderColor: C.mint1 + "44", color: C.sub }}>Loading…</div>
          )}

          {selected && !fetching && log && (
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
                    <div className="px-4 py-3 border-b grid grid-cols-5 gap-2 text-[10px] font-semibold uppercase tracking-wider"
                      style={thStyle}>
                      <span className="col-span-2">Serial / Work</span>
                      <span className="text-center">Target</span>
                      <span className="text-center">Done</span>
                      <span className="text-right">Log</span>
                    </div>
                    {allSerials.map((serial) => {
                      const group = log?.by_serial?.find((g) => g.serial === serial) || { serial, count: 0, entries: [] };
                      const deleg = delegMap[serial] || null;
                      const ss = ACT_STATUS[deleg?.status] || ACT_STATUS.pending;
                      return (
                        <div key={serial} className="px-4 py-3 border-b last:border-0 grid grid-cols-5 gap-2 items-center hover:bg-green-50/20"
                          style={rowStyle}>
                          <div className="col-span-2">
                            <div className="font-medium text-sm" style={{ color: C.dark }}>{serial}</div>
                            <div className="flex items-center gap-2 mt-0.5">
                              {deleg && <span className="text-[10px] px-1.5 py-0.5 rounded font-medium" style={{ background: ss.bg, color: ss.color }}>{ss.label}</span>}
                              {deleg?.episode_range && <span className="text-[10px]" style={{ color: C.sub }}>{deleg.episode_range}</span>}
                            </div>
                          </div>
                          <div className="text-center text-sm font-medium" style={{ color: C.dark }}>{deleg?.week_target ?? "—"}</div>
                          <div className="text-center text-sm font-medium" style={{ color: C.ok }}>{deleg?.completed ?? "—"}</div>
                          <div className="text-right">
                            <button onClick={() => setModalSerial(serial)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium hover:opacity-90"
                              style={{ background: C.dark, color: C.mint4 }}>
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

function WDActivitySubTab({ wdUsers, delegations }) {
  const [selected, setSelected] = useState(null);
  const myDelegations = selected ? delegations.filter((d) => d.created_by === selected) : [];

  return (
    <div className="grid grid-cols-3 gap-6">
      <div className="rounded-xl border overflow-hidden" style={{ background: C.white, borderColor: C.mint1 + "44" }}>
        <div className="px-4 py-3 border-b text-xs font-semibold uppercase tracking-wider"
          style={{ borderColor: C.mint4, background: C.mint4 + "66", color: C.sub }}>
          Work Delegators ({wdUsers.length})
        </div>
        {wdUsers.length === 0 && <div className="p-6 text-sm text-center" style={{ color: C.sub }}>No work delegators</div>}
        {wdUsers.map((u) => {
          const count = delegations.filter((d) => d.created_by === u.id).length;
          return (
            <button key={u.id} onClick={() => setSelected(u.id === selected ? null : u.id)}
              className="w-full text-left px-4 py-3 border-b last:border-0 text-sm hover:bg-green-50/40 transition"
              style={{ borderColor: C.mint4 + "55", background: selected === u.id ? C.mint4 + "99" : undefined, color: C.dark }}>
              <div className="font-medium">{u.full_name}</div>
              <div className="text-xs" style={{ color: C.sub }}>{u.email}</div>
              <div className="text-xs mt-0.5" style={{ color: C.sub }}>{count} delegation{count !== 1 ? "s" : ""} created</div>
            </button>
          );
        })}
      </div>

      <div className="col-span-2">
        {!selected && (
          <div className="rounded-xl border p-10 text-center text-sm" style={{ background: C.white, borderColor: C.mint1 + "44", color: C.sub }}>
            Select a work delegator to view their assignments
          </div>
        )}
        {selected && (
          <div className="space-y-4">
            <div className="grid grid-cols-4 gap-3">
              <div className="rounded-xl border p-3 text-center" style={{ background: C.white, borderColor: C.mint1 + "44" }}>
                <div className="text-2xl font-bold" style={{ color: C.dark }}>{myDelegations.length}</div>
                <div className="text-xs mt-0.5" style={{ color: C.sub }}>Total</div>
              </div>
              {["pending", "in_progress", "completed"].map((s) => {
                const ss = ACT_STATUS[s];
                return (
                  <div key={s} className="rounded-xl border p-3 text-center" style={{ background: ss.bg + "66", borderColor: ss.color + "44" }}>
                    <div className="text-2xl font-bold" style={{ color: ss.color }}>
                      {myDelegations.filter((d) => d.status === s).length}
                    </div>
                    <div className="text-xs mt-0.5" style={{ color: ss.color }}>{ss.label}</div>
                  </div>
                );
              })}
            </div>

            <div className="rounded-xl border overflow-hidden" style={{ background: C.white, borderColor: C.mint1 + "44" }}>
              {myDelegations.length === 0 ? (
                <div className="p-10 text-center text-sm" style={{ color: C.sub }}>No delegations created yet</div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-[10px] uppercase tracking-wider"
                      style={{ borderColor: C.mint4, color: C.sub, background: C.mint4 + "33" }}>
                      <th className="text-left px-4 py-2">Serial</th>
                      <th className="text-left px-4 py-2">Assigned To</th>
                      <th className="text-left px-4 py-2">Range</th>
                      <th className="text-center px-4 py-2">Target</th>
                      <th className="text-center px-4 py-2">Done</th>
                      <th className="text-left px-4 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {myDelegations.map((d) => {
                      const ss = ACT_STATUS[d.status] || ACT_STATUS.pending;
                      return (
                        <tr key={d.id} className="border-b last:border-0 hover:bg-green-50/30 transition"
                          style={{ borderColor: C.mint4 + "55" }}>
                          <td className="px-4 py-3">
                            <div className="font-medium" style={{ color: C.dark }}>{d.serial_name}</div>
                            {d.channel && <div className="text-[10px]" style={{ color: C.sub }}>{d.channel}</div>}
                          </td>
                          <td className="px-4 py-3 text-sm" style={{ color: C.dark }}>{d.assigned_to_name || "—"}</td>
                          <td className="px-4 py-3 text-xs" style={{ color: C.sub }}>{d.episode_range || "—"}</td>
                          <td className="px-4 py-3 text-center font-medium" style={{ color: C.dark }}>{d.week_target ?? "—"}</td>
                          <td className="px-4 py-3 text-center font-medium" style={{ color: C.ok }}>{d.completed}</td>
                          <td className="px-4 py-3">
                            <span className="text-[10px] px-2 py-0.5 rounded font-medium" style={{ background: ss.bg, color: ss.color }}>
                              {ss.label}
                            </span>
                          </td>
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

function ReviewerActivitySubTab({ reviewers }) {
  const [selected, setSelected] = useState(null);
  const [log, setLog] = useState(null);
  const [fetching, setFetching] = useState(false);

  const handleSelect = async (uid) => {
    if (selected === uid) { setSelected(null); setLog(null); return; }
    setSelected(uid);
    setLog(null);
    setFetching(true);
    try { setLog(await api.editorActivity(uid)); } catch (_) {}
    finally { setFetching(false); }
  };

  const REVIEW_ACTIONS = new Set(["approve", "reject", "suggest"]);

  // Flatten all review entries across serials, keeping serial name + episode number
  const reviewActivity = (log?.by_serial || [])
    .flatMap((g) => g.entries
      .filter((e) => REVIEW_ACTIONS.has(e.action?.toLowerCase()))
      .map((e) => ({ ...e, serial: g.serial }))
    )
    .sort((a, b) => new Date(b.at) - new Date(a.at));

  const approved  = reviewActivity.filter((a) => a.action === "approve").length;
  const rejected  = reviewActivity.filter((a) => a.action === "reject").length;
  const suggested = reviewActivity.filter((a) => a.action === "suggest").length;

  // Strip redundant prefix from details for cleaner display
  const cleanNote = (details, action) => {
    if (!details) return null;
    return details
      .replace(/^Approved episode\.?\s*/i, "")
      .replace(/^Rejected\s*[—-]\s*/i, "")
      .replace(/^Suggested changes\s*[—-]\s*/i, "")
      .trim() || null;
  };

  const TH = "text-[10px] uppercase tracking-wider font-semibold";
  const thStyle = { borderColor: C.mint4, background: C.mint4 + "33", color: C.sub };

  return (
    <div className="grid grid-cols-3 gap-6">
      <div className="rounded-xl border overflow-hidden" style={{ background: C.white, borderColor: C.mint1 + "44" }}>
        <div className="px-4 py-3 border-b text-xs font-semibold uppercase tracking-wider"
          style={{ borderColor: C.mint4, background: C.mint4 + "66", color: C.sub }}>
          Reviewers ({reviewers.length})
        </div>
        {reviewers.length === 0 && <div className="p-6 text-sm text-center" style={{ color: C.sub }}>No reviewers</div>}
        {reviewers.map((r) => (
          <button key={r.id} onClick={() => handleSelect(r.id)}
            className="w-full text-left px-4 py-3 border-b last:border-0 text-sm hover:bg-green-50/40 transition"
            style={{ borderColor: C.mint4 + "55", background: selected === r.id ? C.mint4 + "99" : undefined, color: C.dark }}>
            <div className="font-medium">{r.full_name}</div>
            <div className="text-xs" style={{ color: C.sub }}>{r.email}</div>
          </button>
        ))}
      </div>

      <div className="col-span-2">
        {!selected && (
          <div className="rounded-xl border p-10 text-center text-sm" style={{ background: C.white, borderColor: C.mint1 + "44", color: C.sub }}>
            Select a reviewer to view their activity
          </div>
        )}
        {selected && fetching && (
          <div className="rounded-xl border p-10 text-center text-sm" style={{ background: C.white, borderColor: C.mint1 + "44", color: C.sub }}>Loading…</div>
        )}
        {selected && !fetching && log && (
          <div className="space-y-4">
            {/* Stat cards */}
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-xl border p-3 text-center" style={{ background: "#E8F5E9", borderColor: "#A5D6A7" }}>
                <div className="text-2xl font-bold" style={{ color: "#2E7D32" }}>{approved}</div>
                <div className="text-xs mt-0.5" style={{ color: "#2E7D32" }}>Approved</div>
              </div>
              <div className="rounded-xl border p-3 text-center" style={{ background: "#FFEBEE", borderColor: "#EF9A9A" }}>
                <div className="text-2xl font-bold" style={{ color: "#C62828" }}>{rejected}</div>
                <div className="text-xs mt-0.5" style={{ color: "#C62828" }}>Rejected</div>
              </div>
              <div className="rounded-xl border p-3 text-center" style={{ background: "#E3F2FD", borderColor: "#90CAF9" }}>
                <div className="text-2xl font-bold" style={{ color: "#1565C0" }}>{suggested}</div>
                <div className="text-xs mt-0.5" style={{ color: "#1565C0" }}>Suggestions</div>
              </div>
            </div>

            {/* Detailed table */}
            {reviewActivity.length === 0 ? (
              <div className="rounded-xl border p-8 text-center text-sm" style={{ background: C.white, borderColor: C.mint1 + "44", color: C.sub }}>
                No review actions found
              </div>
            ) : (
              <div className="rounded-xl border overflow-hidden" style={{ background: C.white, borderColor: C.mint1 + "44" }}>
                <div className="px-4 py-2.5 border-b text-xs font-semibold uppercase tracking-wider"
                  style={{ borderColor: C.mint4, background: C.mint4 + "33", color: C.sub }}>
                  {reviewActivity.length} review action{reviewActivity.length !== 1 ? "s" : ""}
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b" style={thStyle}>
                      <th className={`text-left px-4 py-2 ${TH}`}>Serial</th>
                      <th className={`text-center px-4 py-2 ${TH}`}>Ep #</th>
                      <th className={`text-left px-4 py-2 ${TH}`}>Action</th>
                      <th className={`text-left px-4 py-2 ${TH}`}>Note / Suggestion</th>
                      <th className={`text-right px-4 py-2 ${TH}`}>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reviewActivity.map((a) => {
                      const as = ACT_ACTION[a.action] || { bg: "#F3F4F6", color: "#374151" };
                      const note = cleanNote(a.details, a.action);
                      return (
                        <tr key={a.id} className="border-b last:border-0 hover:bg-green-50/20"
                          style={{ borderColor: C.mint4 + "55" }}>
                          <td className="px-4 py-2.5 font-medium max-w-[140px] truncate" style={{ color: C.dark }} title={a.serial}>
                            {a.serial}
                          </td>
                          <td className="px-4 py-2.5 text-center font-mono text-xs" style={{ color: C.dark }}>
                            {a.episode_number != null ? String(a.episode_number).padStart(2, "0") : "—"}
                          </td>
                          <td className="px-4 py-2.5">
                            <span className="text-[10px] px-2 py-0.5 rounded font-medium capitalize"
                              style={{ background: as.bg, color: as.color }}>{a.action}</span>
                          </td>
                          <td className="px-4 py-2.5 text-xs max-w-[180px]" style={{ color: C.sub }}>
                            {note ? (
                              <span className="italic" title={note}>
                                {note.length > 60 ? note.slice(0, 60) + "…" : note}
                              </span>
                            ) : (
                              <span style={{ color: C.mint4 + "99" }}>—</span>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-right text-xs whitespace-nowrap" style={{ color: C.sub }}>
                            {a.at ? new Date(a.at).toLocaleString() : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ActivityTab() {
  const [roleTab, setRoleTab] = useState("editors");
  const [users, setUsers] = useState([]);
  const [delegations, setDelegations] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.listUsers(), api.listDelegations()])
      .then(([u, d]) => { setUsers(u); setDelegations(d); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const editors   = users.filter((u) => u.role === "editor");
  const wdUsers   = users.filter((u) => u.role === "work_delegator");
  const reviewers = users.filter((u) => u.role === "reviewer");

  const roleTabs = [
    { key: "editors",   label: `Editors (${editors.length})`           },
    { key: "wds",       label: `Work Delegators (${wdUsers.length})`   },
    { key: "reviewers", label: `Reviewers (${reviewers.length})`       },
  ];

  if (loading) return <div className="p-8 text-center text-sm" style={{ color: C.sub }}>Loading…</div>;

  return (
    <div>
      <div className="flex gap-1 mb-6 p-1 rounded-xl w-fit" style={{ background: C.mint4 + "99" }}>
        {roleTabs.map((t) => (
          <button key={t.key} onClick={() => setRoleTab(t.key)}
            className="px-5 py-2 rounded-lg text-sm font-medium transition-all"
            style={{ background: roleTab === t.key ? C.dark : "transparent", color: roleTab === t.key ? C.mint4 : C.sub }}>
            {t.label}
          </button>
        ))}
      </div>
      {roleTab === "editors"   && <EditorActivitySubTab editors={editors} delegations={delegations} />}
      {roleTab === "wds"       && <WDActivitySubTab wdUsers={wdUsers} delegations={delegations} />}
      {roleTab === "reviewers" && <ReviewerActivitySubTab reviewers={reviewers} />}
    </div>
  );
}

export default function AdminDashboard() {
  const [tab, setTab] = useState("overview");

  const tabs = [
    { key: "overview",     label: "Overview"           },
    { key: "projects",     label: "Projects"           },
    { key: "delegations",  label: "Delegations"        },
    { key: "activity",     label: "Activity"           },
    { key: "users",        label: "Users"              },
    { key: "bgcomposer",   label: "BG Composer Search" },
  ];

  return (
    <DashboardShell title="Admin Dashboard" subtitle="Manage users, serials, and delegations" tabs={tabs} activeTab={tab} onTab={setTab}>
      {tab === "overview"    && <OverviewTab />}
      {tab === "projects"    && <ProjectsTab hideHeader />}
      {tab === "delegations" && <DelegationsTab />}
      {tab === "activity"    && <ActivityTab />}
      {tab === "users"       && <UsersTab />}
      {tab === "bgcomposer"  && <BGComposerTab />}
    </DashboardShell>
  );
}
