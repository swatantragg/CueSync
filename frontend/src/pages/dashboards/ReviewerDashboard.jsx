import { useEffect, useRef, useState } from "react";
import {
  CheckCircle2, XCircle, MessageSquare, Download, Search, X,
  Layers, ChevronDown, FileDown, ChevronLeft, ChevronRight, Film,
  Send, AlertCircle, Eye, Lock, Archive, Mail, Repeat,
} from "lucide-react";
import { C, FONTS, alpha, T } from "../../styles/palette";
import Select from "../../components/Select";
import DashboardShell from "./DashboardShell";
import { api } from "../../utils/api";
import { fmtDateTime } from "../../utils/format";
import { showAlert, showConfirm } from "../../components/Dialog";
import { useApp } from "../../context/AppContext";
import { WorkFileChip, downloadWorkFile } from "../../components/WorkFileUpload";
import ClientsPanel from "../../components/ClientsPanel";
import SocietiesPanel from "../../components/SocietiesPanel";
import SocietyMailModal from "../../components/SocietyMailModal";
import SocietyDashboard from "../../components/SocietyDashboard";
import ReviewerCalendar from "./ReviewerCalendar";
import ConversionTab, { ConvertedSheets } from "../../components/ConversionPanel";

// ── Constants ──────────────────────────────────────────────────────────────────
const PER_PAGE = 15;

// ── Helpers ────────────────────────────────────────────────────────────────────
const STATUS_STYLE = {
  submitted: { bg: T.blueBg, color: T.blue, label: "Pending Review" },
  approved:  { bg: T.greenBg, color: T.green, label: "Approved" },
  rejected:  { bg: T.redBg, color: T.red, label: "Rejected" },
  edited:    { bg: T.amberBg, color: T.orange, label: "Changes Suggested" },
  pending:   { bg: T.grayBg, color: T.gray, label: "Draft" },
};

function StatusBadge({ status }) {
  const s = STATUS_STYLE[status] || STATUS_STYLE.pending;
  return (
    <span className="px-2 py-0.5 rounded-full text-[0.625rem] font-semibold whitespace-nowrap"
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

// Opens a submitted cue sheet in the episode editor (this is what unlocks Review for reviewers).
function useOpenEpisode() {
  const { setActiveProjectId, setActiveEpisodeId, setScreen, setProjects } = useApp();
  return (ep, projectId, projectTitle) => {
    const epStub = {
      id: ep.id, number: ep.episode_number, title: ep.title || "",
      airDate: ep.air_date, status: ep.status, editHistory: [], cues: [],
      rejectionNote: ep.rejection_note || null, reviewNote: ep.review_note || null,
      cueDetails: {}, totalDuration: ep.total_duration_sec || 0, musicalDuration: 0,
    };
    setProjects((prev) => {
      const existing = prev.find((p) => p.id === projectId);
      if (existing) {
        const alreadyHas = (existing.episodes || []).some((e) => e.id === ep.id);
        if (alreadyHas) return prev;
        return prev.map((p) => p.id === projectId ? { ...p, episodes: [...(p.episodes || []), epStub] } : p);
      }
      return [...prev, { id: projectId, title: projectTitle, episodes: [epStub] }];
    });
    setActiveProjectId(projectId);
    setActiveEpisodeId(ep.id);
    setScreen("episode");
  };
}

const LOCKED_TITLE = "Open the cue sheet first — Review unlocks once you've opened it";

function ReviewButton({ opened, onClick }) {
  return (
    <button
      onClick={onClick}
      disabled={!opened}
      title={opened ? "Approve, reject or suggest changes" : LOCKED_TITLE}
      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold disabled:cursor-not-allowed"
      style={opened ? { background: C.dark, color: C.mint4 } : { background: C.mint4, color: C.muted, border: `1px dashed ${C.mint1}` }}>
      {!opened && <Lock className="w-3 h-3" />}Review
    </button>
  );
}

function OpenButton({ onClick, label = "Open" }) {
  return (
    <button onClick={onClick}
      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold hover:opacity-80"
      style={{ background: C.white, color: C.dark, border: `1px solid ${C.mint1}` }}>
      <Eye className="w-3 h-3" />{label}
    </button>
  );
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
function EpDownloadBtn({ episode, projectTitle, projectId }) {
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
      if (soc === "workfile") {
        await downloadWorkFile(projectId, projectTitle, episode.episode_number);
        return;
      }
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
        style={{ background: T.greenBg, color: T.green }}>
        <Download className="w-3 h-3" />{busy ? "…" : "Download"}
        <ChevronDown className="w-3 h-3" />
      </button>
      {open && (
        <div className="absolute right-0 mt-1 z-30 rounded-xl shadow-xl overflow-hidden min-w-[90px]"
          style={{ background: C.white, border: `1px solid ${alpha(C.mint1, "44")}` }}>
          {["IPRS", "PRS", "ASCAP"].map((s) => (
            <button key={s} onMouseDown={() => download(s.toLowerCase())}
              className="block w-full text-left px-4 py-2 text-xs hover:opacity-70"
              style={{ color: C.dark }}>{s}</button>
          ))}
          {episode.has_work_file && projectId && (
            <button onMouseDown={() => download("workfile")}
              className="block w-full text-left px-4 py-2 text-xs hover:opacity-70 whitespace-nowrap border-t"
              style={{ color: C.dark, borderColor: alpha(C.mint1, "44") }}>Work File</button>
          )}
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
    <div className="cs-backdrop fixed inset-0 z-50 flex items-center justify-center">
      <div className="cs-dark cs-glass rounded-2xl w-full max-w-lg overflow-hidden">
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
              style={{ background: C.mid, color: C.mint4, border: `1px solid ${alpha(C.mint1, "33")}` }} />
          </div>
          <div className="flex gap-3">
            <button onClick={() => handle("approve")} disabled={saving}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium disabled:opacity-50"
              style={{ background: T.greenBg, color: T.green }}>
              <CheckCircle2 className="w-4 h-4" />Approve
            </button>
            <button onClick={() => handle("suggest")} disabled={saving}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium disabled:opacity-50"
              style={{ background: T.blueBg, color: T.blue }}>
              <MessageSquare className="w-4 h-4" />Suggest Changes
            </button>
            <button onClick={() => handle("reject")} disabled={saving}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium disabled:opacity-50"
              style={{ background: T.redBg, color: T.red }}>
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
      style={{ background: C.white, borderColor: alpha(C.mint1, "44") }}>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[0.625rem] uppercase tracking-wider border-b"
            style={{ borderColor: alpha(C.mint4, "55"), color: C.sub, background: alpha(C.mint4, "22") }}>
            <th className="text-left px-4 py-2.5 w-14">EP #</th>
            <th className="text-left px-4 py-2.5">Title</th>
            <th className="text-left px-4 py-2.5 w-32">Air Date</th>
            <th className="text-center px-4 py-2.5 w-24">Duration</th>
            <th className="text-center px-4 py-2.5 w-16">Songs</th>
            <th className="text-left px-4 py-2.5 w-36">Status</th>
            <th className="text-left px-4 py-2.5 w-28">Work File</th>
            <th className="text-right px-4 py-2.5 w-48">Actions</th>
          </tr>
        </thead>
        <tbody>
          {episodes.length === 0 && (
            <tr><td colSpan={8} className="px-4 py-8 text-center text-xs"
              style={{ color: C.sub }}>No episodes.</td></tr>
          )}
          {episodes.map((ep) => (
            <tr key={ep.id}
              onClick={() => onOpen?.(ep)}
              className="border-b last:border-0 hover:bg-green-50/20 cursor-pointer"
              style={{ borderColor: alpha(C.mint4, "33") }}>
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
              <td className="px-4 py-2.5">
                {ep.has_work_file
                  ? <WorkFileChip projectId={projectId} projectTitle={projectTitle} epNum={ep.episode_number} />
                  : <span className="text-xs" style={{ color: C.muted }}>—</span>}
              </td>
              <td className="px-4 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-end gap-2">
                  {ep.status === "submitted" && (
                    <>
                      <OpenButton onClick={() => onOpen?.(ep)} />
                      <ReviewButton opened={ep.opened !== false}
                        onClick={() => onReview({ ...ep, project_title: projectTitle, project_id: projectId })} />
                    </>
                  )}
                  {ep.status === "approved" && (
                    <EpDownloadBtn episode={ep} projectTitle={projectTitle} projectId={projectId} />
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

  const range = async () => {
    const from = parseInt(fromEp, 10);
    const to   = parseInt(toEp,   10);
    if (!from || !to || from > to) {
      await showAlert("Enter a valid episode range (From ≤ To).", { variant: "warn" });
      return null;
    }
    return { from, to };
  };

  const go = async (society) => {
    const r = await range();
    if (!r) return;
    setBusy(society);
    try {
      const label = society === "workfile" ? "WorkFile" : society.toUpperCase();
      const fname = `${serial.project_title}_${label}_EP${r.from}-${r.to}.xlsx`;
      await api.downloadBulkExport(serial.project_id, society, r.from, r.to, fname);
    } catch (ex) {
      await showAlert(ex.message, { title: "Download Failed", variant: "error" });
    } finally { setBusy(null); }
  };

  const goAll = async () => {
    const r = await range();
    if (!r) return;
    setBusy("all");
    try {
      const got = await api.downloadBulkAll(
        serial.project_id, r.from, r.to, `${serial.project_title}_All_EP${r.from}-${r.to}.zip`,
      );
      if (!got.workFiles) {
        await showAlert(`No work files are uploaded for Ep ${r.from}–${r.to}, so the ZIP has the IPRS, PRS and ASCAP sheets only.`, { title: "Downloaded without Work File", variant: "warn" });
      } else if (!got.episodes) {
        await showAlert(`No cue sheets exist for Ep ${r.from}–${r.to}, so the ZIP has the work file only.`, { title: "Downloaded Work File only", variant: "warn" });
      }
    } catch (ex) {
      await showAlert(ex.message, { title: "Download Failed", variant: "error" });
    } finally { setBusy(null); }
  };

  const societies = [
    { key: "iprs",     label: "IPRS" },
    { key: "prs",      label: "PRS"  },
    { key: "ascap",    label: "ASCAP" },
    { key: "workfile", label: "Work File" },
  ];

  return (
    <div className="flex items-center gap-3 flex-wrap p-3 rounded-xl"
      style={{ background: alpha(C.mint4, "22"), border: `1px solid ${alpha(C.mint1, "33")}` }}>
      <span className="text-xs font-semibold" style={{ color: C.dark }}>Bulk Download</span>
      <div className="flex items-center gap-1.5">
        <span className="text-xs" style={{ color: C.sub }}>Ep from</span>
        <input type="number" value={fromEp} onChange={(e) => setFromEp(e.target.value)}
          min={1} placeholder="1"
          className="w-16 px-2 py-1.5 rounded-lg text-xs focus:outline-none text-center"
          style={{ background: C.white, color: C.dark, border: `1px solid ${alpha(C.mint1, "44")}` }} />
        <span className="text-xs" style={{ color: C.sub }}>to</span>
        <input type="number" value={toEp} onChange={(e) => setToEp(e.target.value)}
          min={1} placeholder="10"
          className="w-16 px-2 py-1.5 rounded-lg text-xs focus:outline-none text-center"
          style={{ background: C.white, color: C.dark, border: `1px solid ${alpha(C.mint1, "44")}` }} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {societies.map(({ key, label }) => (
          <button key={key} onClick={() => go(key)} disabled={busy !== null}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-50"
            style={{ background: C.dark, color: C.mint4 }}>
            <FileDown className="w-3.5 h-3.5" />
            {busy === key ? "Downloading…" : `Download ${label}`}
          </button>
        ))}
        <button onClick={goAll} disabled={busy !== null}
          title="One ZIP with the IPRS, PRS and ASCAP sheets and the work file for this range"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50"
          style={{ background: C.mint1, color: C.dark }}>
          <Archive className="w-3.5 h-3.5" />
          {busy === "all" ? "Preparing ZIP…" : "Download All"}
        </button>
      </div>
    </div>
  );
}

// ── Serial detail view ────────────────────────────────────────────────────────
function SerialDetail({ serial, onBack, onReview }) {
  const openEp = useOpenEpisode();
  const [detail, setDetail]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [subTab, setSubTab]   = useState("all");
  const [allPage, setAllPage]         = useState(1);
  const [approvedPage, setApprovedPage] = useState(1);
  const [societySubs, setSocietySubs]  = useState([]);
  const [subsLoading, setSubsLoading]  = useState(false);

  const openEpisode = (ep) => openEp(ep, serial.project_id, serial.project_title);

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

      <div className="flex flex-wrap gap-4 mb-5">
        <div className="px-4 py-3 rounded-xl border flex-1"
          style={{ background: C.white, borderColor: alpha(C.mint1, "44") }}>
          <p className="text-[0.625rem] uppercase tracking-wider mb-0.5" style={{ color: C.sub }}>Channel</p>
          <p className="text-sm font-medium" style={{ color: C.dark }}>{detail?.channel || "—"}</p>
        </div>
        <div className="px-4 py-3 rounded-xl border"
          style={{ background: C.white, borderColor: alpha(C.mint1, "44") }}>
          <p className="text-[0.625rem] uppercase tracking-wider mb-0.5" style={{ color: C.sub }}>Episodes</p>
          <p className="text-sm font-semibold" style={{ color: C.dark }}>{allEps.length}</p>
        </div>
        <div className="px-4 py-3 rounded-xl border"
          style={{ background: T.greenBg, borderColor: T.greenBorder }}>
          <p className="text-[0.625rem] uppercase tracking-wider mb-0.5" style={{ color: T.green }}>Approved</p>
          <p className="text-sm font-semibold" style={{ color: T.green }}>{approvedEps.length}</p>
        </div>
        <div className="px-4 py-3 rounded-xl border"
          style={{ background: T.blueBg, borderColor: T.blueBorder }}>
          <p className="text-[0.625rem] uppercase tracking-wider mb-0.5" style={{ color: T.blue }}>Pending Review</p>
          <p className="text-sm font-semibold" style={{ color: T.blue }}>
            {allEps.filter((e) => e.status === "submitted").length}
          </p>
        </div>
      </div>

      <div className="mb-5">
        <BulkDownloadBar serial={serial} />
      </div>

      <div className="flex flex-wrap gap-1 mb-4 p-1 rounded-xl w-fit max-w-full"
        style={{ background: C.mint4, border: `1px solid ${alpha(C.mint1, "66")}` }}>
        {[
          { key: "all",      label: `All Episodes (${allEps.length})` },
          { key: "approved", label: `Approved (${approvedEps.length})` },
          { key: "society",  label: "Submitted to Society" },
          { key: "converted", label: `Converted${serial.converted_count ? ` (${serial.converted_count})` : ""}` },
        ].map((t) => (
          <button key={t.key} onClick={() => setSubTab(t.key)}
            className="px-4 py-1.5 rounded-lg text-xs font-semibold transition-all"
            style={subTab === t.key
              ? { background: C.dark, color: C.mint4 }
              : { color: C.mid }}>
            {t.label}
          </button>
        ))}
      </div>

      {subTab === "converted" ? (
        <ConvertedSheets projectId={serial.project_id} projectTitle={serial.project_title} projectType="SERIAL" />
      ) : subTab !== "society" && loading ? (
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
                style={{ background: C.white, borderColor: alpha(C.mint1, "44") }}>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[0.625rem] uppercase tracking-wider border-b"
                      style={{ borderColor: alpha(C.mint4, "44"), color: C.sub, background: alpha(C.mint4, "22") }}>
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
                        style={{ borderColor: alpha(C.mint4, "33") }}>
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
  const openEp = useOpenEpisode();
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

  const openEpisode = (ep) => openEp(ep, movie.project_id, movie.project_title);

  // Movie cue sheet card — shows single file-level status
  const MovieCueCard = ({ ep }) => (
    <div className="rounded-xl border p-4 flex items-center justify-between"
      style={{ background: C.white, borderColor: alpha(C.mint1, "44") }}>
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
        {ep.status === "submitted" ? (
          <>
            <OpenButton onClick={() => openEpisode(ep)} />
            <ReviewButton opened={ep.opened !== false}
              onClick={() => onReview({ ...ep, project_title: movie.project_title, project_id: movie.project_id, project_type: "MOVIE" })} />
          </>
        ) : (
          <OpenButton onClick={() => openEpisode(ep)} label="View" />
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

      <div className="flex flex-wrap gap-4 mb-5">
        <div className="px-4 py-3 rounded-xl border"
          style={{ background: T.greenBg, borderColor: T.greenBorder }}>
          <p className="text-[0.625rem] uppercase tracking-wider mb-0.5" style={{ color: T.green }}>Approved</p>
          <p className="text-sm font-semibold" style={{ color: T.green }}>{approvedEps.length}</p>
        </div>
        <div className="px-4 py-3 rounded-xl border"
          style={{ background: T.blueBg, borderColor: T.blueBorder }}>
          <p className="text-[0.625rem] uppercase tracking-wider mb-0.5" style={{ color: T.blue }}>Pending Review</p>
          <p className="text-sm font-semibold" style={{ color: T.blue }}>{pendingEps.length}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-1 mb-4 p-1 rounded-xl w-fit max-w-full"
        style={{ background: C.mint4, border: `1px solid ${alpha(C.mint1, "66")}` }}>
        {[
          { key: "approved", label: `Approved (${approvedEps.length})` },
          { key: "society",  label: "Submitted to Society" },
          { key: "converted", label: "Converted" },
        ].map((t) => (
          <button key={t.key} onClick={() => setSubTab(t.key)}
            className="px-4 py-1.5 rounded-lg text-xs font-semibold transition-all"
            style={subTab === t.key
              ? { background: C.dark, color: C.mint4 }
              : { color: C.mid }}>
            {t.label}
          </button>
        ))}
      </div>

      {subTab === "converted" ? (
        <ConvertedSheets projectId={movie.project_id} projectTitle={movie.project_title} projectType="MOVIE" />
      ) : loading ? (
        <div className="py-10 text-center text-sm" style={{ color: C.sub }}>Loading…</div>
      ) : (
        <>
          {subTab === "approved" && (
            <>
              {/* Pending review cards first */}
              {pendingEps.length > 0 && (
                <div className="mb-4">
                  <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: T.blue }}>
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
                style={{ background: C.white, borderColor: alpha(C.mint1, "44") }}>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[0.625rem] uppercase tracking-wider border-b"
                      style={{ borderColor: alpha(C.mint4, "44"), color: C.sub, background: alpha(C.mint4, "22") }}>
                      <th className="text-left px-4 py-2.5">Client</th>
                      <th className="text-left px-4 py-2.5">Notes</th>
                      <th className="text-left px-4 py-2.5">Submitted By</th>
                      <th className="text-left px-4 py-2.5">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {societySubs.map((s) => (
                      <tr key={s.id} className="border-b last:border-0"
                        style={{ borderColor: alpha(C.mint4, "33") }}>
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

// Marks a serial / movie that has cue sheets saved under Projects → Conversion.
function ConvertedChip({ count, movie }) {
  if (!count) return null;
  return (
    <span className="px-2 py-0.5 rounded-full text-[0.625rem] font-semibold whitespace-nowrap"
      title="Cue sheets converted from an uploaded IPRS, PRS or ASCAP file. Open the Converted tab to download or email them."
      style={{ background: T.blueBg, color: T.blue }}>
      {movie ? "Converted" : `${count} converted`}
    </span>
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
            style={{ borderColor: alpha(C.mint1, "44"), background: C.white, color: C.dark }} />
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
          No serials with submitted, approved or converted episodes.
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <div className="rounded-2xl border overflow-hidden"
          style={{ background: C.white, borderColor: alpha(C.mint1, "44") }}>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[0.625rem] uppercase tracking-wider border-b"
                style={{ borderColor: alpha(C.mint4, "55"), color: C.sub, background: alpha(C.mint4, "22") }}>
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
                  style={{ borderColor: alpha(C.mint4, "55") }}
                  onClick={() => onOpenSerial(serial)}>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <Layers className="w-3.5 h-3.5 flex-shrink-0" style={{ color: C.mint1 }} />
                      <span className="font-semibold text-sm" style={{ color: C.dark }}>
                        {serial.project_title}
                      </span>
                      <ConvertedChip count={serial.converted_count} />
                    </div>
                  </td>
                  <td className="px-5 py-3 text-center text-sm" style={{ color: C.sub }}>
                    {serial.total_episodes}
                  </td>
                  <td className="px-5 py-3 text-center">
                    {serial.submitted_count > 0 ? (
                      <span className="px-2 py-0.5 rounded-full text-[0.625rem] font-semibold"
                        style={{ background: T.blueBg, color: T.blue }}>
                        {serial.submitted_count} pending
                      </span>
                    ) : (
                      <span className="text-xs" style={{ color: C.sub }}>—</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-center">
                    {serial.approved_count > 0 ? (
                      <span className="px-2 py-0.5 rounded-full text-[0.625rem] font-semibold"
                        style={{ background: T.greenBg, color: T.green }}>
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
            style={{ borderColor: alpha(C.mint1, "44"), background: C.white, color: C.dark }} />
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
          No movies with submitted, approved or converted cue sheets.
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <div className="rounded-2xl border overflow-hidden"
          style={{ background: C.white, borderColor: alpha(C.mint1, "44") }}>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[0.625rem] uppercase tracking-wider border-b"
                style={{ borderColor: alpha(C.mint4, "55"), color: C.sub, background: alpha(C.mint4, "22") }}>
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
                  style={{ borderColor: alpha(C.mint4, "55") }}
                  onClick={() => onOpenMovie(movie)}>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <Film className="w-3.5 h-3.5 flex-shrink-0" style={{ color: C.mint1 }} />
                      <span className="font-semibold text-sm" style={{ color: C.dark }}>
                        {movie.project_title}
                      </span>
                      <ConvertedChip count={movie.converted_count} movie />
                    </div>
                  </td>
                  <td className="px-5 py-3 text-center">
                    {movie.submitted_count > 0 ? (
                      <span className="px-2 py-0.5 rounded-full text-[0.625rem] font-semibold"
                        style={{ background: T.blueBg, color: T.blue }}>
                        {movie.submitted_count} pending
                      </span>
                    ) : (
                      <span className="text-xs" style={{ color: C.sub }}>—</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-center">
                    {movie.approved_count > 0 ? (
                      <span className="px-2 py-0.5 rounded-full text-[0.625rem] font-semibold"
                        style={{ background: T.greenBg, color: T.green }}>
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

// ── Projects tab (Serials + Movies + Conversion) ──────────────────────────────
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
      <div className="flex flex-wrap gap-1 mb-5 p-1 rounded-xl w-fit max-w-full"
        style={{ background: C.mint4, border: `1px solid ${alpha(C.mint1, "66")}` }}>
        {[
          { key: "serials", label: "Serials", Icon: Layers },
          { key: "movies",  label: "Movies",  Icon: Film   },
          { key: "conversion", label: "Conversion", Icon: Repeat },
        ].map(({ key, label, Icon }) => (
          <button key={key} onClick={() => setProjTab(key)}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold transition-all"
            style={projTab === key
              ? { background: C.dark, color: C.mint4 }
              : { color: C.mid }}>
            <Icon className="w-3.5 h-3.5" />{label}
          </button>
        ))}
      </div>

      {projTab === "serials" && <SerialsSubTab onOpenSerial={openSerial} />}
      {projTab === "movies"  && <MoviesSubTab  onOpenMovie={openMovie}   />}
      {projTab === "conversion" && <ConversionTab />}
    </div>
  );
}

// ── Society status badge ──────────────────────────────────────────────────────
function IprsBadge({ item }) {
  if (item.mail_status === "bounced") return (
    <span className="text-[0.625rem] px-2 py-0.5 rounded-full font-semibold" style={{ background: T.redBg, color: T.red }} title={item.bounce_reason || ""}>
      ✕ Bounced — resend from Dashboard
    </span>
  );
  if (item.mail_status === "resent") return (
    <span className="text-[0.625rem] px-2 py-0.5 rounded-full font-semibold" style={{ background: T.grayBg, color: T.grayMid }}>
      Bounced · sent again
    </span>
  );
  if (item.accepted_by_iprs) return (
    <span className="text-[0.625rem] px-2 py-0.5 rounded-full font-semibold" style={{ background: T.greenBg, color: T.green }}>
      ✓ Society Accepted
    </span>
  );
  if (item.mail_status === "replied") return (
    <span className="text-[0.625rem] px-2 py-0.5 rounded-full font-semibold" style={{ background: T.purpleBg, color: T.purple }} title={item.reply_snippet || ""}>
      ↩ {item.society_name || "Society"} replied
    </span>
  );
  if (item.submitted_to_iprs) return (
    <span className="text-[0.625rem] px-2 py-0.5 rounded-full font-semibold" style={{ background: T.blueBg, color: T.blue }}>
      {item.sent_via === "gmail" ? `✉ Emailed to ${item.society_name || "Society"}` : "↑ Sent to Society"}
    </span>
  );
  return (
    <span className="text-[0.625rem] px-2 py-0.5 rounded-full font-semibold" style={{ background: T.orangeBg, color: T.orange }}>
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

  if (item.accepted_by_iprs || ["bounced", "resent"].includes(item.mail_status)) return null;

  return (
    <div className="flex items-center gap-1.5">
      {!item.submitted_to_iprs && (
        <button onClick={handleSubmitIprs} disabled={busy}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50 hover:opacity-90 transition"
          style={{ background: T.blue, color: C.white }}>
          <Send className="w-3 h-3 shrink-0" />{busy ? "…" : "Submit to Society"}
        </button>
      )}
      {item.submitted_to_iprs && (
        <button onClick={handleAcceptIprs} disabled={busy}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50 hover:opacity-90 transition"
          style={{ background: T.green, color: C.white }}>
          <CheckCircle2 className="w-3 h-3 shrink-0" />{busy ? "…" : "Accepted by Society"}
        </button>
      )}
    </div>
  );
}

// How the entry was made: a Send to Society email (details on hover) or typed in by hand.
function SentVia({ item }) {
  if (item.sent_via !== "gmail") return <div className="text-[0.625rem] mt-0.5" style={{ color: C.sub }}>Logged by hand</div>;
  const details = [
    `From: ${item.mail_from}`, `To: ${item.mail_to}`,
    item.mail_cc && `CC: ${item.mail_cc}`, item.mail_bcc && `BCC: ${item.mail_bcc}`,
    `Subject: ${item.mail_subject}`, item.mail_attachments && `Files: ${item.mail_attachments}`,
  ].filter(Boolean).join("\n");
  return (
    <div className="flex items-center gap-1 text-[0.625rem] mt-0.5 cursor-help" style={{ color: T.blue }} title={details}>
      <Mail className="w-3 h-3" /> Emailed from {item.mail_from}{item.from_conversion ? " · converted sheets" : ""}
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
      style={{ background: C.white, borderColor: alpha(C.mint1, "44") }}>
      <button onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 border-b"
        style={{ borderColor: alpha(C.mint4, "44"), background: alpha(C.mint4, "22") }}>
        <div className="flex items-center gap-2 flex-wrap">
          <Layers className="w-3.5 h-3.5" style={{ color: C.mint1 }} />
          <span className="font-semibold text-sm" style={{ color: C.dark }}>{group.project_title}</span>
          <span className="text-[0.625rem] px-2 py-0.5 rounded-full" style={{ background: alpha(C.mint1, "33"), color: C.sub }}>
            {group.items.length} log{group.items.length !== 1 ? "s" : ""}
          </span>
          {group.items.some((i) => !i.submitted_to_iprs) && (
            <span className="text-[0.625rem] px-2 py-0.5 rounded-full font-semibold" style={{ background: T.orangeBg, color: T.orange }}>
              {group.items.filter((i) => !i.submitted_to_iprs).length} pending IPRS
            </span>
          )}
          {group.items.some((i) => i.submitted_to_iprs && !i.accepted_by_iprs) && (
            <span className="text-[0.625rem] px-2 py-0.5 rounded-full font-semibold" style={{ background: T.blueBg, color: T.blue }}>
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
              <tr className="text-[0.625rem] uppercase tracking-wider border-b"
                style={{ borderColor: alpha(C.mint4, "44"), color: C.sub, background: alpha(C.mint4, "11") }}>
                <th className="text-left px-4 py-2">Episodes</th>
                <th className="text-left px-4 py-2">Client</th>
                <th className="text-left px-4 py-2">Society</th>
                <th className="text-left px-4 py-2">Submitted By</th>
                <th className="text-left px-4 py-2">Date</th>
                <th className="text-left px-4 py-2">IPRS Status</th>
                <th className="text-left px-4 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {paged.map((item) => (
                <tr key={item.id} className="border-b last:border-0" style={{ borderColor: alpha(C.mint4, "33"),
                  background: !item.submitted_to_iprs ? T.yellowBg : item.accepted_by_iprs ? T.greenBg3 : alpha(T.blueBg, "11") }}>
                  <td className="px-4 py-2.5 font-medium" style={{ color: C.dark }}>
                    Ep {item.episode_from}–{item.episode_to}
                  </td>
                  <td className="px-4 py-2.5 text-xs" style={{ color: C.sub }}>{item.client || "—"}<SentVia item={item} /></td>
                  <td className="px-4 py-2.5 text-xs" style={{ color: C.sub }}>{item.society_name || "—"}</td>
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
            <div className="px-4 py-2 border-t flex items-center justify-between" style={{ borderColor: alpha(C.mint4, "44") }}>
              <span className="text-[0.625rem]" style={{ color: C.sub }}>Page {page} / {totalPages} · {sorted.length} logs</span>
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
      style={{ background: C.white, borderColor: alpha(C.mint1, "44") }}>
      <button onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 border-b"
        style={{ borderColor: alpha(C.mint4, "44"), background: alpha(C.mint4, "22") }}>
        <div className="flex items-center gap-2 flex-wrap">
          <Film className="w-3.5 h-3.5" style={{ color: C.mint1 }} />
          <span className="font-semibold text-sm" style={{ color: C.dark }}>{group.project_title}</span>
          <span className="text-[0.625rem] px-2 py-0.5 rounded-full" style={{ background: alpha(C.mint1, "33"), color: C.sub }}>
            {group.items.length} log{group.items.length !== 1 ? "s" : ""}
          </span>
          {group.items.some((i) => !i.submitted_to_iprs) && (
            <span className="text-[0.625rem] px-2 py-0.5 rounded-full font-semibold" style={{ background: T.orangeBg, color: T.orange }}>
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
              <tr className="text-[0.625rem] uppercase tracking-wider border-b"
                style={{ borderColor: alpha(C.mint4, "44"), color: C.sub, background: alpha(C.mint4, "11") }}>
                <th className="text-left px-4 py-2">Client</th>
                <th className="text-left px-4 py-2">Society</th>
                <th className="text-left px-4 py-2">Submitted By</th>
                <th className="text-left px-4 py-2">Date</th>
                <th className="text-left px-4 py-2">IPRS Status</th>
                <th className="text-left px-4 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {paged.map((item) => (
                <tr key={item.id} className="border-b last:border-0" style={{ borderColor: alpha(C.mint4, "33"),
                  background: !item.submitted_to_iprs ? T.yellowBg : item.accepted_by_iprs ? T.greenBg3 : alpha(T.blueBg, "11") }}>
                  <td className="px-4 py-2.5 text-xs" style={{ color: C.sub }}>{item.client || "—"}<SentVia item={item} /></td>
                  <td className="px-4 py-2.5 text-xs" style={{ color: C.sub }}>{item.society_name || "—"}</td>
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
            <div className="px-4 py-2 border-t flex items-center justify-between" style={{ borderColor: alpha(C.mint4, "44") }}>
              <span className="text-[0.625rem]" style={{ color: C.sub }}>Page {page} / {totalPages}</span>
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
    { label: "Total Submissions to Society", val: stats.total,               color: C.dark,    bg: alpha(C.mint4, "33") },
    { label: "Submitted to Client",          val: stats.with_client,          color: T.purple, bg: T.purpleBg },
    { label: "Submitted to IPRS",            val: stats.submitted_to_iprs,    color: T.blue, bg: T.blueBg },
    { label: "Accepted by IPRS",             val: stats.accepted_by_iprs,     color: T.green, bg: T.greenBg },
    { label: "Pending IPRS Submission",      val: stats.pending_iprs_submit,  color: T.orange, bg: T.orangeBg },
    { label: "Pending IPRS Acceptance",      val: stats.pending_acceptance,   color: C.danger,  bg: T.redBg },
  ];

  return (
    <div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
        {tiles.map(({ label, val, color, bg }) => (
          <div key={label} className="rounded-xl border p-5 text-center" style={{ background: bg, borderColor: alpha(color, "33") }}>
            <div className="text-3xl font-bold" style={{ color }}>{val}</div>
            <div className="text-xs mt-1 font-medium uppercase tracking-wide" style={{ color: alpha(color, "cc") }}>{label}</div>
          </div>
        ))}
      </div>

      {stats.pending_iprs_submit > 0 && (
        <div className="rounded-xl border px-4 py-3 flex items-start gap-3" style={{ background: T.orangeBg, borderColor: T.amberBorder }}>
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" style={{ color: T.orange }} />
          <div className="text-sm" style={{ color: T.orangeDeep }}>
            <strong>{stats.pending_iprs_submit} submission{stats.pending_iprs_submit !== 1 ? "s" : ""}</strong> {stats.pending_iprs_submit === 1 ? "has" : "have"} not been submitted to IPRS yet. Go to <em>Submit Cue</em> tab to mark them.
          </div>
        </div>
      )}
      {stats.pending_acceptance > 0 && (
        <div className="mt-3 rounded-xl border px-4 py-3 flex items-start gap-3" style={{ background: T.redBg, borderColor: T.redBorder }}>
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" style={{ color: C.danger }} />
          <div className="text-sm" style={{ color: T.redDeep }}>
            <strong>{stats.pending_acceptance} submission{stats.pending_acceptance !== 1 ? "s" : ""}</strong> submitted to IPRS but acceptance not confirmed. Follow up with IPRS.
          </div>
        </div>
      )}
    </div>
  );
}

// ── Submit Cue tab ─────────────────────────────────────────────────────────
function SubmittedCueTab() {
  const { pushToast } = useApp();
  const [serials, setSerials]         = useState([]);
  const [movies, setMovies]           = useState([]);
  const [clients, setClients]         = useState([]);
  const [societies, setSocieties]     = useState([]);
  const [mailRequest, setMailRequest] = useState(null);   // open Send to Society preview
  const [approved, setApproved]       = useState(null);   // approved episodes of the picked serial/movie
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading]         = useState(true);
  const [logTab, setLogTab]           = useState("serial"); // "serial" | "movie"
  const [form, setForm] = useState({
    content_type: "serial", // "serial" | "movie"
    project_id: "", episode_from: "", episode_to: "", client_id: "", society_id: "", notes: "",
  });

  const load = () => {
    Promise.all([
      api.reviewerSerials(),
      api.reviewerMovies(),
      api.listClients(),
      api.listSocieties(),
      api.listSubmissions(),
    ]).then(([s, m, c, soc, subs]) => {
      setSerials(s);
      setMovies(m);
      setClients(c.filter((x) => x.is_active));
      setSocieties(soc.filter((x) => x.is_active));
      setSubmissions(subs);
    }).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  // Only approved episodes can be emailed: the pickers list just those (and mark ones already sent).
  useEffect(() => {
    if (!form.project_id) { setApproved(null); return; }
    let live = true;
    api.approvedEpisodes(form.project_id, form.society_id || null)
      .then((r) => { if (live) setApproved(r); })
      .catch(() => { if (live) setApproved({ episodes: [] }); });
    return () => { live = false; };
  }, [form.project_id, form.society_id, mailRequest]);

  const approvedEps = approved?.episodes || [];
  const fromIdx = approvedEps.findIndex((e) => String(e.number) === String(form.episode_from));
  // "To" only offers the unbroken run of approved episodes after "From", so a range can't include an unapproved one.
  const toOptions = [];
  for (let i = fromIdx; fromIdx >= 0 && i < approvedEps.length; i++) {
    if (i > fromIdx && approvedEps[i].number !== approvedEps[i - 1].number + 1) break;
    toOptions.push(approvedEps[i]);
  }
  const epLabel = (e) => `Ep ${e.number}${e.sent ? " · already sent" : ""}`;

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
        await showAlert("Pick the approved episodes to send (From and To).", { variant: "warn" }); return;
      }
    }
    if (!form.client_id) {
      await showAlert("Pick the client whose Gmail sends the email.", { variant: "warn" }); return;
    }
    if (!form.society_id) {
      await showAlert("Pick the society to send to.", { variant: "warn" }); return;
    }
    setMailRequest({
      project_id: parseInt(form.project_id),
      episode_from: from,
      episode_to: to,
      client_id: parseInt(form.client_id),
      society_id: parseInt(form.society_id),
      notes: form.notes.trim() || null,
    });
  };

  const onMailSent = (row) => {
    pushToast({ kind: "success", title: `Emailed to ${row.society_name}`, body: `${row.project_title} · Ep ${row.episode_from}–${row.episode_to} from ${row.mail_from}` });
    setForm({ content_type: form.content_type, project_id: "", episode_from: "", episode_to: "", client_id: form.client_id, society_id: "", notes: "" });
    load();
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
      <div className="rounded-xl border p-5" style={{ background: C.white, borderColor: alpha(C.mint1, "44") }}>
        <h4 className="text-sm font-semibold" style={{ fontFamily: FONTS.serif, color: C.dark }}>
          Submit to Society
        </h4>
        <p className="text-xs mb-4 mt-0.5" style={{ color: C.sub }}>
          Emails the cue sheets from the client's Gmail to the society. You see and can edit the email before it is sent.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
          {/* Content type */}
          <div>
            <label className="block text-[0.625rem] uppercase tracking-wider mb-1" style={{ color: C.sub }}>
              Type
            </label>
            <Select value={form.content_type}
              onChange={(e) => setForm((f) => ({ ...f, content_type: e.target.value, project_id: "" }))}
              className="w-full px-3 py-2 rounded-lg text-sm border focus:outline-none"
              style={{ borderColor: alpha(C.mint1, "44"), color: C.dark, background: C.white }}>
              <option value="serial">Serial</option>
              <option value="movie">Movie</option>
            </Select>
          </div>
          {/* Project dropdown — serials or movies based on type */}
          <div>
            <label className="block text-[0.625rem] uppercase tracking-wider mb-1" style={{ color: C.sub }}>
              {form.content_type === "serial" ? "Serial" : "Movie"}
            </label>
            <Select value={form.project_id}
              onChange={(e) => setForm((f) => ({ ...f, project_id: e.target.value, episode_from: "", episode_to: "" }))}
              className="w-full px-3 py-2 rounded-lg text-sm border focus:outline-none"
              style={{ borderColor: alpha(C.mint1, "44"), color: C.dark, background: C.white }}>
              <option value="">Select {form.content_type}…</option>
              {projectOptions.map((p) => (
                <option key={p.project_id} value={p.project_id}>{p.project_title}</option>
              ))}
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
          {/* Episode range only for serials — approved episodes only */}
          {form.content_type === "serial" && (
            <>
              <div>
                <label className="block text-[0.625rem] uppercase tracking-wider mb-1" style={{ color: C.sub }}>
                  Episode From
                </label>
                <Select value={form.episode_from} disabled={!form.project_id || !approvedEps.length}
                  onChange={(e) => setForm((f) => ({ ...f, episode_from: e.target.value, episode_to: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg text-sm border focus:outline-none"
                  style={{ borderColor: alpha(C.mint1, "44"), color: C.dark, background: C.white }}>
                  <option value="">{!form.project_id ? "Pick a serial first" : approved && !approvedEps.length ? "No approved episodes yet" : "From…"}</option>
                  {approvedEps.map((e) => <option key={e.number} value={e.number}>{epLabel(e)}</option>)}
                </Select>
              </div>
              <div>
                <label className="block text-[0.625rem] uppercase tracking-wider mb-1" style={{ color: C.sub }}>
                  Episode To
                </label>
                <Select value={form.episode_to} disabled={!toOptions.length}
                  onChange={(e) => setForm((f) => ({ ...f, episode_to: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg text-sm border focus:outline-none"
                  style={{ borderColor: alpha(C.mint1, "44"), color: C.dark, background: C.white }}>
                  <option value="">To…</option>
                  {toOptions.map((e) => <option key={e.number} value={e.number}>{epLabel(e)}</option>)}
                </Select>
              </div>
            </>
          )}
          {/* Client — its connected Gmail sends the email (Clients tab) */}
          <div>
            <label className="block text-[0.625rem] uppercase tracking-wider mb-1" style={{ color: C.sub }}>
              Client (sends from)
            </label>
            <Select value={form.client_id}
              onChange={(e) => setForm((f) => ({ ...f, client_id: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg text-sm border focus:outline-none"
              style={{ borderColor: alpha(C.mint1, "44"), color: C.dark, background: C.white }}>
              <option value="">Select client…</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}{c.mailbox?.status === "connected" ? ` — ${c.mailbox.email}` : c.mailbox ? " — Gmail needs reconnecting" : " — Gmail not connected"}
                </option>
              ))}
            </Select>
          </div>
          {/* Society — where the email goes (Societies tab) */}
          <div>
            <label className="block text-[0.625rem] uppercase tracking-wider mb-1" style={{ color: C.sub }}>
              Society (sends to)
            </label>
            <Select value={form.society_id}
              onChange={(e) => setForm((f) => ({ ...f, society_id: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg text-sm border focus:outline-none"
              style={{ borderColor: alpha(C.mint1, "44"), color: C.dark, background: C.white }}>
              <option value="">{societies.length ? "Select society…" : "No societies yet — add one under Societies"}</option>
              {societies.map((s) => <option key={s.id} value={s.id}>{s.name} — {s.to_emails.join(", ")}</option>)}
            </Select>
          </div>
          {/* Notes */}
          <div className={form.content_type === "movie" ? "" : ""}>
            <label className="block text-[0.625rem] uppercase tracking-wider mb-1" style={{ color: C.sub }}>
              Notes
            </label>
            <input value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder="Optional notes…"
              className="w-full px-3 py-2 rounded-lg text-sm border focus:outline-none"
              style={{ borderColor: alpha(C.mint1, "44"), color: C.dark }} />
          </div>
        </div>
        {form.project_id && approved && !approvedEps.length && (
          <p className="text-xs mb-3" style={{ color: T.orange }}>
            This {form.content_type} has no approved episodes yet. Approve it in Projects before sending.
          </p>
        )}
        {form.content_type === "serial" && fromIdx >= 0 && toOptions.length < approvedEps.length - fromIdx && (
          <p className="text-xs mb-3" style={{ color: C.sub }}>
            The range stops at Ep {toOptions[toOptions.length - 1].number}: the next episode isn't approved yet.
          </p>
        )}
        <button onClick={submit}
          className="inline-flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium"
          style={{ background: C.dark, color: C.mint4 }}>
          <Mail className="w-4 h-4" /> Preview Email
        </button>
      </div>

      {mailRequest && <SocietyMailModal request={mailRequest} onClose={() => setMailRequest(null)} onSent={onMailSent} />}

      {/* Submission log */}
      <div>
        <h4 className="text-sm font-semibold mb-3" style={{ fontFamily: FONTS.serif, color: C.dark }}>
          Submission Log
        </h4>

        {/* Log type tabs */}
        <div className="flex flex-wrap gap-1 mb-4 p-1 rounded-xl w-fit max-w-full"
          style={{ background: C.mint4, border: `1px solid ${alpha(C.mint1, "66")}` }}>
          {[
            { key: "serial", label: "Serials", Icon: Layers },
            { key: "movie",  label: "Movies",  Icon: Film   },
          ].map(({ key, label, Icon }) => (
            <button key={key} onClick={() => setLogTab(key)}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold transition-all"
              style={logTab === key
                ? { background: C.dark, color: C.mint4 }
                : { color: C.mid }}>
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

// ── Dashboard: episodes waiting for review ─────────────────────────────────────
const PENDING_SHOWN = 8;
const SLOW_DAYS = 3;
const REVIEW_TH = "text-left text-[0.625rem] uppercase tracking-wider font-semibold px-4 py-2.5";

function PendingReviews({ episodes, onReview }) {
  const openEp = useOpenEpisode();
  const [all, setAll] = useState(false);
  const rows = [...episodes].sort((a, b) => (a.submitted_at || "").localeCompare(b.submitted_at || ""));
  const shown = all ? rows : rows.slice(0, PENDING_SHOWN);
  const waited = (iso) => (iso ? Math.floor((Date.now() - new Date(iso)) / 86400000) : null);

  return (
    <section className="space-y-3">
      <div>
        <h4 className="text-sm font-semibold" style={{ fontFamily: FONTS.serif, color: C.dark }}>
          Pending review {rows.length > 0 && <span className="ml-1 text-[0.625rem] px-2 py-0.5 rounded-full font-bold" style={{ background: T.blue, color: C.white }}>{rows.length}</span>}
        </h4>
        <p className="text-[0.6875rem] mt-0.5" style={{ color: C.sub }}>Episodes editors submitted, oldest first. Open the cue sheet, then Review to approve, reject or ask for changes.</p>
      </div>
      {rows.length === 0 ? (
        <div className="text-sm rounded-xl border px-4 py-6 text-center" style={{ color: C.sub, borderColor: alpha(C.mint1, "44"), background: C.white }}>
          Nothing to review. Episodes editors submit show up here.
        </div>
      ) : (
        <div className="rounded-2xl border overflow-hidden" style={{ background: C.white, borderColor: alpha(C.mint1, "44") }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: alpha(C.mint4, "33"), color: C.sub }}>
                <th className={REVIEW_TH}>Serial / movie</th><th className={REVIEW_TH}>Episode</th><th className={REVIEW_TH}>Submitted by</th>
                <th className={REVIEW_TH}>Submitted</th><th className={REVIEW_TH}>Waiting</th><th className={REVIEW_TH}></th>
              </tr>
            </thead>
            <tbody>
              {shown.map((ep) => {
                const days = waited(ep.submitted_at);
                const isMovie = ep.project_type === "MOVIE";
                return (
                  <tr key={ep.id} className="border-t" style={{ borderColor: alpha(C.mint4, "88") }}>
                    <td className="px-4 py-2.5 font-medium" style={{ color: C.dark }}>{ep.project_title || "—"}</td>
                    <td className="px-4 py-2.5 text-xs" style={{ color: C.dark }}>{isMovie ? "Movie" : `Ep ${ep.episode_number}`}</td>
                    <td className="px-4 py-2.5 text-xs" style={{ color: C.dark }}>{ep.submitted_by || "—"}</td>
                    <td className="px-4 py-2.5 text-xs" style={{ color: C.sub }}>{ep.submitted_at ? fmtDateTime(ep.submitted_at) : "—"}</td>
                    <td className="px-4 py-2.5 text-xs font-semibold" style={{ color: days >= SLOW_DAYS ? T.orange : C.sub }}>
                      {days == null ? "—" : days === 0 ? "today" : `${days} day${days === 1 ? "" : "s"}`}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <div className="flex justify-end gap-1.5">
                        <OpenButton onClick={() => openEp(ep, ep.project_id, ep.project_title)} />
                        <ReviewButton opened={ep.opened !== false} onClick={() => onReview(ep)} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {rows.length > PENDING_SHOWN && (
            <button onClick={() => setAll((v) => !v)} className="w-full px-4 py-2 text-xs font-semibold border-t hover:bg-black/[0.03]"
              style={{ borderColor: alpha(C.mint4, "88"), color: C.sub }}>
              {all ? "Show fewer" : `Show all ${rows.length}`}
            </button>
          )}
        </div>
      )}
    </section>
  );
}

// ── Main dashboard ─────────────────────────────────────────────────────────────
export default function ReviewerDashboard() {
  const openEp = useOpenEpisode();
  const [tab, setTab]             = useState("dashboard");
  const [submitted, setSubmitted] = useState([]);   // episodes waiting for review (Projects badge)
  const [attention, setAttention] = useState(0);    // Dashboard items needing action
  const [reviewEp, setReviewEp]   = useState(null);

  useEffect(() => {
    api.submittedEpisodes().then(setSubmitted).catch(() => {});
  }, []);

  const handleAction = async (eid, type, note) => {
    if (type === "approve")      await api.approveEpisode(eid);
    else if (type === "reject")  await api.rejectEpisode(eid, note);
    else                         await api.suggestEpisode(eid, note);
    setSubmitted((prev) => prev.filter((e) => e.id !== eid));
  };

  const tabs = [
    { key: "dashboard",      label: "Dashboard", badge: attention },
    { key: "projects",       label: "Projects", badge: submitted.length },
    { key: "submitted_cue",  label: "Submit Cue" },
    { key: "clients",        label: "Clients" },
    { key: "societies",      label: "Societies" },
    { key: "activity",       label: "Activity Stats" },
  ];

  return (
    <DashboardShell
      title="Reviewer"
      subtitle="Review submitted episodes and track cue sheets emailed to the societies"
      tabs={tabs}
      activeTab={tab}
      onTab={setTab}>

      {reviewEp && (
        <ReviewModal episode={reviewEp} onClose={() => setReviewEp(null)} onAction={handleAction} />
      )}

      {/* ── Dashboard: emails to the societies and their responses ── */}
      {tab === "dashboard" && (
        <div className="space-y-6">
          <SocietyDashboard onAttention={setAttention}
            pendingReviews={<PendingReviews episodes={submitted} onReview={setReviewEp} />} />
          <ReviewerCalendar reloadKey={submitted.length} />
        </div>
      )}

      {/* ── Projects (Serials + Movies) ── */}
      {tab === "projects" && (
        <ProjectsTab onReviewEp={setReviewEp} />
      )}

      {/* ── Submit Cue ── */}
      {tab === "submitted_cue" && <SubmittedCueTab />}

      {/* ── Clients + Gmail connections ── */}
      {tab === "clients" && <ClientsPanel />}

      {/* ── Societies (where Send to Society emails go) ── */}
      {tab === "societies" && <SocietiesPanel />}

      {/* ── Activity Stats ── */}
      {tab === "activity" && <ReviewerActivityTab />}
    </DashboardShell>
  );
}
