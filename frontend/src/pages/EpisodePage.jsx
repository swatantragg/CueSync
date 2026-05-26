import { useEffect, useRef, useState } from "react";
import { XCircle, CheckCircle2, History, Send, Check, Package, ChevronLeft, ChevronRight, Save, ArrowLeft, MessageSquare, List, Copy, Plus } from "lucide-react";
import { showAlert } from "../components/Dialog";
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
import { STATUS } from "../constants/status";
import { applyShareRules } from "../utils/cueRules";

function CopyEpisodesModal({ episodes, currentEpId, onCopy, onClose }) {
  const [checked, setChecked] = useState(new Set());
  const toggle = (id) => setChecked((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const targets = episodes.filter((e) => e.id !== currentEpId);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.4)" }} onClick={onClose}>
      <div
        className="rounded-2xl shadow-2xl flex flex-col"
        style={{ background: C.dark, border: `1px solid ${C.mid}`, width: 340, maxHeight: 520 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b flex items-center justify-between shrink-0" style={{ borderColor: C.mid }}>
          <div>
            <div className="font-semibold text-base" style={{ color: C.mint1, fontFamily: FONTS.serif }}>Copy Cue Details</div>
            <div className="text-[10px] mt-0.5" style={{ color: C.muted }}>Select episodes to copy to</div>
          </div>
          <button onClick={onClose} style={{ color: C.muted }} className="hover:opacity-70"><XCircle className="w-4 h-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto py-2" style={{ maxHeight: 360 }}>
          {targets.map((e) => (
            <label
              key={e.id}
              className="flex items-center gap-3 px-5 py-2.5 cursor-pointer hover:opacity-70 transition-opacity"
            >
              <input
                type="checkbox"
                checked={checked.has(e.id)}
                onChange={() => toggle(e.id)}
                style={{ accentColor: C.mint1 }}
              />
              <span className="font-mono text-xs" style={{ color: C.mint1, minWidth: 28 }}>
                {String(e.number).padStart(2, "0")}
              </span>
              <span className="text-xs flex-1 truncate" style={{ color: C.mint4 }}>
                {e.airDate || e.title || `Episode ${e.number}`}
              </span>
            </label>
          ))}
        </div>
        <div className="px-5 py-4 border-t shrink-0" style={{ borderColor: C.mid }}>
          <button
            disabled={checked.size === 0}
            onClick={() => { onCopy([...checked]); onClose(); }}
            className="w-full py-2.5 rounded-xl text-sm font-semibold disabled:opacity-40 hover:opacity-80 transition"
            style={{ background: C.mint1, color: C.dark }}
          >
            Copy to {checked.size > 0 ? `${checked.size} episode${checked.size > 1 ? "s" : ""}` : "Selected"}
          </button>
        </div>
      </div>
    </div>
  );
}

function CopyToast({ episodes, onDismiss }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 3500);
    return () => clearTimeout(t);
  }, [onDismiss]);
  return (
    <div
      className="fixed bottom-6 right-6 z-50 rounded-2xl shadow-2xl px-5 py-4 flex items-start gap-3"
      style={{ background: C.dark, border: `1px solid ${C.mint1}55`, maxWidth: 300 }}
    >
      <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" style={{ color: C.mint1 }} />
      <div>
        <div className="text-xs font-semibold mb-1" style={{ color: C.mint1 }}>Cue details copied</div>
        <div className="text-[10px]" style={{ color: C.muted }}>
          Ep {episodes.map((n) => String(n).padStart(2, "0")).join(", Ep ")}
        </div>
      </div>
    </div>
  );
}

function EpNavRow({ id, className, style, prevEp, nextEp, epIdx, sortedEps, currentEpId, showEpPicker, setShowEpPicker, onPrev, onNext, onPick }) {
  const pickerKey = `${id}-picker`;
  return (
    <div className={`flex items-center gap-3 ${className || ""}`} style={style}>

      {/* ← Prev */}
      <button
        disabled={!prevEp}
        onClick={onPrev}
        className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium disabled:opacity-25 hover:opacity-75 transition-opacity"
        style={{ background: C.white, border: `1px solid ${C.mint1}55`, color: C.dark, minWidth: 130 }}
      >
        <ChevronLeft className="w-4 h-4 shrink-0" />
        <span className="truncate">
          {prevEp ? `Ep ${String(prevEp.number).padStart(2, "0")}` : "—"}
        </span>
      </button>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Counter (jump picker) + Next — grouped on the right */}
      <div className="relative shrink-0">
        <button
          onClick={() => setShowEpPicker(showEpPicker === pickerKey ? null : pickerKey)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-medium hover:opacity-75 transition-opacity"
          style={{
            background: showEpPicker === pickerKey ? C.dark : C.mint4,
            border: `1px solid ${C.mint1}44`,
            color: showEpPicker === pickerKey ? C.mint1 : C.sub,
          }}
          title="Jump to any episode"
        >
          <List className="w-3.5 h-3.5 shrink-0" />
          <span style={{ fontFamily: FONTS.mono }}>{epIdx + 1} / {sortedEps.length}</span>
        </button>
        {showEpPicker === pickerKey && (
          <EpPickerDropdown sortedEps={sortedEps} currentEpId={currentEpId} onPick={onPick} />
        )}
      </div>

      {/* Next → */}
      <button
        disabled={!nextEp}
        onClick={onNext}
        className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium disabled:opacity-25 hover:opacity-75 transition-opacity justify-end"
        style={{ background: C.white, border: `1px solid ${C.mint1}55`, color: C.dark, minWidth: 130 }}
      >
        <span className="truncate">
          {nextEp ? `Ep ${String(nextEp.number).padStart(2, "0")}` : "—"}
        </span>
        <ChevronRight className="w-4 h-4 shrink-0" />
      </button>

    </div>
  );
}

function EpPickerDropdown({ sortedEps, currentEpId, onPick }) {
  return (
    <div
      className="absolute z-50 rounded-xl shadow-2xl flex flex-col"
      style={{
        top: "calc(100% + 8px)",
        left: "50%",
        transform: "translateX(-50%)",
        background: C.dark,
        border: `1px solid ${C.mid}`,
        width: 260,
        maxHeight: 360,
        overflow: "hidden",
      }}
    >
      <div
        className="px-4 py-2.5 text-[10px] uppercase tracking-widest font-semibold shrink-0"
        style={{ borderBottom: `1px solid ${C.mid}`, color: C.mint1 }}
      >
        Jump to Episode
      </div>
      <div style={{ overflowY: "auto", maxHeight: 310 }}>
        {sortedEps.map((e) => {
          const s = STATUS[e.status] || STATUS.pending;
          const isActive = e.id === currentEpId;
          return (
            <button
              key={e.id}
              onClick={() => onPick(e)}
              className="w-full text-left px-4 py-2.5 flex items-center gap-3 text-xs hover:opacity-70 transition-opacity"
              style={{ background: isActive ? C.mid : "transparent", color: C.mint4 }}
            >
              <span
                className="shrink-0 font-mono text-right"
                style={{ color: C.mint1, minWidth: 22 }}
              >
                {String(e.number).padStart(2, "0")}
              </span>
              <span className="truncate flex-1" style={{ color: isActive ? C.mint1 : C.mint4 }}>
                {e.airDate || e.title || `Episode ${e.number}`}
              </span>
              <span
                className="shrink-0 w-2 h-2 rounded-full"
                style={{ background: s.color }}
                title={s.label}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function EpisodePage() {
  const { activeProject, activeEpisode, currentUser, isAdmin, isReviewer, updateProject, updateEpisode, setActiveEpisodeId, setNotifications, setScreen } = useApp();
  const canReviewRole = isAdmin || isReviewer;
  const [adminReviewNote, setAdminReviewNote] = useState("");
  const [suggestNote, setSuggestNote] = useState("");
  const [activity, setActivity] = useState([]);
  const [showAllActivity, setShowAllActivity] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const [showEpPicker, setShowEpPicker] = useState(null);
  const [showCopyModal, setShowCopyModal] = useState(false);
  const [copyToast, setCopyToast] = useState(null); // array of episode numbers
  const [reviewerHasPendingChanges, setReviewerHasPendingChanges] = useState(false);
  const [showApproveConfirm, setShowApproveConfirm] = useState(false);
  // saves: key → { timer: id|null, fn: () => Promise }
  // flying: Map<key, in-flight Promise> — keyed same as saves so saves chain in order
  const saves = useRef(new Map());
  const flying = useRef(new Map());
  const latestEpisodeRef = useRef(activeEpisode);

  useEffect(() => {
    latestEpisodeRef.current = activeEpisode;
  }, [activeEpisode]);

  const schedule = (key, fn) => {
    const prev = saves.current.get(key);
    if (prev?.timer) clearTimeout(prev.timer);
    saves.current.set(key, {
      fn,
      timer: setTimeout(() => {
        const entry = saves.current.get(key);
        if (!entry) return;
        saves.current.delete(key);
        // Chain after any in-flight save for the same key so newer data always wins
        const prevFlight = flying.current.get(key);
        const p = (prevFlight ? prevFlight.catch(() => {}) : Promise.resolve())
          .then(() => entry.fn())
          .finally(() => { if (flying.current.get(key) === p) flying.current.delete(key); });
        // suppress unhandled-rejection; log + re-queue (skip 401 — token expired)
        p.catch((e) => {
          console.error("[auto-save]", key, e);
          const is401 = e?.message === "Invalid token" || String(e?.message).includes("401");
          if (!is401 && !saves.current.has(key) && !flying.current.has(key)) saves.current.set(key, { fn: entry.fn, timer: null });
        });
        flying.current.set(key, p);
      }, 0),
    });
  };

  const flushAll = async () => {
    // Drain all pending (cancel timers, run immediately, chained after any in-flight for same key)
    const pending = [...saves.current.entries()];
    for (const [, { timer }] of pending) if (timer) clearTimeout(timer);
    saves.current.clear();
    for (const [key, { fn }] of pending) {
      const prevFlight = flying.current.get(key);
      const p = (prevFlight ? prevFlight.catch(() => {}) : Promise.resolve())
        .then(() => fn())
        .finally(() => { if (flying.current.get(key) === p) flying.current.delete(key); });
      flying.current.set(key, p);
    }
    // Wait for ALL in-flight (timer-started + just-started above)
    const results = await Promise.allSettled([...flying.current.values()]);
    const failures = results.filter((r) => r.status === "rejected");
    if (failures.length) {
      throw new Error(failures.map((r) => r.reason?.message || "Save failed").join("; "));
    }
  };
  useEffect(() => () => { flushAll(); }, []);

  const refreshActivity = async (eid) => {
    try {
      const rows = await api.listEpisodeActivity(eid);
      setActivity(rows || []);
    } catch (e) { console.error("activity load failed", e); }
  };

  const refreshEpisode = async () => {
    if (!activeEpisode?.id || !activeProject?.id) return;
    setLoading(true);
    try {
      await flushAll().catch(() => {}); // best-effort flush on navigation
      const [epRow, cues, projRow] = await Promise.all([
        api.getEpisode(activeEpisode.id),
        api.listCues(activeEpisode.id),
        api.getProject(activeProject.id),
      ]);
      updateProject(activeProject.id, (p) => ({
        ...p, ...projRow,
        year: projRow.production_year, productionCompany: projRow.production_company,
        channel: projRow.channel_name, countryOfOrigin: projRow.country,
        backgroundMusicComposer: projRow.bg_music_composer,
        submittedBy: projRow.submitted_by,
      }));
      const epKey = `ep:${activeEpisode.id}`;
      const hasPendingSave = saves.current.has(epKey);
      const currentEp = latestEpisodeRef.current || activeEpisode;
      const refreshedEpisode = {
        ...currentEp,
        number: epRow.episode_number, title: epRow.title, airDate: epRow.air_date,
        totalDuration: epRow.total_duration_sec, musicalDuration: epRow.musical_duration_sec,
        bg_instrumental_duration_sec: epRow.bg_instrumental_duration_sec,
        bg_vocal_duration_sec: epRow.bg_vocal_duration_sec,
        status: epRow.status || "pending",
        rejectionNote: epRow.rejection_note,
        reviewNote: epRow.review_note,
        // keep in-memory cueDetails if a save is pending (user is typing) — DB may be stale
        cueDetails: hasPendingSave ? (currentEp.cueDetails || {}) : {
          serialTitle: epRow.cue_serial_title ?? null,
          channel: epRow.cue_channel ?? null,
          serialType: epRow.cue_serial_type ?? null,
          language: epRow.cue_language ?? null,
          director: epRow.cue_director ?? null,
          genre: epRow.cue_genre ?? null,
          productionCompany: epRow.cue_production_company ?? null,
          country: epRow.cue_country ?? null,
          actors: epRow.cue_actors ?? null,
          producer: epRow.cue_producer ?? null,
          year: epRow.cue_production_year ?? null,
          bgMusicComposer: epRow.cue_bg_music_composer ?? null,
          submittedBy: epRow.cue_submitted_by ?? null,
        },
        cues: cues.map((c) => ({
          id: c.id, songTitle: c.song_title, usageType: c.usage_type, duration: c.duration_sec,
          usages: c.usage_count, songCode: c.song_code, isrc: c.isrc,
          workNumber: c.work_number, ascapWorkId: c.ascap_work_id, validationLink: c.validation_link,
          singer: c.singer, libraryId: c.library_id, orderIndex: c.order_index,
          contributors: c.contributors.map((ct) => ({
            id: ct.id, name: ct.name, role: ct.role, society: ct.society,
            share: Number(ct.share_percent), ipi: ct.ipi_number || ct.cae_number,
          })),
        })),
      };
      latestEpisodeRef.current = refreshedEpisode;
      updateEpisode(activeProject.id, activeEpisode.id, () => refreshedEpisode);
      await refreshActivity(activeEpisode.id);
    } catch (e) { console.error("episode refresh failed", e); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    if (!activeEpisode?.id) return;
    refreshEpisode();
  }, [activeEpisode?.id]);

  if (!activeProject || !activeEpisode) return null;
  const proj = activeProject;
  const ep = activeEpisode;
  const sortedEps = [...proj.episodes].sort((a, b) => (a.number || 0) - (b.number || 0));
  const epIdx = sortedEps.findIndex((e) => e.id === ep.id);
  const prevEp = epIdx > 0 ? sortedEps[epIdx - 1] : null;
  const nextEp = epIdx >= 0 && epIdx < sortedEps.length - 1 ? sortedEps[epIdx + 1] : null;

  const replaceCurrentEpisode = (producer) => {
    const base = latestEpisodeRef.current || ep;
    const next = producer(base);
    latestEpisodeRef.current = next;
    updateEpisode(proj.id, next.id, () => next);
    return next;
  };

  const toSec = (v) => {
    if (v == null || v === "") return null;
    if (typeof v === "number") return v;
    const s = String(v).trim();
    const m = s.match(/^(\d+):(\d+)(?::(\d+))?$/);
    if (m) return (+m[1]) * (m[3] ? 3600 : 60) + (+m[2]) * (m[3] ? 60 : 1) + (+m[3] || 0);
    const n = Number(s);
    return isNaN(n) ? null : n;
  };

  const secToMinSec = (val) => {
    if (val == null || val === "") return "";
    const s = typeof val === "number" ? val : toSec(val);
    if (s == null) return typeof val === "string" ? val : "";
    const m = Math.floor(s / 60);
    const sec = Math.round(s % 60);
    return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  };

  const calcMusicalDuration = (e) =>
    (e.cues || []).reduce((sum, c) => sum + (toSec(c.duration) || 0), 0);

  const buildEpisodePayload = (e) => {
    const cd = e.cueDetails || {};
    return {
      episode_number: e.number, title: e.title || null, air_date: e.airDate || null,
      total_duration_sec: toSec(e.totalDuration), musical_duration_sec: calcMusicalDuration(e),
      bg_instrumental_duration_sec: toSec(e.bg_instrumental_duration_sec),
      bg_vocal_duration_sec: toSec(e.bg_vocal_duration_sec),
      cue_serial_title: cd.serialTitle || null,
      cue_channel: cd.channel || null,
      cue_serial_type: cd.serialType || null,
      cue_language: cd.language || null,
      cue_director: cd.director || null,
      cue_genre: cd.genre || null,
      cue_production_company: cd.productionCompany || null,
      cue_country: cd.country || null,
      cue_actors: cd.actors || null,
      cue_producer: cd.producer || null,
      cue_production_year: cd.year ? Number(cd.year) : null,
      cue_bg_music_composer: cd.bgMusicComposer || null,
      cue_submitted_by: cd.submittedBy || null,
    };
  };

  const buildCuePayload = (cue) => ({
    song_title: cue.songTitle || "", usage_type: cue.usageType || "bi",
    duration_sec: toSec(cue.duration) || 0, usage_count: Number(cue.usages) || 1,
    song_code: cue.songCode || null, isrc: cue.isrc || null,
    work_number: cue.workNumber || null, ascap_work_id: cue.ascapWorkId || null,
    validation_link: cue.validationLink || null, singer: cue.singer || null,
    order_index: cue.orderIndex ?? 0,
    contributors: (cue.contributors || []).map((ct) => ({
      name: ct.name || "", role: ct.role || "Composer", society: ct.society || null,
      share_percent: Number(ct.share) || 0, ipi_number: ct.ipi || null,
    })),
  });

  const saveEpisode = (e) => schedule(`ep:${e.id}`, () => api.updateEpisode(e.id, buildEpisodePayload(e)));
  const saveCue = (cue) => schedule(`cue:${cue.id}`, () => api.updateCue(cue.id, buildCuePayload(cue)));

  const persistCurrentSnapshot = async () => {
    await flushAll().catch(() => {}); // stale/failed auto-saves don't block submit; explicit saves below handle current state
    const snapshot = latestEpisodeRef.current || ep;
    await api.updateEpisode(snapshot.id, buildEpisodePayload(snapshot));
    for (const cue of snapshot.cues || []) {
      await api.updateCue(cue.id, buildCuePayload(cue));
    }
    return snapshot;
  };

  const editEpCue = (k, v) => {
    const updated = replaceCurrentEpisode((e) => ({ ...e, cueDetails: { ...(e.cueDetails || {}), [k]: v } }));
    saveEpisode(updated);
    if (canReviewRole) setReviewerHasPendingChanges(true);
  };

  const addSong = async () => {
    try {
      await flushAll();
      await api.createCue(ep.id, {
        song_title: "",
        usage_type: "bi",
        duration_sec: 0,
        usage_count: 1,
        order_index: ep.cues.length,
        contributors: [],
      });
      await refreshEpisode();
      if (canReviewRole) setReviewerHasPendingChanges(true);
    } catch (e) { await showAlert(e?.message || String(e), { title: "Failed to Add Song", variant: "error" }); }
  };

  const applyLibraryMatch = (cid, libEntry) => {
    if (!libEntry) return;
    const contribs = applyShareRules((libEntry.contributors || []).map((c) => ({
      id: uid(), name: c.name || "", role: c.role || "Composer",
      society: c.society || "", share: Number(c.share_percent) || 0, ipi: c.ipi_number || "",
    })));
    const updated = replaceCurrentEpisode((e) => ({
      ...e,
      cues: e.cues.map((c) => {
        if (c.id !== cid) return c;
        return {
          ...c,
          ...(libEntry.isrc ? { isrc: libEntry.isrc } : {}),
          ...(libEntry.song_code ? { songCode: libEntry.song_code } : {}),
          ...(libEntry.singer ? { singer: libEntry.singer } : {}),
          ...(libEntry.work_number ? { workNumber: libEntry.work_number } : {}),
          ...(libEntry.ascap_work_id ? { ascapWorkId: libEntry.ascap_work_id } : {}),
          contributors: contribs.length > 0 ? contribs : c.contributors,
        };
      }),
    }));
    const updatedCue = updated.cues.find((c) => c.id === cid);
    if (updatedCue) saveCue(updatedCue);
    if (canReviewRole) setReviewerHasPendingChanges(true);
  };

  const copyToEpisodes = async (targetEids) => {
    const cd = ep.cueDetails || {};
    const cuePayload = {
      cue_serial_title: cd.serialTitle || null, cue_channel: cd.channel || null,
      cue_serial_type: cd.serialType || null, cue_language: cd.language || null,
      cue_director: cd.director || null, cue_genre: cd.genre || null,
      cue_production_company: cd.productionCompany || null, cue_country: cd.country || null,
      cue_actors: cd.actors || null, cue_producer: cd.producer || null,
      cue_production_year: cd.year ? Number(cd.year) : null,
      cue_bg_music_composer: cd.bgMusicComposer || null, cue_submitted_by: cd.submittedBy || null,
    };
    const copiedNums = [];
    try {
      const epKey = `ep:${ep.id}`;
      const pending = saves.current.get(epKey);
      if (pending?.timer) clearTimeout(pending.timer);
      saves.current.delete(epKey);
      await api.updateEpisode(ep.id, buildEpisodePayload(ep));
      await Promise.all(targetEids.map(async (tid) => {
        const target = sortedEps.find((e) => e.id === tid);
        if (!target) return;
        await api.updateEpisode(tid, { ...buildEpisodePayload(target), ...cuePayload });
        updateEpisode(proj.id, tid, (e) => ({ ...e, cueDetails: { ...cd } }));
        copiedNums.push(target.number);
      }));
      setCopyToast(copiedNums.sort((a, b) => a - b));
    } catch (e) { await showAlert(e?.message || String(e), { title: "Copy Failed", variant: "error" }); }
  };

  const copyToNextEpisode = async () => {
    if (!nextEp) return;
    try {
      // Cancel pending timer + explicitly save current episode so its data is in DB
      const epKey = `ep:${ep.id}`;
      const pending = saves.current.get(epKey);
      if (pending?.timer) clearTimeout(pending.timer);
      saves.current.delete(epKey);
      await api.updateEpisode(ep.id, buildEpisodePayload(ep));

      const cd = ep.cueDetails || {};
      // Preserve nextEp's own metadata (number, title, durations); only overwrite cue fields
      await api.updateEpisode(nextEp.id, {
        ...buildEpisodePayload(nextEp),
        cue_serial_title: cd.serialTitle || null,
        cue_channel: cd.channel || null,
        cue_serial_type: cd.serialType || null,
        cue_language: cd.language || null,
        cue_director: cd.director || null,
        cue_genre: cd.genre || null,
        cue_production_company: cd.productionCompany || null,
        cue_country: cd.country || null,
        cue_actors: cd.actors || null,
        cue_producer: cd.producer || null,
        cue_production_year: cd.year ? Number(cd.year) : null,
        cue_bg_music_composer: cd.bgMusicComposer || null,
        cue_submitted_by: cd.submittedBy || null,
      });
      updateEpisode(proj.id, nextEp.id, (e) => ({ ...e, cueDetails: { ...cd } }));
      setSavedAt(`Copied to Ep ${String(nextEp.number).padStart(2, "0")}`);
    } catch (e) { await showAlert(e?.message || String(e), { title: "Copy Failed", variant: "error" }); }
  };
  const editEp = (k, v) => {
    const updated = replaceCurrentEpisode((e) => ({ ...e, [k]: v }));
    saveEpisode(updated);
    if (canReviewRole) setReviewerHasPendingChanges(true);
  };
  const uploader = USERS_DB.find((u) => u.id === ep.uploadedBy);
  const uploadRow = [...activity].reverse().find((r) => r.action === "upload");
  const lastEditor = activity.find((r) => r.action !== "upload") || activity[0];
  const fmtAt = (iso) => {
    if (!iso) return "";
    try { const d = new Date(iso); return d.toLocaleString(); } catch { return iso; }
  };
  const initialsOf = (name) => (name || "??").trim().split(/\s+/).map((s) => s[0]).join("").slice(0, 2).toUpperCase();

  const handleSave = async () => {
    setSaving(true);
    try {
      await persistCurrentSnapshot();
      await refreshEpisode();
      setSavedAt(new Date().toLocaleTimeString());
      setReviewerHasPendingChanges(false);
    } catch (e) {
      console.error(e);
      const raw = e?.message || String(e);
      const msg = raw === "Insufficient privileges"
        ? "Save failed — your account role may not have write access. Ask an admin to verify your role is set to \"reviewer\" in the Admin Dashboard, then log out and back in."
        : raw;
      await showAlert(msg, { title: "Save Failed", variant: "error" });
    } finally { setSaving(false); }
  };

  const shareCheck = (c) => {
    const s = c.contributors.reduce((a, x) => a + Number(x.share || 0), 0);
    return { ok: Math.abs(s - 100) < 0.02, sum: Math.round(s * 100) / 100 };
  };
  const allValid = ep.cues.every((c) => shareCheck(c).ok);

  const addEditEntry = (action) => {
    updateEpisode(proj.id, ep.id, (e) => ({ ...e, editHistory: [...e.editHistory, { userId: currentUser.id, name: currentUser.name, action, at: now() }] }));
  };
  const updateCue = (cid, k, v) => {
    let updated;
    const newEp = replaceCurrentEpisode((e) => ({
      ...e,
      status: e.status === "pending" || e.status === "rejected" ? "in_progress" : e.status,
      cues: e.cues.map((c) => { if (c.id === cid) { updated = { ...c, [k]: v }; return updated; } return c; }),
    }));
    if (updated) saveCue(updated);
    if (newEp && k === "duration") saveEpisode(newEp);
    if (canReviewRole) setReviewerHasPendingChanges(true);
  };
  const updateContrib = (cid, coid, k, v) => {
    let updated;
    replaceCurrentEpisode((e) => ({
      ...e,
      status: e.status === "pending" || e.status === "rejected" ? "in_progress" : e.status,
      cues: e.cues.map((c) => {
        if (c.id !== cid) return c;
        const contributors = c.contributors.map((co) => (co.id === coid ? { ...co, [k]: v } : co));
        updated = { ...c, contributors: k === "role" ? applyShareRules(contributors) : contributors };
        return updated;
      }),
    }));
    if (updated) saveCue(updated);
    if (canReviewRole) setReviewerHasPendingChanges(true);
  };
  const addContrib = (cid, afterId) => {
    let updated;
    replaceCurrentEpisode((e) => ({
      ...e,
      cues: e.cues.map((c) => {
        if (c.id !== cid) return c;
        const newCo = { id: uid(), name: "", role: "Composer", society: "", share: 0, ipi: "" };
        let newContribs;
        if (afterId !== undefined) {
          const i = c.contributors.findIndex((co) => co.id === afterId);
          newContribs = i >= 0
            ? [...c.contributors.slice(0, i + 1), newCo, ...c.contributors.slice(i + 1)]
            : [...c.contributors, newCo];
        } else {
          newContribs = [...c.contributors, newCo];
        }
        updated = { ...c, contributors: applyShareRules(newContribs) };
        return updated;
      }),
    }));
    if (updated) saveCue(updated);
    if (canReviewRole) setReviewerHasPendingChanges(true);
  };
  const removeContrib = (cid, coid) => {
    let updated;
    replaceCurrentEpisode((e) => ({
      ...e,
      cues: e.cues.map((c) => { if (c.id === cid) { updated = { ...c, contributors: applyShareRules(c.contributors.filter((co) => co.id !== coid)) }; return updated; } return c; }),
    }));
    if (updated) saveCue(updated);
    if (canReviewRole) setReviewerHasPendingChanges(true);
  };
  const removeContribs = (cid, coIds) => {
    const idSet = new Set(coIds);
    let updated;
    replaceCurrentEpisode((e) => ({
      ...e,
      cues: e.cues.map((c) => {
        if (c.id !== cid) return c;
        updated = { ...c, contributors: applyShareRules(c.contributors.filter((co) => !idSet.has(co.id))) };
        return updated;
      }),
    }));
    if (updated) saveCue(updated);
    if (canReviewRole) setReviewerHasPendingChanges(true);
  };
  const duplicateCue = async (cid) => {
    const cue = ep.cues.find((c) => c.id === cid);
    if (!cue) return;
    try {
      await flushAll();
      await api.createCue(ep.id, {
        song_title: cue.songTitle || "",
        usage_type: cue.usageType || "bi",
        duration_sec: toSec(cue.duration) || 0,
        usage_count: Number(cue.usages) || 1,
        song_code: cue.songCode || null,
        isrc: cue.isrc || null,
        work_number: cue.workNumber || null,
        ascap_work_id: cue.ascapWorkId || null,
        validation_link: cue.validationLink || null,
        singer: cue.singer || null,
        order_index: cue.orderIndex ?? 0,
        contributors: (cue.contributors || []).map((ct) => ({
          name: ct.name || "", role: ct.role || "Composer",
          society: ct.society || null, share_percent: Number(ct.share) || 0,
          ipi_number: ct.ipi || null,
        })),
      });
      await refreshEpisode();
    } catch (e) { await showAlert(e.message, { title: "Duplicate Failed", variant: "error" }); }
  };
  const removeSong = (cid) => {
    replaceCurrentEpisode((e) => ({ ...e, cues: e.cues.filter((c) => c.id !== cid) }));
    addEditEntry("Removed a song");
    api.deleteCue(cid).catch(() => {});
    if (canReviewRole) setReviewerHasPendingChanges(true);
  };
  const handleSubmit = async () => {
    try {
      const submittedSnapshot = await persistCurrentSnapshot();
      await api.submitEpisode(submittedSnapshot.id);
      await refreshEpisode();
      setNotifications((prev) => [...prev, { id: uid(), type: "submission", serial: proj.title, epNum: submittedSnapshot.number, message: `Episode ${submittedSnapshot.number} submitted for review.`, from: currentUser.name, at: now(), read: false }]);
    } catch (e) { await showAlert(e.message, { title: "Submit Failed", variant: "error" }); }
  };
  const handleApprove = async () => {
    if (reviewerHasPendingChanges) {
      setShowApproveConfirm(true);
      return;
    }
    await _doApprove();
  };

  const _doApprove = async () => {
    // Flush any in-flight auto-saves first (best-effort; auto-saves already committed most changes)
    await flushAll().catch(() => {});
    try {
      await api.approveEpisode(ep.id);
      await refreshEpisode();
      setReviewerHasPendingChanges(false);
      setNotifications((prev) => [...prev, { id: uid(), type: "approval", serial: proj.title, epNum: ep.number, message: `Episode ${ep.number} has been approved. Cue sheets are ready for export.`, from: currentUser.name, at: now(), read: false }]);
    } catch (e) {
      const raw = e?.message || String(e);
      const msg = raw === "Insufficient privileges"
        ? "Approve failed — your account role must be \"reviewer\". Ask an admin to verify your role in the Admin Dashboard, then log out and back in."
        : raw;
      await showAlert(msg, { title: "Approve Failed", variant: "error" });
    }
  };

  const handleSaveAndApprove = async () => {
    setShowApproveConfirm(false);
    setSaving(true);
    // Step 1: save
    try {
      await persistCurrentSnapshot();
      setSavedAt(new Date().toLocaleTimeString());
      setReviewerHasPendingChanges(false);
    } catch (e) {
      const raw = e?.message || String(e);
      const msg = raw === "Insufficient privileges"
        ? "Save failed — your account role may not have write access. Ask an admin to verify your role is set to \"reviewer\" in the Admin Dashboard, then log out and back in."
        : raw;
      await showAlert(msg, { title: "Save Failed", variant: "error" });
      setSaving(false);
      return;
    }
    // Step 2: approve
    try {
      await api.approveEpisode(ep.id);
      await refreshEpisode();
      setNotifications((prev) => [...prev, { id: uid(), type: "approval", serial: proj.title, epNum: ep.number, message: `Episode ${ep.number} has been approved. Cue sheets are ready for export.`, from: currentUser.name, at: now(), read: false }]);
    } catch (e) {
      const raw = e?.message || String(e);
      const msg = raw === "Insufficient privileges"
        ? "Approve failed — your account role must be \"reviewer\". Ask an admin to verify your role in the Admin Dashboard, then log out and back in."
        : raw;
      await showAlert(msg, { title: "Approve Failed", variant: "error" });
    } finally { setSaving(false); }
  };

  const handleApproveWithoutSaving = async () => {
    setShowApproveConfirm(false);
    await _doApprove();
  };
  const handleReject = async () => {
    if (!adminReviewNote.trim()) return;
    try {
      await api.rejectEpisode(ep.id, adminReviewNote.trim());
      await refreshEpisode();
      setNotifications((prev) => [...prev, { id: uid(), type: "rejection", serial: proj.title, epNum: ep.number, message: adminReviewNote, from: currentUser.name, at: now(), read: false }]);
      setAdminReviewNote("");
    } catch (e) { await showAlert(e.message, { title: "Reject Failed", variant: "error" }); }
  };
  const handleSaveToLibrary = async (cid) => {
    const cue = ep.cues.find((c) => c.id === cid);
    if (!cue) return;
    try {
      await flushAll();
      await api.upsertSongLibrary({
        cue_id: cue.id,
        title: cue.songTitle || "",
        isrc: cue.isrc || null,
        song_code: cue.songCode || null,
        work_number: cue.workNumber || null,
        ascap_work_id: cue.ascapWorkId || null,
        singer: cue.singer || null,
        contributors: (cue.contributors || []).map((ct) => ({
          name: ct.name || "", role: ct.role || "Composer", society: ct.society || null,
          share_percent: Number(ct.share) || 0, ipi_number: ct.ipi || null,
        })),
      });
      await refreshEpisode();
    } catch (e) { await showAlert(e.message, { title: "Library Save Failed", variant: "error" }); }
  };

  const handleSuggest = async () => {
    if (!suggestNote.trim()) return;
    try {
      await api.suggestEpisode(ep.id, suggestNote.trim());
      await refreshEpisode();
      setNotifications((prev) => [...prev, { id: uid(), type: "suggestion", serial: proj.title, epNum: ep.number, message: suggestNote, from: currentUser.name, at: now(), read: false }]);
      setSuggestNote("");
    } catch (e) { await showAlert(e.message, { title: "Suggestion Failed", variant: "error" }); }
  };

  return (
    <div className="min-h-screen" style={{ background: C.light, fontFamily: FONTS.sans, color: C.dark }}>
      <Header />

      {showApproveConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.55)" }}>
          <div className="rounded-2xl w-full max-w-md shadow-2xl overflow-hidden" style={{ background: C.dark }}>
            <div className="px-6 py-4 border-b" style={{ borderColor: C.mid }}>
              <h3 className="font-semibold text-lg" style={{ fontFamily: FONTS.serif, color: C.mint4 }}>
                Unsaved Changes
              </h3>
              <p className="text-xs mt-1" style={{ color: C.muted }}>
                Save your changes before approving so the exported cue sheet reflects your edits.
              </p>
            </div>
            <div className="p-6 space-y-3">
              <button
                onClick={handleSaveAndApprove}
                disabled={saving}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-medium disabled:opacity-50"
                style={{ background: C.ok, color: C.white }}
              >
                <Save className="w-4 h-4" />Save &amp; Approve
              </button>
              <button
                onClick={handleApproveWithoutSaving}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-medium"
                style={{ background: C.mid, color: C.mint4, border: `1px solid ${C.mint1}33` }}
              >
                <Check className="w-4 h-4" />Approve Without Saving
              </button>
              <button
                onClick={() => setShowApproveConfirm(false)}
                className="w-full py-2.5 rounded-xl text-sm"
                style={{ color: C.sub }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
      {(loading || saving) && (
        <div className="fixed top-4 right-4 z-50 flex items-center gap-3 px-4 py-2.5 rounded-xl shadow-lg" style={{ background: C.dark, color: C.mint4 }}>
          <span className="w-3 h-3 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: C.mint1, borderTopColor: "transparent" }} />
          <span className="text-xs font-medium">{saving ? "Saving…" : "Loading data…"}</span>
        </div>
      )}
      <main className="max-w-7xl mx-auto px-6 py-10">
        <button onClick={async () => { await flushAll().catch(() => {}); setActiveEpisodeId(null); setScreen("serial"); }} className="flex items-center gap-1.5 text-xs mb-5 px-3 py-1.5 rounded-lg hover:opacity-80" style={{ background: C.white, border: `1px solid ${C.mint1}55`, color: C.dark }}>
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Episodes
        </button>
        <div className="flex items-start justify-between mb-6">
          <div>
            <div className="text-xs uppercase tracking-widest mb-2" style={{ color: C.sub }}>{proj.title} · Episode {String(ep.number).padStart(2, "0")}</div>
            <h2 className="text-4xl mb-2" style={{ fontFamily: FONTS.serif }}>Episode {ep.number}</h2>
            {ep.airDate && <div className="text-sm" style={{ color: C.sub }}>Air date: {ep.airDate}</div>}
          </div>
          <StatusBadge status={ep.status} />
        </div>

        <div className="rounded-2xl border mb-6 overflow-hidden" style={{ background: C.white, borderColor: C.mint1 + "44" }}>
          <div className="px-5 py-3 border-b flex items-center gap-2 flex-wrap" style={{ borderColor: C.mint4, background: C.mint4 + "66" }}>
            <History className="w-4 h-4" style={{ color: C.sub }} />
            <span className="text-sm font-semibold" style={{ fontFamily: FONTS.serif }}>Activity Log</span>
            <span className="ml-auto flex items-center gap-4 text-xs" style={{ color: C.sub }}>
              {uploadRow && <span>Uploaded by <strong>{uploadRow.user_name}</strong> · {fmtAt(uploadRow.at)}</span>}
              {lastEditor && lastEditor !== uploadRow && <span>Last edit by <strong>{lastEditor.user_name}</strong> · {fmtAt(lastEditor.at)}</span>}
            </span>
          </div>
          <div className={"divide-y " + (showAllActivity ? "max-h-96 overflow-auto" : "")} style={{ borderColor: C.mint4 + "88" }}>
            {activity.length === 0 && (
              <div className="px-5 py-4 text-xs" style={{ color: C.sub }}>No activity yet.</div>
            )}
            {(showAllActivity ? activity : activity.slice(0, 5)).map((h, i) => (
              <div key={h.id} className="px-5 py-2.5 flex items-center gap-3 text-xs" style={{ background: i === 0 ? C.mint4 + "44" : "" }}>
                <div className="w-6 h-6 rounded-lg flex items-center justify-center text-[8px] font-bold shrink-0" style={{ background: h.user_id === currentUser?.id ? C.dark : C.mint1, color: h.user_id === currentUser?.id ? C.mint1 : C.dark }}>
                  {initialsOf(h.user_name)}
                </div>
                <span className="font-medium" style={{ color: C.dark }}>{h.user_name}</span>
                {h.user_role && <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: C.mint4, color: C.sub }}>{h.user_role}</span>}
                <span style={{ color: C.sub }}>{h.details || h.action}</span>
                <span className="ml-auto" style={{ color: C.muted, fontFamily: FONTS.mono, fontSize: 10 }}>{fmtAt(h.at)}</span>
                {i === 0 && <span className="text-[9px] px-1.5 py-0.5 rounded font-medium" style={{ background: C.mint1, color: C.dark }}>LATEST</span>}
              </div>
            ))}
          </div>
          {activity.length > 5 && (
            <div className="px-5 py-2 border-t flex items-center justify-center" style={{ borderColor: C.mint4 + "88", background: C.mint4 + "22" }}>
              <button
                onClick={() => setShowAllActivity((v) => !v)}
                className="text-xs font-medium px-3 py-1.5 rounded-lg hover:opacity-80"
                style={{ color: C.dark }}
              >
                {showAllActivity ? "Hide Activity Log" : `Show Activity Log (${activity.length})`}
              </button>
            </div>
          )}
        </div>

        {showEpPicker && <div className="fixed inset-0 z-40" onClick={() => setShowEpPicker(null)} />}
        <EpNavRow
          id="top"
          className="mb-6"
          prevEp={prevEp} nextEp={nextEp} epIdx={epIdx}
          sortedEps={sortedEps} currentEpId={ep.id}
          showEpPicker={showEpPicker} setShowEpPicker={setShowEpPicker}
          onPrev={async () => { if (prevEp) { await flushAll().catch(() => {}); setActiveEpisodeId(prevEp.id); } }}
          onNext={async () => { if (nextEp) { await flushAll().catch(() => {}); setActiveEpisodeId(nextEp.id); } }}
          onPick={async (e) => { await flushAll().catch(() => {}); setActiveEpisodeId(e.id); setShowEpPicker(null); }}
        />

        {ep.status === "rejected" && ep.rejectionNote && (
          <div className="rounded-2xl border px-5 py-4 mb-6 flex items-start gap-3" style={{ background: "#FFEBEE", borderColor: "#EF9A9A" }}>
            <XCircle className="w-5 h-5 shrink-0 mt-0.5" style={{ color: C.danger }} />
            <div>
              <div className="font-semibold text-sm mb-1" style={{ color: C.danger }}>Rejected — changes required</div>
              <p className="text-sm leading-relaxed" style={{ color: "#B71C1C" }}>{ep.rejectionNote}</p>
            </div>
          </div>
        )}
        {ep.reviewNote && (
          <div className="rounded-2xl border px-5 py-4 mb-6 flex items-start gap-3" style={{ background: "#FFF8E1", borderColor: "#FFE082" }}>
            <MessageSquare className="w-5 h-5 shrink-0 mt-0.5" style={{ color: "#F57C00" }} />
            <div>
              <div className="font-semibold text-sm mb-1" style={{ color: "#E65100" }}>Admin suggested changes</div>
              <p className="text-sm leading-relaxed" style={{ color: "#BF360C" }}>{ep.reviewNote}</p>
            </div>
          </div>
        )}

        <div className="mb-3">
          <SectionTitle title="Cue Details" />
        </div>
        <div className="rounded-2xl border p-6 mb-3" style={{ background: C.white, borderColor: C.mint1 + "44" }}>
          {(() => { const cd = ep.cueDetails || {}; return (
          <div className="grid grid-cols-4 gap-4">
            <Fld label="Serial Title" tag="auto"><Inp value={cd.serialTitle} onChange={(v) => editEpCue("serialTitle", v)} /></Fld>
            <Fld label="Channel" tag="auto"><Inp value={cd.channel} onChange={(v) => editEpCue("channel", v)} /></Fld>
            <Fld label="Serial Type" tag="auto"><Inp value={cd.serialType} onChange={(v) => editEpCue("serialType", v)} /></Fld>
            <Fld label="Language" tag="auto"><Inp value={cd.language} onChange={(v) => editEpCue("language", v)} /></Fld>
            <Fld label="Director" tag="auto"><Inp value={cd.director} onChange={(v) => editEpCue("director", v)} /></Fld>
            <Fld label="Genre" tag="auto"><Inp value={cd.genre} onChange={(v) => editEpCue("genre", v)} /></Fld>
            <Fld label="Production Company" tag="auto"><Inp value={cd.productionCompany} onChange={(v) => editEpCue("productionCompany", v)} /></Fld>
            <Fld label="Country" tag="auto"><Inp value={cd.country} onChange={(v) => editEpCue("country", v)} /></Fld>
            <Fld label="Principal Actors" tag="auto" span={2}><Inp value={cd.actors} onChange={(v) => editEpCue("actors", v)} /></Fld>
            <Fld label="Producer" tag="auto"><Inp value={cd.producer} onChange={(v) => editEpCue("producer", v)} /></Fld>
            <Fld label="Production Year" tag="auto"><Inp value={cd.year} onChange={(v) => editEpCue("year", v)} /></Fld>
            <Fld label="Background Music Composer" tag="auto"><Inp value={cd.bgMusicComposer} onChange={(v) => editEpCue("bgMusicComposer", v)} /></Fld>
            <Fld label="Submitted by (Client name)" tag="auto"><Inp value={cd.submittedBy} onChange={(v) => editEpCue("submittedBy", v)} /></Fld>
          </div>
          ); })()}
        </div>
        {sortedEps.length > 1 && !canReviewRole && (
          <div className="flex justify-end mb-6">
            <button
              onClick={() => setShowCopyModal(true)}
              className="flex items-center gap-1.5 text-xs px-4 py-2 rounded-xl font-medium hover:opacity-90 transition"
              style={{ background: C.dark, color: C.mint4 }}
              title="Copy cue details to multiple episodes"
            >
              <Copy className="w-3.5 h-3.5" />
              Copy Cue Details
            </button>
          </div>
        )}

        <SectionTitle title="Episode Details" />
        <div className="rounded-2xl border p-6 mb-6" style={{ background: C.white, borderColor: C.mint1 + "44" }}>
          <div className="grid grid-cols-4 gap-4">
            <Fld label="Episode #" tag="auto"><Inp value={ep.number} onChange={(v) => editEp("number", Number(v) || ep.number)} /></Fld>
            <Fld label="Episode Title" tag="auto"><Inp value={ep.title} onChange={(v) => editEp("title", v)} /></Fld>
            <Fld label="Air Date" tag="auto"><Inp value={ep.airDate} onChange={(v) => editEp("airDate", v)} /></Fld>
            <Fld label="Total Duration" tag="auto"><Inp value={typeof ep.totalDuration === "number" ? secToMinSec(ep.totalDuration) : (ep.totalDuration ?? "")} onChange={(v) => editEp("totalDuration", v)} mono /></Fld>
            <Fld label="Musical Duration" tag="auto"><Inp value={secToMinSec(ep.cues.reduce((s, c) => s + (toSec(c.duration) || 0), 0))} readOnly mono /></Fld>
          </div>
        </div>

        <div className="mb-3 flex items-center justify-between">
          <SectionTitle title={`Song Details (${ep.cues.length})`} />
          <button
            onClick={addSong}
            className="flex items-center gap-1.5 text-xs px-4 py-2 rounded-xl font-medium hover:opacity-90 transition"
            style={{ background: C.ok, color: C.white }}
          >
            <Plus className="w-3.5 h-3.5" />Add Song
          </button>
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
              onContribsRemove={removeContribs}
              onDuplicate={duplicateCue}
              onRemove={removeSong}
              otherEpisodes={sortedEps.filter((e) => e.id !== ep.id)}
              onSaveToLibrary={handleSaveToLibrary}
              onApplyLibraryMatch={applyLibraryMatch}
            />
          ))}
        </div>

        {!canReviewRole && (ep.status === "in_progress" || ep.status === "pending" || ep.status === "rejected" || ep.status === "edited") && (
          <div className="rounded-2xl border p-6 mb-6 flex items-center justify-between" style={{ background: C.white, borderColor: C.mint1 + "44" }}>
            <div>
              <div className="font-semibold text-lg" style={{ fontFamily: FONTS.serif }}>Ready to submit?</div>
              <div className="text-xs mt-1" style={{ color: C.sub }}>Once submitted, a reviewer will approve or request changes.</div>
            </div>
            <div className="flex items-center gap-3">
              {savedAt && <span className="text-xs" style={{ color: C.sub }}>Saved {savedAt}</span>}
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-medium disabled:opacity-40 hover:opacity-90 transition"
                style={{ background: C.white, color: C.dark, border: `1px solid ${C.mint1}` }}
              >
                <Save className="w-4 h-4" />{saving ? "Saving…" : "Save"}
              </button>
              <button
                onClick={handleSubmit}
                disabled={!allValid || ep.cues.length === 0}
                className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-medium disabled:opacity-40 hover:opacity-90 transition"
                style={{ background: C.dark, color: C.mint4 }}
              >
                <Send className="w-4 h-4" />Submit for Approval
              </button>
            </div>
          </div>
        )}

        {ep.status === "submitted" && !canReviewRole && (
          <div className="rounded-2xl border p-6 mb-6 text-center" style={{ background: "#F3E5F5", borderColor: "#CE93D8" }}>
            <Send className="w-6 h-6 mx-auto mb-2" style={{ color: "#7B1FA2" }} />
            <div className="font-semibold" style={{ color: "#7B1FA2" }}>Submitted — awaiting review</div>
            <div className="text-xs mt-1" style={{ color: "#9C27B0" }}>You'll be notified once a reviewer approves or requests changes.</div>
          </div>
        )}

        {ep.status === "approved" && !canReviewRole && (
          <div className="rounded-2xl border p-6 mb-6 text-center" style={{ background: "#E8F5E9", borderColor: "#A5D6A7" }}>
            <CheckCircle2 className="w-6 h-6 mx-auto mb-2" style={{ color: C.ok }} />
            <div className="font-semibold" style={{ color: C.ok }}>Approved</div>
            <div className="text-xs mt-1" style={{ color: C.mid }}>Cue sheets are ready for export.</div>
          </div>
        )}

        {canReviewRole && (ep.status === "submitted" || ep.status === "edited") && (
          <div className="rounded-2xl overflow-hidden mb-6" style={{ background: C.dark }}>
            <div className="px-6 py-5 border-b" style={{ borderColor: C.mid }}>
              <div className="font-semibold text-xl" style={{ fontFamily: FONTS.serif, color: C.mint4 }}>Review</div>
              <div className="text-xs mt-1" style={{ color: C.mint1 + "88" }}>Approve to enable export, reject with a note, or suggest changes without rejecting.</div>
            </div>
            <div className="p-6 space-y-5">
              <div>
                <label className="text-xs uppercase tracking-widest block mb-2" style={{ color: C.mint1 + "88" }}>Rejection note (required to reject)</label>
                <textarea
                  value={adminReviewNote}
                  onChange={(e) => setAdminReviewNote(e.target.value)}
                  rows={3}
                  placeholder="e.g. Song Code missing for 'Montu Da Theme'."
                  className="w-full border rounded-xl px-4 py-3 text-sm focus:outline-none"
                  style={{ borderColor: C.mid, background: "rgba(255,255,255,0.05)", color: C.mint4 }}
                />
              </div>
              <div>
                <label className="text-xs uppercase tracking-widest block mb-2" style={{ color: C.mint1 + "88" }}>Suggest changes (user can keep editing)</label>
                <textarea
                  value={suggestNote}
                  onChange={(e) => setSuggestNote(e.target.value)}
                  rows={2}
                  placeholder="e.g. Double-check IPI numbers for contributors."
                  className="w-full border rounded-xl px-4 py-3 text-sm focus:outline-none"
                  style={{ borderColor: C.mid, background: "rgba(255,255,255,0.05)", color: C.mint4 }}
                />
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-medium disabled:opacity-40 hover:opacity-90 transition" style={{ background: C.mid, color: C.mint4, border: `1px solid ${C.mint1}44` }}>
                  <Save className="w-4 h-4" />{saving ? "Saving…" : "Save Changes"}
                </button>
                <button onClick={handleApprove} className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-medium hover:opacity-90 transition" style={{ background: C.ok, color: C.white }}>
                  <Check className="w-4 h-4" />Approve
                </button>
                <button onClick={handleReject} disabled={!adminReviewNote.trim()} className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-medium disabled:opacity-40 hover:opacity-90 transition" style={{ background: C.danger, color: C.white }}>
                  <XCircle className="w-4 h-4" />Reject
                </button>
                <button onClick={handleSuggest} disabled={!suggestNote.trim()} className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-medium disabled:opacity-40 hover:opacity-90 transition" style={{ background: "#F57C00", color: C.white }}>
                  <MessageSquare className="w-4 h-4" />Suggest Changes
                </button>
              </div>
            </div>
          </div>
        )}

        {canReviewRole && ep.status === "approved" && (
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

        <EpNavRow
          id="bottom"
          className="mt-8 pt-6 border-t"
          style={{ borderColor: C.mint4 }}
          prevEp={prevEp} nextEp={nextEp} epIdx={epIdx}
          sortedEps={sortedEps} currentEpId={ep.id}
          showEpPicker={showEpPicker} setShowEpPicker={setShowEpPicker}
          onPrev={async () => { if (prevEp) { await flushAll().catch(() => {}); setActiveEpisodeId(prevEp.id); } }}
          onNext={async () => { if (nextEp) { await flushAll().catch(() => {}); setActiveEpisodeId(nextEp.id); } }}
          onPick={async (e) => { await flushAll().catch(() => {}); setActiveEpisodeId(e.id); setShowEpPicker(null); }}
        />
      </main>

      {showCopyModal && (
        <CopyEpisodesModal
          episodes={sortedEps}
          currentEpId={ep.id}
          onCopy={copyToEpisodes}
          onClose={() => setShowCopyModal(false)}
        />
      )}
      {copyToast && (
        <CopyToast episodes={copyToast} onDismiss={() => setCopyToast(null)} />
      )}
    </div>
  );
}
