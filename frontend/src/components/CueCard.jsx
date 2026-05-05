import { useCallback, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Copy, Database, Plus, Save, Trash2, X } from "lucide-react";
import { showConfirm } from "./Dialog";
import { C, FONTS } from "../styles/palette";
import { iprsCode, prsCode, ascapCode } from "../constants/usage";
import Fld from "./Fld";
import Inp from "./Inp";
import InpSm from "./InpSm";
import { api } from "../utils/api";

const CONTRIB_ROLES = ["CA", "Composer", "Author", "Publisher", "Performer", "Arranger"];
const USAGE_OPTIONS = [
  ["bi", "BI - BG Instrumental"],
  ["bv", "BV - BG Vocal"],
  ["fi", "FI - Feature Instrumental"],
  ["fv", "FV - Feature Vocal"],
  ["theme", "Theme"],
  ["visual", "Visual"],
  ["other", "Other"],
];
// Display sort order: CA → Composer → Author → Publisher → Arranger → Performer
const ROLE_ORDER = { CA: 0, Composer: 1, Author: 2, Publisher: 3, Arranger: 4, Performer: 99 };

function RoleSelect({ value, onChange, readOnly }) {
  return (
    <select
      value={value || "Composer"}
      onChange={(e) => onChange?.(e.target.value)}
      disabled={readOnly}
      className="w-full border rounded-lg px-2 py-1.5 text-xs focus:outline-none"
      style={{
        borderColor: C.mint1 + "44",
        background: readOnly ? "#f9fafb" : C.white,
        color: C.dark,
        fontFamily: FONTS.sans,
      }}
    >
      {CONTRIB_ROLES.map((r) => (
        <option key={r} value={r}>{r}</option>
      ))}
    </select>
  );
}

function UsageSelect({ value, onChange, readOnly }) {
  const normalized = { background: "bi", instrumental: "bi", vocal: "bv" }[value] || value || "bi";
  return (
    <select
      value={normalized}
      onChange={(e) => onChange?.(e.target.value)}
      disabled={readOnly}
      className="w-full border rounded-lg px-2 py-2 text-sm focus:outline-none"
      style={{
        borderColor: C.mint1 + "44",
        background: readOnly ? "#f9fafb" : C.white,
        color: C.dark,
        fontFamily: FONTS.sans,
      }}
    >
      {USAGE_OPTIONS.map(([v, label]) => (
        <option key={v} value={v}>{label}</option>
      ))}
    </select>
  );
}

function ContribDropdown({ suggestions, onSelect, onClose }) {
  if (!suggestions || suggestions.length === 0) return null;
  return (
    <div
      className="absolute z-50 rounded-xl shadow-2xl"
      style={{
        top: "calc(100% + 2px)", left: 0, right: 0,
        background: C.dark, border: `1px solid ${C.mid}`,
        minWidth: 300, maxHeight: 240, overflowY: "auto",
      }}
    >
      {suggestions.map((s, i) => {
        const altNames = (s.all_names || []).slice(1);
        return (
          <button
            key={i}
            className="w-full text-left px-3 py-2.5 flex flex-col hover:opacity-70 transition-opacity border-b"
            style={{ borderColor: C.mid + "66" }}
            onMouseDown={(e) => { e.preventDefault(); onSelect(s); onClose(); }}
          >
            <div className="text-xs font-semibold" style={{ color: C.mint1 }}>{s.name}</div>
            {altNames.length > 0 && (
              <div className="text-[10px] mt-0.5" style={{ color: C.muted }}>
                Also known as: {altNames.join(" · ")}
              </div>
            )}
            <div className="text-[10px] flex gap-2 mt-0.5" style={{ color: C.muted }}>
              <span>{s.role}</span>
              <span>·</span>
              <span>{s.society || "—"}</span>
              <span>·</span>
              <span style={{ fontFamily: "monospace" }}>IPI: {s.ipi_number || s.cae_number || "—"}</span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function SongDropdown({ suggestions, onSelect, onClose }) {
  if (!suggestions || suggestions.length === 0) return null;
  return (
    <div
      className="absolute z-50 rounded-xl shadow-2xl"
      style={{
        top: "calc(100% + 2px)", left: 0, right: 0,
        background: C.dark, border: `1px solid ${C.mint1}55`,
        minWidth: 280, maxHeight: 280, overflowY: "auto",
      }}
    >
      {suggestions.map((s, i) => {
        const contribs = s.contributors || [];
        return (
          <button
            key={i}
            className="w-full text-left px-3 py-2.5 flex flex-col hover:opacity-70 transition-opacity border-b"
            style={{ borderColor: C.mid + "66" }}
            onMouseDown={(e) => { e.preventDefault(); onSelect(s); onClose(); }}
          >
            <div className="text-xs font-semibold" style={{ color: C.mint1 }}>{s.title}</div>
            <div className="text-[10px] flex gap-3 mt-0.5 flex-wrap" style={{ color: C.muted }}>
              {s.isrc && <span style={{ fontFamily: "monospace" }}>ISRC: {s.isrc}</span>}
              {s.song_code && <span style={{ fontFamily: "monospace" }}>Code: {s.song_code}</span>}
              {s.singer && <span>{s.singer}</span>}
            </div>
            {contribs.length > 0 && (
              <div className="text-[10px] mt-0.5 truncate" style={{ color: C.muted }}>
                {contribs.slice(0, 3).map((c) => `${c.role}: ${c.name}`).join(" · ")}
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}

const _toSec = (v) => {
  if (v == null || v === "") return null;
  if (typeof v === "number") return v;
  const s = String(v).trim();
  const m = s.match(/^(\d+):(\d+)(?::(\d+))?$/);
  if (m) return (+m[1]) * (m[3] ? 3600 : 60) + (+m[2]) * (m[3] ? 60 : 1) + (+m[3] || 0);
  const n = Number(s);
  return isNaN(n) ? null : n;
};
const _secToMinSec = (val) => {
  if (val == null || val === "") return "";
  const s = typeof val === "number" ? val : _toSec(val);
  if (s == null) return typeof val === "string" ? val : "";
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
};

export default function CueCard({
  cue, idx, isAdmin,
  onUpdate, onContribUpdate, onContribAdd, onContribRemove, onContribsRemove,
  onDuplicate, onRemove, onSaveToLibrary, onApplyLibraryMatch,
  otherEpisodes = [],
}) {
  const [selected, setSelected] = useState(new Set());
  const [songSuggestions, setSongSuggestions] = useState([]);
  const [openSongDropdown, setOpenSongDropdown] = useState(null); // 'songCode' | 'isrc' | null
  const [contribSuggestions, setContribSuggestions] = useState({});
  const [openDropdown, setOpenDropdown] = useState(null); // { coId, field }
  const debounceTimers = useRef({});
  const songDebounceRef = useRef(null);

  // Exclude Performer from share sum
  const sum = cue.contributors.reduce(
    (a, x) => a + (x.role === "Performer" ? 0 : Number(x.share || 0)), 0
  );
  const ok = Math.abs(sum - 100) < 0.02;

  const sortedContribs = [...cue.contributors].sort(
    (a, b) => (ROLE_ORDER[a.role] ?? 5) - (ROLE_ORDER[b.role] ?? 5)
  );

  const allChecked = cue.contributors.length > 0 && cue.contributors.every((co) => selected.has(co.id));
  const anyChecked = selected.size > 0;

  const toggleOne = (coId) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(coId)) next.delete(coId); else next.add(coId);
    return next;
  });
  const toggleAll = () => setSelected(allChecked ? new Set() : new Set(cue.contributors.map((co) => co.id)));
  const deleteSelected = () => { onContribsRemove?.(cue.id, [...selected]); setSelected(new Set()); };

  // ── Song lookup helpers ───────────────────────────────────────────────────────

  const doSongTypeahead = useCallback((field, songCode, isrc) => {
    if (isAdmin) return;
    if (songDebounceRef.current) clearTimeout(songDebounceRef.current);
    const hasCode = songCode && songCode.trim().length > 1;
    const hasIsrc = isrc && isrc.trim().length > 2;
    if (!hasCode && !hasIsrc) { setSongSuggestions([]); setOpenSongDropdown(null); return; }
    songDebounceRef.current = setTimeout(async () => {
      try {
        const results = await api.searchSongs("", songCode || "", isrc || "");
        setSongSuggestions(results || []);
        if (results && results.length > 0) setOpenSongDropdown(field);
      } catch (_) {}
    }, 280);
  }, [isAdmin]);

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

  const applySongMatch = (song) => {
    if (song.title) onUpdate(cue.id, "songTitle", song.title);
    if (song.isrc) onUpdate(cue.id, "isrc", song.isrc);
    if (song.song_code) onUpdate(cue.id, "songCode", song.song_code);
    if (song.singer) onUpdate(cue.id, "singer", song.singer);
    if (song.work_number) onUpdate(cue.id, "workNumber", song.work_number);
    if (song.ascap_work_id) onUpdate(cue.id, "ascapWorkId", song.ascap_work_id);
    onApplyLibraryMatch?.(cue.id, song);
    setSongSuggestions([]);
    setOpenSongDropdown(null);
  };

  // ── Contributor lookup helpers ────────────────────────────────────────────────

  const doContribSearch = useCallback((coId, field, value) => {
    const key = `${coId}:${field}`;
    if (debounceTimers.current[key]) clearTimeout(debounceTimers.current[key]);
    if (!value || value.trim().length < 2) {
      setContribSuggestions((prev) => ({ ...prev, [coId]: [] }));
      return;
    }
    debounceTimers.current[key] = setTimeout(async () => {
      try {
        const q = field === "ipi" ? "" : value.trim();
        const ipi = field === "ipi" ? value.trim() : "";
        const results = await api.searchContributors(q, ipi);
        setContribSuggestions((prev) => ({ ...prev, [coId]: results || [] }));
        if (results && results.length > 0) setOpenDropdown({ coId, field });
      } catch (_) {}
    }, 280);
  }, []);

  const applyContribSuggestion = (coId, s) => {
    onContribUpdate(cue.id, coId, "name", s.name);
    if (s.role) onContribUpdate(cue.id, coId, "role", s.role);
    if (s.society) onContribUpdate(cue.id, coId, "society", s.society);
    const ipi = s.ipi_number || s.cae_number;
    if (ipi) onContribUpdate(cue.id, coId, "ipi", ipi);
    setContribSuggestions((prev) => ({ ...prev, [coId]: [] }));
    setOpenDropdown(null);
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

  const handleRoleChange = (coId, newRole) => {
    onContribUpdate(cue.id, coId, "role", newRole);
  };

  return (
    <div className="rounded-2xl border overflow-visible" style={{ background: C.white, borderColor: C.mint1 + "44" }}>
      {/* ── Header ── */}
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
          {onDuplicate && !isAdmin && (
            <button
              onClick={() => onDuplicate(cue.id)}
              className="p-1.5 rounded-lg hover:opacity-80 transition"
              title="Duplicate this song"
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
              title={cue.libraryId ? "Update this song in library" : "Add this song to library"}
            >
              {cue.libraryId ? <Save className="w-3.5 h-3.5" /> : <Database className="w-3.5 h-3.5" />}
              {cue.libraryId ? "Update DB" : "Add to DB"}
            </button>
          )}
          <button
            onClick={async () => { if (await showConfirm(`Remove Song ${idx + 1} — "${cue.songTitle || "Untitled"}"?`, { title: "Remove Song", confirmLabel: "Remove", variant: "danger" })) onRemove(cue.id); }}
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
          <Fld label="Song Title" tag="hybrid" span={3}>
            <Inp value={cue.songTitle} onChange={(v) => onUpdate(cue.id, "songTitle", v)} onBlur={handleSongTitleBlur} readOnly={false} />
          </Fld>
          <Fld label="Usage Type" tag="auto">
            <UsageSelect value={cue.usageType} onChange={(v) => onUpdate(cue.id, "usageType", v)} readOnly={false} />
          </Fld>
          <Fld label="Duration" tag="auto">
            <Inp value={typeof cue.duration === "number" ? _secToMinSec(cue.duration) : (cue.duration ?? "")} onChange={(v) => onUpdate(cue.id, "duration", v)} readOnly={false} mono />
          </Fld>
          <Fld label="Usages" tag="auto">
            <Inp value={cue.usages} onChange={(v) => onUpdate(cue.id, "usages", parseInt(v) || 1)} readOnly={false} mono />
          </Fld>
          <Fld label="Song Code" tag="manual">
            <div className="relative">
              <Inp
                value={cue.songCode}
                onChange={(v) => { onUpdate(cue.id, "songCode", v); doSongTypeahead("songCode", v, cue.isrc); }}
                onFocus={() => { if (songSuggestions.length > 0) setOpenSongDropdown("songCode"); }}
                onBlur={() => setTimeout(() => setOpenSongDropdown(null), 150)}
                readOnly={false}
                mono
              />
              {openSongDropdown === "songCode" && (
                <SongDropdown
                  suggestions={songSuggestions}
                  onSelect={applySongMatch}
                  onClose={() => setOpenSongDropdown(null)}
                />
              )}
            </div>
          </Fld>
          <Fld label="ISRC" tag="manual">
            <div className="relative">
              <Inp
                value={cue.isrc || ""}
                onChange={(v) => { onUpdate(cue.id, "isrc", v); doSongTypeahead("isrc", cue.songCode, v); }}
                onFocus={() => { if (songSuggestions.length > 0) setOpenSongDropdown("isrc"); }}
                onBlur={() => setTimeout(() => setOpenSongDropdown(null), 150)}
                readOnly={false}
                mono
              />
              {openSongDropdown === "isrc" && (
                <SongDropdown
                  suggestions={songSuggestions}
                  onSelect={applySongMatch}
                  onClose={() => setOpenSongDropdown(null)}
                />
              )}
            </div>
          </Fld>
          <Fld label="Singer" tag="hybrid">
            <Inp value={cue.singer} onChange={(v) => onUpdate(cue.id, "singer", v)} readOnly={false} />
          </Fld>
          <Fld label="PRS Work No." tag="manual">
            <Inp value={cue.workNumber || ""} onChange={(v) => onUpdate(cue.id, "workNumber", v)} readOnly={false} mono />
          </Fld>
          <Fld label="ASCAP Work ID" tag="manual">
            <Inp value={cue.ascapWorkId || ""} onChange={(v) => onUpdate(cue.id, "ascapWorkId", v)} readOnly={false} mono />
          </Fld>
          <Fld label="Validation Link" tag="manual" span={3}>
            <Inp value={cue.validationLink || ""} onChange={(v) => onUpdate(cue.id, "validationLink", v)} readOnly={false} />
          </Fld>
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

        <div className="rounded-xl border overflow-visible" style={{ borderColor: C.mint1 + "44" }}>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider" style={{ background: C.mint4 + "55", color: C.sub }}>
                <th className="w-7" />
                <th className="text-left px-3 py-2">Name</th>
                <th className="text-left px-3 py-2 w-32">Role</th>
                <th className="text-left px-3 py-2 w-24">Society</th>
                <th className="text-left px-3 py-2 w-36">IPI / CAE</th>
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
              {sortedContribs.map((co) => {
                const isPerformer = co.role === "Performer";
                const suggestions = contribSuggestions[co.id] || [];
                const showNameDrop = openDropdown?.coId === co.id && openDropdown?.field === "name" && suggestions.length > 0;
                const showIpiDrop = openDropdown?.coId === co.id && openDropdown?.field === "ipi" && suggestions.length > 0;
                return (
                  <tr
                    key={co.id}
                    className="border-t"
                    style={{
                      borderColor: C.mint4 + "88",
                      background: selected.has(co.id) ? C.mint4 + "99" : isPerformer ? "#fafafa" : undefined,
                    }}
                  >
                    {/* + insert below */}
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

                    {/* Name with typeahead */}
                    <td className="p-1.5 relative">
                      <InpSm
                        value={co.name}
                        onChange={(v) => { onContribUpdate(cue.id, co.id, "name", v); doContribSearch(co.id, "name", v); }}
                        onBlur={(v) => { handleContribNameBlur(co.id, v); setTimeout(() => setOpenDropdown(null), 150); }}
                        onFocus={() => { if (suggestions.length > 0) setOpenDropdown({ coId: co.id, field: "name" }); }}
                        readOnly={false}
                        placeholder="Name"
                      />
                      {showNameDrop && (
                        <ContribDropdown
                          suggestions={suggestions}
                          onSelect={(s) => applyContribSuggestion(co.id, s)}
                          onClose={() => setOpenDropdown(null)}
                        />
                      )}
                    </td>

                    {/* Role dropdown */}
                    <td className="p-1.5">
                      <RoleSelect value={co.role} onChange={(v) => handleRoleChange(co.id, v)} readOnly={false} />
                    </td>

                    {/* Society */}
                    <td className="p-1.5">
                      <InpSm value={co.society} onChange={(v) => onContribUpdate(cue.id, co.id, "society", v)} readOnly={false} mono placeholder="IPRS" />
                    </td>

                    {/* IPI/CAE with typeahead */}
                    <td className="p-1.5 relative">
                      <InpSm
                        value={co.ipi}
                        onChange={(v) => { onContribUpdate(cue.id, co.id, "ipi", v); doContribSearch(co.id, "ipi", v); }}
                        onFocus={() => { if (suggestions.length > 0) setOpenDropdown({ coId: co.id, field: "ipi" }); }}
                        onBlur={() => setTimeout(() => setOpenDropdown(null), 150)}
                        readOnly={false}
                        mono
                        placeholder="IPI/CAE"
                      />
                      {showIpiDrop && (
                        <ContribDropdown
                          suggestions={suggestions}
                          onSelect={(s) => applyContribSuggestion(co.id, s)}
                          onClose={() => setOpenDropdown(null)}
                        />
                      )}
                    </td>

                    {/* Share — locked to 0 for Performer */}
                    <td className="p-1.5">
                      <InpSm
                        value={isPerformer ? "0" : co.share}
                        onChange={(v) => { if (!isPerformer) onContribUpdate(cue.id, co.id, "share", parseFloat(v) || 0); }}
                        readOnly={isPerformer}
                        mono
                        placeholder="%"
                      />
                    </td>

                    {/* Checkbox + × */}
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
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
