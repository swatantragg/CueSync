import { useEffect, useState } from "react";
import {
  CheckCircle2, XCircle, MessageSquare, Download, Search, X,
  Layers, ChevronDown, FileDown, ChevronLeft, ChevronRight,
} from "lucide-react";
import { C, FONTS } from "../../styles/palette";
import DashboardShell from "./DashboardShell";
import { api } from "../../utils/api";
import { showAlert } from "../../components/Dialog";
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
    <div className="relative inline-block">
      <button onClick={() => setOpen((o) => !o)} disabled={busy}
        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium disabled:opacity-50"
        style={{ background: "#E8F5E9", color: "#2E7D32" }}>
        <Download className="w-3 h-3" />{busy ? "…" : "Download"}
        <ChevronDown className="w-3 h-3" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-1 z-30 rounded-xl shadow-xl overflow-hidden min-w-[90px]"
            style={{ background: C.white, border: `1px solid ${C.mint1}44` }}>
            {["IPRS", "PRS", "ASCAP"].map((s) => (
              <button key={s} onClick={() => download(s.toLowerCase())}
                className="block w-full text-left px-4 py-2 text-xs hover:opacity-70"
                style={{ color: C.dark }}>{s}</button>
            ))}
          </div>
        </>
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.55)" }}>
      <div className="rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden"
        style={{ background: C.dark }}>
        <div className="px-6 py-4 border-b flex items-center justify-between"
          style={{ borderColor: C.mid }}>
          <div>
            <h3 className="font-semibold" style={{ fontFamily: FONTS.serif, color: C.mint4 }}>
              Review — {episode.project_title} Ep {episode.episode_number}
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
  const [society, setSociety] = useState("iprs");
  const [fromEp,  setFromEp]  = useState("");
  const [toEp,    setToEp]    = useState("");
  const [busy,    setBusy]    = useState(false);

  const go = async () => {
    const from = parseInt(fromEp, 10);
    const to   = parseInt(toEp,   10);
    if (!from || !to || from > to) {
      await showAlert("Enter a valid episode range (From ≤ To).", { variant: "warn" }); return;
    }
    setBusy(true);
    try {
      const fname = `${serial.project_title}_${society.toUpperCase()}_EP${from}-${to}.xlsx`;
      await api.downloadBulkExport(serial.project_id, society, from, to, fname);
    } catch (ex) {
      await showAlert(ex.message, { title: "Download Failed", variant: "error" });
    } finally { setBusy(false); }
  };

  return (
    <div className="flex items-center gap-3 flex-wrap p-3 rounded-xl"
      style={{ background: C.mint4 + "22", border: `1px solid ${C.mint1}33` }}>
      <span className="text-xs font-semibold" style={{ color: C.dark }}>Bulk Download</span>
      <select value={society} onChange={(e) => setSociety(e.target.value)}
        className="px-2 py-1.5 rounded-lg text-xs focus:outline-none"
        style={{ background: C.white, color: C.dark, border: `1px solid ${C.mint1}44` }}>
        <option value="iprs">IPRS</option>
        <option value="prs">PRS</option>
        <option value="ascap">ASCAP</option>
      </select>
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
      <button onClick={go} disabled={busy}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-50"
        style={{ background: C.dark, color: C.mint4 }}>
        <FileDown className="w-3.5 h-3.5" />{busy ? "Downloading…" : `Download ${society.toUpperCase()}`}
      </button>
    </div>
  );
}

// ── Serial detail view (shown inside Serials tab, not a separate page) ────────
function SerialDetail({ serial, onBack, onReview }) {
  const { setActiveProjectId, setActiveEpisodeId, setScreen, setProjects } = useApp();
  const [detail, setDetail]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [subTab, setSubTab]   = useState("all");
  const [allPage, setAllPage]         = useState(1);
  const [approvedPage, setApprovedPage] = useState(1);

  const openEpisode = (ep) => {
    const epStub = {
      id: ep.id, number: ep.episode_number, title: ep.title || "",
      airDate: ep.air_date, status: ep.status, editHistory: [], cues: [],
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
      {/* Back button */}
      <button onClick={onBack}
        className="flex items-center gap-1.5 text-sm mb-5 hover:opacity-70"
        style={{ color: C.sub }}>
        <ChevronLeft className="w-4 h-4" />Back to Serials
      </button>

      {/* Serial header */}
      <div className="mb-5">
        <p className="text-xs font-semibold uppercase tracking-widest mb-1"
          style={{ color: C.sub }}>SERIAL</p>
        <h2 className="text-2xl font-bold" style={{ fontFamily: FONTS.serif, color: C.dark }}>
          {serial.project_title}
        </h2>
      </div>

      {/* Stats row */}
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

      {/* Bulk download bar */}
      <div className="mb-5">
        <BulkDownloadBar serial={serial} />
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-1 mb-4 p-1 rounded-xl w-fit"
        style={{ background: C.mint4 + "33" }}>
        {[
          { key: "all",      label: `All Episodes (${allEps.length})` },
          { key: "approved", label: `Approved (${approvedEps.length})` },
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

      {/* Episode tables */}
      {loading ? (
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
        </>
      )}
    </div>
  );
}

// ── Serials list view with pagination ─────────────────────────────────────────
function SerialsTab({ onReviewEp }) {
  const [view, setView]             = useState("list");
  const [serials, setSerials]       = useState([]);
  const [loading, setLoading]       = useState(true);
  const [page, setPage]             = useState(1);
  const [searchQ, setSearchQ]       = useState("");
  const [selectedSerial, setSelected] = useState(null);

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

  const openSerial = (serial) => {
    setSelected(serial);
    setView("detail");
  };

  // Review action inside detail view re-fetches submitted list in parent, handled via onReviewEp
  const handleReviewInDetail = async (ep) => {
    onReviewEp(ep);
  };

  if (view === "detail" && selectedSerial) {
    return (
      <SerialDetail
        serial={selectedSerial}
        onBack={() => setView("list")}
        onReview={handleReviewInDetail}
      />
    );
  }

  return (
    <div>
      {/* Search */}
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

      {loading && (
        <div className="py-10 text-center text-sm" style={{ color: C.sub }}>Loading…</div>
      )}

      {!loading && filtered.length === 0 && (
        <div className="py-10 text-center text-sm" style={{ color: C.sub }}>
          No serials with submitted or approved episodes.
        </div>
      )}

      {/* Serials table */}
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
                  onClick={() => openSerial(serial)}>
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
                      onClick={() => openSerial(serial)}
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

// ── Download records tab ───────────────────────────────────────────────────────
function DownloadsTab() {
  const [entries, setEntries] = useState(() => {
    try { return JSON.parse(localStorage.getItem("reviewer_downloads") || "[]"); } catch { return []; }
  });
  const [form, setForm] = useState({ client: "", serial: "", count: "" });

  const save = () => {
    if (!form.client.trim() || !form.serial.trim()) return;
    const updated = [...entries, { ...form, id: Date.now(), at: new Date().toISOString() }];
    setEntries(updated);
    localStorage.setItem("reviewer_downloads", JSON.stringify(updated));
    setForm({ client: "", serial: "", count: "" });
  };

  const remove = (id) => {
    const updated = entries.filter((e) => e.id !== id);
    setEntries(updated);
    localStorage.setItem("reviewer_downloads", JSON.stringify(updated));
  };

  return (
    <div>
      <div className="rounded-xl border p-4 mb-6"
        style={{ background: C.white, borderColor: C.mint1 + "44" }}>
        <h4 className="text-sm font-semibold mb-3" style={{ fontFamily: FONTS.serif }}>
          Add Download Entry
        </h4>
        <div className="grid grid-cols-3 gap-3">
          <input value={form.client} onChange={(e) => setForm((f) => ({ ...f, client: e.target.value }))}
            placeholder="Client name"
            className="px-3 py-2 rounded-lg text-sm border focus:outline-none"
            style={{ borderColor: C.mint1 + "44", color: C.dark }} />
          <input value={form.serial} onChange={(e) => setForm((f) => ({ ...f, serial: e.target.value }))}
            placeholder="Serial / movie name"
            className="px-3 py-2 rounded-lg text-sm border focus:outline-none"
            style={{ borderColor: C.mint1 + "44", color: C.dark }} />
          <input value={form.count} onChange={(e) => setForm((f) => ({ ...f, count: e.target.value }))}
            placeholder="No. of cue sheets" type="number"
            className="px-3 py-2 rounded-lg text-sm border focus:outline-none"
            style={{ borderColor: C.mint1 + "44", color: C.dark }} />
        </div>
        <button onClick={save}
          className="mt-3 px-4 py-2 rounded-lg text-sm font-medium"
          style={{ background: C.dark, color: C.mint4 }}>
          Add Entry
        </button>
      </div>

      <div className="rounded-xl border overflow-hidden"
        style={{ background: C.white, borderColor: C.mint1 + "44" }}>
        <div className="px-4 py-3 border-b text-xs font-semibold uppercase tracking-wider"
          style={{ borderColor: C.mint4, background: C.mint4 + "66", color: C.sub }}>
          Download Records ({entries.length})
        </div>
        {entries.length === 0 ? (
          <div className="p-8 text-center text-sm" style={{ color: C.sub }}>No entries yet</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-[10px] uppercase tracking-wider"
                style={{ borderColor: C.mint4, color: C.sub, background: C.mint4 + "22" }}>
                <th className="text-left px-4 py-2">Client</th>
                <th className="text-left px-4 py-2">Serial / Movie</th>
                <th className="text-center px-4 py-2">Cue Sheets</th>
                <th className="text-left px-4 py-2">Date</th>
                <th className="w-8 px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id} className="border-b last:border-0"
                  style={{ borderColor: C.mint4 + "55" }}>
                  <td className="px-4 py-3" style={{ color: C.dark }}>{e.client}</td>
                  <td className="px-4 py-3" style={{ color: C.dark }}>{e.serial}</td>
                  <td className="px-4 py-3 text-center font-medium" style={{ color: C.dark }}>
                    {e.count || "—"}
                  </td>
                  <td className="px-4 py-3 text-xs" style={{ color: C.sub }}>
                    {e.at ? new Date(e.at).toLocaleDateString() : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => remove(e.id)} className="hover:opacity-70">
                      <X className="w-3.5 h-3.5" style={{ color: C.danger }} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ── Main dashboard ─────────────────────────────────────────────────────────────
export default function ReviewerDashboard() {
  const { setActiveProjectId, setScreen } = useApp();
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
    { key: "queue",     label: "Review Queue", badge: submitted.length },
    { key: "serials",   label: "Serials" },
    { key: "downloads", label: "Download Records" },
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
                  <th className="text-left px-5 py-3">Serial</th>
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
                          onClick={() => { setActiveProjectId(ep.project_id); setScreen("serial"); }}
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

      {/* ── Serials ── */}
      {tab === "serials" && (
        <SerialsTab onReviewEp={setReviewEp} />
      )}

      {/* ── Download Records ── */}
      {tab === "downloads" && <DownloadsTab />}
    </DashboardShell>
  );
}
