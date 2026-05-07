import { useEffect, useState, useRef, useCallback } from "react";
import {
  CheckCircle2, XCircle, MessageSquare, Clock, AlertCircle,
  ChevronDown, ChevronUp, ExternalLink,
} from "lucide-react";
import { C, FONTS } from "../../styles/palette";
import DashboardShell from "./DashboardShell";
import ProjectsTab from "./ProjectsTab";
import { api } from "../../utils/api";
import { useApp } from "../../context/AppContext";

const STATUS_STYLE = {
  pending:     { bg: "#FFF3E0", color: "#E65100", label: "Pending",    Icon: Clock         },
  in_progress: { bg: "#E3F2FD", color: "#1565C0", label: "In Progress", Icon: AlertCircle  },
  completed:   { bg: "#E8F5E9", color: "#2E7D32", label: "Completed",   Icon: CheckCircle2 },
};

const REVIEW_STYLE = {
  rejected: { bg: "#FFEBEE", color: "#C62828", Icon: XCircle,        label: "Rejected"           },
  edited:   { bg: "#E3F2FD", color: "#1565C0", Icon: MessageSquare,  label: "Changes Suggested"  },
  approved: { bg: "#E8F5E9", color: "#2E7D32", Icon: CheckCircle2,   label: "Approved"           },
};

function useOpenSerial() {
  const { setActiveProjectId, setScreen, setProjects } = useApp();
  return useCallback(async (projectId) => {
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
  }, [setActiveProjectId, setScreen, setProjects]);
}

// ─── My Assignments tab ───────────────────────────────────────────────────────
function MyWorkTab() {
  const openSerial = useOpenSerial();
  const [delegations, setDelegations] = useState([]);
  const [loading, setLoading]         = useState(true);

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
        const s   = STATUS_STYLE[d.status] || STATUS_STYLE.pending;
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
                  {d.work_type    && <span>{d.work_type}</span>}
                  {d.client       && <span>Client: {d.client}</span>}
                  {d.channel      && <span>Channel: {d.channel}</span>}
                  {d.episode_range && <span>Range: {d.episode_range}</span>}
                  {d.created_by_name && <span>Assigned by: {d.created_by_name}</span>}
                </div>
                {d.notes && <p className="text-xs mt-2 italic" style={{ color: C.sub }}>{d.notes}</p>}
              </div>
              <div className="text-right shrink-0">
                <div className="text-xs mb-1" style={{ color: C.sub }}>Progress</div>
                <div className="text-2xl font-bold" style={{ color: C.dark }}>
                  {d.completed}<span className="text-sm font-normal" style={{ color: C.sub }}>/{d.week_target || "?"}</span>
                </div>
                {d.week_target && (
                  <div className="mt-1 w-24 h-1.5 rounded-full overflow-hidden" style={{ background: C.mint4 }}>
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: pct >= 100 ? C.ok : C.dark }} />
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center justify-between mt-4">
              <select value={d.status} onChange={(e) => handleStatusUpdate(d.id, e.target.value)}
                className="text-xs px-3 py-1.5 rounded-lg focus:outline-none"
                style={{ background: s.bg, color: s.color, border: "none", fontWeight: 500 }}>
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

// ─── Review Feedback tab (serial-wise) ───────────────────────────────────────
function ReviewFeedbackTab() {
  const { notifications, markRead } = useApp();
  const openSerial = useOpenSerial();

  const [groups, setGroups]     = useState([]);  // [{project_id, title, episodes}]
  const [loading, setLoading]   = useState(true);
  const [expanded, setExpanded] = useState({});
  const [newEpIds, setNewEpIds] = useState(new Set());
  const prevEpIdsRef            = useRef(null);
  const isMounted               = useRef(true);

  // Episode IDs with unread notifications from backend
  const unreadEpIds = new Set(
    notifications.filter((n) => !n.is_read && n.entity_type === "episode").map((n) => n.entity_id)
  );

  const loadData = useCallback(async (isRefresh = false) => {
    try {
      const projs = await api.projects();
      const result = [];
      for (const p of projs) {
        try {
          const eps = await api.listEpisodes(p.id);
          const reviewed = eps.filter((e) => ["rejected", "edited", "approved"].includes(e.status));
          if (reviewed.length > 0) {
            result.push({
              project_id: p.id,
              title: p.title,
              episodes: reviewed.sort((a, b) => b.id - a.id),
            });
          }
        } catch (_) {}
      }
      result.sort((a, b) => a.title.localeCompare(b.title));

      if (!isMounted.current) return;

      // Track which episode IDs are newly added since last fetch
      if (isRefresh && prevEpIdsRef.current) {
        const allIds = new Set(result.flatMap((g) => g.episodes.map((e) => e.id)));
        const added  = new Set([...allIds].filter((id) => !prevEpIdsRef.current.has(id)));
        if (added.size > 0) setNewEpIds((prev) => new Set([...prev, ...added]));
        prevEpIdsRef.current = allIds;
      } else {
        prevEpIdsRef.current = new Set(result.flatMap((g) => g.episodes.map((e) => e.id)));
      }

      setGroups(result);
      setExpanded((prev) => {
        const next = { ...prev };
        result.forEach((g) => { if (!(g.project_id in next)) next[g.project_id] = true; });
        return next;
      });
    } catch (_) {}
  }, []);

  useEffect(() => {
    isMounted.current = true;
    loadData(false).finally(() => { if (isMounted.current) setLoading(false); });
    return () => { isMounted.current = false; };
  }, [loadData]);

  // Re-fetch whenever a new notification arrives (notifications poll every 30s)
  const prevNotifCount = useRef(notifications.length);
  useEffect(() => {
    if (notifications.length !== prevNotifCount.current && !loading) {
      prevNotifCount.current = notifications.length;
      loadData(true);
    }
  }, [notifications.length, loading, loadData]);

  const toggle = (pid) => setExpanded((prev) => ({ ...prev, [pid]: !prev[pid] }));

  const clearNew = (pid, epIds) => {
    setNewEpIds((prev) => {
      const next = new Set(prev);
      epIds.forEach((id) => next.delete(id));
      return next;
    });
  };

  const markEpNotifsRead = (epIds) => {
    notifications
      .filter((n) => !n.is_read && n.entity_type === "episode" && epIds.includes(n.entity_id))
      .forEach((n) => markRead(n.id));
  };

  if (loading) return <div className="p-8 text-center text-sm" style={{ color: C.sub }}>Loading…</div>;

  if (groups.length === 0) {
    return (
      <div className="rounded-xl border p-12 text-center" style={{ background: C.white, borderColor: C.mint1 + "44" }}>
        <div className="text-4xl mb-3">✅</div>
        <div className="font-semibold mb-1" style={{ fontFamily: FONTS.serif }}>No feedback yet</div>
        <p className="text-sm" style={{ color: C.sub }}>Reviewed episodes will appear here, grouped by serial.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {groups.map((g) => {
        const isOpen   = expanded[g.project_id] ?? true;
        const epIds    = g.episodes.map((e) => e.id);
        const newInGroup    = epIds.filter((id) => newEpIds.has(id)).length;
        const unreadInGroup = epIds.filter((id) => unreadEpIds.has(id)).length;
        const badge = newInGroup + unreadInGroup;

        // Summary counts per status
        const counts = g.episodes.reduce((acc, ep) => {
          acc[ep.status] = (acc[ep.status] || 0) + 1;
          return acc;
        }, {});

        return (
          <div key={g.project_id} className="rounded-xl border overflow-hidden"
            style={{ background: C.white, borderColor: badge > 0 ? C.mint1 : C.mint1 + "44" }}>
            {/* Serial header */}
            <button
              onClick={() => {
                toggle(g.project_id);
                if (isOpen) {
                  clearNew(g.project_id, epIds);
                  markEpNotifsRead(epIds);
                }
              }}
              className="w-full flex items-center gap-3 px-5 py-4 hover:bg-green-50/30 transition text-left"
            >
              {/* Expand icon */}
              {isOpen
                ? <ChevronUp className="w-4 h-4 shrink-0" style={{ color: C.muted }} />
                : <ChevronDown className="w-4 h-4 shrink-0" style={{ color: C.muted }} />
              }

              {/* Title + counts */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-sm" style={{ fontFamily: FONTS.serif, color: C.dark }}>
                    {g.title}
                  </span>
                  {badge > 0 && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-bold animate-pulse"
                      style={{ background: C.mint1, color: C.dark }}>
                      {badge} new
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-1 flex-wrap">
                  {counts.rejected  && <span className="text-[10px] px-1.5 py-0.5 rounded font-medium" style={{ background: REVIEW_STYLE.rejected.bg,  color: REVIEW_STYLE.rejected.color  }}>{counts.rejected} rejected</span>}
                  {counts.edited    && <span className="text-[10px] px-1.5 py-0.5 rounded font-medium" style={{ background: REVIEW_STYLE.edited.bg,    color: REVIEW_STYLE.edited.color    }}>{counts.edited} suggested</span>}
                  {counts.approved  && <span className="text-[10px] px-1.5 py-0.5 rounded font-medium" style={{ background: REVIEW_STYLE.approved.bg,  color: REVIEW_STYLE.approved.color  }}>{counts.approved} approved</span>}
                  <span className="text-[10px]" style={{ color: C.muted }}>{g.episodes.length} episode{g.episodes.length !== 1 ? "s" : ""}</span>
                </div>
              </div>

              {/* Open serial button */}
              <button
                onClick={(e) => { e.stopPropagation(); openSerial(g.project_id); }}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium shrink-0 hover:opacity-90"
                style={{ background: C.dark, color: C.mint4 }}
              >
                <ExternalLink className="w-3 h-3" /> Open
              </button>
            </button>

            {/* Episode list */}
            {isOpen && (
              <div className="border-t" style={{ borderColor: C.mint4 + "44" }}>
                {g.episodes.map((ep, idx) => {
                  const s       = REVIEW_STYLE[ep.status] || REVIEW_STYLE.rejected;
                  const isNew   = newEpIds.has(ep.id);
                  const hasUnread = unreadEpIds.has(ep.id);
                  return (
                    <div key={ep.id}
                      className="px-5 py-3 border-b last:border-0 flex items-start gap-4"
                      style={{
                        borderColor: C.mint4 + "33",
                        background: (isNew || hasUnread) ? C.mint4 + "18" : idx % 2 === 0 ? "#fafffe" : C.white,
                      }}
                    >
                      {/* Status icon */}
                      <s.Icon className="w-4 h-4 mt-0.5 shrink-0" style={{ color: s.color }} />

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm" style={{ color: C.dark }}>
                            Ep {ep.episode_number}{ep.title ? ` · ${ep.title}` : ""}
                          </span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                            style={{ background: s.bg, color: s.color }}>{s.label}</span>
                          {(isNew || hasUnread) && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded font-bold"
                              style={{ background: C.mint1, color: C.dark }}>New</span>
                          )}
                        </div>

                        {ep.rejection_note && (
                          <p className="text-xs mt-1.5 px-3 py-1.5 rounded-lg"
                            style={{ background: "#FFEBEE", color: "#C62828" }}>
                            <strong>Rejection:</strong> {ep.rejection_note}
                          </p>
                        )}
                        {ep.review_note && (
                          <p className="text-xs mt-1.5 px-3 py-1.5 rounded-lg"
                            style={{ background: "#E3F2FD", color: "#1565C0" }}>
                            <strong>Suggestion:</strong> {ep.review_note}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function EditorDashboard() {
  const { notifications } = useApp();
  const [tab, setTab] = useState("work");
  const [assignedProjectIds, setAssignedProjectIds] = useState(null);

  useEffect(() => {
    api.listDelegations().then((delegations) => {
      setAssignedProjectIds(new Set(delegations.map((d) => d.project_id).filter(Boolean)));
    }).catch(() => setAssignedProjectIds(new Set()));
  }, []);

  const feedbackUnread = notifications.filter((n) => !n.is_read && n.entity_type === "episode").length;

  const tabs = [
    { key: "work",     label: "My Assignments"  },
    { key: "projects", label: "My Serials"       },
    { key: "feedback", label: feedbackUnread > 0 ? `Review Feedback (${feedbackUnread})` : "Review Feedback" },
  ];

  return (
    <DashboardShell title="Editor Workspace" subtitle="Manage your assigned work and cue sheets" tabs={tabs} activeTab={tab} onTab={setTab}>
      {tab === "work"     && <MyWorkTab />}
      {tab === "projects" && <ProjectsTab hideHeader showCreateBtn filterProjectIds={assignedProjectIds} />}
      {tab === "feedback" && <ReviewFeedbackTab />}
    </DashboardShell>
  );
}
