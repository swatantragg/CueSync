import { useEffect, useState } from "react";
import { Upload, FileSpreadsheet, ChevronRight, Trash2, ArrowLeft, Check, XCircle, MessageSquare, X } from "lucide-react";
import { C, FONTS } from "../styles/palette";
import Header from "../components/Header";
import MetaCard from "../components/MetaCard";
import StatusBadge from "../components/StatusBadge";
import RoughSheetPreview from "../components/RoughSheetPreview";
import { api } from "../utils/api";
import { useApp } from "../context/AppContext";

export default function SerialPage() {
  const { activeProject, isAdmin, updateProject, setActiveEpisodeId, setScreen, goHome } = useApp();
  const [busy, setBusy] = useState(false);
  const [importProgress, setImportProgress] = useState(null);
  const [err, setErr] = useState("");
  const [preview, setPreview] = useState(null);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 25;
  const [reviewModal, setReviewModal] = useState(null); // { ep, action: 'reject'|'suggest', note: '' }

  const reload = async () => {
    if (!activeProject) return;
    const [p, eps] = await Promise.all([api.getProject(activeProject.id), api.listEpisodes(activeProject.id)]);
    updateProject(activeProject.id, (prev) => ({
      ...prev, ...p,
      year: p.production_year, productionCompany: p.production_company, channel: p.channel_name,
      countryOfOrigin: p.country, backgroundMusicComposer: p.bg_music_composer,
      episodes: eps.map((e) => ({
        ...e, id: e.id, number: e.episode_number, airDate: e.air_date,
        totalDuration: e.total_duration_sec, musicalDuration: e.musical_duration_sec,
        status: e.status || "pending", rejectionNote: e.rejection_note, reviewNote: e.review_note,
        editHistory: [], cues: [],
      })),
    }));
  };

  useEffect(() => { setPage(1); reload().catch(() => {}); }, [activeProject?.id]);

  if (!activeProject) return null;
  const proj = activeProject;

  const handleImport = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    e.target.value = "";
    setBusy(true);
    setErr("");
    const errors = [];
    const mergedEpisodes = [];
    let mergedMeta = {};
    setImportProgress({ current: 0, total: files.length });
    for (let i = 0; i < files.length; i++) {
      setImportProgress({ current: i + 1, total: files.length });
      try {
        const data = await api.previewRough(proj.id, files[i]);
        mergedEpisodes.push(...(data.episodes || []));
        mergedMeta = { ...data.meta, ...mergedMeta };
      } catch (ex) {
        errors.push(`${files[i].name}: ${ex.message}`);
      }
    }
    setImportProgress(null);
    setBusy(false);
    if (errors.length) setErr(errors.join("\n"));
    if (mergedEpisodes.length) {
      setPreview({ data: { meta: mergedMeta, episodes: mergedEpisodes } });
    }
  };

  const handlePreviewSaved = async () => {
    setPreview(null);
    await reload();
  };

  const handleApprove = async (ep) => {
    try { await api.approveEpisode(ep.id); await reload(); }
    catch (ex) { alert(ex.message); }
  };

  const handleReviewSubmit = async () => {
    if (!reviewModal || !reviewModal.note.trim()) return;
    const { ep, action, note } = reviewModal;
    try {
      if (action === "reject") await api.rejectEpisode(ep.id, note.trim());
      else await api.suggestEpisode(ep.id, note.trim());
      await reload();
      setReviewModal(null);
    } catch (ex) { alert(ex.message); }
  };

  return (
    <div className="min-h-screen" style={{ background: C.light, fontFamily: FONTS.sans, color: C.dark }}>
      <Header />

      {preview && (
        <RoughSheetPreview
          projectId={proj.id}
          data={preview.data}
          onClose={() => setPreview(null)}
          onSaved={handlePreviewSaved}
        />
      )}

      {reviewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.55)" }}>
          <div className="rounded-2xl p-6 w-full max-w-md shadow-2xl" style={{ background: C.dark }}>
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
        <button onClick={goHome} className="flex items-center gap-1.5 text-xs mb-5 px-3 py-1.5 rounded-lg hover:opacity-80" style={{ background: C.white, border: `1px solid ${C.mint1}55`, color: C.dark }}>
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Serials
        </button>
        <div className="flex items-end justify-between mb-8">
          <div>
            <div className="text-xs uppercase tracking-widest mb-2" style={{ color: C.sub }}>{proj.type} · {proj.language}</div>
            <h2 className="text-5xl" style={{ fontFamily: FONTS.serif }}>{proj.title}</h2>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
          <MetaCard label="Director" value={proj.director} />
          <MetaCard label="Producer" value={proj.producer} />
          <MetaCard label="Channel" value={proj.channel} />
          <MetaCard label="Episodes" value={proj.episodes.length} mono />
        </div>

        {err && (
          <div className="mb-4 text-sm whitespace-pre-line rounded-xl px-4 py-3" style={{ color: C.danger, background: "#FFEBEE", border: "1px solid #EF9A9A" }}>
            {err}
          </div>
        )}

        {!isAdmin && (
          <div className="rounded-2xl border overflow-hidden mb-8" style={{ borderColor: C.mint1 + "66", background: C.mint4 + "88" }}>
            <div className="px-6 py-5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: C.mint1 }}>
                  <Upload className="w-5 h-5" style={{ color: C.dark }} />
                </div>
                <div>
                  <div className="font-semibold text-lg" style={{ fontFamily: FONTS.serif }}>Import Rough Sheet</div>
                  <div className="text-xs" style={{ color: C.sub }}>
                    {busy && importProgress
                      ? `Parsing file ${importProgress.current} of ${importProgress.total}…`
                      : "Select one or multiple .xlsx sheets — data is matched against DB before saving"}
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
                <input type="file" accept=".xlsx,.xls" multiple className="hidden" onChange={handleImport} disabled={busy} />
              </label>
            </div>
          </div>
        )}

        <div className="rounded-2xl border overflow-hidden" style={{ background: C.white, borderColor: C.mint1 + "44" }}>
          <div className="px-6 py-4 border-b flex items-center justify-between" style={{ borderColor: C.mint4, background: C.mint4 + "66" }}>
            <h3 className="font-semibold text-lg" style={{ fontFamily: FONTS.serif }}>Episodes ({proj.episodes.length})</h3>
            <div className="flex items-center gap-3">
              {isAdmin && proj.episodes.filter((e) => e.status === "submitted" || e.status === "edited").length > 0 && (
                <span className="text-xs px-2.5 py-1 rounded-lg font-medium" style={{ background: "#F3E5F5", color: "#7B1FA2" }}>
                  {proj.episodes.filter((e) => e.status === "submitted" || e.status === "edited").length} pending review
                </span>
              )}
              {/* Pagination controls */}
              {proj.episodes.length > PAGE_SIZE && (() => {
                const totalPages = Math.ceil(proj.episodes.length / PAGE_SIZE);
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
              <tr className="border-b text-[10px] uppercase tracking-wider" style={{ borderColor: C.mint4, color: C.sub, background: C.mint4 + "33" }}>
                <th className="text-left px-5 py-3 w-16">Ep.</th>
                <th className="text-left px-5 py-3">Air Date</th>
                <th className="text-left px-5 py-3 w-28">Duration</th>
                <th className="text-left px-5 py-3 w-16">Songs</th>
                <th className="text-left px-5 py-3 w-32">Status</th>
                <th className="text-left px-5 py-3">Last Activity</th>
                <th className="text-right px-5 py-3 w-52">Action</th>
              </tr>
            </thead>
            <tbody>
              {proj.episodes.length === 0 && (
                <tr><td colSpan={7} className="px-5 py-10 text-center text-sm" style={{ color: C.sub }}>No episodes yet.</td></tr>
              )}
              {proj.episodes.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((ep) => {
                const lastEdit = ep.editHistory?.[ep.editHistory.length - 1];
                const canReview = isAdmin && (ep.status === "submitted" || ep.status === "edited");
                return (
                  <tr
                    key={ep.id}
                    className="border-b last:border-0 hover:bg-green-50/30 transition"
                    style={{ borderColor: C.mint4 + "88", background: canReview ? "#F3E5F511" : undefined }}
                  >
                    <td className="px-5 py-3 font-mono text-sm">{String(ep.number).padStart(2, "0")}</td>
                    <td className="px-5 py-3 text-xs" style={{ fontFamily: FONTS.mono, color: C.sub }}>{ep.airDate || "—"}</td>
                    <td className="px-5 py-3 text-xs" style={{ fontFamily: FONTS.mono, color: C.sub }}>{ep.totalDuration}</td>
                    <td className="px-5 py-3" style={{ color: C.sub }}>{ep.cues.length}</td>
                    <td className="px-5 py-3"><StatusBadge status={ep.status} /></td>
                    <td className="px-5 py-3 text-xs" style={{ color: C.sub }}>{lastEdit ? `${lastEdit.name} · ${lastEdit.at}` : "—"}</td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={async () => {
                            if (!confirm(`Delete episode ${ep.number}?`)) return;
                            try { await api.deleteEpisode(ep.id); await reload(); }
                            catch (ex) { alert(ex.message); }
                          }}
                          className="p-1.5 rounded-lg hover:bg-red-50"
                          title="Delete episode"
                        ><Trash2 className="w-4 h-4" style={{ color: C.danger }} /></button>

                        {canReview && (
                          <>
                            <button
                              onClick={() => handleApprove(ep)}
                              className="p-1.5 rounded-lg hover:opacity-80 transition"
                              title="Approve"
                              style={{ background: "#E8F5E9", border: "1px solid #A5D6A7" }}
                            ><Check className="w-4 h-4" style={{ color: C.ok }} /></button>
                            <button
                              onClick={() => setReviewModal({ ep, action: "reject", note: "" })}
                              className="p-1.5 rounded-lg hover:opacity-80 transition"
                              title="Reject"
                              style={{ background: "#FFEBEE", border: "1px solid #EF9A9A" }}
                            ><XCircle className="w-4 h-4" style={{ color: C.danger }} /></button>
                            <button
                              onClick={() => setReviewModal({ ep, action: "suggest", note: "" })}
                              className="p-1.5 rounded-lg hover:opacity-80 transition"
                              title="Suggest changes"
                              style={{ background: "#FFF8E1", border: "1px solid #FFE082" }}
                            ><MessageSquare className="w-4 h-4" style={{ color: "#F57C00" }} /></button>
                          </>
                        )}

                        <button
                          onClick={() => { setActiveEpisodeId(ep.id); setScreen("episode"); }}
                          className="text-xs uppercase tracking-wider flex items-center gap-1 font-medium hover:gap-2 transition-all ml-1"
                          style={{ color: C.dark }}
                        >
                          {isAdmin ? "Review" : "Open"} <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Bottom pagination */}
          {proj.episodes.length > PAGE_SIZE && (() => {
            const totalPages = Math.ceil(proj.episodes.length / PAGE_SIZE);
            const start = (page - 1) * PAGE_SIZE + 1;
            const end = Math.min(page * PAGE_SIZE, proj.episodes.length);
            return (
              <div className="px-5 py-3 border-t flex items-center justify-between text-xs" style={{ borderColor: C.mint4, color: C.sub }}>
                <span>Showing {start}–{end} of {proj.episodes.length} episodes</span>
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
