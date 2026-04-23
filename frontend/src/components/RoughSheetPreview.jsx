import { useState } from "react";
import {
  X, Check, AlertCircle, ChevronDown, ChevronRight,
  Database, Plus, Trash2, Save,
} from "lucide-react";
import { C, FONTS } from "../styles/palette";
import { api } from "../utils/api";

const USAGE_OPTIONS = [
  { value: "theme",        label: "Theme" },
  { value: "background",   label: "Background" },
  { value: "vocal",        label: "Vocal" },
  { value: "instrumental", label: "Instrumental" },
  { value: "visual",       label: "Visual" },
  { value: "other",        label: "Other" },
];

const MATCH_BADGE = {
  code:  { bg: "#E8F5E9", color: "#2E7D32", label: "code" },
  isrc:  { bg: "#E3F2FD", color: "#1565C0", label: "ISRC" },
  title: { bg: "#FFF8E1", color: "#E65100", label: "title" },
  none:  { bg: "#F5F5F5", color: "#9E9E9E", label: "no match" },
};

function Field({ label, children }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide mb-1" style={{ color: C.sub }}>{label}</div>
      {children}
    </div>
  );
}

function Inp({ value, onChange, type = "text", placeholder, disabled }) {
  return (
    <input
      type={type}
      value={value ?? ""}
      onChange={onChange}
      placeholder={placeholder}
      disabled={disabled}
      className="w-full border rounded-lg px-2.5 py-1.5 text-xs focus:outline-none disabled:opacity-50"
      style={{ borderColor: C.mint1, background: C.white, color: C.dark, fontFamily: FONTS.sans }}
    />
  );
}

function Sel({ value, onChange, disabled }) {
  return (
    <select
      value={value}
      onChange={onChange}
      disabled={disabled}
      className="w-full border rounded-lg px-2 py-1.5 text-xs focus:outline-none disabled:opacity-50"
      style={{ borderColor: C.mint1, background: C.white, color: C.dark }}
    >
      {USAGE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

export default function RoughSheetPreview({ projectId, data, onClose, onSaved }) {
  const [episodes, setEpisodes] = useState(() =>
    data.episodes.map(ep => ({
      ...ep,
      cues: ep.cues.map(cue => ({
        ...cue,
        _open: false,
        contributors: cue.contributors.map(c => ({ ...c })),
      })),
    }))
  );
  const [activeEp, setActiveEp]   = useState(0);
  const [saving,   setSaving]     = useState(false);
  const [err,      setErr]        = useState("");

  // ── State updaters ──────────────────────────────────────────────────────────

  const updEp = (epIdx, patch) =>
    setEpisodes(eps => eps.map((e, i) => i === epIdx ? { ...e, ...patch } : e));

  const updCue = (epIdx, ci, patch) =>
    setEpisodes(eps => eps.map((e, i) => i !== epIdx ? e : {
      ...e,
      cues: e.cues.map((c, j) => j !== ci ? c : { ...c, ...patch }),
    }));

  const updContrib = (epIdx, ci, cIdx, patch) =>
    setEpisodes(eps => eps.map((e, i) => i !== epIdx ? e : {
      ...e,
      cues: e.cues.map((c, j) => j !== ci ? c : {
        ...c,
        contributors: c.contributors.map((ct, k) => k !== cIdx ? ct : { ...ct, ...patch }),
      }),
    }));

  const addContrib = (epIdx, ci) =>
    setEpisodes(eps => eps.map((e, i) => i !== epIdx ? e : {
      ...e,
      cues: e.cues.map((c, j) => j !== ci ? c : {
        ...c,
        contributors: [...c.contributors, {
          name: "", role: "Composer", society: "", share_percent: 0, ipi_number: "", library_match: false,
        }],
      }),
    }));

  const delContrib = (epIdx, ci, cIdx) =>
    setEpisodes(eps => eps.map((e, i) => i !== epIdx ? e : {
      ...e,
      cues: e.cues.map((c, j) => j !== ci ? c : {
        ...c,
        contributors: c.contributors.filter((_, k) => k !== cIdx),
      }),
    }));

  // ── Save ───────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    setSaving(true);
    setErr("");
    try {
      const result = await api.commitRough(projectId, {
        episodes: episodes.map(ep => ({
          episode_number:              ep.episode_number,
          title:                       ep.title || null,
          air_date:                    ep.air_date || null,
          total_duration_sec:          ep.total_duration_sec ?? null,
          musical_duration_sec:        ep.musical_duration_sec ?? null,
          bg_instrumental_duration_sec: ep.bg_instrumental_duration_sec ?? null,
          bg_vocal_duration_sec:       ep.bg_vocal_duration_sec ?? null,
          existing_episode_id:         ep.existing_episode_id ?? null,
          cues: ep.cues.map((cue, idx) => ({
            song_title:  cue.song_title,
            usage_type:  cue.usage_type,
            duration_sec: Number(cue.duration_sec) || 0,
            usage_count:  Number(cue.usage_count) || 1,
            song_code:    cue.song_code || null,
            isrc:         cue.isrc || null,
            singer:       cue.singer || null,
            library_id:   cue.library_id || null,
            order_index:  cue.order_index ?? idx,
            contributors: cue.contributors.map(c => ({
              name:          c.name,
              role:          c.role || "Composer",
              society:       c.society || null,
              share_percent: Number(c.share_percent) || 0,
              ipi_number:    c.ipi_number || null,
            })),
          })),
        })),
      });
      onSaved(result);
    } catch (ex) {
      setErr(ex.message);
      setSaving(false);
    }
  };

  const newCount = episodes.filter(e => !e.existing_episode_id).length;
  const ep = episodes[activeEp];

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: C.light, fontFamily: FONTS.sans }}>

      {/* ── Top bar ─────────────────────────────────────────────────────────── */}
      <div
        className="flex items-center justify-between px-6 py-3 border-b shrink-0"
        style={{ borderColor: C.mint1 + "66", background: C.white }}
      >
        <div>
          <div className="font-semibold text-base" style={{ fontFamily: FONTS.serif, color: C.dark }}>
            Review Rough Sheet
          </div>
          <div className="text-xs mt-0.5" style={{ color: C.sub }}>
            {episodes.length} episode{episodes.length !== 1 ? "s" : ""} parsed
            &nbsp;·&nbsp;
            <span style={{ color: C.ok }}>{newCount} new</span>
            &nbsp;·&nbsp;
            <span style={{ color: C.warn }}>{episodes.length - newCount} already in DB (will be skipped)</span>
          </div>
        </div>

        {err && (
          <div className="text-xs px-3 py-2 rounded-lg mx-4 max-w-xs" style={{ color: C.danger, background: "#FFEBEE", border: "1px solid #EF9A9A" }}>
            {err}
          </div>
        )}

        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm hover:opacity-80"
            style={{ color: C.sub, background: C.mint4 }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || newCount === 0}
            className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-medium disabled:opacity-40 hover:opacity-90"
            style={{ background: C.dark, color: C.mint4 }}
          >
            {saving
              ? <><span className="w-3.5 h-3.5 rounded-full border-2 border-t-transparent animate-spin shrink-0" style={{ borderColor: C.mint1, borderTopColor: "transparent" }} /> Saving…</>
              : <><Save className="w-3.5 h-3.5" /> Save {newCount} Episode{newCount !== 1 ? "s" : ""}</>
            }
          </button>
        </div>
      </div>

      {/* ── Body ────────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* Episode sidebar */}
        <div
          className="w-44 shrink-0 border-r overflow-y-auto py-1"
          style={{ borderColor: C.mint1 + "44", background: C.mint4 + "55" }}
        >
          {episodes.map((e, i) => {
            const isActive = i === activeEp;
            const skipped  = !!e.existing_episode_id;
            return (
              <button
                key={i}
                onClick={() => setActiveEp(i)}
                className="w-full text-left px-3 py-2.5 transition"
                style={{
                  background: isActive ? C.mint1 + "88" : "transparent",
                  borderLeft: isActive ? `3px solid ${C.dark}` : "3px solid transparent",
                }}
              >
                <div className="flex items-center gap-1.5">
                  <span className="font-mono text-xs font-semibold" style={{ color: isActive ? C.dark : C.sub }}>
                    Ep {String(e.episode_number).padStart(2, "0")}
                  </span>
                  {skipped && (
                    <span className="text-[9px] px-1 py-0.5 rounded" style={{ background: "#FFF3E0", color: C.warn }}>
                      exists
                    </span>
                  )}
                </div>
                <div className="text-[10px] mt-0.5" style={{ color: C.muted }}>
                  {e.cues.length} cues
                </div>
              </button>
            );
          })}
        </div>

        {/* Episode detail */}
        {ep && (
          <div className="flex-1 overflow-y-auto px-5 py-4">

            {/* Existing warning */}
            {ep.existing_episode_id && (
              <div className="mb-4 px-4 py-3 rounded-xl flex items-center gap-2 text-xs" style={{ background: "#FFF3E0", color: C.warn, border: "1px solid #FFE082" }}>
                <AlertCircle className="w-4 h-4 shrink-0" />
                Episode {ep.episode_number} already exists in DB — these fields are read-only and this episode will be skipped on save.
              </div>
            )}

            {/* Episode meta */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5 p-4 rounded-xl border" style={{ borderColor: C.mint1 + "55", background: C.white }}>
              <Field label="Episode #">
                <Inp value={ep.episode_number} disabled onChange={()=>{}} />
              </Field>
              <Field label="Title">
                <Inp
                  value={ep.title}
                  disabled={!!ep.existing_episode_id}
                  onChange={ev => updEp(activeEp, { title: ev.target.value })}
                />
              </Field>
              <Field label="Air Date">
                <Inp
                  value={ep.air_date}
                  disabled={!!ep.existing_episode_id}
                  onChange={ev => updEp(activeEp, { air_date: ev.target.value })}
                  placeholder="DD Mon YYYY"
                />
              </Field>
              <Field label="Total Duration (sec)">
                <Inp
                  type="number" value={ep.total_duration_sec}
                  disabled={!!ep.existing_episode_id}
                  onChange={ev => updEp(activeEp, { total_duration_sec: Number(ev.target.value) || null })}
                />
              </Field>
              <Field label="Musical Duration (sec)">
                <Inp
                  type="number" value={ep.musical_duration_sec}
                  disabled={!!ep.existing_episode_id}
                  onChange={ev => updEp(activeEp, { musical_duration_sec: Number(ev.target.value) || null })}
                />
              </Field>
              <Field label="BG Instrumental (sec)">
                <Inp
                  type="number" value={ep.bg_instrumental_duration_sec}
                  disabled={!!ep.existing_episode_id}
                  onChange={ev => updEp(activeEp, { bg_instrumental_duration_sec: Number(ev.target.value) || null })}
                />
              </Field>
              <Field label="BG Vocal (sec)">
                <Inp
                  type="number" value={ep.bg_vocal_duration_sec}
                  disabled={!!ep.existing_episode_id}
                  onChange={ev => updEp(activeEp, { bg_vocal_duration_sec: Number(ev.target.value) || null })}
                />
              </Field>
            </div>

            {/* Cue list */}
            <div className="rounded-xl border overflow-hidden" style={{ borderColor: C.mint1 + "55" }}>

              {/* Column headers */}
              <div
                className="grid px-3 py-2 text-[10px] font-semibold uppercase tracking-wider"
                style={{
                  gridTemplateColumns: "20px 1fr 110px 70px 90px 110px 90px 90px",
                  background: C.mint4,
                  color: C.sub,
                }}
              >
                <span />
                <span>Song Title</span>
                <span>Usage</span>
                <span>Dur (s)</span>
                <span>Song Code</span>
                <span>ISRC</span>
                <span>Singer</span>
                <span>DB Match</span>
              </div>

              {ep.cues.map((cue, ci) => {
                const badge = MATCH_BADGE[cue.library_match] || MATCH_BADGE.none;
                const locked = !!ep.existing_episode_id;
                return (
                  <div key={ci} className="border-t" style={{ borderColor: C.mint1 + "33" }}>

                    {/* Cue row */}
                    <div
                      className="grid items-center px-3 py-2 gap-2"
                      style={{ gridTemplateColumns: "20px 1fr 110px 70px 90px 110px 90px 90px" }}
                    >
                      {/* Expand toggle */}
                      <button
                        onClick={() => updCue(activeEp, ci, { _open: !cue._open })}
                        className="flex items-center justify-center w-5 h-5 rounded hover:opacity-70"
                        style={{ color: C.sub }}
                      >
                        {cue._open
                          ? <ChevronDown className="w-3.5 h-3.5" />
                          : <ChevronRight className="w-3.5 h-3.5" />}
                      </button>

                      <Inp
                        value={cue.song_title}
                        disabled={locked}
                        onChange={ev => updCue(activeEp, ci, { song_title: ev.target.value })}
                        placeholder="Song title"
                      />
                      <Sel
                        value={cue.usage_type}
                        disabled={locked}
                        onChange={ev => updCue(activeEp, ci, { usage_type: ev.target.value })}
                      />
                      <Inp
                        type="number" value={cue.duration_sec}
                        disabled={locked}
                        onChange={ev => updCue(activeEp, ci, { duration_sec: Number(ev.target.value) || 0 })}
                        placeholder="sec"
                      />
                      <Inp
                        value={cue.song_code}
                        disabled={locked}
                        onChange={ev => updCue(activeEp, ci, { song_code: ev.target.value || null })}
                        placeholder="—"
                      />
                      <Inp
                        value={cue.isrc}
                        disabled={locked}
                        onChange={ev => updCue(activeEp, ci, { isrc: ev.target.value || null })}
                        placeholder="—"
                      />
                      <Inp
                        value={cue.singer}
                        disabled={locked}
                        onChange={ev => updCue(activeEp, ci, { singer: ev.target.value || null })}
                        placeholder="—"
                      />

                      {/* Match badge */}
                      <div className="flex items-center gap-1">
                        <span
                          className="text-[10px] px-2 py-0.5 rounded-full flex items-center gap-1"
                          style={{ background: badge.bg, color: badge.color }}
                        >
                          {cue.library_match !== "none" && <Database className="w-2.5 h-2.5" />}
                          {badge.label}
                        </span>
                        <span className="text-[10px]" style={{ color: C.muted }}>
                          {cue.contributors.length}c
                        </span>
                      </div>
                    </div>

                    {/* Contributors panel */}
                    {cue._open && (
                      <div
                        className="mx-3 mb-3 rounded-xl border overflow-hidden"
                        style={{ borderColor: C.mint1 + "44", background: C.mint4 + "55" }}
                      >
                        {/* Contrib header */}
                        <div
                          className="grid px-3 py-1.5 text-[10px] uppercase tracking-wider border-b"
                          style={{
                            gridTemplateColumns: "2fr 1fr 1fr 80px 140px 24px",
                            color: C.sub,
                            borderColor: C.mint1 + "44",
                          }}
                        >
                          <span>Name</span>
                          <span>Role</span>
                          <span>Society</span>
                          <span>Share %</span>
                          <span>IPI Number</span>
                          <span />
                        </div>

                        {cue.contributors.map((ct, cIdx) => (
                          <div
                            key={cIdx}
                            className="grid items-center px-3 py-1.5 gap-2 border-b last:border-0"
                            style={{
                              gridTemplateColumns: "2fr 1fr 1fr 80px 140px 24px",
                              borderColor: C.mint1 + "22",
                            }}
                          >
                            <div className="flex items-center gap-1.5">
                              {ct.library_match && (
                                <Check className="w-3 h-3 shrink-0" style={{ color: C.ok }} title="Matched in library" />
                              )}
                              <Inp
                                value={ct.name} disabled={locked}
                                onChange={ev => updContrib(activeEp, ci, cIdx, { name: ev.target.value })}
                                placeholder="Name"
                              />
                            </div>
                            <Inp
                              value={ct.role} disabled={locked}
                              onChange={ev => updContrib(activeEp, ci, cIdx, { role: ev.target.value })}
                              placeholder="Role"
                            />
                            <Inp
                              value={ct.society} disabled={locked}
                              onChange={ev => updContrib(activeEp, ci, cIdx, { society: ev.target.value })}
                              placeholder="—"
                            />
                            <Inp
                              type="number" value={ct.share_percent} disabled={locked}
                              onChange={ev => updContrib(activeEp, ci, cIdx, { share_percent: Number(ev.target.value) || 0 })}
                              placeholder="0"
                            />
                            <Inp
                              value={ct.ipi_number} disabled={locked}
                              onChange={ev => updContrib(activeEp, ci, cIdx, { ipi_number: ev.target.value || null })}
                              placeholder="—"
                            />
                            <button
                              onClick={() => !locked && delContrib(activeEp, ci, cIdx)}
                              disabled={locked}
                              className="p-0.5 hover:opacity-70 disabled:opacity-30"
                            >
                              <Trash2 className="w-3.5 h-3.5" style={{ color: C.muted }} />
                            </button>
                          </div>
                        ))}

                        {!locked && (
                          <button
                            onClick={() => addContrib(activeEp, ci)}
                            className="flex items-center gap-1.5 px-3 py-2 text-xs w-full hover:opacity-80"
                            style={{ color: C.sub }}
                          >
                            <Plus className="w-3 h-3" /> Add contributor
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              {ep.cues.length === 0 && (
                <div className="px-4 py-8 text-center text-xs" style={{ color: C.muted }}>
                  No cues parsed in this episode.
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
