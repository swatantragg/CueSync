import { CheckCircle2, AlertCircle, Trash2, Plus, X } from "lucide-react";
import { C, FONTS } from "../styles/palette";
import { iprsCode, prsCode, ascapCode } from "../constants/usage";
import Fld from "./Fld";
import Inp from "./Inp";
import InpSm from "./InpSm";

export default function CueCard({ cue, idx, isAdmin, onUpdate, onContribUpdate, onContribAdd, onContribRemove, onRemove, onCopyTo, otherEpisodes = [] }) {
  const sum = cue.contributors.reduce((a, x) => a + Number(x.share || 0), 0);
  const ok = sum === 100;

  return (
    <div className="rounded-2xl border overflow-hidden" style={{ background: C.white, borderColor: C.mint1 + "44" }}>
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
          {onCopyTo && otherEpisodes.length > 0 && (
            <select
              value=""
              onChange={(e) => { const v = e.target.value; if (v) { onCopyTo(cue.id, Number(v)); e.target.value = ""; } }}
              className="text-xs px-2 py-1.5 rounded-lg border"
              style={{ borderColor: C.mint1 + "66", background: C.white }}
              title="Copy this song to another episode"
            >
              <option value="">Copy to Ep…</option>
              {otherEpisodes.map((oe) => (
                <option key={oe.id} value={oe.id}>Ep {oe.number}</option>
              ))}
            </select>
          )}
          <button onClick={() => { if (confirm(`Remove Song ${idx + 1}?`)) onRemove(cue.id); }} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg opacity-50 hover:opacity-100" style={{ color: C.danger, background: "#FFDDD2" }}>
            <Trash2 className="w-3.5 h-3.5" />Remove
          </button>
        </div>
      </div>
      <div className="px-5 py-5">
        <div className="grid grid-cols-6 gap-3 mb-5">
          <Fld label="Song Title" tag="hybrid" span={3}><Inp value={cue.songTitle} onChange={(v) => onUpdate(cue.id, "songTitle", v)} readOnly={false} /></Fld>
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
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-xs uppercase tracking-widest font-semibold" style={{ color: C.sub }}>Contributors</h4>
          <div className="flex items-center gap-3">
            <span className="text-xs px-2 py-1 rounded-lg" style={{ color: ok ? C.ok : C.danger, background: ok ? "#D8F3DC" : "#FFDDD2" }}>
              Total: {sum}% {ok ? "✓" : "(need 100%)"}
            </span>
            <button onClick={() => onContribAdd(cue.id)} className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg font-medium hover:opacity-90" style={{ background: C.dark, color: C.mint4 }}>
              <Plus className="w-3 h-3" />Add Row
            </button>
          </div>
        </div>
        <div className="rounded-xl border overflow-hidden" style={{ borderColor: C.mint1 + "44" }}>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider" style={{ background: C.mint4 + "55", color: C.sub }}>
                <th className="text-left px-3 py-2">Name</th>
                <th className="text-left px-3 py-2 w-28">Role</th>
                <th className="text-left px-3 py-2 w-24">Society</th>
                <th className="text-left px-3 py-2 w-32">IPI / CAE</th>
                <th className="text-left px-3 py-2 w-20">Share%</th>
                <th className="w-8"></th>
              </tr>
            </thead>
            <tbody>
              {cue.contributors.map((co) => (
                <tr key={co.id} className="border-t" style={{ borderColor: C.mint4 + "88" }}>
                  <td className="p-1.5"><InpSm value={co.name} onChange={(v) => onContribUpdate(cue.id, co.id, "name", v)} readOnly={false} placeholder="Name" /></td>
                  <td className="p-1.5"><InpSm value={co.role} onChange={(v) => onContribUpdate(cue.id, co.id, "role", v)} readOnly={false} placeholder="C/A/E" /></td>
                  <td className="p-1.5"><InpSm value={co.society} onChange={(v) => onContribUpdate(cue.id, co.id, "society", v)} readOnly={false} mono placeholder="IPRS" /></td>
                  <td className="p-1.5"><InpSm value={co.ipi} onChange={(v) => onContribUpdate(cue.id, co.id, "ipi", v)} readOnly={false} mono placeholder="IPI" /></td>
                  <td className="p-1.5"><InpSm value={co.share} onChange={(v) => onContribUpdate(cue.id, co.id, "share", parseFloat(v) || 0)} readOnly={false} mono placeholder="%" /></td>
                  <td className="p-1.5">
                    <button onClick={() => onContribRemove(cue.id, co.id)} className="opacity-30 hover:opacity-100" style={{ color: C.danger }} tabIndex={-1}>
                      <X className="w-3.5 h-3.5" />
                    </button>
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
