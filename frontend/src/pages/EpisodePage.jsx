import { useEffect, useRef, useState } from "react";
import { XCircle, CheckCircle2, History, Send, Check, Package, ChevronLeft, ChevronRight } from "lucide-react";
import { api } from "../utils/api";
import { C, FONTS } from "../styles/palette";
import Header from "../components/Header";
import StatusBadge from "../components/StatusBadge";
import SectionTitle from "../components/SectionTitle";
import Fld from "../components/Fld";
import Inp from "../components/Inp";
import CueCard from "../components/CueCard";
import ExpBtn from "../components/ExpBtn";
import { USERS_DB } from "../constants/users";
import { uid } from "../utils/uid";
import { now } from "../utils/format";
import { useApp } from "../context/AppContext";

export default function EpisodePage() {
  const { activeProject, activeEpisode, currentUser, isAdmin, updateProject, updateEpisode, setActiveEpisodeId, setNotifications } = useApp();
  const [adminReviewNote, setAdminReviewNote] = useState("");
  const timers = useRef(new Map());
  const pending = useRef(new Map());

  const schedule = (key, fn) => {
    pending.current.set(key, fn);
    const existing = timers.current.get(key);
    if (existing) clearTimeout(existing);
    timers.current.set(key, setTimeout(async () => {
      const run = pending.current.get(key);
      pending.current.delete(key);
      timers.current.delete(key);
      try { await run(); } catch (e) { console.error("save failed", key, e); }
    }, 400));
  };
  const flushAll = async () => {
    const entries = [...pending.current.entries()];
    pending.current.clear();
    for (const [k, t] of timers.current) clearTimeout(t);
    timers.current.clear();
    await Promise.all(entries.map(([, fn]) => fn().catch(() => {})));
  };
  useEffect(() => () => { flushAll(); }, []);

  useEffect(() => {
    if (!activeEpisode?.id) return;
    flushAll().then(() => api.listCues(activeEpisode.id)).then((cues) => {
      updateEpisode(activeProject.id, activeEpisode.id, (e) => ({
        ...e,
        cues: cues.map((c) => ({
          id: c.id, songTitle: c.song_title, usageType: c.usage_type, duration: c.duration_sec,
          usages: c.usage_count, songCode: c.song_code, isrc: c.isrc,
          contributors: c.contributors.map((ct) => ({
            id: ct.id, name: ct.name, role: ct.role, society: ct.society,
            share: Number(ct.share_percent), ipi: ct.ipi_number,
          })),
        })),
      }));
    }).catch(() => {});
  }, [activeEpisode?.id]);

  if (!activeProject || !activeEpisode) return null;
  const proj = activeProject;
  const ep = activeEpisode;
  const sortedEps = [...proj.episodes].sort((a, b) => (a.number || 0) - (b.number || 0));
  const epIdx = sortedEps.findIndex((e) => e.id === ep.id);
  const prevEp = epIdx > 0 ? sortedEps[epIdx - 1] : null;
  const nextEp = epIdx >= 0 && epIdx < sortedEps.length - 1 ? sortedEps[epIdx + 1] : null;

  const toSec = (v) => {
    if (v == null || v === "") return null;
    if (typeof v === "number") return v;
    const s = String(v).trim();
    const m = s.match(/^(\d+):(\d+)(?::(\d+))?$/);
    if (m) return (+m[1]) * (m[3] ? 3600 : 60) + (+m[2]) * (m[3] ? 60 : 1) + (+m[3] || 0);
    const n = Number(s);
    return isNaN(n) ? null : n;
  };

  const saveEpisode = (e) => schedule(`ep:${e.id}`, () => api.updateEpisode(e.id, {
    episode_number: e.number, title: e.title || null, air_date: e.airDate || null,
    total_duration_sec: toSec(e.totalDuration), musical_duration_sec: toSec(e.musicalDuration),
    bg_instrumental_duration_sec: toSec(e.bg_instrumental_duration_sec),
    bg_vocal_duration_sec: toSec(e.bg_vocal_duration_sec),
  }));
  const saveCue = (cue) => schedule(`cue:${cue.id}`, () => api.updateCue(cue.id, {
    song_title: cue.songTitle || "", usage_type: cue.usageType || "background",
    duration_sec: toSec(cue.duration) || 0, usage_count: Number(cue.usages) || 1,
    song_code: cue.songCode || null, isrc: cue.isrc || null,
    contributors: (cue.contributors || []).map((ct) => ({
      name: ct.name || "", role: ct.role || "Composer", society: ct.society || null,
      share_percent: Number(ct.share) || 0, ipi_number: ct.ipi || null,
    })),
  }));
  const saveProject = (p) => schedule(`proj:${p.id}`, () => api.updateProject(p.id, {
    title: p.title, type: p.type, language: p.language || null, genre: p.genre || null,
    production_company: p.productionCompany || null, director: p.director || null,
    producer: p.producer || null, actors: p.actors || null,
    production_year: p.year ? Number(p.year) : null, channel_name: p.channel || null,
    country: p.countryOfOrigin || null, total_episodes: p.total_episodes || null,
    bg_music_composer: p.backgroundMusicComposer || null,
  }));

  const editProj = (k, v) => {
    let updated;
    updateProject(proj.id, (p) => { updated = { ...p, [k]: v }; return updated; });
    if (updated) saveProject(updated);
  };
  const editEp = (k, v) => {
    let updated;
    updateEpisode(proj.id, ep.id, (e) => { updated = { ...e, [k]: v }; return updated; });
    if (updated) saveEpisode(updated);
  };
  const uploader = USERS_DB.find((u) => u.id === ep.uploadedBy);

  const shareCheck = (c) => {
    const s = c.contributors.reduce((a, x) => a + Number(x.share || 0), 0);
    return { ok: s === 100, sum: s };
  };
  const allValid = ep.cues.every((c) => shareCheck(c).ok);

  const addEditEntry = (action) => {
    updateEpisode(proj.id, ep.id, (e) => ({ ...e, editHistory: [...e.editHistory, { userId: currentUser.id, name: currentUser.name, action, at: now() }] }));
  };
  const updateCue = (cid, k, v) => {
    let updated;
    updateEpisode(proj.id, ep.id, (e) => ({
      ...e,
      status: e.status === "pending" || e.status === "rejected" ? "in_progress" : e.status,
      cues: e.cues.map((c) => { if (c.id === cid) { updated = { ...c, [k]: v }; return updated; } return c; }),
    }));
    if (updated) saveCue(updated);
  };
  const updateContrib = (cid, coid, k, v) => {
    let updated;
    updateEpisode(proj.id, ep.id, (e) => ({
      ...e,
      status: e.status === "pending" || e.status === "rejected" ? "in_progress" : e.status,
      cues: e.cues.map((c) => {
        if (c.id !== cid) return c;
        updated = { ...c, contributors: c.contributors.map((co) => (co.id === coid ? { ...co, [k]: v } : co)) };
        return updated;
      }),
    }));
    if (updated) saveCue(updated);
  };
  const addContrib = (cid) => {
    let updated;
    updateEpisode(proj.id, ep.id, (e) => ({
      ...e,
      cues: e.cues.map((c) => { if (c.id === cid) { updated = { ...c, contributors: [...c.contributors, { id: uid(), name: "", role: "Composer", society: "", share: 0, ipi: "" }] }; return updated; } return c; }),
    }));
    if (updated) saveCue(updated);
  };
  const removeContrib = (cid, coid) => {
    let updated;
    updateEpisode(proj.id, ep.id, (e) => ({
      ...e,
      cues: e.cues.map((c) => { if (c.id === cid) { updated = { ...c, contributors: c.contributors.filter((co) => co.id !== coid) }; return updated; } return c; }),
    }));
    if (updated) saveCue(updated);
  };
  const removeSong = (cid) => {
    updateEpisode(proj.id, ep.id, (e) => ({ ...e, cues: e.cues.filter((c) => c.id !== cid) }));
    addEditEntry("Removed a song");
    api.deleteCue(cid).catch(() => {});
  };
  const handleSubmit = () => {
    updateEpisode(proj.id, ep.id, (e) => ({ ...e, status: "submitted" }));
    addEditEntry("Submitted for approval");
    if (nextEp) setTimeout(() => setActiveEpisodeId(nextEp.id), 400);
  };
  const handleApprove = () => {
    updateEpisode(proj.id, ep.id, (e) => ({ ...e, status: "approved", rejectionNote: "" }));
    addEditEntry("Approved");
    setNotifications((prev) => [...prev, { id: uid(), type: "approval", serial: proj.title, epNum: ep.number, message: `Episode ${ep.number} has been approved. Cue sheets are ready for export.`, from: currentUser.name, at: now(), read: false }]);
  };
  const handleReject = () => {
    if (!adminReviewNote.trim()) return;
    updateEpisode(proj.id, ep.id, (e) => ({ ...e, status: "rejected", rejectionNote: adminReviewNote }));
    addEditEntry(`Rejected — ${adminReviewNote}`);
    setNotifications((prev) => [...prev, { id: uid(), type: "rejection", serial: proj.title, epNum: ep.number, message: adminReviewNote, from: currentUser.name, at: now(), read: false }]);
    setAdminReviewNote("");
  };

  return (
    <div className="min-h-screen" style={{ background: C.light, fontFamily: FONTS.sans, color: C.dark }}>
      <Header />
      <main className="max-w-7xl mx-auto px-6 py-10">
        <div className="flex items-start justify-between mb-6">
          <div>
            <div className="text-xs uppercase tracking-widest mb-2" style={{ color: C.sub }}>{proj.title} · Episode {String(ep.number).padStart(2, "0")}</div>
            <h2 className="text-4xl mb-2" style={{ fontFamily: FONTS.serif }}>Episode {ep.number}</h2>
            {ep.airDate && <div className="text-sm" style={{ color: C.sub }}>Air date: {ep.airDate}</div>}
          </div>
          <StatusBadge status={ep.status} />
        </div>

        <div className="flex items-center justify-between mb-6">
          <button
            disabled={!prevEp}
            onClick={async () => { if (prevEp) { await flushAll(); setActiveEpisodeId(prevEp.id); } }}
            className="flex items-center gap-1 px-4 py-2 rounded-xl text-sm disabled:opacity-30"
            style={{ background: C.white, border: `1px solid ${C.mint1}55`, color: C.dark }}
          >
            <ChevronLeft className="w-4 h-4" />Prev {prevEp ? `Ep ${prevEp.number}` : ""}
          </button>
          <div className="text-xs" style={{ color: C.sub }}>{epIdx + 1} of {sortedEps.length}</div>
          <button
            disabled={!nextEp}
            onClick={async () => { if (nextEp) { await flushAll(); setActiveEpisodeId(nextEp.id); } }}
            className="flex items-center gap-1 px-4 py-2 rounded-xl text-sm disabled:opacity-30"
            style={{ background: C.white, border: `1px solid ${C.mint1}55`, color: C.dark }}
          >
            Next {nextEp ? `Ep ${nextEp.number}` : ""}<ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {ep.status === "rejected" && ep.rejectionNote && (
          <div className="rounded-2xl border px-5 py-4 mb-6 flex items-start gap-3" style={{ background: "#FFEBEE", borderColor: "#EF9A9A" }}>
            <XCircle className="w-5 h-5 shrink-0 mt-0.5" style={{ color: C.danger }} />
            <div>
              <div className="font-semibold text-sm mb-1" style={{ color: C.danger }}>Rejected — changes required</div>
              <p className="text-sm leading-relaxed" style={{ color: "#B71C1C" }}>{ep.rejectionNote}</p>
            </div>
          </div>
        )}

        <div className="rounded-2xl border mb-6 overflow-hidden" style={{ background: C.white, borderColor: C.mint1 + "44" }}>
          <div className="px-5 py-3 border-b flex items-center gap-2" style={{ borderColor: C.mint4, background: C.mint4 + "66" }}>
            <History className="w-4 h-4" style={{ color: C.sub }} />
            <span className="text-sm font-semibold" style={{ fontFamily: FONTS.serif }}>Activity Log</span>
            {uploader && <span className="ml-auto text-xs" style={{ color: C.sub }}>Uploaded by <strong>{uploader.name}</strong> on {ep.uploadedAt}</span>}
          </div>
          <div className="divide-y" style={{ borderColor: C.mint4 + "88" }}>
            {[...(ep.editHistory || [])].reverse().map((h, i) => (
              <div key={i} className="px-5 py-2.5 flex items-center gap-3 text-xs" style={{ background: i === 0 ? C.mint4 + "44" : "" }}>
                <div className="w-6 h-6 rounded-lg flex items-center justify-center text-[8px] font-bold shrink-0" style={{ background: h.userId === currentUser?.id ? C.dark : C.mint1, color: h.userId === currentUser?.id ? C.mint1 : C.dark }}>
                  {USERS_DB.find((u) => u.id === h.userId)?.avatar || "??"}
                </div>
                <span className="font-medium" style={{ color: C.dark }}>{h.name}</span>
                <span style={{ color: C.sub }}>{h.action}</span>
                <span className="ml-auto" style={{ color: C.muted, fontFamily: FONTS.mono, fontSize: 10 }}>{h.at}</span>
                {i === 0 && <span className="text-[9px] px-1.5 py-0.5 rounded font-medium" style={{ background: C.mint1, color: C.dark }}>LATEST</span>}
              </div>
            ))}
          </div>
        </div>

        <SectionTitle title="Cue Details" />
        <div className="rounded-2xl border p-6 mb-6" style={{ background: C.white, borderColor: C.mint1 + "44" }}>
          <div className="grid grid-cols-4 gap-4">
            <Fld label="Serial Title" tag="once"><Inp value={proj.title} onChange={(v) => editProj("title", v)} /></Fld>
            <Fld label="Channel" tag="once"><Inp value={proj.channel} onChange={(v) => editProj("channel", v)} /></Fld>
            <Fld label="Serial Type" tag="once"><Inp value={proj.type} onChange={(v) => editProj("type", v)} /></Fld>
            <Fld label="Language" tag="auto"><Inp value={proj.language} onChange={(v) => editProj("language", v)} /></Fld>
            <Fld label="Director" tag="auto"><Inp value={proj.director} onChange={(v) => editProj("director", v)} /></Fld>
            <Fld label="Genre" tag="auto"><Inp value={proj.genre} onChange={(v) => editProj("genre", v)} /></Fld>
            <Fld label="Production Company" tag="auto"><Inp value={proj.productionCompany} onChange={(v) => editProj("productionCompany", v)} /></Fld>
            <Fld label="Country" tag="once"><Inp value={proj.countryOfOrigin} onChange={(v) => editProj("countryOfOrigin", v)} /></Fld>
            <Fld label="Principal Actors" tag="auto" span={2}><Inp value={proj.actors} onChange={(v) => editProj("actors", v)} /></Fld>
            <Fld label="Producer" tag="auto"><Inp value={proj.producer} onChange={(v) => editProj("producer", v)} /></Fld>
            <Fld label="Production Year" tag="once"><Inp value={proj.year} onChange={(v) => editProj("year", v)} /></Fld>
          </div>
        </div>

        <SectionTitle title="Episode Details" />
        <div className="rounded-2xl border p-6 mb-6" style={{ background: C.white, borderColor: C.mint1 + "44" }}>
          <div className="grid grid-cols-4 gap-4">
            <Fld label="Episode #" tag="auto"><Inp value={ep.number} onChange={(v) => editEp("number", Number(v) || ep.number)} /></Fld>
            <Fld label="Episode Title" tag="auto"><Inp value={ep.title} onChange={(v) => editEp("title", v)} /></Fld>
            <Fld label="Air Date" tag="auto"><Inp value={ep.airDate} onChange={(v) => editEp("airDate", v)} /></Fld>
            <Fld label="Total Duration" tag="auto"><Inp value={ep.totalDuration} onChange={(v) => editEp("totalDuration", v)} mono /></Fld>
            <Fld label="Musical Duration" tag="auto"><Inp value={ep.musicalDuration} onChange={(v) => editEp("musicalDuration", v)} mono /></Fld>
          </div>
        </div>

        <div className="flex items-center justify-between mb-3">
          <SectionTitle title={`Song Details (${ep.cues.length})`} />
          {!isAdmin && (
            <button
              onClick={async () => {
                const created = await api.createCue(ep.id, { song_title: "New Song", usage_type: "background", duration_sec: 0, usage_count: 1, contributors: [] });
                updateEpisode(proj.id, ep.id, (e) => ({
                  ...e,
                  cues: [...e.cues, { id: created.id, songTitle: created.song_title, usageType: created.usage_type, duration: created.duration_sec, usages: created.usage_count, contributors: [] }],
                }));
              }}
              className="px-4 py-2 rounded-lg text-sm font-medium"
              style={{ background: C.dark, color: C.mint4 }}
            >+ Add Song</button>
          )}
        </div>
        <div className="space-y-6 mb-8">
          {ep.cues.map((cue, idx) => (
            <CueCard
              key={cue.id}
              cue={cue}
              idx={idx}
              isAdmin={isAdmin}
              onUpdate={updateCue}
              onContribUpdate={updateContrib}
              onContribAdd={addContrib}
              onContribRemove={removeContrib}
              onRemove={removeSong}
              otherEpisodes={sortedEps.filter((e) => e.id !== ep.id)}
              onCopyTo={async (cid, targetEid) => {
                try { await api.copyCue(cid, targetEid); alert(`Copied to Ep ${sortedEps.find((e) => e.id === targetEid)?.number}`); }
                catch (ex) { alert(ex.message); }
              }}
            />
          ))}
        </div>

        {!isAdmin && (ep.status === "in_progress" || ep.status === "pending" || ep.status === "rejected" || ep.status === "edited") && (
          <div className="rounded-2xl border p-6 mb-6 flex items-center justify-between" style={{ background: C.white, borderColor: C.mint1 + "44" }}>
            <div>
              <div className="font-semibold text-lg" style={{ fontFamily: FONTS.serif }}>Ready to submit?</div>
              <div className="text-xs mt-1" style={{ color: C.sub }}>Once submitted, the admin will review and approve or request changes.</div>
            </div>
            <button
              onClick={handleSubmit}
              disabled={!allValid || ep.cues.length === 0}
              className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-medium disabled:opacity-40 hover:opacity-90 transition"
              style={{ background: C.dark, color: C.mint4 }}
            >
              <Send className="w-4 h-4" />Submit for Approval
            </button>
          </div>
        )}

        {ep.status === "submitted" && !isAdmin && (
          <div className="rounded-2xl border p-6 mb-6 text-center" style={{ background: "#F3E5F5", borderColor: "#CE93D8" }}>
            <Send className="w-6 h-6 mx-auto mb-2" style={{ color: "#7B1FA2" }} />
            <div className="font-semibold" style={{ color: "#7B1FA2" }}>Submitted — awaiting admin review</div>
            <div className="text-xs mt-1" style={{ color: "#9C27B0" }}>You'll be notified once the admin approves or requests changes.</div>
          </div>
        )}

        {ep.status === "approved" && !isAdmin && (
          <div className="rounded-2xl border p-6 mb-6 text-center" style={{ background: "#E8F5E9", borderColor: "#A5D6A7" }}>
            <CheckCircle2 className="w-6 h-6 mx-auto mb-2" style={{ color: C.ok }} />
            <div className="font-semibold" style={{ color: C.ok }}>Approved by admin</div>
            <div className="text-xs mt-1" style={{ color: C.mid }}>Cue sheets are ready for export (admin-only).</div>
          </div>
        )}

        {isAdmin && ep.status === "submitted" && (
          <div className="rounded-2xl overflow-hidden mb-6" style={{ background: C.dark }}>
            <div className="px-6 py-5 border-b" style={{ borderColor: C.mid }}>
              <div className="font-semibold text-xl" style={{ fontFamily: FONTS.serif, color: C.mint4 }}>Admin Review</div>
              <div className="text-xs mt-1" style={{ color: C.mint1 + "88" }}>Review the data above. Approve to enable export, or reject with a note.</div>
            </div>
            <div className="p-6">
              <div className="mb-4">
                <label className="text-xs uppercase tracking-widest block mb-2" style={{ color: C.mint1 + "88" }}>Rejection note (required to reject)</label>
                <textarea
                  value={adminReviewNote}
                  onChange={(e) => setAdminReviewNote(e.target.value)}
                  rows={3}
                  placeholder="e.g. Song Code missing for 'Montu Da Theme'. Please verify singer name."
                  className="w-full border rounded-xl px-4 py-3 text-sm focus:outline-none"
                  style={{ borderColor: C.mid, background: "rgba(255,255,255,0.05)", color: C.mint4 }}
                />
              </div>
              <div className="flex items-center gap-3">
                <button onClick={handleApprove} className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-medium hover:opacity-90 transition" style={{ background: C.ok, color: C.white }}>
                  <Check className="w-4 h-4" />Approve
                </button>
                <button onClick={handleReject} disabled={!adminReviewNote.trim()} className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-medium disabled:opacity-40 hover:opacity-90 transition" style={{ background: C.danger, color: C.white }}>
                  <XCircle className="w-4 h-4" />Reject
                </button>
              </div>
            </div>
          </div>
        )}

        {isAdmin && ep.status === "approved" && (
          <div className="rounded-2xl overflow-hidden mb-6" style={{ background: C.dark }}>
            <div className="px-6 py-5 flex items-center justify-between border-b" style={{ borderColor: C.mid }}>
              <div className="flex items-center gap-3">
                <Package className="w-5 h-5" style={{ color: C.mint1 }} />
                <div>
                  <div className="font-semibold text-xl" style={{ fontFamily: FONTS.serif, color: C.mint4 }}>Export Cue Sheets</div>
                  <div className="text-xs mt-0.5" style={{ color: C.mint1 + "88" }}>Approved — download in society template format</div>
                </div>
              </div>
              <span className="text-xs px-3 py-1.5 rounded-lg" style={{ background: "#27AE6033", border: "1px solid #27AE60", color: "#7DCEA0" }}>Ready to export</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 divide-x" style={{ borderColor: C.mid }}>
              {(() => {
                const fname = (soc) => `${proj.title.replace(/[^a-z0-9]+/gi, "_")}_Ep${String(ep.number).padStart(2, "0")}_${soc}.xlsx`;
                return <>
                  <ExpBtn label="IPRS" sub="India" icon="🇮🇳" onClick={() => api.downloadExport(ep.id, "iprs", fname("IPRS"))} />
                  <ExpBtn label="PRS" sub="UK" icon="🇬🇧" onClick={() => api.downloadExport(ep.id, "prs", fname("PRS"))} />
                  <ExpBtn label="ASCAP" sub="USA" icon="🇺🇸" onClick={() => api.downloadExport(ep.id, "ascap", fname("ASCAP"))} />
                </>;
              })()}
            </div>
          </div>
        )}

        <div className="flex items-center justify-between mt-8 pt-6 border-t" style={{ borderColor: C.mint4 }}>
          <button
            disabled={!prevEp}
            onClick={async () => { if (prevEp) { await flushAll(); setActiveEpisodeId(prevEp.id); } }}
            className="flex items-center gap-1 px-5 py-2.5 rounded-xl text-sm disabled:opacity-30"
            style={{ background: C.white, border: `1px solid ${C.mint1}55`, color: C.dark }}
          >
            <ChevronLeft className="w-4 h-4" />Prev {prevEp ? `Ep ${prevEp.number}` : ""}
          </button>
          <div className="text-xs" style={{ color: C.sub }}>{epIdx + 1} of {sortedEps.length}</div>
          <button
            disabled={!nextEp}
            onClick={async () => { if (nextEp) { await flushAll(); setActiveEpisodeId(nextEp.id); } }}
            className="flex items-center gap-1 px-5 py-2.5 rounded-xl text-sm disabled:opacity-30"
            style={{ background: C.white, border: `1px solid ${C.mint1}55`, color: C.dark }}
          >
            Next {nextEp ? `Ep ${nextEp.number}` : ""}<ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </main>
    </div>
  );
}
