import { useEffect, useState } from "react";
import { CheckCircle2, XCircle, MessageSquare, Clock, AlertCircle } from "lucide-react";
import { C, FONTS } from "../../styles/palette";
import DashboardShell from "./DashboardShell";
import ProjectsTab from "./ProjectsTab";
import { api } from "../../utils/api";
import { useApp } from "../../context/AppContext";

const STATUS_STYLE = {
  pending: { bg: "#FFF3E0", color: "#E65100", label: "Pending", Icon: Clock },
  in_progress: { bg: "#E3F2FD", color: "#1565C0", label: "In Progress", Icon: AlertCircle },
  completed: { bg: "#E8F5E9", color: "#2E7D32", label: "Completed", Icon: CheckCircle2 },
};

function MyWorkTab() {
  const { currentUser, setActiveProjectId, setScreen, setProjects } = useApp();

  const openSerial = async (projectId) => {
    try {
      const p = await api.getProject(projectId);
      setProjects((prev) => {
        const mapped = {
          ...p, year: p.production_year, productionCompany: p.production_company,
          channel: p.channel_name, countryOfOrigin: p.country,
          backgroundMusicComposer: p.bg_music_composer,
          episodes: prev.find((x) => x.id === p.id)?.episodes || [],
        };
        return prev.some((x) => x.id === p.id)
          ? prev.map((x) => x.id === p.id ? { ...x, ...mapped } : x)
          : [...prev, mapped];
      });
    } catch (_) {}
    setActiveProjectId(projectId);
    setScreen("serial");
  };
  const [delegations, setDelegations] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.listDelegations().then(setDelegations).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const handleStatusUpdate = async (id, status) => {
    const d = await api.updateDelegation(id, { status });
    setDelegations((prev) => prev.map((x) => x.id === d.id ? d : x));
  };

  if (loading) return <div className="p-8 text-center text-sm" style={{ color: C.sub }}>Loading…</div>;

  if (delegations.length === 0) {
    return (
      <div className="rounded-xl border p-12 text-center" style={{ background: C.white, borderColor: C.mint1 + "44" }}>
        <div className="text-4xl mb-3">📋</div>
        <div className="font-semibold mb-1" style={{ fontFamily: FONTS.serif }}>No work assigned yet</div>
        <p className="text-sm" style={{ color: C.sub }}>Your work delegator will assign serials/episodes here.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {delegations.map((d) => {
        const s = STATUS_STYLE[d.status] || STATUS_STYLE.pending;
        const pct = d.week_target ? Math.min(100, Math.round((d.completed / d.week_target) * 100)) : 0;
        return (
          <div key={d.id} className="rounded-xl border p-5" style={{ background: C.white, borderColor: C.mint1 + "44" }}>
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-semibold" style={{ fontFamily: FONTS.serif, color: C.dark }}>{d.serial_name}</span>
                  <span className="text-[10px] px-2 py-0.5 rounded font-medium" style={{ background: s.bg, color: s.color }}>{s.label}</span>
                </div>
                <div className="flex flex-wrap gap-3 text-xs" style={{ color: C.sub }}>
                  {d.work_type && <span>{d.work_type}</span>}
                  {d.client && <span>Client: {d.client}</span>}
                  {d.channel && <span>Channel: {d.channel}</span>}
                  {d.episode_range && <span>Range: {d.episode_range}</span>}
                  {d.created_by_name && <span>Assigned by: {d.created_by_name}</span>}
                </div>
                {d.notes && <p className="text-xs mt-2 italic" style={{ color: C.sub }}>{d.notes}</p>}
              </div>
              <div className="text-right shrink-0">
                <div className="text-xs mb-1" style={{ color: C.sub }}>Progress</div>
                <div className="text-2xl font-bold" style={{ color: C.dark }}>{d.completed}<span className="text-sm font-normal" style={{ color: C.sub }}>/{d.week_target || "?"}</span></div>
                {d.week_target && (
                  <div className="mt-1 w-24 h-1.5 rounded-full overflow-hidden" style={{ background: C.mint4 }}>
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: pct >= 100 ? C.ok : C.dark }} />
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center justify-between mt-4">
              <select
                value={d.status}
                onChange={(e) => handleStatusUpdate(d.id, e.target.value)}
                className="text-xs px-3 py-1.5 rounded-lg focus:outline-none"
                style={{ background: s.bg, color: s.color, border: "none", fontWeight: 500 }}
              >
                {Object.entries(STATUS_STYLE).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
              {d.project_id && (
                <button onClick={() => openSerial(d.project_id)}
                  className="text-xs px-3 py-1.5 rounded-lg font-medium hover:opacity-90"
                  style={{ background: C.dark, color: C.mint4 }}>
                  Open Serial →
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ReviewFeedbackTab() {
  const [episodes, setEpisodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const { setActiveProjectId, setScreen, setProjects } = useApp();

  const openSerial = async (projectId) => {
    try {
      const p = await api.getProject(projectId);
      setProjects((prev) => {
        const mapped = {
          ...p, year: p.production_year, productionCompany: p.production_company,
          channel: p.channel_name, countryOfOrigin: p.country,
          backgroundMusicComposer: p.bg_music_composer,
          episodes: prev.find((x) => x.id === p.id)?.episodes || [],
        };
        return prev.some((x) => x.id === p.id)
          ? prev.map((x) => x.id === p.id ? { ...x, ...mapped } : x)
          : [...prev, mapped];
      });
    } catch (_) {}
    setActiveProjectId(projectId);
    setScreen("serial");
  };

  useEffect(() => {
    // Load projects and their episodes to find rejected/suggested ones
    api.projects().then(async (projs) => {
      const all = [];
      for (const p of projs) {
        try {
          const eps = await api.listEpisodes(p.id);
          const reviewed = eps.filter((e) => ["rejected", "edited", "approved"].includes(e.status));
          reviewed.forEach((e) => all.push({ ...e, project_title: p.title, project_id: p.id }));
        } catch (_) {}
      }
      setEpisodes(all.sort((a, b) => b.id - a.id));
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="p-8 text-center text-sm" style={{ color: C.sub }}>Loading…</div>;

  if (episodes.length === 0) {
    return (
      <div className="rounded-xl border p-12 text-center" style={{ background: C.white, borderColor: C.mint1 + "44" }}>
        <div className="text-4xl mb-3">✅</div>
        <div className="font-semibold mb-1" style={{ fontFamily: FONTS.serif }}>No feedback yet</div>
        <p className="text-sm" style={{ color: C.sub }}>Reviewed episodes will appear here.</p>
      </div>
    );
  }

  const statusStyle = {
    rejected: { bg: "#FFEBEE", color: "#C62828", Icon: XCircle, label: "Rejected" },
    edited: { bg: "#E3F2FD", color: "#1565C0", Icon: MessageSquare, label: "Changes Suggested" },
    approved: { bg: "#E8F5E9", color: "#2E7D32", Icon: CheckCircle2, label: "Approved" },
  };

  return (
    <div className="space-y-3">
      {episodes.map((ep) => {
        const s = statusStyle[ep.status] || statusStyle.rejected;
        return (
          <div key={ep.id} className="rounded-xl border p-4" style={{ background: C.white, borderColor: C.mint1 + "44" }}>
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <s.Icon className="w-5 h-5 mt-0.5 shrink-0" style={{ color: s.color }} />
                <div>
                  <div className="font-medium" style={{ color: C.dark }}>
                    {ep.project_title} — Episode {ep.episode_number}{ep.title ? ` · ${ep.title}` : ""}
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded font-medium" style={{ background: s.bg, color: s.color }}>{s.label}</span>
                  {ep.rejection_note && (
                    <p className="text-sm mt-2 p-2 rounded-lg" style={{ background: "#FFEBEE", color: "#C62828" }}>
                      <strong>Rejection:</strong> {ep.rejection_note}
                    </p>
                  )}
                  {ep.review_note && (
                    <p className="text-sm mt-2 p-2 rounded-lg" style={{ background: "#E3F2FD", color: "#1565C0" }}>
                      <strong>Suggestion:</strong> {ep.review_note}
                    </p>
                  )}
                </div>
              </div>
              <button onClick={() => openSerial(ep.project_id)}
                className="text-xs px-3 py-1.5 rounded-lg font-medium shrink-0 hover:opacity-90"
                style={{ background: C.dark, color: C.mint4 }}>
                Open →
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function EditorDashboard() {
  const { notifications } = useApp();
  const [tab, setTab] = useState("work");
  const [assignedProjectIds, setAssignedProjectIds] = useState(null);
  const unreadNotifs = notifications.filter((n) => !n.is_read).length;

  useEffect(() => {
    api.listDelegations().then((delegations) => {
      const ids = new Set(delegations.map((d) => d.project_id).filter(Boolean));
      setAssignedProjectIds(ids);
    }).catch(() => setAssignedProjectIds(new Set()));
  }, []);

  const tabs = [
    { key: "work", label: "My Assignments" },
    { key: "projects", label: "My Serials" },
    { key: "feedback", label: "Review Feedback" },
  ];

  return (
    <DashboardShell title="Editor Workspace" subtitle="Manage your assigned work and cue sheets" tabs={tabs} activeTab={tab} onTab={setTab}>
      {tab === "work" && <MyWorkTab />}
      {tab === "projects" && <ProjectsTab hideHeader showCreateBtn filterProjectIds={assignedProjectIds} />}
      {tab === "feedback" && <ReviewFeedbackTab />}
    </DashboardShell>
  );
}
