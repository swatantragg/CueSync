import { useState } from "react";
import { CheckCircle2, AlertCircle, Trash2, Plus, X, Database, Save, Copy } from "lucide-react";
import { C, FONTS } from "../styles/palette";
import { iprsCode, prsCode, ascapCode } from "../constants/usage";
import Fld from "./Fld";
import Inp from "./Inp";
import InpSm from "./InpSm";
import { api } from "../utils/api";

export default function CueCard({ cue, idx, isAdmin, onUpdate, onContribUpdate, onContribAdd, onContribRemove, onContribsRemove, onDuplicate, onRemove, onCopyTo, onSaveToLibrary, otherEpisodes = [] }) {
  const [selected, setSelected] = useState(new Set());

  const sum = cue.contributors.reduce((a, x) => a + Number(x.share || 0), 0);
  const ok = sum === 100;

  const allChecked = cue.contributors.length > 0 && cue.contributors.every((co) => selected.has(co.id));
  const anyChecked = selected.size > 0;

  const toggleOne = (coId) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(coId)) next.delete(coId); else next.add(coId);
    return next;
  });
  const toggleAll = () => setSelected(allChecked ? new Set() : new Set(cue.contributors.map((co) => co.id)));
  const deleteSelected = () => {
    onContribsRemove?.(cue.id, [...selected]);
    setSelected(new Set());
  };

  const handleSongTitleBlur = async (title) => {
    if (!title || title.trim().length < 2 || isAdmin) return;
    try {
      const match = await api.lookupSong(title.trim(), cue.isrc || "");
      if (!match) return;
      if (!cue.songCode && match.song_code) onUpdate(cue.id, "songCode", match.song_code);
      if (!cue.isrc && match.isrc) onUpdate(cue.id, "isrc", match.isrc);
      if (!cue.singer && match.singer) onUpdate(cue.id, "singer", match.singer);
      if (!cue.workNumber && match.work_number) onUpdate(cue.id, "workNumber", match.work_number);
      if (!cue.ascapWorkId && match.ascap_work_id) onUpdate(cue.id, "ascapWorkId", match.ascap_work_id);
    } catch (_) {}
  };

  const handleContribNameBlur = async (coId, name) => {
    if (!name || name.trim().length < 2 || isAdmin) return;
    try {
      const match = await api.lookupContributor(name.trim());
      if (!match) return;
      const co = cue.contributors.find((c) => c.id === coId);
      if (!co) return;
      if (!co.ipi && match.ipi_number) onContribUpdate(cue.id, coId, "ipi", match.ipi_number);
      if (!co.society && match.society) onContribUpdate(cue.id, coId, "society", match.society);
      if ((!co.role || co.role === "Composer") && match.role && match.role !== "Composer")
        onContribUpdate(cue.id, coId, "role", match.role);
    } catch (_) {}
  };

  return (
    <div className="rounded-2xl border overflow-hidden" style={{ background: C.white, borderColor: C.mint1 + "44" }}>
      {/* ── Header bar ── */}
      <div className="flex items-center justify-between px-5 py-3" style={{ background: C.mint4 + "88" }}>
        <div className="flex items-center gap-3 flex-wrap">
          <span className="font-mono text-xs px-2.5 py-1 rounded-lg font-medium" style={{ background: C.dark, color: C.mint1 }}>
            SONG {String(idx + 1).padStart(2, "0")}
          </span>
          <span className="text-sm font-medium truncate max-w-xs" style={{ fontFamily: FONTS.serif }}>{cue.songTitle || "Untitled"}</span>
          <span className="px-1.5 py-0.5 rounded text-[10px]" style={{ background: C.mint3, fontFamily: FONTS.mono }}>
            IPRS:{iprsCode(cue.usageType)} · PRS:{prsCode(cue.usageType)} · ASCAP:{ascapCode(cue.usageType)}
          </span>
          {ok ? (
            <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-lg" style={{ color: C.ok, background: "#D8F3DC" }}>
              <CheckCircle2 className="w-3 h-3" />100%
            </span>
          ) : (
            <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-lg" style={{ color: C.danger, background: "#FFDDD2" }}>
              <AlertCircle className="w-3 h-3" />{sum}%
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Duplicate — icon only */}
          {onDuplicate && !isAdmin && (
            <button
              onClick={() => onDuplicate(cue.id)}
              className="p-1.5 rounded-lg hover:opacity-80 transition"
              title="Duplicate this song (exact copy with contributors)"
              style={{ color: C.sub, background: C.mint4, border: `1px solid ${C.mint1}55` }}
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
          )}
          {onSaveToLibrary && !isAdmin && (
            <button
              onClick={() => onSaveToLibrary(cue.id)}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium hover:opacity-90"
              style={{ background: cue.libraryId ? C.mint1 : C.dark, color: cue.libraryId ? C.dark : C.mint4 }}
              title={cue.libraryId ? "Update this song's details in the shared library" : "Add this song to the shared library for future autofill"}
            >
              {cue.libraryId ? <Save className="w-3.5 h-3.5" /> : <Database className="w-3.5 h-3.5" />}
              {cue.libraryId ? "Update DB" : "Add to DB"}
            </button>
          )}
          <button
            onClick={() => { if (confirm(`Remove Song ${idx + 1}?`)) onRemove(cue.id); }}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg opacity-50 hover:opacity-100"
            style={{ color: C.danger, background: "#FFDDD2" }}
          >
            <Trash2 className="w-3.5 h-3.5" />Remove
          </button>
        </div>
      </div>

      {/* ── Song fields ── */}
      <div className="px-5 py-5">
        <div className="grid grid-cols-6 gap-3 mb-5">
          <Fld label="Song Title" tag="hybrid" span={3}><Inp value={cue.songTitle} onChange={(v) => onUpdate(cue.id, "songTitle", v)} onBlur={handleSongTitleBlur} readOnly={false} /></Fld>
          <Fld label="Usage Type" tag="auto"><Inp value={cue.usageType} onChange={(v) => onUpdate(cue.id, "usageType", v)} readOnly={false} /></Fld>
          <Fld label="Duration" tag="auto"><Inp value={cue.duration} onChange={(v) => onUpdate(cue.id, "duration", v)} readOnly={false} mono /></Fld>
          <Fld label="Usages" tag="auto"><Inp value={cue.usages} onChange={(v) => onUpdate(cue.id, "usages", parseInt(v) || 1)} readOnly={false} mono /></Fld>
          <Fld label="Song Code" tag="manual"><Inp value={cue.songCode} onChange={(v) => onUpdate(cue.id, "songCode", v)} readOnly={false} mono /></Fld>
          <Fld label="ISRC" tag="manual"><Inp value={cue.isrc || ""} onChange={(v) => onUpdate(cue.id, "isrc", v)} readOnly={false} mono /></Fld>
          <Fld label="Singer" tag="hybrid"><Inp value={cue.singer} onChange={(v) => onUpdate(cue.id, "singer", v)} readOnly={false} /></Fld>
          <Fld label="PRS Work No." tag="manual"><Inp value={cue.workNumber || ""} onChange={(v) => onUpdate(cue.id, "workNumber", v)} readOnly={false} mono /></Fld>
          <Fld label="ASCAP Work ID" tag="manual"><Inp value={cue.ascapWorkId || ""} onChange={(v) => onUpdate(cue.id, "ascapWorkId", v)} readOnly={false} mono /></Fld>
          <Fld label="Validation Link" tag="manual" span={3}><Inp value={cue.validationLink || ""} onChange={(v) => onUpdate(cue.id, "validationLink", v)} readOnly={false} /></Fld>
        </div>

        {/* ── Contributors ── */}
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-xs uppercase tracking-widest font-semibold" style={{ color: C.sub }}>Contributors</h4>
          <div className="flex items-center gap-2">
            <span className="text-xs px-2 py-1 rounded-lg" style={{ color: ok ? C.ok : C.danger, background: ok ? "#D8F3DC" : "#FFDDD2" }}>
              Total: {sum}% {ok ? "✓" : "(need 100%)"}
            </span>
            {anyChecked && (
              <button
                onClick={deleteSelected}
                className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg font-medium hover:opacity-90"
                style={{ background: "#FFDDD2", color: C.danger }}
              >
                <Trash2 className="w-3 h-3" />Delete {selected.size} selected
              </button>
            )}
          </div>
        </div>

        <div className="rounded-xl border overflow-hidden" style={{ borderColor: C.mint1 + "44" }}>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider" style={{ background: C.mint4 + "55", color: C.sub }}>
                <th className="w-7" />
                <th className="text-left px-3 py-2">Name</th>
                <th className="text-left px-3 py-2 w-28">Role</th>
                <th className="text-left px-3 py-2 w-24">Society</th>
                <th className="text-left px-3 py-2 w-32">IPI / CAE</th>
                <th className="text-left px-3 py-2 w-20">Share%</th>
                <th className="w-14 px-2 py-2 text-center">
                  <input
                    type="checkbox"
                    checked={allChecked}
                    onChange={toggleAll}
                    className="accent-current cursor-pointer"
                    style={{ accentColor: C.dark }}
                    title="Select all"
                  />
                </th>
              </tr>
            </thead>
            <tbody>
              {cue.contributors.map((co) => (
                <tr
                  key={co.id}
                  className="border-t"
                  style={{
                    borderColor: C.mint4 + "88",
                    background: selected.has(co.id) ? C.mint4 + "99" : undefined,
                  }}
                >
                  {/* + (insert below) */}
                  <td className="p-1.5 text-center">
                    <button
                      onClick={() => onContribAdd(cue.id, co.id)}
                      className="w-5 h-5 flex items-center justify-center rounded hover:opacity-70"
                      style={{ color: C.ok, background: "#D8F3DC" }}
                      title="Insert row below"
                      tabIndex={-1}
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </td>
                  {/* Fields */}
                  <td className="p-1.5">
                    <InpSm
                      value={co.name}
                      onChange={(v) => onContribUpdate(cue.id, co.id, "name", v)}
                      onBlur={(v) => handleContribNameBlur(co.id, v)}
                      readOnly={false}
                      placeholder="Name"
                    />
                  </td>
                  <td className="p-1.5"><InpSm value={co.role} onChange={(v) => onContribUpdate(cue.id, co.id, "role", v)} readOnly={false} placeholder="C/A/E" /></td>
                  <td className="p-1.5"><InpSm value={co.society} onChange={(v) => onContribUpdate(cue.id, co.id, "society", v)} readOnly={false} mono placeholder="IPRS" /></td>
                  <td className="p-1.5"><InpSm value={co.ipi} onChange={(v) => onContribUpdate(cue.id, co.id, "ipi", v)} readOnly={false} mono placeholder="IPI/CAE" /></td>
                  <td className="p-1.5"><InpSm value={co.share} onChange={(v) => onContribUpdate(cue.id, co.id, "share", parseFloat(v) || 0)} readOnly={false} mono placeholder="%" /></td>
                  {/* Checkbox + × (delete) */}
                  <td className="p-1.5">
                    <div className="flex items-center gap-1 justify-center">
                      <input
                        type="checkbox"
                        checked={selected.has(co.id)}
                        onChange={() => toggleOne(co.id)}
                        className="cursor-pointer"
                        style={{ accentColor: C.dark }}
                      />
                      <button
                        onClick={() => onContribRemove(cue.id, co.id)}
                        className="w-5 h-5 flex items-center justify-center rounded hover:opacity-70"
                        style={{ color: C.danger }}
                        tabIndex={-1}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
