import { useEffect, useRef, useState } from "react";
import {
  Users, Tv, CheckCircle2, Clock, Search, X, Trash2,
  UserCog, Music2, FileText, ChevronLeft, ChevronRight,
  CalendarDays, History, ArrowLeft, Layers, ChevronDown, Film,
} from "lucide-react";
import { C, FONTS } from "../../styles/palette";
import DashboardShell from "./DashboardShell";
import ProjectsTab from "./ProjectsTab";
import { api, tokenStore } from "../../utils/api";
import { showAlert, showConfirm } from "../../components/Dialog";

const ROLES = ["admin", "work_delegator", "reviewer", "editor", "viewer"];
const ROLE_LABEL = {
  admin: "Admin", work_delegator: "Work Delegator",
  reviewer: "Reviewer", editor: "Editor", viewer: "Viewer",
};
const ROLE_COLOR = {
  admin:          { bg: "#EDE7F6", color: "#4527A0" },
  work_delegator: { bg: "#E3F2FD", color: "#1565C0" },
  reviewer:       { bg: "#E8F5E9", color: "#2E7D32" },
  editor:         { bg: "#FFF3E0", color: "#E65100" },
  viewer:         { bg: "#F3F4F6", color: "#374151" },
};

const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const MONTH_FULL  = ["January","February","March","April","May","June","July","August","September","October","November","December"];

// ─── Shared mini pager ────────────────────────────────────────────────────────
const PG = 25;
function MiniPager({ entries, children, pageSize = PG }) {
  const [page, setPage] = useState(1);
  const total = Math.max(1, Math.ceil(entries.length / pageSize));
  const paged = entries.slice((page - 1) * pageSize, page * pageSize);
  return (
    <>
      {children(paged, (page - 1) * pageSize)}
      {total > 1 && (
        <div className="px-4 py-2 border-t flex items-center justify-between" style={{ borderColor: C.mint4 + "44" }}>
          <span className="text-xs" style={{ color: C.sub }}>Page {page}/{total} · {entries.length} entries</span>
          <div className="flex gap-1">
            <button onClick={() => setPage(1)} disabled={page === 1} className="px-1.5 py-0.5 text-xs rounded disabled:opacity-30 hover:bg-black/5" style={{ color: C.sub }}>«</button>
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="p-1 rounded disabled:opacity-30 hover:bg-black/5" style={{ color: C.sub }}><ChevronLeft className="w-3.5 h-3.5" /></button>
            <button onClick={() => setPage((p) => Math.min(total, p + 1))} disabled={page === total} className="p-1 rounded disabled:opacity-30 hover:bg-black/5" style={{ color: C.sub }}><ChevronRight className="w-3.5 h-3.5" /></button>
            <button onClick={() => setPage(total)} disabled={page === total} className="px-1.5 py-0.5 text-xs rounded disabled:opacity-30 hover:bg-black/5" style={{ color: C.sub }}>»</button>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Overview ─────────────────────────────────────────────────────────────────
function StatCard({ icon: Icon, label, value, sub, color, onClick }) {
  return (
    <div
      onClick={onClick}
      className={`rounded-xl border p-5 flex items-start gap-4 ${onClick ? "cursor-pointer hover:shadow-md hover:border-opacity-80 transition-all" : ""}`}
      style={{ background: C.white, borderColor: onClick ? (color || C.mint1) + "66" : C.mint1 + "44" }}
    >
      <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: (color || C.mint4) + "33" }}>
        <Icon className="w-5 h-5" style={{ color: color || C.dark }} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-2xl font-bold" style={{ color: color || C.dark }}>{value}</div>
        <div className="text-sm font-medium" style={{ color: C.dark }}>{label}</div>
        {sub && <div className="text-xs mt-0.5" style={{ color: C.sub }}>{sub}</div>}
      </div>
      {onClick && <ChevronRight className="w-4 h-4 shrink-0 mt-2" style={{ color: C.muted }} />}
    </div>
  );
}

// Enhanced overview calendar (uses reviewer-calendar which has all 6 metrics)
function OverviewCalendar() {
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: Math.max(1, currentYear - 2026 + 1) }, (_, i) => 2026 + i);
  const [selectedYear, setSelectedYear]   = useState(currentYear >= 2026 ? currentYear : 2026);
  const [calData, setCalData]             = useState(null);
  const [loading, setLoading]             = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(null);

  useEffect(() => {
    setLoading(true); setSelectedMonth(null);
    api.reviewerCalendar(selectedYear).then(setCalData).catch(() => setCalData(null)).finally(() => setLoading(false));
  }, [selectedYear]);

  const mTotal = (m) => {
    const d      = calData?.months?.[String(m)] ?? {};
    const target = (calData?.month_target?.[String(m)]) || 0;
    const sub    = d.submitted     || 0;
    const app    = d.approved      || 0;
    const soc    = d.society       || 0;
    const acc    = d.society_accepted || 0;
    const pend   = Math.max(0, sub - app);
    return { target, sub, app, pend, soc, acc };
  };
  const qTotal = (months) =>
    months.reduce((a, m) => { const t = mTotal(m); return { target: a.target+t.target, sub: a.sub+t.sub, app: a.app+t.app, pend: a.pend+t.pend, soc: a.soc+t.soc, acc: a.acc+t.acc }; },
      { target: 0, sub: 0, app: 0, pend: 0, soc: 0, acc: 0 });

  const quarters   = [[1,2,3,4],[5,6,7,8],[9,10,11,12]];
  const selData    = selectedMonth ? (calData?.months?.[String(selectedMonth)] ?? {}) : null;
  const selMt      = selectedMonth ? mTotal(selectedMonth) : null;
  const weekTgts   = selectedMonth ? (calData?.week_target?.[String(selectedMonth)] ?? {}) : {};

  return (
    <div className="rounded-xl border overflow-hidden" style={{ background: C.white, borderColor: C.mint1 + "44" }}>
      <div className="px-5 py-3 border-b flex items-center justify-between" style={{ borderColor: C.mint4, background: C.mint4 + "33" }}>
        <div className="font-semibold text-sm" style={{ fontFamily: FONTS.serif, color: C.dark }}>Activity Calendar</div>
        <div className="flex gap-1">
          {years.map((y) => (
            <button key={y} onClick={() => setSelectedYear(y)}
              className="px-3 py-1 rounded-lg text-xs font-semibold transition"
              style={{ background: selectedYear === y ? C.dark : C.mint4, color: selectedYear === y ? C.mint4 : C.sub }}>
              {y}
            </button>
          ))}
        </div>
      </div>

      <div className="p-4">
        {loading ? (
          <div className="py-6 text-center text-sm" style={{ color: C.sub }}>Loading…</div>
        ) : (
          <div className="space-y-2">
            {quarters.map((qMonths, qi) => {
              const qt = qTotal(qMonths);
              return (
                <div key={qi} className="flex gap-2 items-stretch">
                  {qMonths.map((m) => {
                    const mt          = mTotal(m);
                    const isSel       = selectedMonth === m;
                    const isCurrent   = selectedYear === new Date().getFullYear() && m === new Date().getMonth() + 1;
                    const hasActivity = mt.sub > 0 || mt.app > 0 || mt.soc > 0;
                    return (
                      <button key={m} onClick={() => setSelectedMonth(isSel ? null : m)}
                        className="flex-1 rounded-xl border p-2.5 text-left transition-all hover:shadow-sm"
                        style={{
                          background:  isSel ? C.dark : isCurrent ? C.mint4 + "cc" : C.white,
                          borderColor: isSel ? C.mint1 : isCurrent ? C.mint1 : hasActivity ? C.mint1 + "77" : C.mint1 + "33",
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
                        <div className="grid grid-cols-3 gap-x-2 gap-y-1.5">
                          {[
                            { v: mt.target, l: "Tgt",  c: isSel ? "#fde68a" : "#E65100" },
                            { v: mt.sub,    l: "Sub",  c: isSel ? C.mint4   : C.dark    },
                            { v: mt.app,    l: "Rev",  c: isSel ? "#86efac" : C.ok      },
                            { v: mt.pend,   l: "Pend", c: isSel ? "#fca5a5" : C.danger  },
                            { v: mt.soc,    l: "Soc",  c: isSel ? "#d8b4fe" : "#7B1FA2" },
                            { v: mt.acc,    l: "Acc",  c: isSel ? "#6ee7b7" : "#0D9488" },
                          ].map(({ v, l, c }) => (
                            <div key={l}>
                              <div className="text-sm font-bold leading-none" style={{ color: c }}>{v}</div>
                              <div className="text-[9px] font-semibold uppercase mt-0.5" style={{ color: c + "bb" }}>{l}</div>
                            </div>
                          ))}
                        </div>
                      </button>
                    );
                  })}
                  {/* Quarter */}
                  <div className="w-20 shrink-0 rounded-xl border p-2.5 flex flex-col justify-center"
                    style={{ background: C.mint4 + "33", borderColor: C.mint4 + "55" }}>
                    <div className="text-[10px] font-bold uppercase tracking-widest mb-1.5 text-center" style={{ color: C.sub }}>Q{qi+1}</div>
                    <div className="grid grid-cols-2 gap-1 text-center">
                      {[
                        { v: qt.target, c: "#E65100", l: "Tgt"  },
                        { v: qt.sub,    c: C.dark,    l: "Sub"  },
                        { v: qt.app,    c: C.ok,      l: "Rev"  },
                        { v: qt.pend,   c: C.danger,  l: "Pend" },
                        { v: qt.soc,    c: "#7B1FA2", l: "Soc"  },
                        { v: qt.acc,    c: "#0D9488", l: "Acc"  },
                      ].map(({ v, c, l }) => (
                        <div key={l}>
                          <div className="text-sm font-bold" style={{ color: c }}>{v}</div>
                          <div className="text-[9px] font-semibold uppercase mt-0.5" style={{ color: c + "aa" }}>{l}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Legend */}
        <div className="mt-3 flex gap-4 flex-wrap pt-3 border-t" style={{ borderColor: C.mint4 + "55" }}>
          {[
            { l: "Target",      c: "#E65100" }, { l: "Submitted",     c: C.dark    },
            { l: "Reviewed",    c: C.ok      }, { l: "Pending",       c: C.danger  },
            { l: "To Society",  c: "#7B1FA2" }, { l: "Soc. Accepted", c: "#0D9488" },
          ].map(({ l, c }) => (
            <div key={l} className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full" style={{ background: c }} />
              <span className="text-[10px]" style={{ color: C.sub }}>{l}</span>
            </div>
          ))}
        </div>

        {/* Month detail */}
        {selectedMonth && selData !== null && selMt && (
          <div className="mt-4 rounded-xl border overflow-hidden" style={{ borderColor: C.mint1 + "44" }}>
            <div className="px-4 py-3 border-b flex items-center justify-between"
              style={{ borderColor: C.mint4, background: C.mint4 + "33" }}>
              <div className="font-semibold text-sm" style={{ color: C.dark }}>
                {MONTH_FULL[selectedMonth - 1]} {selectedYear}
              </div>
              <div className="flex gap-4 flex-wrap justify-end">
                {[
                  { l: "Target",      v: selMt.target, c: "#E65100" },
                  { l: "Submitted",   v: selMt.sub,    c: C.dark    },
                  { l: "Reviewed",    v: selMt.app,    c: C.ok      },
                  { l: "Pending",     v: selMt.pend,   c: C.danger  },
                  { l: "To Society",  v: selMt.soc,    c: "#7B1FA2" },
                  { l: "Soc. Accepted", v: selMt.acc,  c: "#0D9488" },
                ].map(({ l, v, c }) => (
                  <div key={l} className="text-center">
                    <div className="text-base font-bold" style={{ color: c }}>{v}</div>
                    <div className="text-[10px] font-semibold uppercase tracking-wide mt-0.5" style={{ color: c + "bb" }}>{l}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="p-4">
              <div className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: C.sub }}>Weekly Breakdown</div>
              {Object.entries(selData.weeks || {}).length === 0 ? (
                <div className="text-xs text-center py-3" style={{ color: C.sub }}>No weekly data</div>
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b" style={{ borderColor: C.mint4 + "88" }}>
                      {["Week","Target","Submitted","Reviewed","Pending"].map((h) => (
                        <th key={h} className="text-left pb-2 pr-6 font-semibold uppercase tracking-wide" style={{ color: C.sub }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(selData.weeks || {}).sort(([a],[b]) => +a - +b).map(([wk, wd]) => {
                      const wSub  = wd.submitted || 0;
                      const wApp  = wd.approved  || 0;
                      const wTgt  = weekTgts[wk]  || 0;
                      const wPend = Math.max(0, wSub - wApp);
                      return (
                        <tr key={wk} className="border-b last:border-0" style={{ borderColor: C.mint4 + "44" }}>
                          <td className="py-2 pr-6 font-semibold" style={{ color: C.dark }}>Week {wk}</td>
                          <td className="py-2 pr-6 font-bold" style={{ color: "#E65100" }}>{wTgt || "—"}</td>
                          <td className="py-2 pr-6 font-bold" style={{ color: C.dark }}>{wSub}</td>
                          <td className="py-2 pr-6 font-bold" style={{ color: C.ok }}>{wApp}</td>
                          <td className="py-2 font-bold" style={{ color: wPend > 0 ? C.danger : C.ok }}>{wPend}</td>
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

function OverviewTab({ navigate }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => { api.projectStats().then(setStats).catch(() => {}).finally(() => setLoading(false)); }, []);
  if (loading) return <div className="p-8 text-center text-sm" style={{ color: C.sub }}>Loading…</div>;
  if (!stats)  return <div className="p-8 text-center text-sm" style={{ color: C.danger }}>Failed to load stats</div>;
  const totalUsers = Object.values(stats.users_by_role).reduce((a, b) => a + b, 0);
  return (
    <div className="space-y-6">
      {/* Top stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
        <StatCard icon={Tv}           label="Total Serials"  value={stats.total_serials ?? stats.total_projects}
          onClick={() => navigate("projects", { projectSubTab: "serial" })} />
        <StatCard icon={Film}         label="Total Movies"   value={stats.total_movies ?? 0} color="#7B1FA2"
          onClick={() => navigate("projects", { projectSubTab: "movie" })} />
        <StatCard icon={CheckCircle2} label="Approved"       value={stats.episodes.approved}  sub="episodes" color={C.ok}
          onClick={() => navigate("activity", { activityTab: "editors" })} />
        <StatCard icon={Clock}        label="Pending Review" value={stats.episodes.submitted} sub="episodes" color={C.warn}
          onClick={() => navigate("activity", { activityTab: "editors" })} />
        <StatCard icon={Users}        label="Total Users"    value={totalUsers}
          onClick={() => navigate("users")} />
        <StatCard icon={FileText}     label="Clients"        value="View" color="#1565C0"
          onClick={() => navigate("activity", { activityTab: "clients" })} />
      </div>

      {/* Episodes by Status + Users by Role */}
      <div className="grid grid-cols-2 gap-6">
        <div className="rounded-xl border p-5" style={{ background: C.white, borderColor: C.mint1 + "44" }}>
          <h4 className="font-semibold mb-4" style={{ fontFamily: FONTS.serif }}>Episodes by Status</h4>
          {[
            { label: "Approved",  val: stats.episodes.approved,  color: C.ok,      tab: "activity", activityTab: "editors" },
            { label: "Submitted", val: stats.episodes.submitted, color: "#7B1FA2", tab: "activity", activityTab: "editors" },
            { label: "Rejected",  val: stats.episodes.rejected,  color: C.danger,  tab: "activity", activityTab: "editors" },
            { label: "Pending",   val: stats.episodes.pending,   color: C.sub,     tab: "activity", activityTab: "editors" },
          ].map((r) => (
            <div key={r.label}
              onClick={() => navigate(r.tab, { activityTab: r.activityTab })}
              className="flex items-center justify-between py-2 border-b last:border-0 cursor-pointer hover:bg-green-50/30 rounded px-2 -mx-2 transition"
              style={{ borderColor: C.mint4 + "55" }}>
              <span className="text-sm" style={{ color: C.dark }}>{r.label}</span>
              <div className="flex items-center gap-2">
                <span className="font-bold" style={{ color: r.color }}>{r.val}</span>
                <ChevronRight className="w-3.5 h-3.5" style={{ color: C.muted }} />
              </div>
            </div>
          ))}
        </div>
        <div className="rounded-xl border p-5" style={{ background: C.white, borderColor: C.mint1 + "44" }}>
          <h4 className="font-semibold mb-4" style={{ fontFamily: FONTS.serif }}>Users by Role</h4>
          {ROLES.map((r) => (
            <div key={r}
              onClick={() => navigate("users", { usersRoleFilter: r })}
              className="flex items-center justify-between py-2 border-b last:border-0 cursor-pointer hover:bg-green-50/30 rounded px-2 -mx-2 transition"
              style={{ borderColor: C.mint4 + "55" }}>
              <span className="text-xs px-2 py-0.5 rounded font-medium" style={{ background: ROLE_COLOR[r]?.bg, color: ROLE_COLOR[r]?.color }}>{ROLE_LABEL[r]}</span>
              <div className="flex items-center gap-2">
                <span className="font-bold" style={{ color: C.dark }}>{stats.users_by_role[r] || 0}</span>
                <ChevronRight className="w-3.5 h-3.5" style={{ color: C.muted }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Enhanced Activity Calendar */}
      <OverviewCalendar />
    </div>
  );
}

// ─── Users tab (with role filter tabs) ───────────────────────────────────────
function UsersTab({ initialRoleFilter = "all" }) {
  const [users, setUsers]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [searchQ, setSearchQ]   = useState("");
  const [creating, setCreating] = useState(false);
  const [form, setForm]         = useState({ email: "", full_name: "", password: "", role: "editor" });
  const [saving, setSaving]     = useState(false);
  const [roleFilter, setRoleFilter] = useState(initialRoleFilter);

  useEffect(() => { api.listUsers().then(setUsers).catch(() => {}).finally(() => setLoading(false)); }, []);

  const handleRoleChange = async (uid, role) => {
    try { const u = await api.updateUserRole(uid, role); setUsers((p) => p.map((x) => x.id === uid ? u : x)); }
    catch (ex) { await showAlert(ex.message, { variant: "error" }); }
  };
  const handleToggleActive = async (uid, is_active) => {
    try { const u = await api.toggleUserActive(uid, is_active); setUsers((p) => p.map((x) => x.id === uid ? u : x)); }
    catch (ex) { await showAlert(ex.message, { variant: "error" }); }
  };
  const handleDelete = async (uid, name) => {
    const ok = await showConfirm(
      `Delete user "${name}"?\n\n` +
      `This removes their notifications and work delegations, and detaches their activity history.\n\n` +
      `A user can only be deleted if they don't own any projects or society submissions. ` +
      `If they do, reassign or delete those first.`,
      { variant: "danger", confirmLabel: "Delete" }
    );
    if (!ok) return;
    try {
      await api.deleteUser(uid);
      setUsers((p) => p.filter((x) => x.id !== uid));
    } catch (ex) {
      // Backend returns a 409 with the exact blocker (e.g. "still owns N project(s)").
      await showAlert(`Couldn't delete "${name}".\n\n${ex.message}`, { variant: "error" });
    }
  };
  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.email || !form.full_name || !form.password) return;
    setSaving(true);
    try {
      const res = await fetch(`${api.base || ""}/api/users/`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenStore.get()}` },
        body: JSON.stringify(form),
      });
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.detail || `${res.status}`); }
      const newU = await res.json();
      setUsers((p) => [...p, newU]);
      setForm({ email: "", full_name: "", password: "", role: "editor" });
      setCreating(false);
    } catch (ex) { await showAlert(ex.message || "Create failed", { variant: "error" }); }
    finally { setSaving(false); }
  };

  const roleTabs = [
    { key: "all", label: "All" },
    ...ROLES.map((r) => ({ key: r, label: ROLE_LABEL[r] })),
  ];

  const byRole = roleFilter === "all" ? users : users.filter((u) => u.role === roleFilter);
  const filtered = byRole.filter((u) => {
    const q = searchQ.trim().toLowerCase();
    return !q || u.full_name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
  });

  const inp = "px-3 py-2 rounded-lg text-sm border focus:outline-none";
  const inpStyle = { borderColor: C.mint1 + "44", color: C.dark };

  return (
    <div>
      {/* Role filter tabs */}
      <div className="flex gap-1 mb-4 p-1 rounded-xl w-fit" style={{ background: C.mint4 + "66" }}>
        {roleTabs.map((t) => {
          const count = t.key === "all" ? users.length : users.filter((u) => u.role === t.key).length;
          return (
            <button key={t.key} onClick={() => setRoleFilter(t.key)}
              className="px-4 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5"
              style={{ background: roleFilter === t.key ? C.dark : "transparent", color: roleFilter === t.key ? C.mint4 : C.sub }}>
              {t.label}
              <span className="text-[10px] opacity-70">({count})</span>
            </button>
          );
        })}
      </div>

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
            <input value={form.full_name} onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))} placeholder="Full name" className={inp} style={inpStyle} />
            <input value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="Email" type="email" className={inp} style={inpStyle} />
            <input value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} placeholder="Password" type="password" className={inp} style={inpStyle} />
            <select value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))} className={inp} style={inpStyle}>
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
            {!loading && filtered.length === 0 && (
              <tr><td colSpan={5} className="px-5 py-8 text-center text-sm" style={{ color: C.sub }}>
                {roleFilter === "all" ? "No users found" : `No ${ROLE_LABEL[roleFilter]}s found`}
              </td></tr>
            )}
            {filtered.map((u) => (
              <tr key={u.id} className="border-b last:border-0 hover:bg-green-50/30" style={{ borderColor: C.mint4 + "55" }}>
                <td className="px-5 py-3 font-medium" style={{ color: C.dark }}>{u.full_name}</td>
                <td className="px-5 py-3 text-xs" style={{ color: C.sub }}>{u.email}</td>
                <td className="px-5 py-3">
                  <select value={u.role} onChange={(e) => handleRoleChange(u.id, e.target.value)}
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

// ─── BG Composer ──────────────────────────────────────────────────────────────
function BGComposerTab() {
  const [q, setQ]               = useState("");
  const [results, setResults]   = useState([]);
  const [loading, setLoading]   = useState(false);
  const [searched, setSearched] = useState(false);
  const [searchedQ, setSearchedQ] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [showSug, setShowSug]   = useState(false);
  const [resTab, setResTab]     = useState("serial");
  const debounceRef             = useRef(null);

  const fetchSuggestions = (val) => {
    clearTimeout(debounceRef.current);
    if (!val.trim()) { setSuggestions([]); setShowSug(false); return; }
    debounceRef.current = setTimeout(async () => {
      try {
        const r = await api.searchByBgComposer(val);
        // Extract unique composer names from results
        const names = [...new Set(r.map((x) => x.bg_music_composer).filter(Boolean))].sort();
        setSuggestions(names);
        setShowSug(names.length > 0);
      } catch (_) {}
    }, 280);
  };

  const search = async (overrideQ) => {
    const term = (overrideQ ?? q).trim();
    if (!term) return;
    setQ(term);
    setShowSug(false);
    setSuggestions([]);
    setLoading(true);
    try {
      const r = await api.searchByBgComposer(term);
      setResults(r);
      setSearched(true);
      setSearchedQ(term);
      setResTab("serial");
    } catch (_) {}
    finally { setLoading(false); }
  };

  const serialResults = results.filter((r) => (r.type || "").toUpperCase() !== "MOVIE");
  const movieResults  = results.filter((r) => (r.type || "").toUpperCase() === "MOVIE");

  const ResultTable = ({ rows }) => (
    rows.length === 0 ? (
      <div className="p-8 text-center text-sm" style={{ color: C.sub }}>
        No {resTab === "movie" ? "movies" : "serials"} found for "{searchedQ}".
      </div>
    ) : (
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-[10px] uppercase tracking-wider"
            style={{ borderColor: C.mint4, color: C.sub, background: C.mint4 + "22" }}>
            <th className="text-left px-5 py-2">{resTab === "movie" ? "Movie" : "Serial"}</th>
            <th className="text-left px-5 py-2">BG Composer</th>
            <th className="text-left px-5 py-2">Language · Channel</th>
            <th className="text-center px-5 py-2">Episodes</th>
            <th className="text-center px-5 py-2">Approved</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b last:border-0 hover:bg-green-50/20"
              style={{ borderColor: C.mint4 + "55" }}>
              <td className="px-5 py-3 font-medium" style={{ color: C.dark }}>{r.title}</td>
              <td className="px-5 py-3" style={{ color: C.dark }}>{r.bg_music_composer}</td>
              <td className="px-5 py-3 text-xs" style={{ color: C.sub }}>
                {[r.language, r.channel_name].filter(Boolean).join(" · ") || "—"}
              </td>
              <td className="px-5 py-3 text-center" style={{ color: C.dark }}>{r.total_episodes}</td>
              <td className="px-5 py-3 text-center font-medium" style={{ color: C.ok }}>{r.approved_episodes}</td>
            </tr>
          ))}
        </tbody>
      </table>
    )
  );

  return (
    <div>
      {/* Search bar with suggestions */}
      <div className="flex items-center gap-3 mb-6">
        <div className="relative flex-1 max-w-md">
          <Music2 className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: C.sub }} />
          <input
            type="text" value={q}
            onChange={(e) => { setQ(e.target.value); fetchSuggestions(e.target.value); }}
            onKeyDown={(e) => e.key === "Enter" && search()}
            onFocus={() => suggestions.length > 0 && setShowSug(true)}
            onBlur={() => setTimeout(() => setShowSug(false), 150)}
            placeholder="Search by BG music composer name…"
            className="w-full pl-9 pr-3 py-2.5 text-sm rounded-xl border focus:outline-none"
            style={{ borderColor: C.mint1 + "44", background: C.white, color: C.dark }}
          />
          {/* Suggestions dropdown */}
          {showSug && suggestions.length > 0 && (
            <div className="absolute left-0 right-0 z-30 mt-1 rounded-xl shadow-xl overflow-hidden max-h-48 overflow-y-auto"
              style={{ background: C.white, border: `1px solid ${C.mint1}44` }}>
              {suggestions.map((name) => (
                <button key={name}
                  onMouseDown={() => { setQ(name); setShowSug(false); search(name); }}
                  className="w-full text-left px-4 py-2.5 text-sm hover:bg-green-50 transition flex items-center gap-2"
                  style={{ color: C.dark }}>
                  <Music2 className="w-3.5 h-3.5 shrink-0" style={{ color: C.mint1 }} />
                  {name}
                </button>
              ))}
            </div>
          )}
        </div>
        <button onClick={() => search()} disabled={loading}
          className="px-5 py-2.5 rounded-xl text-sm font-medium disabled:opacity-50"
          style={{ background: C.dark, color: C.mint4 }}>
          {loading ? "Searching…" : "Search"}
        </button>
      </div>

      {/* Results */}
      {searched && (
        <div className="rounded-2xl border overflow-hidden" style={{ background: C.white, borderColor: C.mint1 + "44" }}>
          {/* Header */}
          <div className="px-5 py-3 border-b flex items-center justify-between"
            style={{ borderColor: C.mint4, background: C.mint4 + "66" }}>
            <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: C.sub }}>
              {results.length} result{results.length !== 1 ? "s" : ""} for "{searchedQ}"
            </span>
            <div className="flex gap-3 text-xs" style={{ color: C.sub }}>
              <span>Serials: <strong style={{ color: C.dark }}>{serialResults.length}</strong></span>
              <span>Movies: <strong style={{ color: "#7B1FA2" }}>{movieResults.length}</strong></span>
            </div>
          </div>

          {results.length === 0 ? (
            <div className="p-8 text-center text-sm" style={{ color: C.sub }}>
              No projects found with BG music composer "{searchedQ}".
            </div>
          ) : (
            <>
              {/* Serial / Movie tabs */}
              <div className="flex border-b" style={{ borderColor: C.mint4 + "55" }}>
                {[
                  { key: "serial", label: `Serials (${serialResults.length})`, icon: Layers },
                  { key: "movie",  label: `Movies (${movieResults.length})`,   icon: Film   },
                ].map(({ key, label, icon: Icon }) => (
                  <button key={key} onClick={() => setResTab(key)}
                    className="flex items-center gap-1.5 px-5 py-2.5 text-xs font-medium transition-all"
                    style={{
                      color:        resTab === key ? C.dark : C.sub,
                      background:   resTab === key ? C.mint4 + "44" : "transparent",
                      borderBottom: resTab === key ? `2px solid ${C.dark}` : "2px solid transparent",
                    }}>
                    <Icon className="w-3.5 h-3.5" />{label}
                  </button>
                ))}
              </div>
              <ResultTable rows={resTab === "movie" ? movieResults : serialResults} />
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Delegations tab ──────────────────────────────────────────────────────────
function DelegationsTab() {
  const [delegations, setDelegations] = useState([]);
  const [loading, setLoading]         = useState(true);
  const [delTab, setDelTab]           = useState("serials");

  useEffect(() => { api.listDelegations().then(setDelegations).catch(() => {}).finally(() => setLoading(false)); }, []);

  const SS = {
    pending:     { bg: "#FFF3E0", color: "#E65100", label: "Pending"     },
    in_progress: { bg: "#E3F2FD", color: "#1565C0", label: "In Progress" },
    completed:   { bg: "#E8F5E9", color: "#2E7D32", label: "Completed"   },
  };
  const thStyle   = { borderColor: C.mint4, color: C.sub, background: C.mint4 + "22" };
  const TH        = "text-[10px] uppercase tracking-wider text-left px-4 py-2";
  const rowBorder = { borderColor: C.mint4 + "55" };

  const serialDeleg  = delegations.filter((d) => d.work_type !== "Movie Cue Sheet");
  const movieDeleg   = delegations.filter((d) => d.work_type === "Movie Cue Sheet");
  const currentDeleg = delTab === "movies" ? movieDeleg : serialDeleg;

  if (loading) return <div className="p-8 text-center text-sm" style={{ color: C.sub }}>Loading…</div>;

  return (
    <div>
      {/* Tabs + count */}
      <div className="flex items-center gap-4 mb-4">
        <div className="flex gap-1 p-1 rounded-xl" style={{ background: C.mint4 + "66" }}>
          {[
            { key: "serials", label: "Serials", icon: CalendarDays, count: serialDeleg.length },
            { key: "movies",  label: "Movies",  icon: Film,         count: movieDeleg.length  },
          ].map(({ key, label, icon: Icon, count }) => (
            <button key={key} onClick={() => setDelTab(key)}
              className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-medium transition-all"
              style={{ background: delTab === key ? C.dark : "transparent", color: delTab === key ? C.mint4 : C.sub }}>
              <Icon className="w-3.5 h-3.5" />{label}
              <span className="text-[10px] opacity-70">({count})</span>
            </button>
          ))}
        </div>
        <span className="text-xs" style={{ color: C.sub }}>
          {currentDeleg.length} {delTab === "movies" ? "movie" : "serial"} delegation{currentDeleg.length !== 1 ? "s" : ""}
        </span>
      </div>

      <div className="rounded-2xl border overflow-hidden" style={{ background: C.white, borderColor: C.mint1 + "44" }}>
        {currentDeleg.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm" style={{ color: C.sub }}>
            No {delTab === "movies" ? "movie" : "serial"} delegations yet
          </div>
        ) : (
          <MiniPager entries={currentDeleg} pageSize={20}>
            {(paged) => (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b" style={thStyle}>
                    <th className={TH}>{delTab === "movies" ? "Movie" : "Serial"}</th>
                    <th className={TH}>Assigned To</th>
                    <th className={TH}>Client</th>
                    {delTab === "serials" && <th className={TH}>Range</th>}
                    <th className="text-center px-4 py-2 text-[10px] uppercase tracking-wider">Target</th>
                    <th className="text-center px-4 py-2 text-[10px] uppercase tracking-wider">Done</th>
                    <th className={TH}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {paged.map((d) => {
                    const ss = SS[d.status] || SS.pending;
                    return (
                      <tr key={d.id} className="border-b last:border-0 hover:bg-green-50/30" style={rowBorder}>
                        <td className="px-4 py-3">
                          <div className="font-medium" style={{ color: C.dark }}>{d.serial_name}</div>
                          {d.channel && <div className="text-[10px]" style={{ color: C.sub }}>{d.channel}</div>}
                        </td>
                        <td className="px-4 py-3" style={{ color: C.dark }}>{d.assigned_to_name || "—"}</td>
                        <td className="px-4 py-3 text-xs" style={{ color: C.sub }}>{d.client || "—"}</td>
                        {delTab === "serials" && <td className="px-4 py-3 text-xs" style={{ color: C.sub }}>{d.episode_range || "—"}</td>}
                        <td className="px-4 py-3 text-center" style={{ color: C.dark }}>{d.week_target ?? "—"}</td>
                        <td className="px-4 py-3 text-center font-medium" style={{ color: C.ok }}>{d.completed}</td>
                        <td className="px-4 py-3">
                          <span className="text-[10px] px-2 py-0.5 rounded font-medium" style={{ background: ss.bg, color: ss.color }}>{ss.label}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </MiniPager>
        )}
      </div>
    </div>
  );
}

// ─── Activity tab ─────────────────────────────────────────────────────────────
const ACT_STATUS = {
  pending:     { bg: "#FFF3E0", color: "#E65100", label: "Pending"     },
  in_progress: { bg: "#E3F2FD", color: "#1565C0", label: "In Progress" },
  completed:   { bg: "#E8F5E9", color: "#2E7D32", label: "Completed"   },
};
const ACT_ACTION = {
  approve: { bg: "#E8F5E9", color: "#2E7D32" },
  reject:  { bg: "#FFEBEE", color: "#C62828" },
  suggest: { bg: "#E3F2FD", color: "#1565C0" },
};
const EP_STATUS_COLOR = {
  approved:  { bg: "#E8F5E9", color: "#2E7D32" },
  submitted: { bg: "#E3F2FD", color: "#1565C0" },
  rejected:  { bg: "#FFEBEE", color: "#C62828" },
  pending:   { bg: "#F3F4F6", color: "#6B7280" },
  unknown:   { bg: "#F3F4F6", color: "#6B7280" },
};

// ── Calendar (same logic as WD) ───────────────────────────────────────────────
function CalendarSubTab() {
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: Math.max(1, currentYear - 2026 + 1) }, (_, i) => 2026 + i);
  const [selectedYear, setSelectedYear]   = useState(currentYear >= 2026 ? currentYear : 2026);
  const [calData, setCalData]             = useState(null);
  const [loading, setLoading]             = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(null);

  useEffect(() => {
    setLoading(true); setSelectedMonth(null);
    api.activityCalendar(selectedYear).then(setCalData).catch(() => setCalData(null)).finally(() => setLoading(false));
  }, [selectedYear]);

  const mTotal = (m) => {
    const d = calData?.months?.[String(m)];
    return d ? { sub: d.submitted || 0, app: d.approved || 0 } : { sub: 0, app: 0 };
  };
  const qTotal = (ms) => ms.reduce((acc, m) => { const t = mTotal(m); return { sub: acc.sub + t.sub, app: acc.app + t.app }; }, { sub: 0, app: 0 });
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
                        style={{ background: isSel ? C.dark : C.white, borderColor: isSel ? C.mint1 : C.mint1 + "44" }}>
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

        {selectedMonth && selData && (
          <div className="mt-5 rounded-xl border overflow-hidden" style={{ background: C.white, borderColor: C.mint1 + "44" }}>
            <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: C.mint4, background: C.mint4 + "33" }}>
              <div className="font-semibold text-sm" style={{ color: C.dark }}>
                {MONTH_FULL[selectedMonth - 1]} {selectedYear}
                <span className="ml-3 text-xs font-normal" style={{ color: C.sub }}>{(selData.submitted || 0) + (selData.approved || 0)} total</span>
              </div>
              <div className="flex gap-4 text-xs" style={{ color: C.sub }}>
                <span>Submitted: <strong style={{ color: C.dark }}>{selData.submitted || 0}</strong></span>
                <span>Approved: <strong style={{ color: C.ok }}>{selData.approved || 0}</strong></span>
              </div>
            </div>
            <div className="grid grid-cols-2">
              <div className="p-4 border-r" style={{ borderColor: C.mint4 + "44" }}>
                <div className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: C.sub }}>Weekly Breakdown</div>
                {Object.entries(selData.weeks || {}).length === 0 ? (
                  <div className="text-xs" style={{ color: C.sub }}>No weekly data</div>
                ) : Object.entries(selData.weeks || {}).sort(([a],[b]) => parseInt(a)-parseInt(b)).map(([wk, wd]) => (
                  <div key={wk} className="py-2 border-b last:border-0" style={{ borderColor: C.mint4 + "33" }}>
                    <div className="flex items-center gap-3 text-xs">
                      <span className="w-12 font-semibold" style={{ color: C.sub }}>Week {wk}</span>
                      <span style={{ color: C.dark }}>{wd.submitted || 0} sub</span>
                      <span style={{ color: C.ok }}>{wd.approved || 0} app</span>
                    </div>
                    {(wd.editors || []).length > 0 && (
                      <div className="text-[10px] mt-1 ml-12" style={{ color: C.muted }}>{wd.editors.join(" · ")}</div>
                    )}
                  </div>
                ))}
              </div>
              <div className="p-4">
                <div className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: C.sub }}>By Editor</div>
                {Object.entries(selData.editors || {}).length === 0 ? (
                  <div className="text-xs" style={{ color: C.sub }}>No editor data</div>
                ) : Object.entries(selData.editors || {}).sort(([,a],[,b]) => (b.submitted+b.approved)-(a.submitted+a.approved)).map(([name, stats]) => (
                  <div key={name} className="flex items-center gap-2 py-2 border-b last:border-0 text-xs" style={{ borderColor: C.mint4 + "33" }}>
                    <span className="flex-1 font-medium" style={{ color: C.dark }}>{name}</span>
                    <span style={{ color: C.dark }}>{stats.submitted || 0}↑</span>
                    <span style={{ color: C.ok }}>{stats.approved || 0}✓</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Editor Activity sub-tab ───────────────────────────────────────────────────
function EditorActivitySubTab({ editors, delegations }) {
  const [selected, setSelected]             = useState(null);
  const [log, setLog]                       = useState(null);
  const [fetching, setFetching]             = useState(false);
  const [panelTab, setPanelTab]             = useState("serials");
  const [selectedSerial, setSelectedSerial] = useState(null);
  const [selectedMovie, setSelectedMovie]   = useState(null);
  const [serialSubTab, setSerialSubTab]     = useState("submitted");
  const [historyYear, setHistoryYear]       = useState(null);
  const [activityEpisode, setActivityEpisode] = useState(null);

  const handleSelect = (uid) => {
    setSelected(uid); setLog(null); setPanelTab("serials");
    setSelectedSerial(null); setSelectedMovie(null); setHistoryYear(null); setActivityEpisode(null);
    setFetching(true);
    api.editorActivity(uid).then(setLog).catch(() => setLog(null)).finally(() => setFetching(false));
  };

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

  const movieGroup   = selectedMovie ? (bySerialMap[selectedMovie] || { entries: [] }) : null;
  const movieStat    = selectedMovie ? (episodeStats[selectedMovie] || null) : null;
  const movieEntries = movieGroup?.entries || [];

  // Episode list for activity-log drill-down (from API + any in audit log not in API)
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

  const thStyle   = { background: C.mint4 + "33", color: C.sub, borderColor: C.mint4 };
  const TH        = "text-[10px] uppercase tracking-wider font-semibold px-4 py-2";
  const rowBorder = { borderColor: C.mint4 + "44" };

  return (
    <div className="grid grid-cols-3 gap-6">
      {/* Editor list */}
      <div className="rounded-xl border overflow-hidden self-start" style={{ background: C.white, borderColor: C.mint1 + "44" }}>
        <div className="px-4 py-3 border-b text-[10px] font-bold uppercase tracking-widest"
          style={{ borderColor: C.mint4, background: C.mint4 + "66", color: C.sub }}>Editors ({editors.length})</div>
        {editors.length === 0 && <div className="p-6 text-sm text-center" style={{ color: C.sub }}>No editors</div>}
        {editors.map((e) => (
          <button key={e.id} onClick={() => handleSelect(e.id)}
            className="w-full text-left px-4 py-3 border-b last:border-0 text-sm hover:bg-green-50/40 transition"
            style={{ borderColor: C.mint4 + "55", background: selected === e.id ? C.mint4 + "99" : undefined, color: C.dark }}>
            <div className="font-medium">{e.full_name}</div>
            <div className="text-xs" style={{ color: C.sub }}>{e.email}</div>
            <div className="text-xs mt-0.5" style={{ color: C.sub }}>{delegations.filter((d) => d.assigned_to === e.id).length} assigned</div>
          </button>
        ))}
      </div>

      {/* Right panel */}
      <div className="col-span-2">
        {!selected && <div className="rounded-xl border p-10 text-center text-sm" style={{ background: C.white, borderColor: C.mint1 + "44", color: C.sub }}>Select an editor</div>}
        {selected && fetching && <div className="rounded-xl border p-10 text-center text-sm" style={{ background: C.white, borderColor: C.mint1 + "44", color: C.sub }}>Loading…</div>}
        {selected && !fetching && log && (
          <>
            {/* Summary */}
            <div className="mb-4 rounded-xl border px-5 py-3 flex items-center gap-6" style={{ background: C.mint4 + "22", borderColor: C.mint4 + "44" }}>
              <div>
                <div className="text-xs font-bold uppercase tracking-widest" style={{ color: C.sub }}>{log.user?.full_name}</div>
                <div className="text-sm mt-0.5" style={{ color: C.dark }}>
                  <strong>{currentMonthSubmitted}</strong> submitted in {MONTH_FULL[now.getMonth()]}
                </div>
              </div>
                  <div className="ml-auto flex gap-4 text-center flex-wrap justify-end">
                {(() => {
                  const editorTarget  = (log?.delegations || []).reduce((s, d) => s + (Number(d.week_target) || 0), 0);
                  const allSubmitted  = (log?.by_serial || []).flatMap((g) => g.entries).filter((e) => e.action === "submit").length;
                  const editorPending = Math.max(0, editorTarget - allSubmitted);
                  const totalRejected = Object.values(episodeStats).reduce((s, v) => s + (v.rejected || 0), 0);
                  return [
                    { v: allSerialsList.length, l: "Serials",   c: C.dark    },
                    { v: allMoviesList.length,  l: "Movies",    c: "#7B1FA2" },
                    { v: editorTarget,          l: "Target",    c: "#E65100" },
                    { v: allSubmitted,          l: "Submitted", c: C.dark    },
                    { v: Object.values(episodeStats).reduce((s, v) => s + (v.approved || 0), 0), l: "Approved", c: C.ok },
                    { v: editorPending,         l: "Pending",   c: C.danger  },
                    { v: totalRejected,         l: "Rejected",  c: "#C62828" },
                  ].map(({ v, l, c }) => (
                    <div key={l}>
                      <div className="text-lg font-bold leading-none" style={{ color: c }}>{v}</div>
                      <div className="text-[10px] uppercase tracking-wider mt-0.5" style={{ color: c + "88" }}>{l}</div>
                    </div>
                  ));
                })()}
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
                  ? <div className="p-8 text-center text-sm" style={{ color: C.sub }}>No serials assigned</div>
                  : allSerialsList.map((serial) => {
                    const deleg = delegMap[serial] || null;
                    const group = bySerialMap[serial] || { count: 0 };
                    const s    = ACT_STATUS[deleg?.status] || ACT_STATUS.pending;
                    const done = episodeStats[serial]?.approved ?? deleg?.completed ?? 0;
                    return (
                      <button key={serial} onClick={() => { setSelectedSerial(serial); setSerialSubTab("submitted"); }}
                        className="w-full text-left px-4 py-3 border-b last:border-0 hover:bg-green-50/30 flex items-center gap-4"
                        style={{ borderColor: C.mint4 + "44" }}>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm truncate" style={{ color: C.dark }}>{serial}</div>
                          <div className="flex items-center gap-2 mt-0.5">
                            {deleg && <span className="text-[10px] px-1.5 py-0.5 rounded font-medium" style={{ background: s.bg, color: s.color }}>{s.label}</span>}
                            {deleg?.episode_range && <span className="text-[10px]" style={{ color: C.sub }}>{deleg.episode_range}</span>}
                          </div>
                        </div>
                        <div className="text-right shrink-0 text-xs" style={{ color: C.sub }}>
                          {group.count > 0 ? `${group.count} actions` : "No log"}
                          {deleg && <div className="text-[10px] mt-0.5">Target: {deleg.week_target ?? "—"} · Done: {done}</div>}
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
                              <span className="text-[10px] px-1.5 py-0.5 rounded font-medium" style={{ background: ACT_STATUS[serialDeleg.status]?.bg, color: ACT_STATUS[serialDeleg.status]?.color }}>{ACT_STATUS[serialDeleg.status]?.label}</span>
                              {serialDeleg.episode_range && <span>Range: {serialDeleg.episode_range}</span>}
                              {serialDeleg.client && <span>Client: {serialDeleg.client}</span>}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="grid grid-cols-5 divide-x text-center py-3" style={{ borderColor: C.mint4 + "44" }}>
                        {[
                          { l: "Target",   v: sTarget,   c: "#E65100" },
                          { l: "Submitted",v: sSub,      c: C.dark    },
                          { l: "Approved", v: sApproved, c: C.ok      },
                          { l: "Pending",  v: sPending,  c: C.danger  },
                          { l: "Rejected", v: sRejected, c: "#C62828" },
                        ].map(({ l, v, c }) => (
                          <div key={l} className="px-3">
                            <div className="text-xl font-bold leading-none" style={{ color: c }}>{v}</div>
                            <div className="text-[10px] uppercase tracking-wide mt-1" style={{ color: c + "88" }}>{l}</div>
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
                    {serialSubmitted.length === 0 ? <div className="p-8 text-center text-sm" style={{ color: C.sub }}>No submissions</div> : (
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
                    {!serialStat ? <div className="p-8 text-center text-sm" style={{ color: C.sub }}>No episode data</div> : (
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
                                    <th className={`text-center ${TH} px-4 py-2`}>Ep #</th>
                                    <th className={`text-left ${TH} px-4 py-2`}>Title</th>
                                    <th className={`text-left ${TH} px-4 py-2`}>Status</th>
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
                                        <th className={`text-left ${TH} px-4 py-2`}>#</th>
                                        <th className={`text-left ${TH} px-4 py-2`}>Action</th>
                                        <th className={`text-left ${TH} px-4 py-2`}>Details</th>
                                        <th className={`text-right ${TH} px-4 py-2`}>Date</th>
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
                  ? <div className="p-8 text-center text-sm" style={{ color: C.sub }}>No movies assigned</div>
                  : allMoviesList.map((movie) => {
                    const group      = bySerialMap[movie] || { count: 0 };
                    const stat       = episodeStats[movie] || null;
                    const isSubmitted = stat ? (stat.submitted > 0 || stat.approved > 0) : false;
                    const isApproved  = stat ? stat.approved > 0 : false;
                    return (
                      <button key={movie} onClick={() => setSelectedMovie(movie)}
                        className="w-full text-left px-4 py-3 border-b last:border-0 hover:bg-green-50/30 flex items-center gap-4"
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
                        <div className="text-right shrink-0 text-xs" style={{ color: C.sub }}>
                          {group.count > 0 ? `${group.count} actions` : "No log"}
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
                    {historyYears.length === 0 ? <div className="p-4 text-xs text-center" style={{ color: C.sub }}>No data</div>
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
                  {!historyYear ? <div className="rounded-xl border p-8 text-center text-sm" style={{ background: C.white, borderColor: C.mint1 + "44", color: C.sub }}>Select a year</div>
                  : (
                    <div className="rounded-xl border overflow-hidden" style={{ background: C.white, borderColor: C.mint1 + "44" }}>
                      <div className="px-4 py-3 border-b text-[10px] font-bold uppercase tracking-widest" style={{ borderColor: C.mint4, background: C.mint4 + "33", color: C.sub }}>{historyYear} — Monthly</div>
                      <table className="w-full text-sm">
                        <thead><tr className="border-b" style={{ background: C.mint4 + "33", color: C.sub, borderColor: C.mint4 }}>
                          <th className="text-left px-4 py-2 text-[10px] uppercase tracking-wider font-semibold">Month</th>
                          <th className="text-center px-4 py-2 text-[10px] uppercase tracking-wider font-semibold">Submitted</th>
                          <th className="text-center px-4 py-2 text-[10px] uppercase tracking-wider font-semibold">Approved</th>
                          <th className="text-center px-4 py-2 text-[10px] uppercase tracking-wider font-semibold">Total</th>
                        </tr></thead>
                        <tbody>
                          {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
                            const d = historyData[historyYear]?.[m] || { sub: 0, app: 0 };
                            return (
                              <tr key={m} className="border-b last:border-0" style={rowBorder}>
                                <td className="px-4 py-2.5 font-medium text-xs" style={{ color: C.dark }}>{MONTH_FULL[m - 1]}</td>
                                <td className="px-4 py-2.5 text-center text-sm font-medium" style={{ color: d.sub > 0 ? C.dark : C.muted }}>{d.sub}</td>
                                <td className="px-4 py-2.5 text-center text-sm font-medium" style={{ color: d.app > 0 ? C.ok : C.muted }}>{d.app}</td>
                                <td className="px-4 py-2.5 text-center text-sm font-bold" style={{ color: (d.sub+d.app) > 0 ? C.dark : C.muted }}>{d.sub + d.app}</td>
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

// ── WD Activity sub-tab ───────────────────────────────────────────────────────
function WDActivitySubTab({ wdUsers, delegations }) {
  const [selected, setSelected] = useState(null);
  const [wdTab, setWdTab]       = useState("serials");

  const myDeleg      = selected ? delegations.filter((d) => d.created_by === selected) : [];
  const serialDeleg  = myDeleg.filter((d) => d.work_type !== "Movie Cue Sheet");
  const movieDeleg   = myDeleg.filter((d) => d.work_type === "Movie Cue Sheet");
  const currentDeleg = wdTab === "movies" ? movieDeleg : serialDeleg;

  const thStyle   = { borderColor: C.mint4, color: C.sub, background: C.mint4 + "33" };
  const TH        = "text-[10px] uppercase tracking-wider";
  const rowBorder = { borderColor: C.mint4 + "55" };

  return (
    <div className="grid grid-cols-3 gap-6">
      <div className="rounded-xl border overflow-hidden self-start" style={{ background: C.white, borderColor: C.mint1 + "44" }}>
        <div className="px-4 py-3 border-b text-[10px] font-bold uppercase tracking-widest" style={{ borderColor: C.mint4, background: C.mint4 + "66", color: C.sub }}>Work Delegators ({wdUsers.length})</div>
        {wdUsers.length === 0 && <div className="p-6 text-sm text-center" style={{ color: C.sub }}>No work delegators</div>}
        {wdUsers.map((u) => {
          const count = delegations.filter((d) => d.created_by === u.id).length;
          return (
            <button key={u.id} onClick={() => { setSelected(u.id === selected ? null : u.id); setWdTab("serials"); }}
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
        {!selected
          ? <div className="rounded-xl border p-10 text-center text-sm" style={{ background: C.white, borderColor: C.mint1 + "44", color: C.sub }}>Select a work delegator</div>
          : (
            <div className="space-y-4">
              {/* Stats */}
              <div className="grid grid-cols-4 gap-3">
                <div className="rounded-xl border p-3 text-center" style={{ background: C.white, borderColor: C.mint1 + "44" }}>
                  <div className="text-2xl font-bold" style={{ color: C.dark }}>{currentDeleg.length}</div>
                  <div className="text-xs mt-0.5" style={{ color: C.sub }}>Total</div>
                </div>
                {["pending","in_progress","completed"].map((s) => {
                  const ss = ACT_STATUS[s];
                  return (
                    <div key={s} className="rounded-xl border p-3 text-center" style={{ background: ss.bg + "66", borderColor: ss.color + "44" }}>
                      <div className="text-2xl font-bold" style={{ color: ss.color }}>{currentDeleg.filter((d) => d.status === s).length}</div>
                      <div className="text-xs mt-0.5" style={{ color: ss.color }}>{ss.label}</div>
                    </div>
                  );
                })}
              </div>

              {/* Serial / Movie tabs */}
              <div className="flex gap-1 p-1 rounded-xl" style={{ background: C.mint4 + "99" }}>
                {[
                  { key: "serials", label: `Serials (${serialDeleg.length})`, icon: CalendarDays },
                  { key: "movies",  label: `Movies (${movieDeleg.length})`,   icon: Film },
                ].map(({ key, label, icon: Icon }) => (
                  <button key={key} onClick={() => setWdTab(key)}
                    className="flex-1 flex items-center justify-center gap-2 py-1.5 rounded-lg text-xs font-medium transition-all"
                    style={{ background: wdTab === key ? C.dark : "transparent", color: wdTab === key ? C.mint4 : C.sub }}>
                    <Icon className="w-3.5 h-3.5" />{label}
                  </button>
                ))}
              </div>

              {/* Table */}
              <div className="rounded-xl border overflow-hidden" style={{ background: C.white, borderColor: C.mint1 + "44" }}>
                {currentDeleg.length === 0
                  ? <div className="p-10 text-center text-sm" style={{ color: C.sub }}>No {wdTab === "movies" ? "movie" : "serial"} delegations yet</div>
                  : (
                    <MiniPager entries={currentDeleg} pageSize={20}>
                      {(paged, offset) => (
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b" style={thStyle}>
                              <th className={`text-left px-4 py-2 ${TH}`}>{wdTab === "movies" ? "Movie" : "Serial"}</th>
                              <th className={`text-left px-4 py-2 ${TH}`}>Assigned To</th>
                              {wdTab === "serials" && <th className={`text-left px-4 py-2 ${TH}`}>Range</th>}
                              <th className={`text-center px-4 py-2 ${TH}`}>Target</th>
                              <th className={`text-center px-4 py-2 ${TH}`}>Done</th>
                              <th className={`text-left px-4 py-2 ${TH}`}>Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {paged.map((d) => {
                              const ss = ACT_STATUS[d.status] || ACT_STATUS.pending;
                              return (
                                <tr key={d.id} className="border-b last:border-0 hover:bg-green-50/30" style={rowBorder}>
                                  <td className="px-4 py-3">
                                    <div className="font-medium" style={{ color: C.dark }}>{d.serial_name}</div>
                                    {d.channel && <div className="text-[10px]" style={{ color: C.sub }}>{d.channel}</div>}
                                  </td>
                                  <td className="px-4 py-3 text-sm" style={{ color: C.dark }}>{d.assigned_to_name || "—"}</td>
                                  {wdTab === "serials" && <td className="px-4 py-3 text-xs" style={{ color: C.sub }}>{d.episode_range || "—"}</td>}
                                  <td className="px-4 py-3 text-center font-medium" style={{ color: C.dark }}>{d.week_target ?? "—"}</td>
                                  <td className="px-4 py-3 text-center font-medium" style={{ color: C.ok }}>{d.completed}</td>
                                  <td className="px-4 py-3"><span className="text-[10px] px-2 py-0.5 rounded font-medium" style={{ background: ss.bg, color: ss.color }}>{ss.label}</span></td>
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
            </div>
          )
        }
      </div>
    </div>
  );
}

// ── Reviewer Activity sub-tab ─────────────────────────────────────────────────
function ReviewerActivitySubTab({ reviewers }) {
  const [selected, setSelected]             = useState(null);
  const [log, setLog]                       = useState(null);
  const [fetching, setFetching]             = useState(false);
  const [reviewTab, setReviewTab]           = useState("serials");
  const [selectedSerial, setSelectedSerial] = useState(null);
  const [selectedMovie, setSelectedMovie]   = useState(null);
  const [selectedEpisode, setSelectedEpisode] = useState(null);

  const handleSelect = (uid) => {
    setSelected(uid); setLog(null); setFetching(true);
    setReviewTab("serials"); setSelectedSerial(null); setSelectedMovie(null); setSelectedEpisode(null);
    api.editorActivity(uid).then(setLog).catch(() => setLog(null)).finally(() => setFetching(false));
  };

  const REVIEW_ACTIONS = new Set(["approve","reject","suggest"]);
  const bySerialMap = Object.fromEntries((log?.by_serial || []).map((g) => [g.serial, g]));

  const isMovieProject = (serial) => {
    const g = bySerialMap[serial];
    return g?.project_type === "MOVIE";
  };

  const reviewActivity = (log?.by_serial || [])
    .flatMap((g) => g.entries.filter((e) => REVIEW_ACTIONS.has(e.action?.toLowerCase())).map((e) => ({ ...e, serial: g.serial })))
    .sort((a, b) => new Date(b.at) - new Date(a.at));

  const approved  = reviewActivity.filter((a) => a.action === "approve").length;
  const rejected  = reviewActivity.filter((a) => a.action === "reject").length;
  const suggested = reviewActivity.filter((a) => a.action === "suggest").length;

  // Group review activity by serial
  const reviewBySerial = {};
  for (const e of reviewActivity) {
    if (!reviewBySerial[e.serial]) reviewBySerial[e.serial] = [];
    reviewBySerial[e.serial].push(e);
  }
  const reviewedSerials = Object.keys(reviewBySerial).filter((s) => !isMovieProject(s)).sort();
  const reviewedMovies  = Object.keys(reviewBySerial).filter((s) =>  isMovieProject(s)).sort();

  // Serial episode map (from reviewer's audit entries)
  const serialEntries = selectedSerial ? (reviewBySerial[selectedSerial] || []) : [];
  const episodeMap = {};
  for (const e of serialEntries) {
    if (e.episode_number != null) {
      if (!episodeMap[e.episode_number]) episodeMap[e.episode_number] = [];
      episodeMap[e.episode_number].push(e);
    }
  }
  const episodeNumbers = Object.keys(episodeMap).map(Number).sort((a, b) => a - b);

  // Most-recent review action per episode
  const epLatestAction = (epNum) => (episodeMap[epNum] || [])[0]?.action || null;

  const thStyle   = { borderColor: C.mint4, background: C.mint4 + "33", color: C.sub };
  const TH        = "text-[10px] uppercase tracking-wider font-semibold px-4 py-2";
  const rowBorder = { borderColor: C.mint4 + "44" };

  return (
    <div className="grid grid-cols-3 gap-6">
      {/* Reviewer list */}
      <div className="rounded-xl border overflow-hidden self-start" style={{ background: C.white, borderColor: C.mint1 + "44" }}>
        <div className="px-4 py-3 border-b text-[10px] font-bold uppercase tracking-widest" style={{ borderColor: C.mint4, background: C.mint4 + "66", color: C.sub }}>Reviewers ({reviewers.length})</div>
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

      {/* Right panel */}
      <div className="col-span-2">
        {!selected && <div className="rounded-xl border p-10 text-center text-sm" style={{ background: C.white, borderColor: C.mint1 + "44", color: C.sub }}>Select a reviewer</div>}
        {selected && fetching && <div className="rounded-xl border p-10 text-center text-sm" style={{ background: C.white, borderColor: C.mint1 + "44", color: C.sub }}>Loading…</div>}
        {selected && !fetching && log && (
          <div className="space-y-4">
            {/* Summary */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "Approved",    val: approved,  bg: "#E8F5E9", color: "#2E7D32" },
                { label: "Rejected",    val: rejected,  bg: "#FFEBEE", color: "#C62828" },
                { label: "Suggestions", val: suggested, bg: "#E3F2FD", color: "#1565C0" },
              ].map((s) => (
                <div key={s.label} className="rounded-xl border p-3 text-center" style={{ background: s.bg, borderColor: s.color + "44" }}>
                  <div className="text-2xl font-bold" style={{ color: s.color }}>{s.val}</div>
                  <div className="text-xs mt-0.5" style={{ color: s.color }}>{s.label}</div>
                </div>
              ))}
            </div>

            {/* Serial / Movie tabs */}
            <div className="flex gap-1 p-1 rounded-xl" style={{ background: C.mint4 + "99" }}>
              {[
                { key: "serials", label: "Serials", icon: CalendarDays },
                { key: "movies",  label: "Movies",  icon: Film },
              ].map(({ key, label, icon: Icon }) => (
                <button key={key}
                  onClick={() => { setReviewTab(key); setSelectedSerial(null); setSelectedMovie(null); setSelectedEpisode(null); }}
                  className="flex-1 flex items-center justify-center gap-2 py-1.5 rounded-lg text-xs font-medium transition-all"
                  style={{ background: reviewTab === key ? C.dark : "transparent", color: reviewTab === key ? C.mint4 : C.sub }}>
                  <Icon className="w-3.5 h-3.5" />{label}
                </button>
              ))}
            </div>

            {/* ── Serials tab ── */}
            {reviewTab === "serials" && !selectedSerial && (
              <div className="rounded-xl border overflow-hidden" style={{ background: C.white, borderColor: C.mint1 + "44" }}>
                {reviewedSerials.length === 0
                  ? <div className="p-8 text-center text-sm" style={{ color: C.sub }}>No serial review activity</div>
                  : reviewedSerials.map((serial) => {
                    const entries = reviewBySerial[serial] || [];
                    const app = entries.filter((e) => e.action === "approve").length;
                    const rej = entries.filter((e) => e.action === "reject").length;
                    return (
                      <button key={serial} onClick={() => setSelectedSerial(serial)}
                        className="w-full text-left px-4 py-3 border-b last:border-0 hover:bg-green-50/30 flex items-center gap-4"
                        style={{ borderColor: C.mint4 + "44" }}>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm truncate" style={{ color: C.dark }}>{serial}</div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[10px] px-1.5 py-0.5 rounded font-medium" style={{ background: "#E8F5E9", color: "#2E7D32" }}>{app} approved</span>
                            {rej > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded font-medium" style={{ background: "#FFEBEE", color: "#C62828" }}>{rej} rejected</span>}
                          </div>
                        </div>
                        <div className="text-xs shrink-0" style={{ color: C.sub }}>{entries.length} action{entries.length !== 1 ? "s" : ""}</div>
                        <ChevronRight className="w-4 h-4 shrink-0" style={{ color: C.muted }} />
                      </button>
                    );
                  })}
              </div>
            )}

            {/* ── Serial → Episode list ── */}
            {reviewTab === "serials" && selectedSerial && !selectedEpisode && (
              <div>
                <button onClick={() => { setSelectedSerial(null); setSelectedEpisode(null); }}
                  className="flex items-center gap-1.5 text-xs mb-3 hover:opacity-70" style={{ color: C.sub }}>
                  <ArrowLeft className="w-3.5 h-3.5" /> Back to serials
                </button>
                <div className="mb-3 px-4 py-2 rounded-xl border inline-flex items-center gap-2" style={{ background: C.mint4 + "22", borderColor: C.mint4 + "44" }}>
                  <span className="font-semibold text-sm" style={{ color: C.dark }}>{selectedSerial}</span>
                </div>
                <div className="rounded-xl border overflow-hidden" style={{ background: C.white, borderColor: C.mint1 + "44" }}>
                  {episodeNumbers.length === 0
                    ? <div className="p-8 text-center text-sm" style={{ color: C.sub }}>No episodes reviewed</div>
                    : (
                      <MiniPager entries={episodeNumbers} pageSize={20}>
                        {(paged) => (
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b" style={thStyle}>
                                <th className={`text-center ${TH}`}>Ep #</th>
                                <th className={`text-left ${TH}`}>Review Status</th>
                                <th className={`text-right ${TH}`}>Actions</th>
                                <th className="px-4 py-2"></th>
                              </tr>
                            </thead>
                            <tbody>
                              {paged.map((epNum) => {
                                const latest = epLatestAction(epNum);
                                const sc = ACT_ACTION[latest] || { bg: "#F3F4F6", color: "#374151" };
                                const cnt = (episodeMap[epNum] || []).length;
                                return (
                                  <tr key={epNum} className="border-b last:border-0 hover:bg-green-50/20 cursor-pointer" style={rowBorder}
                                    onClick={() => setSelectedEpisode(epNum)}>
                                    <td className="px-4 py-2.5 text-center font-mono text-xs" style={{ color: C.dark }}>{String(epNum).padStart(2,"0")}</td>
                                    <td className="px-4 py-2.5">
                                      <span className="text-[10px] px-1.5 py-0.5 rounded font-medium capitalize" style={{ background: sc.bg, color: sc.color }}>{latest || "unknown"}</span>
                                    </td>
                                    <td className="px-4 py-2.5 text-right text-xs" style={{ color: C.sub }}>{cnt}</td>
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
              </div>
            )}

            {/* ── Episode review log ── */}
            {reviewTab === "serials" && selectedSerial && selectedEpisode != null && (
              <div>
                <button onClick={() => setSelectedEpisode(null)}
                  className="flex items-center gap-1.5 text-xs mb-3 hover:opacity-70" style={{ color: C.sub }}>
                  <ArrowLeft className="w-3.5 h-3.5" /> Back to episodes
                </button>
                <div className="mb-2 px-3 py-1 rounded-lg inline-flex items-center gap-2" style={{ background: C.mint4 + "44" }}>
                  <span className="text-xs font-semibold" style={{ color: C.dark }}>{selectedSerial} — Episode {String(selectedEpisode).padStart(2,"0")}</span>
                </div>
                <div className="rounded-xl border overflow-hidden" style={{ background: C.white, borderColor: C.mint1 + "44" }}>
                  <MiniPager entries={episodeMap[selectedEpisode] || []} pageSize={20}>
                    {(paged, offset) => (
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b" style={thStyle}>
                            <th className={`text-left ${TH}`}>#</th>
                            <th className={`text-left ${TH}`}>Action</th>
                            <th className={`text-left ${TH}`}>Note</th>
                            <th className={`text-right ${TH}`}>Date</th>
                          </tr>
                        </thead>
                        <tbody>
                          {paged.map((e, i) => {
                            const as = ACT_ACTION[e.action] || { bg: "#F3F4F6", color: "#374151" };
                            const note = e.details?.replace(/^(Approved episode\.?\s*|Rejected\s*[—-]\s*|Suggested changes\s*[—-]\s*)/i, "").trim() || null;
                            return (
                              <tr key={e.id} className="border-b last:border-0 hover:bg-green-50/20" style={rowBorder}>
                                <td className="px-4 py-2.5 font-mono text-xs" style={{ color: C.sub }}>{offset + i + 1}</td>
                                <td className="px-4 py-2.5"><span className="text-[10px] px-2 py-0.5 rounded font-medium capitalize" style={{ background: as.bg, color: as.color }}>{e.action}</span></td>
                                <td className="px-4 py-2.5 text-xs" style={{ color: C.sub }}>{note ? <span className="italic">{note.length > 80 ? note.slice(0,80)+"…" : note}</span> : "—"}</td>
                                <td className="px-4 py-2.5 text-right text-xs whitespace-nowrap" style={{ color: C.sub }}>{e.at ? new Date(e.at).toLocaleString() : "—"}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                  </MiniPager>
                </div>
              </div>
            )}

            {/* ── Movies tab ── */}
            {reviewTab === "movies" && !selectedMovie && (
              <div className="rounded-xl border overflow-hidden" style={{ background: C.white, borderColor: C.mint1 + "44" }}>
                {reviewedMovies.length === 0
                  ? <div className="p-8 text-center text-sm" style={{ color: C.sub }}>No movie review activity</div>
                  : reviewedMovies.map((movie) => {
                    const entries = reviewBySerial[movie] || [];
                    const isReviewed = entries.length > 0;
                    const isApproved = entries.some((e) => e.action === "approve");
                    return (
                      <button key={movie} onClick={() => setSelectedMovie(movie)}
                        className="w-full text-left px-4 py-3 border-b last:border-0 hover:bg-green-50/30 flex items-center gap-4"
                        style={{ borderColor: C.mint4 + "44" }}>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm truncate" style={{ color: C.dark }}>{movie}</div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                              style={{ background: isReviewed ? "#E3F2FD" : "#F3F4F6", color: isReviewed ? "#1565C0" : C.sub }}>
                              {isReviewed ? "Reviewed" : "Not Reviewed"}
                            </span>
                            {isApproved && <span className="text-[10px] px-1.5 py-0.5 rounded font-medium" style={{ background: "#E8F5E9", color: "#2E7D32" }}>Approved</span>}
                          </div>
                        </div>
                        <div className="text-xs shrink-0" style={{ color: C.sub }}>{entries.length} action{entries.length !== 1 ? "s" : ""}</div>
                        <ChevronRight className="w-4 h-4 shrink-0" style={{ color: C.muted }} />
                      </button>
                    );
                  })}
              </div>
            )}

            {/* ── Movie review log ── */}
            {reviewTab === "movies" && selectedMovie && (
              <div>
                <button onClick={() => setSelectedMovie(null)}
                  className="flex items-center gap-1.5 text-xs mb-3 hover:opacity-70" style={{ color: C.sub }}>
                  <ArrowLeft className="w-3.5 h-3.5" /> Back to movies
                </button>
                <div className="mb-2 px-3 py-1 rounded-lg inline-flex items-center gap-2" style={{ background: C.mint4 + "44" }}>
                  <span className="text-xs font-semibold" style={{ color: C.dark }}>{selectedMovie}</span>
                </div>
                <div className="rounded-xl border overflow-hidden" style={{ background: C.white, borderColor: C.mint1 + "44" }}>
                  {(reviewBySerial[selectedMovie] || []).length === 0
                    ? <div className="p-8 text-center text-sm" style={{ color: C.sub }}>No review activity</div>
                    : (
                      <MiniPager entries={reviewBySerial[selectedMovie]} pageSize={20}>
                        {(paged, offset) => (
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b" style={thStyle}>
                                <th className={`text-left ${TH}`}>#</th>
                                <th className={`text-left ${TH}`}>Action</th>
                                <th className={`text-left ${TH}`}>Note</th>
                                <th className={`text-right ${TH}`}>Date</th>
                              </tr>
                            </thead>
                            <tbody>
                              {paged.map((e, i) => {
                                const as = ACT_ACTION[e.action] || { bg: "#F3F4F6", color: "#374151" };
                                const note = e.details?.replace(/^(Approved episode\.?\s*|Rejected\s*[—-]\s*|Suggested changes\s*[—-]\s*)/i, "").trim() || null;
                                return (
                                  <tr key={e.id} className="border-b last:border-0 hover:bg-green-50/20" style={rowBorder}>
                                    <td className="px-4 py-2.5 font-mono text-xs" style={{ color: C.sub }}>{offset + i + 1}</td>
                                    <td className="px-4 py-2.5"><span className="text-[10px] px-2 py-0.5 rounded font-medium capitalize" style={{ background: as.bg, color: as.color }}>{e.action}</span></td>
                                    <td className="px-4 py-2.5 text-xs" style={{ color: C.sub }}>{note ? <span className="italic">{note.length > 80 ? note.slice(0,80)+"…" : note}</span> : "—"}</td>
                                    <td className="px-4 py-2.5 text-right text-xs whitespace-nowrap" style={{ color: C.sub }}>{e.at ? new Date(e.at).toLocaleString() : "—"}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        )}
                      </MiniPager>
                    )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Submissions sub-tab ───────────────────────────────────────────────────────
function SubmissionGroup({ group }) {
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

function SubmissionsSubTab() {
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading]         = useState(true);

  useEffect(() => {
    api.listSubmissions()
      .then(setSubmissions).catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const grouped = submissions.reduce((acc, s) => {
    if (!acc[s.project_id]) acc[s.project_id] = { project_id: s.project_id, project_title: s.project_title, items: [] };
    acc[s.project_id].items.push(s);
    return acc;
  }, {});
  const groups = Object.values(grouped);

  if (loading) return <div className="p-8 text-center text-sm" style={{ color: C.sub }}>Loading…</div>;

  return (
    <div className="space-y-4">
      {groups.length === 0 ? (
        <div className="py-10 text-center text-sm" style={{ color: C.sub }}>No society submissions yet.</div>
      ) : (
        groups.map((g) => <SubmissionGroup key={g.project_id} group={g} />)
      )}
    </div>
  );
}

// ── Admin Clients sub-tab (Serial + Movie sub-tabs) ───────────────────────────
function AdminClientsTab({ delegations }) {
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
            { key: "serial", label: `Serials (${serialRows.length})`, icon: Layers },
            { key: "movie",  label: `Movies (${movieRows.length})`,   icon: Film   },
          ].map(({ key, label, icon: Icon }) => (
            <button key={key} onClick={() => setClientSubTab(key)}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-medium transition-all"
              style={{ background: clientSubTab === key ? C.dark : "transparent", color: clientSubTab === key ? C.mint4 : C.sub }}>
              <Icon className="w-3.5 h-3.5" />{label}
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
                {rows.map((d) => {
                  const ss = { pending:{bg:"#FFF3E0",color:"#E65100",label:"Pending"}, in_progress:{bg:"#E3F2FD",color:"#1565C0",label:"In Progress"}, completed:{bg:"#E8F5E9",color:"#2E7D32",label:"Completed"} }[d.status] || {bg:C.mint4,color:C.sub,label:d.status};
                  return (
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
                      <td className="px-4 py-3"><span className="text-[10px] px-2 py-0.5 rounded font-medium" style={{ background: ss.bg, color: ss.color }}>{ss.label}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    );
  }

  // ── Client list (no sub-tabs; combined totals) ─────────────────────────────
  return (
    <div>
      {clients.length === 0 ? (
        <div className="rounded-xl border p-12 text-center" style={{ background: C.white, borderColor: C.mint1 + "44" }}>
          <div className="text-4xl mb-3">🏢</div>
          <p className="text-sm" style={{ color: C.sub }}>No clients found. Add a client when creating delegations.</p>
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
                    className="border-b last:border-0 hover:bg-green-50/30 cursor-pointer transition"
                    style={{ borderColor: C.mint4 + "44" }}
                    onClick={() => { setSelected(client); setClientSubTab("serial"); }}
                  >
                    <td className="px-4 py-3 font-semibold" style={{ color: C.dark }}>{client}</td>
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


// ── Activity tab (container) ──────────────────────────────────────────────────
function ActivityTab({ initialTab = "editors" }) {
  const [roleTab, setRoleTab]     = useState(initialTab);
  const [users, setUsers]         = useState([]);
  const [delegations, setDels]    = useState([]);
  const [loading, setLoading]     = useState(true);

  useEffect(() => { setRoleTab(initialTab); }, [initialTab]);

  useEffect(() => {
    Promise.all([api.listUsers(), api.listDelegations()])
      .then(([u, d]) => { setUsers(u); setDels(d); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const editors   = users.filter((u) => u.role === "editor");
  const wdUsers   = users.filter((u) => u.role === "work_delegator");
  const reviewers = users.filter((u) => u.role === "reviewer");

  const roleTabs = [
    { key: "editors",     label: `Editors (${editors.length})`            },
    { key: "wds",         label: `Work Delegators (${wdUsers.length})`    },
    { key: "reviewers",   label: `Reviewers (${reviewers.length})`        },
    { key: "clients",     label: "Clients"                                },
    { key: "submissions", label: "Submissions"                            },
  ];

  if (loading) return <div className="p-8 text-center text-sm" style={{ color: C.sub }}>Loading…</div>;

  return (
    <div>
      <div className="flex gap-1 mb-6 p-1 rounded-xl w-fit flex-wrap" style={{ background: C.mint4 + "99" }}>
        {roleTabs.map((t) => (
          <button key={t.key} onClick={() => setRoleTab(t.key)}
            className="px-5 py-2 rounded-lg text-sm font-medium transition-all"
            style={{ background: roleTab === t.key ? C.dark : "transparent", color: roleTab === t.key ? C.mint4 : C.sub }}>
            {t.label}
          </button>
        ))}
      </div>
      {roleTab === "editors"     && <EditorActivitySubTab editors={editors} delegations={delegations} />}
      {roleTab === "wds"         && <WDActivitySubTab wdUsers={wdUsers} delegations={delegations} />}
      {roleTab === "reviewers"   && <ReviewerActivitySubTab reviewers={reviewers} />}
      {roleTab === "clients"     && <AdminClientsTab delegations={delegations} />}
      {roleTab === "submissions" && <SubmissionsSubTab />}
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function AdminDashboard() {
  const [tab, setTab]                     = useState("overview");
  const [projectSubTab, setProjectSubTab] = useState("serial");
  const [activityTab, setActivityTab]     = useState("editors");
  const [usersRoleFilter, setUsersRoleFilter] = useState("all");

  // Central navigation — called from OverviewTab click handlers
  const navigate = (targetTab, opts = {}) => {
    setTab(targetTab);
    if (opts.projectSubTab) setProjectSubTab(opts.projectSubTab);
    if (opts.activityTab)   setActivityTab(opts.activityTab);
    if (opts.usersRoleFilter) setUsersRoleFilter(opts.usersRoleFilter);
  };

  const tabs = [
    { key: "overview",    label: "Overview"           },
    { key: "projects",    label: "Projects"           },
    { key: "delegations", label: "Delegations"        },
    { key: "activity",    label: "Activity"           },
    { key: "users",       label: "Users"              },
    { key: "bgcomposer",  label: "BG Composer Search" },
  ];
  return (
    <DashboardShell title="Admin Dashboard" subtitle="Manage users, serials, and delegations" tabs={tabs} activeTab={tab} onTab={(t) => { setTab(t); }}>
      {tab === "overview"    && <OverviewTab navigate={navigate} />}
      {tab === "projects"    && (
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
          <ProjectsTab hideHeader projectType={projectSubTab} />
        </div>
      )}
      {tab === "delegations" && <DelegationsTab />}
      {tab === "activity"    && <ActivityTab initialTab={activityTab} />}
      {tab === "users"       && <UsersTab initialRoleFilter={usersRoleFilter} />}
      {tab === "bgcomposer"  && <BGComposerTab />}
    </DashboardShell>
  );
}
