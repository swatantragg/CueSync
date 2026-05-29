import { useEffect, useRef, useState } from "react";
import {
  CheckCircle2, XCircle, MessageSquare, Download, Search, X,
  Layers, ChevronDown, FileDown, ChevronLeft, ChevronRight, Film,
  CalendarDays, Send, AlertCircle,
} from "lucide-react";
import { C, FONTS } from "../../styles/palette";
import DashboardShell from "./DashboardShell";
import { api } from "../../utils/api";
import { showAlert, showConfirm } from "../../components/Dialog";
import { useApp } from "../../context/AppContext";

// ── Constants ──────────────────────────────────────────────────────────────────
const PER_PAGE = 15;

// ── Helpers ────────────────────────────────────────────────────────────────────
const STATUS_STYLE = {
  submitted: { bg: "#E3F2FD", color: "#1565C0", label: "Pending Review" },
  approved:  { bg: "#E8F5E9", color: "#2E7D32", label: "Approved" },
  rejected:  { bg: "#FFEBEE", color: "#C62828", label: "Rejected" },
  edited:    { bg: "#FFF8E1", color: "#E65100", label: "Changes Suggested" },
  pending:   { bg: "#F3F4F6", color: "#374151", label: "Draft" },
};

function StatusBadge({ status }) {
  const s = STATUS_STYLE[status] || STATUS_STYLE.pending;
  return (
    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap"
      style={{ background: s.bg, color: s.color }}>
      {s.label}
    </span>
  );
}

function fmtDur(sec) {
  if (!sec) return "—";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

// ── Paginator ─────────────────────────────────────────────────────────────────
function Paginator({ page, total, onChange }) {
  if (total <= 1) return null;
  const pages = [];
  const delta = 2;
  for (let i = 1; i <= total; i++) {
    if (i === 1 || i === total || (i >= page - delta && i <= page + delta)) {
      pages.push(i);
    } else if (pages[pages.length - 1] !== "…") {
      pages.push("…");
    }
  }
  return (
    <div className="flex items-center justify-center gap-1 mt-4">
      <button onClick={() => onChange(Math.max(1, page - 1))} disabled={page === 1}
        className="p-1.5 rounded-lg disabled:opacity-30" style={{ color: C.sub }}>
        <ChevronLeft className="w-4 h-4" />
      </button>
      {pages.map((p, i) =>
        p === "…" ? (
          <span key={`e${i}`} className="px-1 text-xs" style={{ color: C.sub }}>…</span>
        ) : (
          <button key={p} onClick={() => onChange(p)}
            className="min-w-[28px] h-7 px-1.5 rounded-lg text-xs font-medium"
            style={p === page
              ? { background: C.dark, color: C.mint4 }
              : { color: C.sub }}>
            {p}
          </button>
        )
      )}
      <button onClick={() => onChange(Math.min(total, page + 1))} disabled={page === total}
        className="p-1.5 rounded-lg disabled:opacity-30" style={{ color: C.sub }}>
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
}

// ── Per-episode download button with society picker ────────────────────────────
function EpDownloadBtn({ episode, projectTitle }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy]  = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const download = async (soc) => {
    setOpen(false); setBusy(true);
    try {
      await api.downloadExport(
        episode.id, soc,
        `${projectTitle}_EP${episode.episode_number}_${soc.toUpperCase()}.xlsx`,
      );
    } catch (ex) {
      await showAlert(ex.message, { title: "Download Failed", variant: "error" });
    } finally { setBusy(false); }
  };

  return (
    <div className="relative inline-block" ref={wrapRef}>
      <button onClick={() => setOpen((o) => !o)} disabled={busy}
        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium disabled:opacity-50"
        style={{ background: "#E8F5E9", color: "#2E7D32" }}>
        <Download className="w-3 h-3" />{busy ? "…" : "Download"}
        <ChevronDown className="w-3 h-3" />
      </button>
      {open && (
        <div className="absolute right-0 mt-1 z-30 rounded-xl shadow-xl overflow-hidden min-w-[90px]"
          style={{ background: C.white, border: `1px solid ${C.mint1}44` }}>
          {["IPRS", "PRS", "ASCAP"].map((s) => (
            <button key={s} onMouseDown={() => download(s.toLowerCase())}
              className="block w-full text-left px-4 py-2 text-xs hover:opacity-70"
              style={{ color: C.dark }}>{s}</button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Review modal ───────────────────────────────────────────────────────────────
function ReviewModal({ episode, onClose, onAction }) {
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const handle = async (type) => {
    if ((type === "reject" || type === "suggest") && !note.trim()) {
      await showAlert("Please enter a note before submitting.", { variant: "warn" }); return;
    }
    setSaving(true);
    try {
      await onAction(episode.id, type, note.trim());
      onClose();
    } catch (ex) {
      await showAlert(ex.message, { title: "Action Failed", variant: "error" });
    } finally { setSaving(false); }
  };

  const isMovie = episode.project_type === "MOVIE";
  const label = isMovie
    ? `Review — ${episode.project_title}`
    : `Review — ${episode.project_title} Ep ${episode.episode_number}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.55)" }}>
      <div className="rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden"
        style={{ background: C.dark }}>
        <div className="px-6 py-4 border-b flex items-center justify-between"
          style={{ borderColor: C.mid }}>
          <div>
            <h3 className="font-semibold" style={{ fontFamily: FONTS.serif, color: C.mint4 }}>
              {label}
            </h3>
            {episode.title && (
              <p className="text-xs mt-0.5" style={{ color: C.muted }}>{episode.title}</p>
            )}
          </div>
          <button onClick={onClose} style={{ color: C.muted }}><X className="w-4 h-4" /></button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: C.muted }}>
              Note (required for Reject / Suggest)
            </label>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={4}
              placeholder="Enter rejection reason or suggested changes…"
              className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none resize-none"
              style={{ background: C.mid, color: C.mint4, border: `1px solid ${C.mint1}33` }} />
          </div>
          <div className="flex gap-3">
            <button onClick={() => handle("approve")} disabled={saving}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium disabled:opacity-50"
              style={{ background: "#E8F5E9", color: "#2E7D32" }}>
              <CheckCircle2 className="w-4 h-4" />Approve
            </button>
            <button onClick={() => handle("suggest")} disabled={saving}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium disabled:opacity-50"
              style={{ background: "#E3F2FD", color: "#1565C0" }}>
              <MessageSquare className="w-4 h-4" />Suggest Changes
            </button>
            <button onClick={() => handle("reject")} disabled={saving}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium disabled:opacity-50"
              style={{ background: "#FFEBEE", color: "#C62828" }}>
              <XCircle className="w-4 h-4" />Reject
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Episode table (shared by All + Approved sub-tabs) ─────────────────────────
function EpisodeTable({ episodes, projectTitle, projectId, onReview, onRefresh, onOpen }) {
  return (
    <div className="rounded-xl border overflow-hidden"
      style={{ background: C.white, borderColor: C.mint1 + "44" }}>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[10px] uppercase tracking-wider border-b"
            style={{ borderColor: C.mint4 + "55", color: C.sub, background: C.mint4 + "22" }}>
            <th className="text-left px-4 py-2.5 w-14">EP #</th>
            <th className="text-left px-4 py-2.5">Title</th>
            <th className="text-left px-4 py-2.5 w-32">Air Date</th>
            <th className="text-center px-4 py-2.5 w-24">Duration</th>
            <th className="text-center px-4 py-2.5 w-16">Songs</th>
            <th className="text-left px-4 py-2.5 w-36">Status</th>
            <th className="text-right px-4 py-2.5 w-36">Actions</th>
          </tr>
        </thead>
        <tbody>
          {episodes.length === 0 && (
            <tr><td colSpan={7} className="px-4 py-8 text-center text-xs"
              style={{ color: C.sub }}>No episodes.</td></tr>
          )}
          {episodes.map((ep) => (
            <tr key={ep.id}
              onClick={() => onOpen?.(ep)}
              className="border-b last:border-0 hover:bg-green-50/20 cursor-pointer"
              style={{ borderColor: C.mint4 + "33" }}>
              <td className="px-4 py-2.5 font-semibold text-center"
                style={{ color: C.dark }}>{ep.episode_number}</td>
              <td className="px-4 py-2.5 text-xs max-w-[200px] truncate"
                style={{ color: C.sub }}>{ep.title || "—"}</td>
              <td className="px-4 py-2.5 text-xs" style={{ color: C.sub }}>
                {ep.air_date || "—"}
              </td>
              <td className="px-4 py-2.5 text-xs text-center font-mono"
                style={{ color: C.sub }}>{fmtDur(ep.total_duration_sec)}</td>
              <td className="px-4 py-2.5 text-center text-xs font-medium"
                style={{ color: C.dark }}>{ep.song_count ?? 0}</td>
              <td className="px-4 py-2.5"><StatusBadge status={ep.status} /></td>
              <td className="px-4 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-end gap-2">
                  {ep.status === "submitted" && (
                    <button
                      onClick={() => onReview({ ...ep, project_title: projectTitle, project_id: projectId })}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium"
                      style={{ background: C.dark, color: C.mint4 }}>
                      Review
                    </button>
                  )}
                  {ep.status === "approved" && (
                    <EpDownloadBtn episode={ep} projectTitle={projectTitle} />
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Bulk download bar ─────────────────────────────────────────────────────────
function BulkDownloadBar({ serial }) {
  const [fromEp, setFromEp] = useState("");
  const [toEp,   setToEp]   = useState("");
  const [busy,   setBusy]   = useState(null);

  const go = async (society) => {
    const from = parseInt(fromEp, 10);
    const to   = parseInt(toEp,   10);
    if (!from || !to || from > to) {
      await showAlert("Enter a valid episode range (From ≤ To).", { variant: "warn" }); return;
    }
    setBusy(society);
    try {
      const fname = `${serial.project_title}_${society.toUpperCase()}_EP${from}-${to}.xlsx`;
      await api.downloadBulkExport(serial.project_id, society, from, to, fname);
    } catch (ex) {
      await showAlert(ex.message, { title: "Download Failed", variant: "error" });
    } finally { setBusy(null); }
  };

  const societies = [
    { key: "iprs",  label: "IPRS" },
    { key: "prs",   label: "PRS"  },
    { key: "ascap", label: "ASCAP" },
  ];

  return (
    <div className="flex items-center gap-3 flex-wrap p-3 rounded-xl"
      style={{ background: C.mint4 + "22", border: `1px solid ${C.mint1}33` }}>
      <span className="text-xs font-semibold" style={{ color: C.dark }}>Bulk Download</span>
      <div className="flex items-center gap-1.5">
        <span className="text-xs" style={{ color: C.sub }}>Ep from</span>
        <input type="number" value={fromEp} onChange={(e) => setFromEp(e.target.value)}
          min={1} placeholder="1"
          className="w-16 px-2 py-1.5 rounded-lg text-xs focus:outline-none text-center"
          style={{ background: C.white, color: C.dark, border: `1px solid ${C.mint1}44` }} />
        <span className="text-xs" style={{ color: C.sub }}>to</span>
        <input type="number" value={toEp} onChange={(e) => setToEp(e.target.value)}
          min={1} placeholder="10"
          className="w-16 px-2 py-1.5 rounded-lg text-xs focus:outline-none text-center"
          style={{ background: C.white, color: C.dark, border: `1px solid ${C.mint1}44` }} />
      </div>
      <div className="flex items-center gap-2">
        {societies.map(({ key, label }) => (
          <button key={key} onClick={() => go(key)} disabled={busy !== null}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-50"
            style={{ background: C.dark, color: C.mint4 }}>
            <FileDown className="w-3.5 h-3.5" />
            {busy === key ? "Downloading…" : `Download ${label}`}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Serial detail view ────────────────────────────────────────────────────────
function SerialDetail({ serial, onBack, onReview }) {
  const { setActiveProjectId, setActiveEpisodeId, setScreen, setProjects } = useApp();
  const [detail, setDetail]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [subTab, setSubTab]   = useState("all");
  const [allPage, setAllPage]         = useState(1);
  const [approvedPage, setApprovedPage] = useState(1);
  const [societySubs, setSocietySubs]  = useState([]);
  const [subsLoading, setSubsLoading]  = useState(false);

  const openEpisode = (ep) => {
    const epStub = {
      id: ep.id, number: ep.episode_number, title: ep.title || "",
      airDate: ep.air_date, status: ep.status, editHistory: [], cues: [],
      rejectionNote: ep.rejection_note || null, reviewNote: ep.review_note || null,
      cueDetails: {}, totalDuration: ep.total_duration_sec || 0, musicalDuration: 0,
    };
    setProjects((prev) => {
      const existing = prev.find((p) => p.id === serial.project_id);
      if (existing) {
        const alreadyHas = (existing.episodes || []).some((e) => e.id === ep.id);
        if (alreadyHas) return prev;
        return prev.map((p) => p.id === serial.project_id
          ? { ...p, episodes: [...(p.episodes || []), epStub] }
          : p
        );
      }
      return [...prev, { id: serial.project_id, title: serial.project_title, episodes: [epStub] }];
    });
    setActiveProjectId(serial.project_id);
    setActiveEpisodeId(ep.id);
    setScreen("episode");
  };

  useEffect(() => {
    setLoading(true);
    api.reviewerSerialEpisodes(serial.project_id)
      .then(setDetail).catch(() => {})
      .finally(() => setLoading(false));
  }, [serial.project_id]);

  useEffect(() => {
    if (subTab !== "society") return;
    setSubsLoading(true);
    api.submissionsBySerial(serial.project_id)
      .then(setSocietySubs).catch(() => {})
      .finally(() => setSubsLoading(false));
  }, [subTab, serial.project_id]);

  const allEps      = detail?.episodes || [];
  const approvedEps = [...allEps]
    .filter((e) => e.status === "approved")
    .sort((a, b) => a.episode_number - b.episode_number);

  const allTotalPages      = Math.ceil(allEps.length / PER_PAGE);
  const approvedTotalPages = Math.ceil(approvedEps.length / PER_PAGE);
  const visibleAll      = allEps.slice((allPage - 1) * PER_PAGE, allPage * PER_PAGE);
  const visibleApproved = approvedEps.slice((approvedPage - 1) * PER_PAGE, approvedPage * PER_PAGE);

  return (
    <div>
      <button onClick={onBack}
        className="flex items-center gap-1.5 text-sm mb-5 hover:opacity-70"
        style={{ color: C.sub }}>
        <ChevronLeft className="w-4 h-4" />Back to Projects
      </button>

      <div className="mb-5">
        <p className="text-xs font-semibold uppercase tracking-widest mb-1"
          style={{ color: C.sub }}>SERIAL</p>
        <h2 className="text-2xl font-bold" style={{ fontFamily: FONTS.serif, color: C.dark }}>
          {serial.project_title}
        </h2>
      </div>

      <div className="flex gap-4 mb-5">
        <div className="px-4 py-3 rounded-xl border flex-1"
          style={{ background: C.white, borderColor: C.mint1 + "44" }}>
          <p className="text-[10px] uppercase tracking-wider mb-0.5" style={{ color: C.sub }}>Channel</p>
          <p className="text-sm font-medium" style={{ color: C.dark }}>{detail?.channel || "—"}</p>
        </div>
        <div className="px-4 py-3 rounded-xl border"
          style={{ background: C.white, borderColor: C.mint1 + "44" }}>
          <p className="text-[10px] uppercase tracking-wider mb-0.5" style={{ color: C.sub }}>Episodes</p>
          <p className="text-sm font-semibold" style={{ color: C.dark }}>{allEps.length}</p>
        </div>
        <div className="px-4 py-3 rounded-xl border"
          style={{ background: "#E8F5E9", borderColor: "#A5D6A7" }}>
          <p className="text-[10px] uppercase tracking-wider mb-0.5" style={{ color: "#2E7D32" }}>Approved</p>
          <p className="text-sm font-semibold" style={{ color: "#2E7D32" }}>{approvedEps.length}</p>
        </div>
        <div className="px-4 py-3 rounded-xl border"
          style={{ background: "#E3F2FD", borderColor: "#90CAF9" }}>
          <p className="text-[10px] uppercase tracking-wider mb-0.5" style={{ color: "#1565C0" }}>Pending Review</p>
          <p className="text-sm font-semibold" style={{ color: "#1565C0" }}>
            {allEps.filter((e) => e.status === "submitted").length}
          </p>
        </div>
      </div>

      <div className="mb-5">
        <BulkDownloadBar serial={serial} />
      </div>

      <div className="flex gap-1 mb-4 p-1 rounded-xl w-fit"
        style={{ background: C.mint4 + "33" }}>
        {[
          { key: "all",      label: `All Episodes (${allEps.length})` },
          { key: "approved", label: `Approved (${approvedEps.length})` },
          { key: "society",  label: "Submitted to Society" },
        ].map((t) => (
          <button key={t.key} onClick={() => setSubTab(t.key)}
            className="px-4 py-1.5 rounded-lg text-xs font-medium transition-all"
            style={subTab === t.key
              ? { background: C.dark, color: C.mint4 }
              : { color: C.sub }}>
            {t.label}
          </button>
        ))}
      </div>

      {subTab !== "society" && loading ? (
        <div className="py-10 text-center text-sm" style={{ color: C.sub }}>Loading episodes…</div>
      ) : (
        <>
          {subTab === "all" && (
            <>
              <EpisodeTable
                episodes={visibleAll}
                projectTitle={serial.project_title}
                projectId={serial.project_id}
                onReview={onReview}
                onOpen={openEpisode}
              />
              <Paginator page={allPage} total={allTotalPages} onChange={(p) => { setAllPage(p); window.scrollTo(0,0); }} />
            </>
          )}
          {subTab === "approved" && (
            <>
              {approvedEps.length === 0 ? (
                <div className="py-10 text-center text-sm" style={{ color: C.sub }}>
                  No approved episodes yet.
                </div>
              ) : (
                <>
                  <EpisodeTable
                    episodes={visibleApproved}
                    projectTitle={serial.project_title}
                    projectId={serial.project_id}
                    onReview={onReview}
                    onOpen={openEpisode}
                  />
                  <Paginator page={approvedPage} total={approvedTotalPages}
                    onChange={(p) => { setApprovedPage(p); window.scrollTo(0,0); }} />
                </>
              )}
            </>
          )}
          {subTab === "society" && (
            subsLoading ? (
              <div className="py-10 text-center text-sm" style={{ color: C.sub }}>Loading…</div>
            ) : societySubs.length === 0 ? (
              <div className="py-10 text-center text-sm" style={{ color: C.sub }}>
                No society submissions for this serial yet.
              </div>
            ) : (
              <div className="rounded-xl border overflow-hidden"
                style={{ background: C.white, borderColor: C.mint1 + "44" }}>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[10px] uppercase tracking-wider border-b"
                      style={{ borderColor: C.mint4 + "44", color: C.sub, background: C.mint4 + "22" }}>
                      <th className="text-left px-4 py-2.5">Episodes</th>
                      <th className="text-left px-4 py-2.5">Client</th>
                      <th className="text-left px-4 py-2.5">Notes</th>
                      <th className="text-left px-4 py-2.5">Submitted By</th>
                      <th className="text-left px-4 py-2.5">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {societySubs.map((s) => (
                      <tr key={s.id} className="border-b last:border-0"
                        style={{ borderColor: C.mint4 + "33" }}>
                        <td className="px-4 py-2.5 font-medium" style={{ color: C.dark }}>
                          Ep {s.episode_from}–{s.episode_to}
                        </td>
                        <td className="px-4 py-2.5 text-xs" style={{ color: C.sub }}>{s.client || "—"}</td>
                        <td className="px-4 py-2.5 text-xs max-w-[200px] truncate" style={{ color: C.sub }}>
                          {s.notes || "—"}
                        </td>
                        <td className="px-4 py-2.5 text-xs" style={{ color: C.sub }}>
                          {s.submitted_by_name || "—"}
                        </td>
                        <td className="px-4 py-2.5 text-xs" style={{ color: C.sub }}>
                          {s.submitted_at ? new Date(s.submitted_at).toLocaleDateString() : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}
        </>
      )}
    </div>
  );
}

// ── Movie detail view (no All Episodes, no Bulk Download) ─────────────────────
function MovieDetail({ movie, onBack, onReview }) {
  const { setActiveProjectId, setActiveEpisodeId, setScreen, setProjects } = useApp();
  const [detail, setDetail]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [subTab, setSubTab]   = useState("approved");
  const [societySubs, setSocietySubs] = useState([]);
  const [subsLoading, setSubsLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    api.reviewerSerialEpisodes(movie.project_id)
      .then(setDetail).catch(() => {})
      .finally(() => setLoading(false));
  }, [movie.project_id]);

  useEffect(() => {
    if (subTab !== "society") return;
    setSubsLoading(true);
    api.submissionsBySerial(movie.project_id)
      .then(setSocietySubs).catch(() => {})
      .finally(() => setSubsLoading(false));
  }, [subTab, movie.project_id]);

  const allEps      = detail?.episodes || [];
  const approvedEps = allEps.filter((e) => e.status === "approved");
  const pendingEps  = allEps.filter((e) => e.status === "submitted");

  const openEpisode = (ep) => {
    const epStub = {
      id: ep.id, number: ep.episode_number, title: ep.title || "",
      airDate: ep.air_date, status: ep.status, editHistory: [], cues: [],
      rejectionNote: ep.rejection_note || null, reviewNote: ep.review_note || null,
      cueDetails: {}, totalDuration: ep.total_duration_sec || 0, musicalDuration: 0,
    };
    setProjects((prev) => {
      const existing = prev.find((p) => p.id === movie.project_id);
      if (existing) {
        const alreadyHas = (existing.episodes || []).some((e) => e.id === ep.id);
        if (alreadyHas) return prev;
        return prev.map((p) => p.id === movie.project_id
          ? { ...p, episodes: [...(p.episodes || []), epStub] }
          : p
        );
      }
      return [...prev, { id: movie.project_id, title: movie.project_title, episodes: [epStub] }];
    });
    setActiveProjectId(movie.project_id);
    setActiveEpisodeId(ep.id);
    setScreen("episode");
  };

  // Movie cue sheet card — shows single file-level status
  const MovieCueCard = ({ ep }) => (
    <div className="rounded-xl border p-4 flex items-center justify-between"
      style={{ background: C.white, borderColor: C.mint1 + "44" }}>
      <div className="flex items-center gap-3">
        <Film className="w-5 h-5 flex-shrink-0" style={{ color: C.mint1 }} />
        <div>
          <p className="text-sm font-semibold" style={{ color: C.dark }}>{ep.title || movie.project_title}</p>
          <div className="flex items-center gap-3 mt-0.5">
            <span className="text-xs" style={{ color: C.sub }}>{ep.air_date || "—"}</span>
            <span className="text-xs font-mono" style={{ color: C.sub }}>{fmtDur(ep.total_duration_sec)}</span>
            <span className="text-xs" style={{ color: C.sub }}>{ep.song_count ?? 0} songs</span>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <StatusBadge status={ep.status} />
        {ep.status === "submitted" && (
          <button
            onClick={() => onReview({ ...ep, project_title: movie.project_title, project_id: movie.project_id, project_type: "MOVIE" })}
            className="px-3 py-1.5 rounded-lg text-xs font-medium"
            style={{ background: C.dark, color: C.mint4 }}>
            Review
          </button>
        )}
        {ep.status === "approved" && (
          <EpDownloadBtn episode={ep} projectTitle={movie.project_title} />
        )}
      </div>
    </div>
  );

  return (
    <div>
      <button onClick={onBack}
        className="flex items-center gap-1.5 text-sm mb-5 hover:opacity-70"
        style={{ color: C.sub }}>
        <ChevronLeft className="w-4 h-4" />Back to Projects
      </button>

      <div className="mb-5">
        <p className="text-xs font-semibold uppercase tracking-widest mb-1"
          style={{ color: C.sub }}>MOVIE</p>
        <h2 className="text-2xl font-bold" style={{ fontFamily: FONTS.serif, color: C.dark }}>
          {movie.project_title}
        </h2>
      </div>

      <div className="flex gap-4 mb-5">
        <div className="px-4 py-3 rounded-xl border"
          style={{ background: "#E8F5E9", borderColor: "#A5D6A7" }}>
          <p className="text-[10px] uppercase tracking-wider mb-0.5" style={{ color: "#2E7D32" }}>Approved</p>
          <p className="text-sm font-semibold" style={{ color: "#2E7D32" }}>{approvedEps.length}</p>
        </div>
        <div className="px-4 py-3 rounded-xl border"
          style={{ background: "#E3F2FD", borderColor: "#90CAF9" }}>
          <p className="text-[10px] uppercase tracking-wider mb-0.5" style={{ color: "#1565C0" }}>Pending Review</p>
          <p className="text-sm font-semibold" style={{ color: "#1565C0" }}>{pendingEps.length}</p>
        </div>
      </div>

      <div className="flex gap-1 mb-4 p-1 rounded-xl w-fit"
        style={{ background: C.mint4 + "33" }}>
        {[
          { key: "approved", label: `Approved (${approvedEps.length})` },
          { key: "society",  label: "Submitted to Society" },
        ].map((t) => (
          <button key={t.key} onClick={() => setSubTab(t.key)}
            className="px-4 py-1.5 rounded-lg text-xs font-medium transition-all"
            style={subTab === t.key
              ? { background: C.dark, color: C.mint4 }
              : { color: C.sub }}>
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="py-10 text-center text-sm" style={{ color: C.sub }}>Loading…</div>
      ) : (
        <>
          {subTab === "approved" && (
            <>
              {/* Pending review cards first */}
              {pendingEps.length > 0 && (
                <div className="mb-4">
                  <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "#1565C0" }}>
                    Pending Review
                  </p>
                  <div className="space-y-2">
                    {pendingEps.map((ep) => <MovieCueCard key={ep.id} ep={ep} />)}
                  </div>
                </div>
              )}
              {approvedEps.length === 0 && pendingEps.length === 0 ? (
                <div className="py-10 text-center text-sm" style={{ color: C.sub }}>No cue sheets yet.</div>
              ) : approvedEps.length > 0 && (
                <div className="space-y-2">
                  {approvedEps.map((ep) => <MovieCueCard key={ep.id} ep={ep} />)}
                </div>
              )}
            </>
          )}
          {subTab === "society" && (
            subsLoading ? (
              <div className="py-10 text-center text-sm" style={{ color: C.sub }}>Loading…</div>
            ) : societySubs.length === 0 ? (
              <div className="py-10 text-center text-sm" style={{ color: C.sub }}>
                No society submissions for this movie yet.
              </div>
            ) : (
              <div className="rounded-xl border overflow-hidden"
                style={{ background: C.white, borderColor: C.mint1 + "44" }}>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[10px] uppercase tracking-wider border-b"
                      style={{ borderColor: C.mint4 + "44", color: C.sub, background: C.mint4 + "22" }}>
                      <th className="text-left px-4 py-2.5">Client</th>
                      <th className="text-left px-4 py-2.5">Notes</th>
                      <th className="text-left px-4 py-2.5">Submitted By</th>
                      <th className="text-left px-4 py-2.5">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {societySubs.map((s) => (
                      <tr key={s.id} className="border-b last:border-0"
                        style={{ borderColor: C.mint4 + "33" }}>
                        <td className="px-4 py-2.5 text-xs" style={{ color: C.sub }}>{s.client || "—"}</td>
                        <td className="px-4 py-2.5 text-xs max-w-[200px] truncate" style={{ color: C.sub }}>
                          {s.notes || "—"}
                        </td>
                        <td className="px-4 py-2.5 text-xs" style={{ color: C.sub }}>
                          {s.submitted_by_name || "—"}
                        </td>
                        <td className="px-4 py-2.5 text-xs" style={{ color: C.sub }}>
                          {s.submitted_at ? new Date(s.submitted_at).toLocaleDateString() : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}
        </>
      )}
    </div>
  );
}

// ── Projects list (Serials sub-tab) ────────────────────────────────────────────
function SerialsSubTab({ onOpenSerial }) {
  const [serials, setSerials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage]       = useState(1);
  const [searchQ, setSearchQ] = useState("");

  useEffect(() => {
    api.reviewerSerials()
      .then(setSerials).catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = serials.filter((s) => {
    const q = searchQ.trim().toLowerCase();
    return !q || s.project_title.toLowerCase().includes(q);
  });
  const totalPages     = Math.ceil(filtered.length / PER_PAGE);
  const visibleSerials = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5"
            style={{ color: C.sub }} />
          <input type="text" value={searchQ}
            onChange={(e) => { setSearchQ(e.target.value); setPage(1); }}
            placeholder="Search serials…"
            className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border focus:outline-none"
            style={{ borderColor: C.mint1 + "44", background: C.white, color: C.dark }} />
          {searchQ && (
            <button onClick={() => { setSearchQ(""); setPage(1); }}
              className="absolute right-2 top-1/2 -translate-y-1/2">
              <X className="w-3 h-3" style={{ color: C.sub }} />
            </button>
          )}
        </div>
        <span className="text-xs" style={{ color: C.sub }}>
          {filtered.length} serial{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      {loading && <div className="py-10 text-center text-sm" style={{ color: C.sub }}>Loading…</div>}

      {!loading && filtered.length === 0 && (
        <div className="py-10 text-center text-sm" style={{ color: C.sub }}>
          No serials with submitted or approved episodes.
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <div className="rounded-2xl border overflow-hidden"
          style={{ background: C.white, borderColor: C.mint1 + "44" }}>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider border-b"
                style={{ borderColor: C.mint4 + "55", color: C.sub, background: C.mint4 + "22" }}>
                <th className="text-left px-5 py-3">Serial Name</th>
                <th className="text-center px-5 py-3 w-28">Total Eps</th>
                <th className="text-center px-5 py-3 w-32">Pending Review</th>
                <th className="text-center px-5 py-3 w-28">Approved</th>
                <th className="text-right px-5 py-3 w-36">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleSerials.map((serial) => (
                <tr key={serial.project_id}
                  className="border-b last:border-0 hover:bg-green-50/30 cursor-pointer"
                  style={{ borderColor: C.mint4 + "55" }}
                  onClick={() => onOpenSerial(serial)}>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <Layers className="w-3.5 h-3.5 flex-shrink-0" style={{ color: C.mint1 }} />
                      <span className="font-semibold text-sm" style={{ color: C.dark }}>
                        {serial.project_title}
                      </span>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-center text-sm" style={{ color: C.sub }}>
                    {serial.total_episodes}
                  </td>
                  <td className="px-5 py-3 text-center">
                    {serial.submitted_count > 0 ? (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold"
                        style={{ background: "#E3F2FD", color: "#1565C0" }}>
                        {serial.submitted_count} pending
                      </span>
                    ) : (
                      <span className="text-xs" style={{ color: C.sub }}>—</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-center">
                    {serial.approved_count > 0 ? (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold"
                        style={{ background: "#E8F5E9", color: "#2E7D32" }}>
                        {serial.approved_count} approved
                      </span>
                    ) : (
                      <span className="text-xs" style={{ color: C.sub }}>—</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => onOpenSerial(serial)}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium ml-auto"
                      style={{ background: C.dark, color: C.mint4 }}>
                      Open <ChevronRight className="w-3 h-3" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Paginator page={page} total={totalPages} onChange={setPage} />
    </div>
  );
}

// ── Projects list (Movies sub-tab) ─────────────────────────────────────────────
function MoviesSubTab({ onOpenMovie }) {
  const [movies, setMovies]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage]       = useState(1);
  const [searchQ, setSearchQ] = useState("");

  useEffect(() => {
    api.reviewerMovies()
      .then(setMovies).catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = movies.filter((m) => {
    const q = searchQ.trim().toLowerCase();
    return !q || m.project_title.toLowerCase().includes(q);
  });
  const totalPages    = Math.ceil(filtered.length / PER_PAGE);
  const visibleMovies = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5"
            style={{ color: C.sub }} />
          <input type="text" value={searchQ}
            onChange={(e) => { setSearchQ(e.target.value); setPage(1); }}
            placeholder="Search movies…"
            className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border focus:outline-none"
            style={{ borderColor: C.mint1 + "44", background: C.white, color: C.dark }} />
          {searchQ && (
            <button onClick={() => { setSearchQ(""); setPage(1); }}
              className="absolute right-2 top-1/2 -translate-y-1/2">
              <X className="w-3 h-3" style={{ color: C.sub }} />
            </button>
          )}
        </div>
        <span className="text-xs" style={{ color: C.sub }}>
          {filtered.length} movie{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      {loading && <div className="py-10 text-center text-sm" style={{ color: C.sub }}>Loading…</div>}

      {!loading && filtered.length === 0 && (
        <div className="py-10 text-center text-sm" style={{ color: C.sub }}>
          No movies with submitted or approved cue sheets.
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <div className="rounded-2xl border overflow-hidden"
          style={{ background: C.white, borderColor: C.mint1 + "44" }}>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider border-b"
                style={{ borderColor: C.mint4 + "55", color: C.sub, background: C.mint4 + "22" }}>
                <th className="text-left px-5 py-3">Movie Title</th>
                <th className="text-center px-5 py-3 w-32">Pending Review</th>
                <th className="text-center px-5 py-3 w-28">Approved</th>
                <th className="text-right px-5 py-3 w-36">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleMovies.map((movie) => (
                <tr key={movie.project_id}
                  className="border-b last:border-0 hover:bg-green-50/30 cursor-pointer"
                  style={{ borderColor: C.mint4 + "55" }}
                  onClick={() => onOpenMovie(movie)}>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <Film className="w-3.5 h-3.5 flex-shrink-0" style={{ color: C.mint1 }} />
                      <span className="font-semibold text-sm" style={{ color: C.dark }}>
                        {movie.project_title}
                      </span>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-center">
                    {movie.submitted_count > 0 ? (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold"
                        style={{ background: "#E3F2FD", color: "#1565C0" }}>
                        {movie.submitted_count} pending
                      </span>
                    ) : (
                      <span className="text-xs" style={{ color: C.sub }}>—</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-center">
                    {movie.approved_count > 0 ? (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold"
                        style={{ background: "#E8F5E9", color: "#2E7D32" }}>
                        {movie.approved_count} approved
                      </span>
                    ) : (
                      <span className="text-xs" style={{ color: C.sub }}>—</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => onOpenMovie(movie)}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium ml-auto"
                      style={{ background: C.dark, color: C.mint4 }}>
                      Open <ChevronRight className="w-3 h-3" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Paginator page={page} total={totalPages} onChange={setPage} />
    </div>
  );
}

// ── Projects tab (Serials + Movies) ───────────────────────────────────────────
function ProjectsTab({ onReviewEp }) {
  const [view, setView]         = useState("list");
  const [projTab, setProjTab]   = useState("serials");
  const [selected, setSelected] = useState(null);
  const [selType, setSelType]   = useState(null); // "serial" | "movie"

  const openSerial = (serial) => { setSelected(serial); setSelType("serial"); setView("detail"); };
  const openMovie  = (movie)  => { setSelected(movie);  setSelType("movie");  setView("detail"); };

  if (view === "detail" && selected) {
    return selType === "movie" ? (
      <MovieDetail movie={selected} onBack={() => setView("list")} onReview={onReviewEp} />
    ) : (
      <SerialDetail serial={selected} onBack={() => setView("list")} onReview={onReviewEp} />
    );
  }

  return (
    <div>
      {/* Sub-tabs */}
      <div className="flex gap-1 mb-5 p-1 rounded-xl w-fit"
        style={{ background: C.mint4 + "33" }}>
        {[
          { key: "serials", label: "Serials", Icon: Layers },
          { key: "movies",  label: "Movies",  Icon: Film   },
        ].map(({ key, label, Icon }) => (
          <button key={key} onClick={() => setProjTab(key)}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-medium transition-all"
            style={projTab === key
              ? { background: C.dark, color: C.mint4 }
              : { color: C.sub }}>
            <Icon className="w-3.5 h-3.5" />{label}
          </button>
        ))}
      </div>

      {projTab === "serials" && <SerialsSubTab onOpenSerial={openSerial} />}
      {projTab === "movies"  && <MoviesSubTab  onOpenMovie={openMovie}   />}
    </div>
  );
}

// ── Society status badge ──────────────────────────────────────────────────────
function IprsBadge({ item }) {
  if (item.accepted_by_iprs) return (
    <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold" style={{ background: "#E8F5E9", color: "#2E7D32" }}>
      ✓ Society Accepted
    </span>
  );
  if (item.submitted_to_iprs) return (
    <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold" style={{ background: "#E3F2FD", color: "#1565C0" }}>
      ↑ Sent to Society
    </span>
  );
  return (
    <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold" style={{ background: "#FFF3E0", color: "#E65100" }}>
      Pending Society
    </span>
  );
}

// ── Per-submission IPRS action buttons ────────────────────────────────────────
function IprsActions({ item, onUpdate }) {
  const [busy, setBusy] = useState(false);

  const handleSubmitIprs = async () => {
    const ok = await showConfirm(
      `Mark "Ep ${item.episode_from}–${item.episode_to}" as submitted to the society?\n\nA followup reminder will be sent in 3 weeks if acceptance is not confirmed.`,
      { title: "Submit to Society", confirmLabel: "Yes, Mark Submitted", variant: "warn" }
    );
    if (!ok) return;
    setBusy(true);
    try {
      const updated = await api.markSubmittedToIprs(item.id);
      onUpdate(updated);
    } catch (ex) { await showAlert(ex.message, { title: "Failed", variant: "error" }); }
    finally { setBusy(false); }
  };

  const handleAcceptIprs = async () => {
    const ok = await showConfirm(
      `Confirm that the society has accepted and registered "Ep ${item.episode_from}–${item.episode_to}"?\n\nThis will stop all followup reminders for this submission.`,
      { title: "Accepted by Society", confirmLabel: "Yes, Society Confirmed", variant: "warn" }
    );
    if (!ok) return;
    setBusy(true);
    try {
      const updated = await api.markAcceptedByIprs(item.id);
      onUpdate(updated);
    } catch (ex) { await showAlert(ex.message, { title: "Failed", variant: "error" }); }
    finally { setBusy(false); }
  };

  if (item.accepted_by_iprs) return null;

  return (
    <div className="flex items-center gap-1.5">
      {!item.submitted_to_iprs && (
        <button onClick={handleSubmitIprs} disabled={busy}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50 hover:opacity-90 transition"
          style={{ background: "#1565C0", color: "#fff" }}>
          <Send className="w-3 h-3 shrink-0" />{busy ? "…" : "Submit to Society"}
        </button>
      )}
      {item.submitted_to_iprs && (
        <button onClick={handleAcceptIprs} disabled={busy}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50 hover:opacity-90 transition"
          style={{ background: "#2E7D32", color: "#fff" }}>
          <CheckCircle2 className="w-3 h-3 shrink-0" />{busy ? "…" : "Accepted by Society"}
        </button>
      )}
    </div>
  );
}

const LOG_PAGE = 5;

// ── Submission group component ─────────────────────────────────────────────────
function SerialSubmissionGroup({ group, onItemUpdate }) {
  const [open, setOpen]   = useState(true);
  const [page, setPage]   = useState(1);
  // Latest first
  const sorted = [...group.items].sort((a, b) => new Date(b.submitted_at) - new Date(a.submitted_at));
  const totalPages = Math.ceil(sorted.length / LOG_PAGE);
  const paged = sorted.slice((page - 1) * LOG_PAGE, page * LOG_PAGE);

  return (
    <div className="rounded-xl border overflow-hidden"
      style={{ background: C.white, borderColor: C.mint1 + "44" }}>
      <button onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 border-b"
        style={{ borderColor: C.mint4 + "44", background: C.mint4 + "22" }}>
        <div className="flex items-center gap-2 flex-wrap">
          <Layers className="w-3.5 h-3.5" style={{ color: C.mint1 }} />
          <span className="font-semibold text-sm" style={{ color: C.dark }}>{group.project_title}</span>
          <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: C.mint1 + "33", color: C.sub }}>
            {group.items.length} log{group.items.length !== 1 ? "s" : ""}
          </span>
          {group.items.some((i) => !i.submitted_to_iprs) && (
            <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold" style={{ background: "#FFF3E0", color: "#E65100" }}>
              {group.items.filter((i) => !i.submitted_to_iprs).length} pending IPRS
            </span>
          )}
          {group.items.some((i) => i.submitted_to_iprs && !i.accepted_by_iprs) && (
            <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold" style={{ background: "#E3F2FD", color: "#1565C0" }}>
              {group.items.filter((i) => i.submitted_to_iprs && !i.accepted_by_iprs).length} awaiting acceptance
            </span>
          )}
        </div>
        <ChevronDown className="w-4 h-4 shrink-0 transition-transform"
          style={{ color: C.sub, transform: open ? "rotate(180deg)" : "" }} />
      </button>
      {open && (
        <>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider border-b"
                style={{ borderColor: C.mint4 + "44", color: C.sub, background: C.mint4 + "11" }}>
                <th className="text-left px-4 py-2">Episodes</th>
                <th className="text-left px-4 py-2">Client</th>
                <th className="text-left px-4 py-2">Submitted By</th>
                <th className="text-left px-4 py-2">Date</th>
                <th className="text-left px-4 py-2">IPRS Status</th>
                <th className="text-left px-4 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {paged.map((item) => (
                <tr key={item.id} className="border-b last:border-0" style={{ borderColor: C.mint4 + "33",
                  background: !item.submitted_to_iprs ? "#FFFDE7" : item.accepted_by_iprs ? "#F1F8E9" : "#E3F2FD11" }}>
                  <td className="px-4 py-2.5 font-medium" style={{ color: C.dark }}>
                    Ep {item.episode_from}–{item.episode_to}
                  </td>
                  <td className="px-4 py-2.5 text-xs" style={{ color: C.sub }}>{item.client || "—"}</td>
                  <td className="px-4 py-2.5 text-xs" style={{ color: C.sub }}>{item.submitted_by_name || "—"}</td>
                  <td className="px-4 py-2.5 text-xs" style={{ color: C.sub }}>
                    {item.submitted_at ? new Date(item.submitted_at).toLocaleDateString() : "—"}
                  </td>
                  <td className="px-4 py-2.5"><IprsBadge item={item} /></td>
                  <td className="px-4 py-2.5"><IprsActions item={item} onUpdate={onItemUpdate} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          {totalPages > 1 && (
            <div className="px-4 py-2 border-t flex items-center justify-between" style={{ borderColor: C.mint4 + "44" }}>
              <span className="text-[10px]" style={{ color: C.sub }}>Page {page} / {totalPages} · {sorted.length} logs</span>
              <div className="flex gap-1">
                <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
                  className="p-1 rounded disabled:opacity-30" style={{ color: C.sub }}><ChevronLeft className="w-3.5 h-3.5" /></button>
                <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                  className="p-1 rounded disabled:opacity-30" style={{ color: C.sub }}><ChevronRight className="w-3.5 h-3.5" /></button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function MovieSubmissionGroup({ group, onItemUpdate }) {
  const [open, setOpen] = useState(true);
  const [page, setPage] = useState(1);
  const sorted = [...group.items].sort((a, b) => new Date(b.submitted_at) - new Date(a.submitted_at));
  const totalPages = Math.ceil(sorted.length / LOG_PAGE);
  const paged = sorted.slice((page - 1) * LOG_PAGE, page * LOG_PAGE);

  return (
    <div className="rounded-xl border overflow-hidden"
      style={{ background: C.white, borderColor: C.mint1 + "44" }}>
      <button onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 border-b"
        style={{ borderColor: C.mint4 + "44", background: C.mint4 + "22" }}>
        <div className="flex items-center gap-2 flex-wrap">
          <Film className="w-3.5 h-3.5" style={{ color: C.mint1 }} />
          <span className="font-semibold text-sm" style={{ color: C.dark }}>{group.project_title}</span>
          <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: C.mint1 + "33", color: C.sub }}>
            {group.items.length} log{group.items.length !== 1 ? "s" : ""}
          </span>
          {group.items.some((i) => !i.submitted_to_iprs) && (
            <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold" style={{ background: "#FFF3E0", color: "#E65100" }}>
              {group.items.filter((i) => !i.submitted_to_iprs).length} pending IPRS
            </span>
          )}
        </div>
        <ChevronDown className="w-4 h-4 shrink-0 transition-transform"
          style={{ color: C.sub, transform: open ? "rotate(180deg)" : "" }} />
      </button>
      {open && (
        <>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider border-b"
                style={{ borderColor: C.mint4 + "44", color: C.sub, background: C.mint4 + "11" }}>
                <th className="text-left px-4 py-2">Client</th>
                <th className="text-left px-4 py-2">Submitted By</th>
                <th className="text-left px-4 py-2">Date</th>
                <th className="text-left px-4 py-2">IPRS Status</th>
                <th className="text-left px-4 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {paged.map((item) => (
                <tr key={item.id} className="border-b last:border-0" style={{ borderColor: C.mint4 + "33",
                  background: !item.submitted_to_iprs ? "#FFFDE7" : item.accepted_by_iprs ? "#F1F8E9" : "#E3F2FD11" }}>
                  <td className="px-4 py-2.5 text-xs" style={{ color: C.sub }}>{item.client || "—"}</td>
                  <td className="px-4 py-2.5 text-xs" style={{ color: C.sub }}>{item.submitted_by_name || "—"}</td>
                  <td className="px-4 py-2.5 text-xs" style={{ color: C.sub }}>
                    {item.submitted_at ? new Date(item.submitted_at).toLocaleDateString() : "—"}
                  </td>
                  <td className="px-4 py-2.5"><IprsBadge item={item} /></td>
                  <td className="px-4 py-2.5"><IprsActions item={item} onUpdate={onItemUpdate} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          {totalPages > 1 && (
            <div className="px-4 py-2 border-t flex items-center justify-between" style={{ borderColor: C.mint4 + "44" }}>
              <span className="text-[10px]" style={{ color: C.sub }}>Page {page} / {totalPages}</span>
              <div className="flex gap-1">
                <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
                  className="p-1 rounded disabled:opacity-30" style={{ color: C.sub }}><ChevronLeft className="w-3.5 h-3.5" /></button>
                <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                  className="p-1 rounded disabled:opacity-30" style={{ color: C.sub }}><ChevronRight className="w-3.5 h-3.5" /></button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Month names ───────────────────────────────────────────────────────────────
const MONTH_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const MONTH_FULL  = ["January","February","March","April","May","June","July","August","September","October","November","December"];

// ── Reviewer Calendar tab ─────────────────────────────────────────────────────
function ReviewerCalendarTab() {
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: Math.max(1, currentYear - 2026 + 1) }, (_, i) => 2026 + i);
  const [selectedYear, setSelectedYear]   = useState(currentYear >= 2026 ? currentYear : 2026);
  const [calData, setCalData]             = useState(null);
  const [loading, setLoading]             = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(null);

  useEffect(() => {
    setLoading(true); setSelectedMonth(null);
    api.reviewerCalendar(selectedYear)
      .then(setCalData).catch(() => setCalData(null))
      .finally(() => setLoading(false));
  }, [selectedYear]);

  // per-month metrics
  const mTotal = (m) => {
    const d      = calData?.months?.[String(m)]      ?? {};
    const target = (calData?.month_target?.[String(m)]) || 0;
    const sub    = d.submitted || 0;
    const rev    = d.approved  || 0;
    const pend   = Math.max(0, sub - rev);
    return { target, sub, rev, pend };
  };

  const qTotal = (months) =>
    months.reduce(
      (acc, m) => { const t = mTotal(m); return { target: acc.target + t.target, sub: acc.sub + t.sub, rev: acc.rev + t.rev, pend: acc.pend + t.pend }; },
      { target: 0, sub: 0, rev: 0, pend: 0 }
    );

  const quarters   = [[1,2,3,4],[5,6,7,8],[9,10,11,12]];
  const selData    = selectedMonth ? (calData?.months?.[String(selectedMonth)] ?? {}) : null;
  const selTarget  = selectedMonth ? ((calData?.month_target?.[String(selectedMonth)]) || 0) : 0;
  const selSub     = selData?.submitted || 0;
  const selRev     = selData?.approved  || 0;
  const selPend    = Math.max(0, selSub - selRev);
  const weekTgts   = selectedMonth ? (calData?.week_target?.[String(selectedMonth)] ?? {}) : {};

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
                    const mt          = mTotal(m);
                    const isSel       = selectedMonth === m;
                    const isCurrent   = selectedYear === new Date().getFullYear() && m === new Date().getMonth() + 1;
                    const hasActivity = mt.sub > 0 || mt.rev > 0;
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
                            {MONTH_SHORT[m - 1]}
                          </div>
                          {isCurrent && !isSel && (
                            <span className="text-[8px] font-bold uppercase px-1.5 py-0.5 rounded-full" style={{ background: C.mint1, color: C.dark }}>Now</span>
                          )}
                        </div>
                        <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                          {[
                            { val: mt.target, label: "Target",   color: isSel ? "#fde68a" : "#E65100" },
                            { val: mt.sub,    label: "Submitted", color: isSel ? C.mint4   : C.dark    },
                            { val: mt.rev,    label: "Reviewed",  color: isSel ? "#86efac" : C.ok      },
                            { val: mt.pend,   label: "Pending",   color: isSel ? "#fca5a5" : C.danger  },
                          ].map(({ val, label, color }) => (
                            <div key={label}>
                              <div className="text-sm font-bold leading-none" style={{ color }}>{val}</div>
                              <div className="text-[8px] mt-0.5 uppercase tracking-wide" style={{ color: color + "99" }}>{label}</div>
                            </div>
                          ))}
                        </div>
                      </button>
                    );
                  })}

                  {/* Quarter total */}
                  <div className="w-24 shrink-0 rounded-xl border p-3 flex flex-col justify-center"
                    style={{ background: C.mint4 + "33", borderColor: C.mint4 + "55" }}>
                    <div className="text-[10px] font-bold uppercase tracking-widest mb-2 text-center" style={{ color: C.sub }}>Q{qi + 1}</div>
                    <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-center">
                      {[
                        { val: qt.target, color: "#E65100", lbl: "Tgt" },
                        { val: qt.sub,    color: C.dark,    lbl: "Sub" },
                        { val: qt.rev,    color: C.ok,      lbl: "Rev" },
                        { val: qt.pend,   color: C.danger,  lbl: "Pend" },
                      ].map(({ val, color, lbl }) => (
                        <div key={lbl}>
                          <div className="text-sm font-bold" style={{ color }}>{val}</div>
                          <div className="text-[8px] uppercase" style={{ color: color + "77" }}>{lbl}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Month detail */}
        {selectedMonth && selData !== null && (
          <div className="mt-5 rounded-xl border overflow-hidden" style={{ background: C.white, borderColor: C.mint1 + "44" }}>
            {/* Header — 4 totals */}
            <div className="px-5 py-3 border-b flex items-center gap-6 flex-wrap"
              style={{ borderColor: C.mint4, background: C.mint4 + "33" }}>
              <div className="font-semibold text-sm" style={{ fontFamily: FONTS.serif, color: C.dark }}>
                {MONTH_FULL[selectedMonth - 1]} {selectedYear}
              </div>
              <div className="flex gap-5 ml-auto">
                {[
                  { label: "Target",             val: selTarget, color: "#E65100" },
                  { label: "Submitted",           val: selSub,    color: C.dark    },
                  { label: "Reviewed",            val: selRev,    color: C.ok      },
                  { label: "Pending to Review",   val: selPend,   color: C.danger  },
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
                      {[
                        { h: "Week",                            style: {} },
                        { h: "Target",                          style: { color: "#E65100" } },
                        { h: "Submitted",                       style: { color: C.dark    } },
                        { h: "Reviewed",                        style: { color: C.ok      } },
                        { h: "Pending to Review",                    style: { color: C.danger  } },
                      ].map(({ h, style }) => (
                        <th key={h} className="text-left pb-2 pr-5 font-semibold uppercase tracking-wide"
                          style={{ color: C.sub, ...style }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(selData.weeks || {}).sort(([a],[b]) => +a - +b).map(([wk, wd]) => {
                      const wSub  = wd.submitted || 0;
                      const wRev  = wd.approved  || 0;
                      const wPend = Math.max(0, wSub - wRev);
                      const wTgt  = weekTgts[wk] || 0;
                      return (
                        <tr key={wk} className="border-b last:border-0" style={{ borderColor: C.mint4 + "44" }}>
                          <td className="py-2.5 pr-5 font-semibold" style={{ color: C.dark }}>Week {wk}</td>
                          <td className="py-2.5 pr-5 font-bold" style={{ color: "#E65100" }}>{wTgt || "—"}</td>
                          <td className="py-2.5 pr-5 font-bold" style={{ color: C.dark }}>{wSub}</td>
                          <td className="py-2.5 pr-5 font-bold" style={{ color: C.ok }}>{wRev}</td>
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

// ── Reviewer Activity tab (submission stats) ───────────────────────────────────
function ReviewerActivityTab() {
  const [stats, setStats]   = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.submissionStats()
      .then(setStats).catch(() => setStats(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="p-10 text-center text-sm" style={{ color: C.sub }}>Loading…</div>;
  if (!stats)  return <div className="p-10 text-center text-sm" style={{ color: C.sub }}>No data available.</div>;

  const tiles = [
    { label: "Total Submissions to Society", val: stats.total,               color: C.dark,    bg: C.mint4 + "33" },
    { label: "Submitted to Client",          val: stats.with_client,          color: "#7B1FA2", bg: "#F3E5F5" },
    { label: "Submitted to IPRS",            val: stats.submitted_to_iprs,    color: "#1565C0", bg: "#E3F2FD" },
    { label: "Accepted by IPRS",             val: stats.accepted_by_iprs,     color: "#2E7D32", bg: "#E8F5E9" },
    { label: "Pending IPRS Submission",      val: stats.pending_iprs_submit,  color: "#E65100", bg: "#FFF3E0" },
    { label: "Pending IPRS Acceptance",      val: stats.pending_acceptance,   color: C.danger,  bg: "#FFEBEE" },
  ];

  return (
    <div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
        {tiles.map(({ label, val, color, bg }) => (
          <div key={label} className="rounded-xl border p-5 text-center" style={{ background: bg, borderColor: color + "33" }}>
            <div className="text-3xl font-bold" style={{ color }}>{val}</div>
            <div className="text-xs mt-1 font-medium uppercase tracking-wide" style={{ color: color + "cc" }}>{label}</div>
          </div>
        ))}
      </div>

      {stats.pending_iprs_submit > 0 && (
        <div className="rounded-xl border px-4 py-3 flex items-start gap-3" style={{ background: "#FFF3E0", borderColor: "#FFE082" }}>
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" style={{ color: "#E65100" }} />
          <div className="text-sm" style={{ color: "#BF360C" }}>
            <strong>{stats.pending_iprs_submit} submission{stats.pending_iprs_submit !== 1 ? "s" : ""}</strong> {stats.pending_iprs_submit === 1 ? "has" : "have"} not been submitted to IPRS yet. Go to <em>Submitted Cue</em> tab to mark them.
          </div>
        </div>
      )}
      {stats.pending_acceptance > 0 && (
        <div className="mt-3 rounded-xl border px-4 py-3 flex items-start gap-3" style={{ background: "#FFEBEE", borderColor: "#EF9A9A" }}>
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" style={{ color: C.danger }} />
          <div className="text-sm" style={{ color: "#B71C1C" }}>
            <strong>{stats.pending_acceptance} submission{stats.pending_acceptance !== 1 ? "s" : ""}</strong> submitted to IPRS but acceptance not confirmed. Follow up with IPRS.
          </div>
        </div>
      )}
    </div>
  );
}

// ── Submitted Cue tab ─────────────────────────────────────────────────────────
function SubmittedCueTab() {
  const [serials, setSerials]         = useState([]);
  const [movies, setMovies]           = useState([]);
  const [clients, setClients]         = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading]         = useState(true);
  const [submitting, setSubmitting]   = useState(false);
  const [clientSug, setClientSug]     = useState(false);
  const [logTab, setLogTab]           = useState("serial"); // "serial" | "movie"
  const [form, setForm] = useState({
    content_type: "serial", // "serial" | "movie"
    project_id: "", episode_from: "", episode_to: "", client: "", notes: "",
  });

  const load = () => {
    Promise.all([
      api.reviewerSerials(),
      api.reviewerMovies(),
      api.suggestClients(),
      api.listSubmissions(),
    ]).then(([s, m, c, subs]) => {
      setSerials(s);
      setMovies(m);
      setClients(c);
      setSubmissions(subs);
    }).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const filteredClients = clients.filter((c) =>
    c.toLowerCase().includes((form.client || "").toLowerCase())
  );

  const projectOptions = form.content_type === "serial" ? serials : movies;

  const submit = async () => {
    if (!form.project_id) {
      await showAlert(`Select a ${form.content_type}.`, { variant: "warn" }); return;
    }
    let from = 1, to = 1;
    if (form.content_type === "serial") {
      from = parseInt(form.episode_from, 10);
      to   = parseInt(form.episode_to,   10);
      if (!from || !to || from > to) {
        await showAlert("Enter a valid episode range (From ≤ To).", { variant: "warn" }); return;
      }
    }
    setSubmitting(true);
    try {
      await api.createSubmission({
        project_id: parseInt(form.project_id),
        episode_from: from,
        episode_to: to,
        client: form.client.trim() || null,
        notes: form.notes.trim() || null,
      });
      setForm({ content_type: form.content_type, project_id: "", episode_from: "", episode_to: "", client: "", notes: "" });
      load();
    } catch (ex) {
      await showAlert(ex.message, { title: "Failed", variant: "error" });
    } finally { setSubmitting(false); }
  };

  // Split submissions by type
  const serialSubs = submissions.filter((s) => s.project_type === "SERIAL" || !s.project_type);
  const movieSubs  = submissions.filter((s) => s.project_type === "MOVIE");

  const handleItemUpdate = (updated) => {
    setSubmissions((prev) => prev.map((s) => s.id === updated.id ? updated : s));
  };

  const groupBy = (arr) => {
    const map = arr.reduce((acc, s) => {
      if (!acc[s.project_id]) acc[s.project_id] = { project_id: s.project_id, project_title: s.project_title, items: [] };
      acc[s.project_id].items.push(s);
      return acc;
    }, {});
    return Object.values(map);
  };

  const serialGroups = groupBy(serialSubs);
  const movieGroups  = groupBy(movieSubs);

  return (
    <div className="space-y-6">
      {/* Form */}
      <div className="rounded-xl border p-5" style={{ background: C.white, borderColor: C.mint1 + "44" }}>
        <h4 className="text-sm font-semibold mb-4" style={{ fontFamily: FONTS.serif, color: C.dark }}>
          Submit to Society
        </h4>
        <div className="grid grid-cols-2 gap-3 mb-3">
          {/* Content type */}
          <div>
            <label className="block text-[10px] uppercase tracking-wider mb-1" style={{ color: C.sub }}>
              Type
            </label>
            <select value={form.content_type}
              onChange={(e) => setForm((f) => ({ ...f, content_type: e.target.value, project_id: "" }))}
              className="w-full px-3 py-2 rounded-lg text-sm border focus:outline-none"
              style={{ borderColor: C.mint1 + "44", color: C.dark, background: C.white }}>
              <option value="serial">Serial</option>
              <option value="movie">Movie</option>
            </select>
          </div>
          {/* Project dropdown — serials or movies based on type */}
          <div>
            <label className="block text-[10px] uppercase tracking-wider mb-1" style={{ color: C.sub }}>
              {form.content_type === "serial" ? "Serial" : "Movie"}
            </label>
            <select value={form.project_id}
              onChange={(e) => setForm((f) => ({ ...f, project_id: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg text-sm border focus:outline-none"
              style={{ borderColor: C.mint1 + "44", color: C.dark, background: C.white }}>
              <option value="">Select {form.content_type}…</option>
              {projectOptions.map((p) => (
                <option key={p.project_id} value={p.project_id}>{p.project_title}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 mb-4">
          {/* Episode range only for serials */}
          {form.content_type === "serial" && (
            <>
              <div>
                <label className="block text-[10px] uppercase tracking-wider mb-1" style={{ color: C.sub }}>
                  Episode From
                </label>
                <input type="number" min={1} value={form.episode_from}
                  onChange={(e) => setForm((f) => ({ ...f, episode_from: e.target.value }))}
                  placeholder="1"
                  className="w-full px-3 py-2 rounded-lg text-sm border focus:outline-none"
                  style={{ borderColor: C.mint1 + "44", color: C.dark }} />
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-wider mb-1" style={{ color: C.sub }}>
                  Episode To
                </label>
                <input type="number" min={1} value={form.episode_to}
                  onChange={(e) => setForm((f) => ({ ...f, episode_to: e.target.value }))}
                  placeholder="10"
                  className="w-full px-3 py-2 rounded-lg text-sm border focus:outline-none"
                  style={{ borderColor: C.mint1 + "44", color: C.dark }} />
              </div>
            </>
          )}
          {/* Client autocomplete */}
          <div className={`relative ${form.content_type === "movie" ? "col-span-2" : ""}`}>
            <label className="block text-[10px] uppercase tracking-wider mb-1" style={{ color: C.sub }}>
              Client
            </label>
            <input value={form.client}
              onChange={(e) => { setForm((f) => ({ ...f, client: e.target.value })); setClientSug(true); }}
              onFocus={() => setClientSug(true)}
              onBlur={() => setTimeout(() => setClientSug(false), 150)}
              placeholder="Client name…"
              className="w-full px-3 py-2 rounded-lg text-sm border focus:outline-none"
              style={{ borderColor: C.mint1 + "44", color: C.dark }} />
            {clientSug && filteredClients.length > 0 && (
              <div className="absolute top-full left-0 right-0 z-20 mt-1 rounded-xl shadow-xl overflow-hidden max-h-40 overflow-y-auto"
                style={{ background: C.white, border: `1px solid ${C.mint1}44` }}>
                {filteredClients.map((c) => (
                  <button key={c}
                    onMouseDown={() => { setForm((f) => ({ ...f, client: c })); setClientSug(false); }}
                    className="block w-full text-left px-4 py-2 text-xs hover:bg-green-50"
                    style={{ color: C.dark }}>{c}</button>
                ))}
              </div>
            )}
          </div>
          {/* Notes */}
          <div className={form.content_type === "movie" ? "" : ""}>
            <label className="block text-[10px] uppercase tracking-wider mb-1" style={{ color: C.sub }}>
              Notes
            </label>
            <input value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder="Optional notes…"
              className="w-full px-3 py-2 rounded-lg text-sm border focus:outline-none"
              style={{ borderColor: C.mint1 + "44", color: C.dark }} />
          </div>
        </div>
        <button onClick={submit} disabled={submitting}
          className="px-5 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
          style={{ background: C.dark, color: C.mint4 }}>
          {submitting ? "Submitting…" : "Submit"}
        </button>
      </div>

      {/* Submission log */}
      <div>
        <h4 className="text-sm font-semibold mb-3" style={{ fontFamily: FONTS.serif, color: C.dark }}>
          Submission Log
        </h4>

        {/* Log type tabs */}
        <div className="flex gap-1 mb-4 p-1 rounded-xl w-fit"
          style={{ background: C.mint4 + "33" }}>
          {[
            { key: "serial", label: "Serials", Icon: Layers },
            { key: "movie",  label: "Movies",  Icon: Film   },
          ].map(({ key, label, Icon }) => (
            <button key={key} onClick={() => setLogTab(key)}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-medium transition-all"
              style={logTab === key
                ? { background: C.dark, color: C.mint4 }
                : { color: C.sub }}>
              <Icon className="w-3.5 h-3.5" />{label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="py-8 text-center text-sm" style={{ color: C.sub }}>Loading…</div>
        ) : logTab === "serial" ? (
          serialGroups.length === 0 ? (
            <div className="py-8 text-center text-sm" style={{ color: C.sub }}>No serial submissions yet.</div>
          ) : (
            <div className="space-y-4">
              {serialGroups.map((g) => (
                <SerialSubmissionGroup key={g.project_id} group={g} onItemUpdate={handleItemUpdate} />
              ))}
            </div>
          )
        ) : (
          movieGroups.length === 0 ? (
            <div className="py-8 text-center text-sm" style={{ color: C.sub }}>No movie submissions yet.</div>
          ) : (
            <div className="space-y-4">
              {movieGroups.map((g) => (
                <MovieSubmissionGroup key={g.project_id} group={g} onItemUpdate={handleItemUpdate} />
              ))}
            </div>
          )
        )}
      </div>
    </div>
  );
}

// ── Main dashboard ─────────────────────────────────────────────────────────────
export default function ReviewerDashboard() {
  const { setActiveProjectId, setScreen, setProjects } = useApp();
  const [tab, setTab]             = useState("queue");
  const [submitted, setSubmitted] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [reviewEp, setReviewEp]   = useState(null);
  const [searchQ, setSearchQ]     = useState("");
  const [queuePage, setQueuePage] = useState(1);

  useEffect(() => {
    api.submittedEpisodes()
      .then(setSubmitted).catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleAction = async (eid, type, note) => {
    if (type === "approve")      await api.approveEpisode(eid);
    else if (type === "reject")  await api.rejectEpisode(eid, note);
    else                         await api.suggestEpisode(eid, note);
    setSubmitted((prev) => prev.filter((e) => e.id !== eid));
  };

  const filtered = submitted.filter((e) => {
    const q = searchQ.trim().toLowerCase();
    return !q || (e.project_title || "").toLowerCase().includes(q) ||
      String(e.episode_number).includes(q) || (e.title || "").toLowerCase().includes(q);
  });

  const queueTotalPages  = Math.ceil(filtered.length / PER_PAGE);
  const visibleQueue     = filtered.slice((queuePage - 1) * PER_PAGE, queuePage * PER_PAGE);

  const tabs = [
    { key: "queue",          label: "Review Queue", badge: submitted.length },
    { key: "projects",       label: "Projects" },
    { key: "submitted_cue",  label: "Submitted Cue" },
    { key: "calendar",       label: "Activity Calendar" },
    { key: "activity",       label: "Activity Stats" },
  ];

  return (
    <DashboardShell
      title="Reviewer"
      subtitle="Review submitted cue sheets, approve or request changes"
      tabs={tabs}
      activeTab={tab}
      onTab={setTab}>

      {reviewEp && (
        <ReviewModal episode={reviewEp} onClose={() => setReviewEp(null)} onAction={handleAction} />
      )}

      {/* ── Review Queue ── */}
      {tab === "queue" && (
        <div>
          <div className="flex items-center gap-3 mb-4">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5"
                style={{ color: C.sub }} />
              <input type="text" value={searchQ}
                onChange={(e) => { setSearchQ(e.target.value); setQueuePage(1); }}
                placeholder="Search by serial, episode…"
                className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border focus:outline-none"
                style={{ borderColor: C.mint1 + "44", background: C.white, color: C.dark }} />
              {searchQ && (
                <button onClick={() => { setSearchQ(""); setQueuePage(1); }}
                  className="absolute right-2 top-1/2 -translate-y-1/2">
                  <X className="w-3 h-3" style={{ color: C.sub }} />
                </button>
              )}
            </div>
            <span className="text-sm" style={{ color: C.sub }}>
              {filtered.length} episodes pending review
            </span>
          </div>

          <div className="rounded-2xl border overflow-hidden"
            style={{ background: C.white, borderColor: C.mint1 + "44" }}>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-[10px] uppercase tracking-wider"
                  style={{ borderColor: C.mint4, color: C.sub, background: C.mint4 + "33" }}>
                  <th className="text-left px-5 py-3">Project</th>
                  <th className="text-left px-5 py-3">Episode</th>
                  <th className="text-left px-5 py-3">Title</th>
                  <th className="text-left px-5 py-3">Air Date</th>
                  <th className="text-right px-5 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr><td colSpan={5} className="px-5 py-8 text-center text-sm"
                    style={{ color: C.sub }}>Loading…</td></tr>
                )}
                {!loading && filtered.length === 0 && (
                  <tr><td colSpan={5} className="px-5 py-8 text-center text-sm"
                    style={{ color: C.sub }}>
                    {submitted.length === 0 ? "No episodes awaiting review." : `No results for "${searchQ}".`}
                  </td></tr>
                )}
                {visibleQueue.map((ep) => (
                  <tr key={ep.id} className="border-b last:border-0 hover:bg-green-50/30"
                    style={{ borderColor: C.mint4 + "55" }}>
                    <td className="px-5 py-3 font-medium" style={{ color: C.dark }}>
                      {ep.project_title || "—"}
                    </td>
                    <td className="px-5 py-3 text-center font-medium" style={{ color: C.dark }}>
                      {ep.episode_number}
                    </td>
                    <td className="px-5 py-3 text-xs" style={{ color: C.sub }}>{ep.title || "—"}</td>
                    <td className="px-5 py-3 text-xs" style={{ color: C.sub }}>{ep.air_date || "—"}</td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => {
                            setProjects((prev) => {
                              if (prev.find((p) => p.id === ep.project_id)) return prev;
                              return [...prev, { id: ep.project_id, title: ep.project_title, episodes: [] }];
                            });
                            setActiveProjectId(ep.project_id);
                            setScreen("serial");
                          }}
                          className="text-xs flex items-center gap-1 hover:opacity-70"
                          style={{ color: C.sub }}>
                          View <ChevronRight className="w-3 h-3" />
                        </button>
                        <button onClick={() => setReviewEp(ep)}
                          className="px-3 py-1.5 rounded-lg text-xs font-medium"
                          style={{ background: C.dark, color: C.mint4 }}>
                          Review
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Paginator page={queuePage} total={queueTotalPages} onChange={setQueuePage} />
        </div>
      )}

      {/* ── Projects (Serials + Movies) ── */}
      {tab === "projects" && (
        <ProjectsTab onReviewEp={setReviewEp} />
      )}

      {/* ── Submitted Cue ── */}
      {tab === "submitted_cue" && <SubmittedCueTab />}

      {/* ── Activity Calendar ── */}
      {tab === "calendar" && <ReviewerCalendarTab />}

      {/* ── Activity Stats ── */}
      {tab === "activity" && <ReviewerActivityTab />}
    </DashboardShell>
  );
}
