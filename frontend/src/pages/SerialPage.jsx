import { useEffect, useMemo, useState } from "react";
import { Upload, FileSpreadsheet, ChevronRight, Trash2, ArrowLeft, Check, XCircle, MessageSquare, X, Search } from "lucide-react";
import { showAlert, showConfirm } from "../components/Dialog";
import { C, FONTS, alpha, T } from "../styles/palette";
import Header from "../components/Header";
import MetaCard from "../components/MetaCard";
import StatusBadge from "../components/StatusBadge";
import RoughSheetPreview from "../components/RoughSheetPreview";
import WorkFileCard, { WorkFileChip } from "../components/WorkFileUpload";
import { api } from "../utils/api";
import { ACTION_LABEL, fmtDateTime, timeAgo } from "../utils/format";
import { useApp } from "../context/AppContext";

export default function SerialPage() {
  const { activeProject, activeProjectId, isAdmin, isReviewer, updateProject, setProjects, setActiveProjectId, setActiveEpisodeId, setScreen, goHome } = useApp();
  const canReviewRole = isAdmin || isReviewer;
  const [busy, setBusy] = useState(false);
  const [importProgress, setImportProgress] = useState(null);
  const [err, setErr] = useState("");
  const [preview, setPreview] = useState(null);
  const [importResult, setImportResult] = useState(null);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 25;
  const [reviewModal, setReviewModal] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [deleting, setDeleting] = useState(false);
  const [searchQ, setSearchQ] = useState("");
  const [bootstrapping, setBootstrapping] = useState(false);
  const [workFiles, setWorkFiles] = useState([]);

  const reload = async (pid) => {
    const id = pid || activeProject?.id || activeProjectId;
    if (!id) return;
    const [p, eps, wfs] = await Promise.all([api.getProject(id), api.listEpisodes(id), api.listWorkFiles(id).catch(() => [])]);
    setWorkFiles(wfs);
    setProjects((prev) => {
      const exists = prev.find((proj) => proj.id === id);
      if (!exists) return [...prev, { id, title: p.title, episodes: [] }];
      return prev;
    });
    setActiveProjectId(id);
    updateProject(id, (prev) => ({
      ...prev, ...p,
      type: (p.type || "serial").toLowerCase(),
      year: p.production_year, productionCompany: p.production_company, channel: p.channel_name,
      countryOfOrigin: p.country, backgroundMusicComposer: p.bg_music_composer,
      submittedBy: p.submitted_by,
      episodes: eps.map((e) => ({
        ...e, id: e.id, number: e.episode_number, airDate: e.air_date,
        totalDuration: e.total_duration_sec, musicalDuration: e.musical_duration_sec,
        status: e.status || "pending", rejectionNote: e.rejection_note, reviewNote: e.review_note,
        songCount: e.song_count ?? 0, reviewOpened: e.review_opened !== false,
        lastActivity: e.last_activity_at ? {
          at: e.last_activity_at, by: e.last_activity_by, action: e.last_activity_action, details: e.last_activity_details,
        } : null,
        editHistory: [], cues: [],
      })),
    }));
  };

  useEffect(() => {
    setPage(1);
    if (!activeProject && activeProjectId) {
      setBootstrapping(true);
      reload(activeProjectId).catch(() => {}).finally(() => setBootstrapping(false));
    } else {
      reload().catch(() => {});
    }
  }, [activeProject?.id, activeProjectId]);

  if (!activeProject && bootstrapping) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: C.light }}>
      <span className="text-sm" style={{ color: T.grayMid }}>Loading…</span>
    </div>
  );

  if (!activeProject) return null;
  const proj = { ...activeProject, type: (activeProject.type || "serial").toLowerCase() };

  const fmtDur = (sec) => {
    if (!sec) return "—";
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  const handleImport = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    e.target.value = "";
    setBusy(true);
    setErr("");
    setImportResult(null);
    const errors = [];
    const merged = { meta: {}, episodes: [] };
    const seenEpNums = new Set();
    let totalEpisodes = 0;

    setImportProgress({ pct: 0, episodes: 0, filesDone: 0, filesTotal: files.length });

    for (let i = 0; i < files.length; i++) {
      // Mark file i as in-progress (fill up to just before next file boundary)
      setImportProgress({ pct: Math.round((i / files.length) * 90), episodes: totalEpisodes, filesDone: i, filesTotal: files.length });
      try {
        const data = await api.previewRough(proj.id, files[i]);
        if (data.meta) Object.assign(merged.meta, data.meta);
        for (const ep of data.episodes || []) {
          if (!seenEpNums.has(ep.episode_number)) {
            seenEpNums.add(ep.episode_number);
            merged.episodes.push(ep);
            totalEpisodes++;
          }
        }
      } catch (ex) {
        errors.push(`${files[i].name}: ${ex.message}`);
      }
      // File i done — advance bar proportionally
      setImportProgress({ pct: Math.round(((i + 1) / files.length) * 90), episodes: totalEpisodes, filesDone: i + 1, filesTotal: files.length });
    }

    // All files done — flash 100% so user sees completion before preview opens
    setImportProgress({ pct: 100, episodes: totalEpisodes, filesDone: files.length, filesTotal: files.length, done: true });
    await new Promise((r) => setTimeout(r, 500));

    setImportProgress(null);
    setBusy(false);
    if (errors.length) setErr(errors.join("\n"));
    if (merged.episodes.length > 0) {
      merged.episodes.sort((a, b) => a.episode_number - b.episode_number);
      setPreview(merged);
    }
  };

  const handlePreviewSaved = async (result) => {
    setPreview(null);
    const created = result?.episodes_created || 0;
    if (created > 0) {
      setImportResult(`${created} episode${created !== 1 ? "s" : ""} imported successfully.`);
    }
    await reload();
  };

  const handleApprove = async (ep) => {
    try { await api.approveEpisode(ep.id); await reload(); }
    catch (ex) { await showAlert(ex.message, { title: "Approve Failed", variant: "error" }); }
  };

  const handleDeleteSelected = async () => {
    if (!selected.size) return;
    const ok = await showConfirm(
      `${selected.size} episode${selected.size > 1 ? "s" : ""} will be permanently deleted.`,
      { title: `Delete ${selected.size} Episode${selected.size > 1 ? "s" : ""}`, confirmLabel: "Delete", variant: "danger", detail: "All songs and cue data inside will be lost." }
    );
    if (!ok) return;
    setDeleting(true);
    const ids = [...selected];
    const errors = [];
    for (const id of ids) {
      try { await api.deleteEpisode(id); }
      catch (ex) { errors.push(ex.message); }
    }
    setSelected(new Set());
    setDeleting(false);
    await reload();
    if (errors.length) await showAlert(`${errors.length} deletion(s) failed:\n${errors.join("\n")}`, { title: "Partial Failure", variant: "warn" });
  };

  const filteredEps = useMemo(() => {
    const q = searchQ.trim().toLowerCase();
    if (!q) return proj.episodes;
    return proj.episodes.filter((e) =>
      String(e.number).includes(q) ||
      (e.title || "").toLowerCase().includes(q) ||
      (e.airDate || "").toLowerCase().includes(q)
    );
  }, [proj.episodes, searchQ]);

  const pageEps = filteredEps.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const isSerial = proj.type !== "movie";
  const workFileEps = new Set(workFiles.map((w) => w.episode_number));
  const pageIds = pageEps.map((e) => e.id);
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const toggleOne = (id) => setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAll = () => setSelected(allPageSelected ? new Set([...selected].filter((id) => !pageIds.includes(id))) : new Set([...selected, ...pageIds]));

  const handleReviewSubmit = async () => {
    if (!reviewModal || !reviewModal.note.trim()) return;
    const { ep, action, note } = reviewModal;
    try {
      if (action === "reject") await api.rejectEpisode(ep.id, note.trim());
      else await api.suggestEpisode(ep.id, note.trim());
      await reload();
      setReviewModal(null);
    } catch (ex) { await showAlert(ex.message, { title: "Action Failed", variant: "error" }); }
  };

  return (
    <div className="min-h-screen" style={{ background: C.light, fontFamily: FONTS.sans, color: C.dark }}>
      <Header />

      {preview && (
        <RoughSheetPreview
          projectId={proj.id}
          data={preview}
          onClose={() => setPreview(null)}
          onSaved={handlePreviewSaved}
        />
      )}

      {reviewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.55)" }}>
          <div className="cs-dark rounded-2xl p-6 w-full max-w-md shadow-2xl" style={{ background: C.dark }}>
            <div className="flex items-center justify-between mb-4">
              <div className="font-semibold text-lg" style={{ fontFamily: FONTS.serif, color: C.mint4 }}>
                {reviewModal.action === "reject" ? "Reject" : "Suggest Changes"} — Ep {String(reviewModal.ep.number).padStart(2, "0")}
              </div>
              <button onClick={() => setReviewModal(null)} className="p-1 rounded-lg hover:opacity-70" style={{ color: C.mint1 }}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <textarea
              autoFocus
              value={reviewModal.note}
              onChange={(ev) => setReviewModal((m) => ({ ...m, note: ev.target.value }))}
              rows={4}
              placeholder={reviewModal.action === "reject" ? "Reason for rejection…" : "What should the editor fix or check?"}
              className="w-full border rounded-xl px-4 py-3 text-sm focus:outline-none mb-4 resize-none"
              style={{ borderColor: C.mid, background: "rgba(255,255,255,0.07)", color: C.mint4 }}
            />
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setReviewModal(null)}
                className="px-4 py-2 rounded-xl text-sm"
                style={{ background: "rgba(255,255,255,0.1)", color: C.mint4 }}
              >Cancel</button>
              <button
                onClick={handleReviewSubmit}
                disabled={!reviewModal.note.trim()}
                className="px-5 py-2 rounded-xl text-sm font-medium disabled:opacity-40 hover:opacity-90"
                style={{ background: reviewModal.action === "reject" ? C.danger : "#F57C00", color: C.white }}
              >
                {reviewModal.action === "reject" ? "Reject" : "Send Suggestion"}
              </button>
            </div>
          </div>
        </div>
      )}

      <main className="max-w-7xl mx-auto px-6 py-10">
        <button onClick={goHome} className="flex items-center gap-1.5 text-xs mb-5 px-3 py-1.5 rounded-lg hover:opacity-80" style={{ background: C.white, border: `1px solid ${alpha(C.mint1, "55")}`, color: C.dark }}>
          <ArrowLeft className="w-3.5 h-3.5" /> Back
        </button>
        <div className="flex items-end justify-between mb-8">
          <div>
            <div className="text-xs uppercase tracking-widest mb-2" style={{ color: C.sub }}>{proj.type} · {proj.language}</div>
            <h2 className="text-5xl" style={{ fontFamily: FONTS.serif }}>{proj.title}</h2>
          </div>
        </div>
        {proj.type !== "movie" && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
            <MetaCard label="Channel" value={proj.channel} />
            <MetaCard label="Episodes" value={proj.episodes.length} mono />
          </div>
        )}

        {importResult && (
          <div className="mb-4 text-sm rounded-xl px-4 py-3 flex items-center justify-between" style={{ color: T.green, background: T.greenBg, border: `1px solid ${T.greenBorder}` }}>
            {importResult}
            <button onClick={() => setImportResult(null)} className="ml-4 opacity-60 hover:opacity-100">×</button>
          </div>
        )}
        {err && (
          <div className="mb-4 text-sm whitespace-pre-line rounded-xl px-4 py-3" style={{ color: C.danger, background: T.redBg, border: `1px solid ${T.redBorder}` }}>
            {err}
          </div>
        )}

        {!canReviewRole && (
          <div className="rounded-2xl border overflow-hidden mb-8" style={{ borderColor: alpha(C.mint1, "66"), background: alpha(C.mint4, "88") }}>
            <div className="px-6 py-5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: C.mint1 }}>
                  <Upload className="w-5 h-5" style={{ color: C.dark }} />
                </div>
                <div>
                  <div className="font-semibold text-lg" style={{ fontFamily: FONTS.serif }}>Import Rough Sheet</div>
                  <div className="text-xs" style={{ color: C.sub }}>
                    {busy && importProgress
                      ? importProgress.done
                        ? `All files extracted — opening preview…`
                        : `Parsing file ${importProgress.filesDone + 1} of ${importProgress.filesTotal}…`
                      : "Select one or multiple .xlsx sheets — review extracted data before saving"}
                  </div>
                </div>
              </div>
              <label
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium cursor-pointer hover:opacity-90"
                style={{ background: busy ? C.mid : C.dark, color: C.mint4, pointerEvents: busy ? "none" : "auto" }}
              >
                {busy ? (
                  <>
                    <span className="w-4 h-4 rounded-full border-2 border-t-transparent animate-spin shrink-0" style={{ borderColor: C.mint1, borderTopColor: "transparent" }} />
                    Importing…
                  </>
                ) : (
                  <>
                    <FileSpreadsheet className="w-4 h-4" />Choose .xlsx
                  </>
                )}
                <input type="file" accept=".xlsx,.xls" multiple className="sr-only" onChange={handleImport} disabled={busy} />
              </label>
            </div>
            {busy && importProgress && (
              <div className="px-6 pb-4">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[0.6875rem]" style={{ color: C.sub }}>
                    {importProgress.done
                      ? `✓ ${importProgress.episodes} episode${importProgress.episodes !== 1 ? "s" : ""} extracted`
                      : `File ${importProgress.filesDone + (importProgress.pct < 90 ? 1 : 0)} of ${importProgress.filesTotal} — ${importProgress.episodes} episode${importProgress.episodes !== 1 ? "s" : ""} found`}
                  </span>
                  <span className="text-[0.6875rem] font-mono font-semibold" style={{ color: importProgress.done ? C.ok : C.dark }}>
                    {importProgress.pct}%
                  </span>
                </div>
                <div className="w-full rounded-full overflow-hidden" style={{ height: 7, background: alpha(C.mint1, "2A") }}>
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${importProgress.pct}%`,
                      transition: "width 0.35s cubic-bezier(0.4,0,0.2,1)",
                      backgroundSize: "200% 100%",
                      backgroundImage: importProgress.done
                        ? `linear-gradient(90deg, ${C.ok}, #52c41a)`
                        : `linear-gradient(90deg, ${C.mint1} 0%, ${C.dark} 40%, ${C.mint1} 60%, ${C.dark} 100%)`,
                      animation: importProgress.done ? "none" : "progress-shimmer 1.6s linear infinite",
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {!canReviewRole && isSerial && (
          <WorkFileCard projectId={proj.id} projectTitle={proj.title} workFiles={workFiles} onChanged={() => reload()} />
        )}

        <div className="rounded-2xl border overflow-hidden" style={{ background: C.white, borderColor: alpha(C.mint1, "44") }}>
          <div className="px-6 py-4 border-b flex flex-wrap items-center gap-3 justify-between" style={{ borderColor: C.mint4, background: alpha(C.mint4, "66") }}>
            <h3 className="font-semibold text-lg" style={{ fontFamily: FONTS.serif }}>
              {proj.type === "movie" ? "Movie Cue Sheet" : `Episodes (${filteredEps.length}${searchQ ? ` of ${proj.episodes.length}` : ""})`}
            </h3>
            <div className="flex items-center gap-3 flex-wrap">
              {/* Search — hidden for movies */}
              {proj.type !== "movie" && (
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: C.sub }} />
                <input
                  type="text"
                  value={searchQ}
                  onChange={(e) => { setSearchQ(e.target.value); setPage(1); }}
                  placeholder="Search by ep. number or title…"
                  className="pl-8 pr-3 py-1.5 text-xs rounded-lg border focus:outline-none"
                  style={{ borderColor: alpha(C.mint1, "44"), background: C.white, color: C.dark, width: 230 }}
                />
                {searchQ && (
                  <button onClick={() => setSearchQ("")} className="absolute right-2 top-1/2 -translate-y-1/2 hover:opacity-70" style={{ color: C.sub }}>
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
              )}

              {selected.size > 0 && !canReviewRole && (
                <button
                  onClick={handleDeleteSelected}
                  disabled={deleting}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium disabled:opacity-50"
                  style={{ background: T.redBg, color: C.danger, border: `1px solid ${T.redBorder}` }}
                >
                  <Trash2 className="w-3.5 h-3.5" />{deleting ? "Deleting…" : `Delete ${selected.size} selected`}
                </button>
              )}
              {canReviewRole && proj.episodes.filter((e) => e.status === "submitted" || e.status === "edited").length > 0 && (
                <span className="text-xs px-2.5 py-1 rounded-lg font-medium" style={{ background: T.purpleBg, color: T.purple }}>
                  {proj.episodes.filter((e) => e.status === "submitted" || e.status === "edited").length} pending review
                </span>
              )}
              {filteredEps.length > PAGE_SIZE && (() => {
                const totalPages = Math.ceil(filteredEps.length / PAGE_SIZE);
                return (
                  <div className="flex items-center gap-1 text-xs" style={{ color: C.sub }}>
                    <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                      className="px-2 py-1 rounded disabled:opacity-30 hover:opacity-70"
                      style={{ background: C.mint4 }}>‹</button>
                    <span style={{ fontFamily: FONTS.mono }}>{page} / {totalPages}</span>
                    <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                      className="px-2 py-1 rounded disabled:opacity-30 hover:opacity-70"
                      style={{ background: C.mint4 }}>›</button>
                  </div>
                );
              })()}
            </div>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-[0.625rem] uppercase tracking-wider" style={{ borderColor: C.mint4, color: C.sub, background: alpha(C.mint4, "33") }}>
                {isSerial && <th className="text-left px-5 py-3 w-16">Ep.</th>}
                <th className="text-left px-5 py-3">Title</th>
                <th className="text-left px-5 py-3">Air Date</th>
                <th className="text-left px-5 py-3 w-28">Duration</th>
                <th className="text-left px-5 py-3 w-16">Songs</th>
                <th className="text-left px-5 py-3 w-32">Status</th>
                {isSerial && <th className="text-left px-5 py-3 w-28">Work File</th>}
                <th className="text-left px-5 py-3">Last Activity</th>
                <th className="text-right px-5 py-3 w-52">Action</th>
                {!canReviewRole && (
                  <th className="px-5 py-3 w-10 text-center">
                    <input type="checkbox" checked={allPageSelected} onChange={toggleAll} style={{ accentColor: C.dark }} className="cursor-pointer" title="Select all on this page" />
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {filteredEps.length === 0 && (
                <tr>
                  <td colSpan={(canReviewRole ? 8 : 9) + (isSerial ? 1 : 0)} className="px-5 py-10 text-center text-sm" style={{ color: C.sub }}>
                    {proj.type === "movie"
                      ? "No cue sheet imported yet. Use the Import Rough Sheet option above."
                      : searchQ ? `No episodes match "${searchQ}".` : "No episodes yet."}
                  </td>
                </tr>
              )}
              {pageEps.map((ep) => {
                const last = ep.lastActivity;
                const canReview = canReviewRole && (ep.status === "submitted" || ep.status === "edited");
                // Reviewers unlock the quick review actions by opening the cue sheet first.
                const reviewLocked = isReviewer && !ep.reviewOpened;
                const lockTitle = "Open the cue sheet first to review it";
                const isSelected = selected.has(ep.id);
                return (
                  <tr
                    key={ep.id}
                    className="border-b last:border-0 hover:bg-green-50/30 transition cursor-pointer"
                    style={{ borderColor: alpha(C.mint4, "88"), background: isSelected ? alpha(C.mint4, "99") : canReview ? alpha(T.purpleBg, "11") : undefined }}
                    onClick={() => { setActiveEpisodeId(ep.id); setScreen("episode"); }}
                  >
                    {proj.type !== "movie" && <td className="px-5 py-3 font-mono text-sm">{String(ep.number).padStart(2, "0")}</td>}
                    <td className="px-5 py-3 text-xs font-medium" style={{ color: C.dark }}>{ep.title || "—"}</td>
                    <td className="px-5 py-3 text-xs" style={{ fontFamily: FONTS.mono, color: C.sub }}>{ep.airDate || "—"}</td>
                    <td className="px-5 py-3 text-xs" style={{ fontFamily: FONTS.mono, color: C.sub }}>{fmtDur(ep.totalDuration)}</td>
                    <td className="px-5 py-3 font-medium" style={{ color: C.dark }}>{ep.songCount ?? ep.cues.length}</td>
                    <td className="px-5 py-3"><StatusBadge status={ep.status} /></td>
                    {isSerial && (
                      <td className="px-5 py-3">
                        {workFileEps.has(ep.number)
                          ? <WorkFileChip projectId={proj.id} projectTitle={proj.title} epNum={ep.number} />
                          : <span className="text-xs" style={{ color: C.muted }}>—</span>}
                      </td>
                    )}
                    <td className="px-5 py-3 text-xs" title={last ? `${last.details || ACTION_LABEL[last.action] || last.action} — ${fmtDateTime(last.at)}` : undefined}>
                      {last ? (
                        <div className="leading-snug">
                          <div className="truncate max-w-[14rem]" style={{ color: C.dark }}>
                            <span className="font-semibold">{last.by || "System"}</span>
                            <span style={{ color: C.sub }}> · {ACTION_LABEL[last.action] || last.action}</span>
                          </div>
                          <div style={{ color: C.muted }}>{timeAgo(last.at)}</div>
                        </div>
                      ) : <span style={{ color: C.muted }}>—</span>}
                    </td>
                    <td className="px-5 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1.5">
                        {!canReviewRole && (
                          <button
                            onClick={async () => {
                              const ok = await showConfirm(
                                `Episode ${String(ep.number).padStart(2, "0")}${ep.title ? ` — "${ep.title}"` : ""} will be permanently deleted.`,
                                { title: "Delete Episode", confirmLabel: "Delete", variant: "danger", detail: "All songs and cue data inside will be lost." }
                              );
                              if (!ok) return;
                              try { await api.deleteEpisode(ep.id); await reload(); }
                              catch (ex) { await showAlert(ex.message, { title: "Delete Failed", variant: "error" }); }
                            }}
                            className="p-1.5 rounded-lg hover:bg-red-50"
                            title="Delete episode"
                          ><Trash2 className="w-4 h-4" style={{ color: C.danger }} /></button>
                        )}

                        {canReview && (
                          <>
                            <button
                              onClick={() => handleApprove(ep)}
                              disabled={reviewLocked}
                              className="p-1.5 rounded-lg hover:opacity-80 transition disabled:opacity-35 disabled:cursor-not-allowed"
                              title={reviewLocked ? lockTitle : "Approve"}
                              style={{ background: T.greenBg, border: `1px solid ${T.greenBorder}` }}
                            ><Check className="w-4 h-4" style={{ color: C.ok }} /></button>
                            <button
                              onClick={() => setReviewModal({ ep, action: "reject", note: "" })}
                              disabled={reviewLocked}
                              className="p-1.5 rounded-lg hover:opacity-80 transition disabled:opacity-35 disabled:cursor-not-allowed"
                              title={reviewLocked ? lockTitle : "Reject"}
                              style={{ background: T.redBg, border: `1px solid ${T.redBorder}` }}
                            ><XCircle className="w-4 h-4" style={{ color: C.danger }} /></button>
                            <button
                              onClick={() => setReviewModal({ ep, action: "suggest", note: "" })}
                              disabled={reviewLocked}
                              className="p-1.5 rounded-lg hover:opacity-80 transition disabled:opacity-35 disabled:cursor-not-allowed"
                              title={reviewLocked ? lockTitle : "Suggest changes"}
                              style={{ background: T.amberBg, border: `1px solid ${T.amberBorder}` }}
                            ><MessageSquare className="w-4 h-4" style={{ color: T.orange2 }} /></button>
                          </>
                        )}

                        <button
                          onClick={() => { setActiveEpisodeId(ep.id); setScreen("episode"); }}
                          className="text-xs uppercase tracking-wider flex items-center gap-1 font-medium hover:gap-2 transition-all ml-1"
                          style={{ color: C.dark }}
                        >
                          {canReviewRole ? (canReview ? "Review" : "View") : "Open"} <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                    {!canReviewRole && (
                      <td className="px-5 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" checked={isSelected} onChange={() => toggleOne(ep.id)} style={{ accentColor: C.dark }} className="cursor-pointer" />
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Bottom pagination */}
          {filteredEps.length > PAGE_SIZE && (() => {
            const totalPages = Math.ceil(filteredEps.length / PAGE_SIZE);
            const start = (page - 1) * PAGE_SIZE + 1;
            const end = Math.min(page * PAGE_SIZE, filteredEps.length);
            return (
              <div className="px-5 py-3 border-t flex items-center justify-between text-xs" style={{ borderColor: C.mint4, color: C.sub }}>
                <span>Showing {start}–{end} of {filteredEps.length}{searchQ ? ` filtered` : ""} episodes</span>
                <div className="flex items-center gap-1">
                  <button onClick={() => setPage(1)} disabled={page === 1}
                    className="px-2 py-1 rounded disabled:opacity-30 hover:opacity-70"
                    style={{ background: C.mint4 }}>«</button>
                  <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                    className="px-2 py-1 rounded disabled:opacity-30 hover:opacity-70"
                    style={{ background: C.mint4 }}>‹</button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter(n => n === 1 || n === totalPages || Math.abs(n - page) <= 2)
                    .reduce((acc, n, i, arr) => {
                      if (i > 0 && n - arr[i - 1] > 1) acc.push("…");
                      acc.push(n);
                      return acc;
                    }, [])
                    .map((n, i) =>
                      n === "…"
                        ? <span key={`e${i}`} className="px-1">…</span>
                        : <button key={n} onClick={() => setPage(n)}
                            className="px-2.5 py-1 rounded font-medium"
                            style={{ background: n === page ? C.dark : C.mint4, color: n === page ? C.mint4 : C.sub }}>
                            {n}
                          </button>
                    )
                  }
                  <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                    className="px-2 py-1 rounded disabled:opacity-30 hover:opacity-70"
                    style={{ background: C.mint4 }}>›</button>
                  <button onClick={() => setPage(totalPages)} disabled={page === totalPages}
                    className="px-2 py-1 rounded disabled:opacity-30 hover:opacity-70"
                    style={{ background: C.mint4 }}>»</button>
                </div>
              </div>
            );
          })()}
        </div>
      </main>
    </div>
  );
}
