import { useState } from "react";
import { FileUp, FileSpreadsheet, X, Download, Trash2, ChevronDown, ChevronRight, AlertCircle, CheckCircle2 } from "lucide-react";
import { C, FONTS, alpha, T } from "../styles/palette";
import { api } from "../utils/api";
import { showAlert, showConfirm } from "./Dialog";

// [25, 26, 27, 28, 30] → "25–28, 30"
export function fmtEpRanges(nums) {
  const sorted = [...new Set(nums)].sort((a, b) => a - b);
  const out = [];
  for (let i = 0; i < sorted.length; i++) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j++;
    out.push(i === j ? `${sorted[i]}` : `${sorted[i]}–${sorted[j]}`);
    i = j;
  }
  return out.join(", ");
}

export const workFileName = (projectTitle, epNum) => `${projectTitle}_EP${epNum}_WorkFile.xlsx`;

export async function downloadWorkFile(projectId, projectTitle, epNum) {
  try { await api.downloadWorkFile(projectId, epNum, workFileName(projectTitle, epNum)); }
  catch (ex) { await showAlert(ex.message, { title: "Download Failed", variant: "error" }); }
}

const fmtDur = (sec) => {
  if (!sec) return "—";
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return [h, m, s].map((v) => String(v).padStart(2, "0")).join(":");
};

// Chip shown wherever an episode has a work file; clicking downloads it.
export function WorkFileChip({ projectId, projectTitle, epNum }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); downloadWorkFile(projectId, projectTitle, epNum); }}
      title="Work file available — click to download"
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[0.625rem] font-semibold whitespace-nowrap hover:opacity-80"
      style={{ background: T.greenBg, color: T.teal, border: `1px solid ${alpha(C.mint1, "66")}` }}
    >
      <FileSpreadsheet className="w-3 h-3" />Work file
    </button>
  );
}

// ── Upload preview ───────────────────────────────────────────────────────────

function rowIssues(row, included, ctx) {
  if (row.error) return { blocking: [row.error], notes: [] };
  if (row.serialDeclined) return { blocking: [`Not uploaded — you said this isn't a ${ctx.projectTitle} work file.`], notes: [] };
  const n = parseInt(row.epInput, 10);
  const blocking = [];
  const notes = [...(row.warnings || []).filter((w) => !w.startsWith("Episode number not found"))];
  if (row.serialConfirmed) notes.unshift(`Titled '${row.serial_in_file || "untitled"}' — you confirmed it's ${ctx.projectTitle}.`);
  if (!n || n < 1) blocking.push("Enter the episode number.");
  else {
    if (included && ctx.dupes.has(n)) blocking.push(`Another selected file is also Ep ${n}.`);
    if (ctx.workFileEps.has(n)) notes.push(`Replaces the work file already uploaded for Ep ${n}.`);
    if (!ctx.episodeNumbers.has(n)) notes.push(`Ep ${n} isn't in this serial yet — it will show once the episode is imported.`);
  }
  return { blocking, notes };
}

function WorkFilePreview({ projectId, projectTitle, preview, onClose, onSaved }) {
  const [rows, setRows] = useState(preview.rows);
  const [saving, setSaving] = useState(false);

  const locked = (r) => !!r.error || !!r.serialDeclined;
  const included = rows.filter((r) => r.include && !locked(r));
  const counts = {};
  for (const r of included) { const n = parseInt(r.epInput, 10); if (n) counts[n] = (counts[n] || 0) + 1; }
  const ctx = {
    dupes: new Set(Object.keys(counts).filter((k) => counts[k] > 1).map(Number)),
    workFileEps: preview.workFileEps,
    episodeNumbers: preview.episodeNumbers,
    projectTitle,
  };
  const issues = rows.map((r) => rowIssues(r, r.include, ctx));
  const canSave = included.length > 0 && rows.every((r, i) => !r.include || locked(r) || issues[i].blocking.length === 0);

  const setRow = (i, patch) => setRows((prev) => prev.map((r, k) => (k === i ? { ...r, ...patch } : r)));

  // Select-all covers only rows that can be uploaded (not rejected / declined files).
  const selectable = rows.filter((r) => !locked(r));
  const allSelected = selectable.length > 0 && selectable.every((r) => r.include);
  const someSelected = selectable.some((r) => r.include);
  const toggleAll = () => setRows((prev) => prev.map((r) => (locked(r) ? r : { ...r, include: !allSelected })));

  const save = async () => {
    setSaving(true);
    try {
      const res = await api.uploadWorkFiles(
        projectId,
        included.map((r) => preview.files[r.index]),
        included.map((r) => parseInt(r.epInput, 10)),
        included.map((r) => !!r.serialConfirmed),
      );
      onSaved(res);
    } catch (ex) {
      await showAlert(ex.message, { title: "Upload Failed", variant: "error" });
    } finally { setSaving(false); }
  };

  const rejected = rows.filter(locked).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.55)" }}>
      <div className="rounded-2xl w-full max-w-5xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden" style={{ background: C.white }}>
        <div className="px-6 py-4 border-b flex items-center justify-between shrink-0" style={{ borderColor: alpha(C.mint1, "55") }}>
          <div>
            <div className="font-semibold text-lg" style={{ fontFamily: FONTS.serif, color: C.dark }}>Review Work Files</div>
            <div className="text-xs mt-0.5" style={{ color: C.sub }}>
              {rows.length} file{rows.length !== 1 ? "s" : ""} checked · {included.length} selected
              {rejected > 0 && <span style={{ color: T.red }}> · {rejected} not uploadable</span>}
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:opacity-70" style={{ color: C.sub }}><X className="w-4 h-4" /></button>
        </div>

        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[0.625rem] uppercase tracking-wider border-b" style={{ borderColor: C.mint4, color: C.sub, background: alpha(C.mint4, "44") }}>
                <th className="px-4 py-2.5 w-10">
                  <input type="checkbox" checked={allSelected} disabled={selectable.length === 0}
                    ref={(el) => { if (el) el.indeterminate = someSelected && !allSelected; }}
                    onChange={toggleAll} title={allSelected ? "Unselect all" : "Select all"}
                    style={{ accentColor: C.dark }} className="cursor-pointer disabled:cursor-not-allowed" />
                </th>
                <th className="text-left px-4 py-2.5">File</th>
                <th className="text-left px-4 py-2.5 w-24">Ep #</th>
                <th className="text-left px-4 py-2.5 w-16">Cues</th>
                <th className="text-left px-4 py-2.5 w-24">Duration</th>
                <th className="text-left px-4 py-2.5">Check</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const { blocking, notes } = issues[i];
                return (
                  <tr key={r.index} className="border-b last:border-0 align-top" style={{ borderColor: alpha(C.mint4, "88"), opacity: locked(r) ? 0.75 : 1 }}>
                    <td className="px-4 py-3">
                      <input type="checkbox" checked={!!r.include && !locked(r)} disabled={locked(r)}
                        onChange={(e) => setRow(i, { include: e.target.checked })}
                        style={{ accentColor: C.dark }} className="cursor-pointer disabled:cursor-not-allowed" />
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <div className="font-medium break-all" style={{ color: C.dark }}>{r.filename}</div>
                      {r.title && <div className="mt-0.5 break-all" style={{ color: C.muted }}>{r.title}</div>}
                    </td>
                    <td className="px-4 py-3">
                      {locked(r) ? <span className="text-xs" style={{ fontFamily: FONTS.mono, color: C.muted }}>{r.episode_number || "—"}</span> : (
                        <input type="number" min={1} value={r.epInput}
                          onChange={(e) => setRow(i, { epInput: e.target.value })}
                          className="w-20 px-2 py-1 rounded-lg text-xs text-center focus:outline-none"
                          style={{ fontFamily: FONTS.mono, background: C.white, color: C.dark, border: `1px solid ${blocking.length && r.include ? C.danger : alpha(C.mint1, "66")}` }} />
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs" style={{ fontFamily: FONTS.mono, color: C.sub }}>{r.error ? "—" : r.cue_count}</td>
                    <td className="px-4 py-3 text-xs" style={{ fontFamily: FONTS.mono, color: C.sub }}>{r.error ? "—" : fmtDur(r.duration_sec)}</td>
                    <td className="px-4 py-3 text-xs space-y-1">
                      {locked(r) ? (
                        <div className="flex items-start gap-1.5" style={{ color: T.red }}>
                          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-px" />{blocking[0]}
                        </div>
                      ) : (
                        <>
                          {r.include && blocking.map((m) => (
                            <div key={m} className="flex items-start gap-1.5" style={{ color: T.red }}><AlertCircle className="w-3.5 h-3.5 shrink-0 mt-px" />{m}</div>
                          ))}
                          {notes.map((m) => (
                            <div key={m} className="flex items-start gap-1.5" style={{ color: T.orange }}><AlertCircle className="w-3.5 h-3.5 shrink-0 mt-px" />{m}</div>
                          ))}
                          {blocking.length === 0 && notes.length === 0 && (
                            <div className="flex items-center gap-1.5" style={{ color: T.green }}><CheckCircle2 className="w-3.5 h-3.5" />Work file OK</div>
                          )}
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="px-6 py-4 border-t flex items-center justify-between gap-4 shrink-0" style={{ borderColor: alpha(C.mint1, "55"), background: alpha(C.mint4, "44") }}>
          <div className="text-xs" style={{ color: C.sub }}>
            Titles that don't match {projectTitle} are only saved after you confirm them. Rough sheets can't be saved here.
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm" style={{ background: C.mint4, color: C.dark }}>Cancel</button>
            <button onClick={save} disabled={!canSave || saving}
              className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-medium disabled:opacity-40 hover:opacity-90"
              style={{ background: C.dark, color: C.mint4 }}>
              <FileUp className="w-4 h-4" />
              {saving ? "Saving…" : `Save ${included.length} work file${included.length !== 1 ? "s" : ""}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Work files whose title names a different serial: ask, per title, whether it's this serial's file
// (a name difference) or the wrong file. Marks rows serialConfirmed / serialDeclined in place.
async function confirmSerialNames(rows, projectTitle) {
  const groups = new Map();
  for (const r of rows) {
    if (r.error || !r.serial_mismatch) continue;
    const name = r.serial_in_file || "";
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name).push(r);
  }
  for (const [name, group] of groups) {
    const list = group.slice(0, 5).map((r) => `• ${r.filename}${r.episode_number ? ` (Ep ${r.episode_number})` : ""}`);
    if (group.length > 5) list.push(`• …and ${group.length - 5} more`);
    const ok = await showConfirm(
      `${name ? `The work file title says "${name}"` : "The work file has no title"}, but this serial is "${projectTitle}".\n\n${list.join("\n")}`,
      {
        title: group.length > 1 ? `Are these ${projectTitle} work files?` : `Is this a ${projectTitle} work file?`,
        detail: "Upload if it's the right file and only the name is written differently. Choose Don't upload if it belongs to another serial.",
        confirmLabel: `Yes, upload to ${projectTitle}`,
        cancelLabel: "Don't upload",
        variant: "warn",
      },
    );
    for (const r of group) {
      if (ok) r.serialConfirmed = true;
      else { r.serialDeclined = true; r.include = false; }
    }
  }
}

// ── Card on the serial page ──────────────────────────────────────────────────

export default function WorkFileCard({ projectId, projectTitle, workFiles, onChanged }) {
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(null);
  const [showList, setShowList] = useState(false);
  const [msg, setMsg] = useState(null); // { ok: bool, text }

  const choose = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (!files.length) return;
    setBusy(true); setMsg(null);
    try {
      const res = await api.previewWorkFiles(projectId, files);
      const rows = res.files.map((r) => ({
        ...r,
        epInput: r.episode_number ? String(r.episode_number) : "",
        include: !r.error && !!r.episode_number,
      }));
      await confirmSerialNames(rows, projectTitle);
      setPreview({
        files,
        episodeNumbers: new Set(res.episode_numbers),
        workFileEps: new Set(res.work_file_episode_numbers),
        rows,
      });
    } catch (ex) {
      setMsg({ ok: false, text: ex.message });
    } finally { setBusy(false); }
  };

  const handleSaved = async (res) => {
    setPreview(null);
    setMsg({ ok: true, text: `Saved ${res.saved} work file${res.saved !== 1 ? "s" : ""} — Ep ${fmtEpRanges(res.episode_numbers)}.` });
    await onChanged?.();
  };

  const remove = async (n) => {
    const ok = await showConfirm(`The work file for Ep ${n} will be removed.`, { title: "Remove Work File", confirmLabel: "Remove", variant: "danger" });
    if (!ok) return;
    try { await api.deleteWorkFile(projectId, n); await onChanged?.(); }
    catch (ex) { await showAlert(ex.message, { title: "Remove Failed", variant: "error" }); }
  };

  const nums = workFiles.map((w) => w.episode_number);

  return (
    <div className="rounded-2xl border overflow-hidden mb-8" style={{ borderColor: alpha(C.mint1, "66"), background: alpha(C.mint4, "88") }}>
      {preview && (
        <WorkFilePreview projectId={projectId} projectTitle={projectTitle} preview={preview} onClose={() => setPreview(null)} onSaved={handleSaved} />
      )}
      <div className="px-6 py-5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: C.mint1 }}>
            <FileUp className="w-5 h-5" style={{ color: C.dark }} />
          </div>
          <div>
            <div className="font-semibold text-lg" style={{ fontFamily: FONTS.serif }}>Upload Work File</div>
            <div className="text-xs" style={{ color: C.sub }}>
              {busy ? "Checking files…" : "One .xlsx per episode (the 'Cue Sheet' work file) — rough sheets are rejected here"}
            </div>
          </div>
        </div>
        <label
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium cursor-pointer hover:opacity-90 shrink-0"
          style={{ background: busy ? C.mid : C.dark, color: C.mint4, pointerEvents: busy ? "none" : "auto" }}
        >
          {busy ? (
            <><span className="w-4 h-4 rounded-full border-2 animate-spin shrink-0" style={{ borderColor: C.mint1, borderTopColor: "transparent" }} />Checking…</>
          ) : (
            <><FileSpreadsheet className="w-4 h-4" />Choose .xlsx</>
          )}
          <input type="file" accept=".xlsx" multiple className="sr-only" onChange={choose} disabled={busy} />
        </label>
      </div>

      {msg && (
        <div className="mx-6 mb-4 text-xs whitespace-pre-line rounded-xl px-4 py-2.5 flex items-start justify-between gap-3"
          style={msg.ok
            ? { color: T.green, background: T.greenBg, border: `1px solid ${T.greenBorder}` }
            : { color: C.danger, background: T.redBg, border: `1px solid ${T.redBorder}` }}>
          {msg.text}
          <button onClick={() => setMsg(null)} className="opacity-60 hover:opacity-100">×</button>
        </div>
      )}

      {workFiles.length > 0 && (
        <div className="border-t" style={{ borderColor: alpha(C.mint1, "44") }}>
          <button onClick={() => setShowList((v) => !v)} className="w-full px-6 py-2.5 flex items-center gap-2 text-xs hover:opacity-80" style={{ color: C.dark }}>
            {showList ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            <span className="font-semibold">{workFiles.length} work file{workFiles.length !== 1 ? "s" : ""} uploaded</span>
            <span style={{ color: C.sub }}>· Ep {fmtEpRanges(nums)}</span>
          </button>
          {showList && (
            <div className="px-6 pb-4 max-h-72 overflow-auto">
              <table className="w-full text-xs rounded-xl overflow-hidden" style={{ background: C.white }}>
                <thead>
                  <tr className="text-[0.625rem] uppercase tracking-wider" style={{ color: C.sub, background: alpha(C.mint4, "66") }}>
                    <th className="text-left px-3 py-2 w-16">Ep</th>
                    <th className="text-left px-3 py-2">File</th>
                    <th className="text-left px-3 py-2 w-14">Cues</th>
                    <th className="text-left px-3 py-2">Uploaded</th>
                    <th className="px-3 py-2 w-20"></th>
                  </tr>
                </thead>
                <tbody>
                  {workFiles.map((w) => (
                    <tr key={w.episode_number} className="border-t" style={{ borderColor: alpha(C.mint4, "88") }}>
                      <td className="px-3 py-2" style={{ fontFamily: FONTS.mono }}>{String(w.episode_number).padStart(2, "0")}</td>
                      <td className="px-3 py-2 break-all" style={{ color: C.dark }}>{w.filename}</td>
                      <td className="px-3 py-2" style={{ fontFamily: FONTS.mono, color: C.sub }}>{w.cue_count}</td>
                      <td className="px-3 py-2" style={{ color: C.sub }}>
                        {w.uploaded_by || "—"}{w.uploaded_at ? ` · ${new Date(w.uploaded_at).toLocaleDateString()}` : ""}
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        <button onClick={() => downloadWorkFile(projectId, projectTitle, w.episode_number)} className="p-1 rounded hover:opacity-70" title="Download" style={{ color: C.dark }}>
                          <Download className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => remove(w.episode_number)} className="p-1 rounded hover:opacity-70 ml-1" title="Remove" style={{ color: C.danger }}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
