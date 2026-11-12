import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle, Archive, CheckCircle2, ChevronDown, FileDown, FileSpreadsheet, FileUp, Film, Info, Layers, Mail,
  Plus, Repeat, Trash2, X,
} from "lucide-react";
import { C, FONTS, alpha, T } from "../styles/palette";
import Select from "./Select";
import SocietyMailModal from "./SocietyMailModal";
import { api } from "../utils/api";
import { fmtDateTime } from "../utils/format";
import { showAlert, showConfirm } from "./Dialog";
import { useApp } from "../context/AppContext";

const FORMATS = [{ key: "iprs", label: "IPRS" }, { key: "prs", label: "PRS" }, { key: "ascap", label: "ASCAP" }];
const EP_SHOWN = 10;
const NEW = "__new__";
const MAX_FILE_MB = 10; // the server refuses larger requests (MAX_BODY_SIZE_MB)

const LABEL = "block text-[0.625rem] uppercase tracking-wider mb-1";
const FIELD = "w-full px-3 py-2 rounded-lg text-sm border focus:outline-none";
const TH = "text-left text-[0.625rem] uppercase tracking-wider font-semibold px-4 py-2.5";
const fieldStyle = () => ({ borderColor: alpha(C.mint1, "44"), color: C.dark, background: C.white });
const isMovieType = (t) => String(t || "").toUpperCase() === "MOVIE";

const fmtDur = (sec) => {
  if (!sec) return "—";
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return [h, m, s].map((v) => String(v).padStart(2, "0")).join(":");
};

function FormatTag({ label }) {
  return (
    <span className="px-2 py-0.5 rounded-full text-[0.625rem] font-semibold whitespace-nowrap" style={{ background: T.blueBg, color: T.blue }}>
      {label}
    </span>
  );
}

function clientLabel(c) {
  const box = c.mailbox?.status === "connected" ? c.mailbox.email : c.mailbox ? "Gmail needs reconnecting" : "Gmail not connected";
  return `${c.name} — ${box}`;
}

// Active clients and societies for the email pickers, loaded here unless the caller already has them.
function useMailParties(given) {
  const [own, setOwn] = useState({ clients: [], societies: [] });
  const needed = !given.clients || !given.societies;
  useEffect(() => {
    if (!needed) return;
    Promise.all([api.listClients(), api.listSocieties()])
      .then(([c, s]) => setOwn({ clients: c.filter((x) => x.is_active), societies: s.filter((x) => x.is_active) }))
      .catch(() => {});
  }, [needed]);
  return needed ? own : given;
}

/**
 * The converted cue sheets saved for one serial or movie: download any range in IPRS, PRS or ASCAP
 * (or all three as a ZIP), email them to a society from the client's Gmail, or remove one.
 * `refreshKey` reloads the list; `onChanged` fires after a sheet is removed.
 */
export function ConvertedSheets({ projectId, projectTitle, projectType, refreshKey = 0, onChanged, ...given }) {
  const { pushToast } = useApp();
  const { clients, societies } = useMailParties(given);
  const movie = isMovieType(projectType);
  const [rows, setRows]       = useState(null);
  const [range, setRange]     = useState({ from: "", to: "" });
  const [clientId, setClientId]   = useState("");
  const [societyId, setSocietyId] = useState("");
  const [busy, setBusy]       = useState(null);
  const [showAll, setShowAll] = useState(false);
  const [mailRequest, setMailRequest] = useState(null);
  const [reload, setReload]   = useState(0);

  useEffect(() => {
    let live = true;
    api.projectConversions(projectId, societyId || null)
      .then((r) => { if (live) setRows(r.episodes); })
      .catch(() => { if (live) setRows([]); });
    return () => { live = false; };
  }, [projectId, societyId, refreshKey, reload]);

  // Whole saved range by default, and again whenever a new conversion changes what is saved.
  const numbers = (rows || []).map((r) => r.episode_number);
  const span = numbers.length ? `${numbers[0]}-${numbers[numbers.length - 1]}` : "";
  useEffect(() => {
    if (!span) return;
    const [a, b] = span.split("-");
    setRange({ from: a, to: b });
  }, [span]);

  // The client the sheets were converted for sends the email unless the Reviewer picks another.
  const savedClient = (rows || []).find((r) => r.client_id)?.client_id;
  useEffect(() => {
    if (savedClient && !clientId && clients.some((c) => c.id === savedClient)) setClientId(String(savedClient));
  }, [savedClient, clients]); // eslint-disable-line react-hooks/exhaustive-deps

  if (rows === null) return <div className="py-8 text-center text-sm" style={{ color: C.sub }}>Loading…</div>;
  if (!rows.length) {
    return (
      <div className="py-8 text-center text-sm" style={{ color: C.sub }}>
        No converted cue sheets saved for this {movie ? "movie" : "serial"} yet. Convert one under Projects → Conversion.
      </div>
    );
  }

  const from = movie ? 1 : parseInt(range.from, 10);
  const to   = movie ? 1 : parseInt(range.to, 10);
  const inRange = rows.filter((r) => r.episode_number >= from && r.episode_number <= to);
  const gaps = !movie && from && to && from <= to ? to - from + 1 - inRange.length : 0;
  const epWord = movie ? "the movie" : from === to ? `Ep ${from}` : `Ep ${from}–${to}`;

  const validRange = async () => {
    if (movie) return true;
    if (!from || !to || from > to) {
      await showAlert("Pick the episodes: From must be the same as or before To.", { variant: "warn" });
      return false;
    }
    return true;
  };

  const download = async (key) => {
    if (!(await validRange())) return;
    setBusy(key);
    try {
      const tail = movie ? "" : `_EP${from}-${to}`;
      const name = key === "all" ? `${projectTitle}_Converted${tail}.zip` : `${projectTitle}_${key.toUpperCase()}${tail}.xlsx`;
      const got = await api.downloadConversion(projectId, key, from, to, name);
      if (gaps > 0) {
        await showAlert(`${got} converted episode${got !== 1 ? "s" : ""} downloaded. ${gaps} episode${gaps !== 1 ? "s" : ""} in Ep ${from}–${to} ${gaps !== 1 ? "were" : "was"} never converted and ${gaps !== 1 ? "are" : "is"} not in the file.`,
          { title: "Some episodes are missing", variant: "warn" });
      }
    } catch (ex) {
      await showAlert(ex.message, { title: "Download Failed", variant: "error" });
    } finally { setBusy(null); }
  };

  const send = async () => {
    if (!(await validRange())) return;
    if (!clientId) { await showAlert("Pick the client whose Gmail sends the email.", { variant: "warn" }); return; }
    if (!societyId) { await showAlert("Pick the society to send to.", { variant: "warn" }); return; }
    setMailRequest({
      project_id: projectId, episode_from: from, episode_to: to,
      client_id: parseInt(clientId, 10), society_id: parseInt(societyId, 10), converted: true,
    });
  };

  const remove = async (r) => {
    const what = movie ? "the converted cue sheet of this movie" : `the converted cue sheet of Ep ${r.episode_number}`;
    const ok = await showConfirm(`Remove ${what}? Emails already sent stay in Submit Cue.`, { title: "Remove converted cue sheet", variant: "danger", confirmLabel: "Remove" });
    if (!ok) return;
    try {
      await api.deleteConversion(r.id);
      setReload((n) => n + 1);
      onChanged?.();
    } catch (ex) { await showAlert(ex.message, { title: "Not removed", variant: "error" }); }
  };

  const epOption = (r) => `Ep ${r.episode_number}${r.sent ? " · already sent" : ""}`;
  const shown = showAll ? rows : rows.slice(0, EP_SHOWN);

  return (
    <div className="space-y-4">
      <div className="rounded-xl p-4 space-y-3" style={{ background: alpha(C.mint4, "22"), border: `1px solid ${alpha(C.mint1, "33")}` }}>
        <div className="flex items-end gap-3 flex-wrap">
          {!movie && (
            <>
              <div className="w-36">
                <label className={LABEL} style={{ color: C.sub }}>Episode From</label>
                <Select value={range.from} onChange={(e) => setRange((r) => ({ from: e.target.value, to: parseInt(r.to, 10) >= parseInt(e.target.value, 10) ? r.to : e.target.value }))}
                  className={FIELD} style={fieldStyle()}>
                  {rows.map((r) => <option key={r.id} value={r.episode_number}>{epOption(r)}</option>)}
                </Select>
              </div>
              <div className="w-36">
                <label className={LABEL} style={{ color: C.sub }}>Episode To</label>
                <Select value={range.to} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} className={FIELD} style={fieldStyle()}>
                  {rows.filter((r) => r.episode_number >= from).map((r) => <option key={r.id} value={r.episode_number}>{epOption(r)}</option>)}
                </Select>
              </div>
            </>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {FORMATS.map(({ key, label }) => (
              <button key={key} onClick={() => download(key)} disabled={busy !== null}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium disabled:opacity-50"
                style={{ background: C.dark, color: C.mint4 }}>
                <FileDown className="w-3.5 h-3.5" />{busy === key ? "Downloading…" : `Download ${label}`}
              </button>
            ))}
            <button onClick={() => download("all")} disabled={busy !== null}
              title="One ZIP with the IPRS, PRS and ASCAP sheets"
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold disabled:opacity-50"
              style={{ background: C.mint1, color: C.dark }}>
              <Archive className="w-3.5 h-3.5" />{busy === "all" ? "Preparing ZIP…" : "Download All"}
            </button>
          </div>
        </div>
        {gaps > 0 && (
          <p className="text-xs" style={{ color: T.orange }}>
            {gaps} episode{gaps !== 1 ? "s" : ""} in Ep {from}–{to} {gaps !== 1 ? "have" : "has"} no converted cue sheet. Downloads leave {gaps !== 1 ? "them" : "it"} out; an email needs every episode of the range.
          </p>
        )}

        <div className="flex items-end gap-3 flex-wrap pt-3 border-t" style={{ borderColor: alpha(C.mint1, "33") }}>
          <div className="flex-1 min-w-[200px]">
            <label className={LABEL} style={{ color: C.sub }}>Client (sends from)</label>
            <Select value={clientId} onChange={(e) => setClientId(e.target.value)} className={FIELD} style={fieldStyle()}>
              <option value="">Select client…</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{clientLabel(c)}</option>)}
            </Select>
          </div>
          <div className="flex-1 min-w-[200px]">
            <label className={LABEL} style={{ color: C.sub }}>Society (sends to)</label>
            <Select value={societyId} onChange={(e) => setSocietyId(e.target.value)} className={FIELD} style={fieldStyle()}>
              <option value="">{societies.length ? "Select society…" : "No societies yet — add one under Societies"}</option>
              {societies.map((s) => <option key={s.id} value={s.id}>{s.name} — {s.to_emails.join(", ")}</option>)}
            </Select>
          </div>
          <button onClick={send}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap"
            style={{ background: C.dark, color: C.mint4 }}>
            <Mail className="w-4 h-4" /> Preview Email
          </button>
        </div>
        <p className="text-xs" style={{ color: C.sub }}>
          Emails {epWord} from the client's Gmail to the society, the same way as Submit Cue. You see and can edit the email before it is sent.
        </p>
      </div>

      <div className="rounded-xl border overflow-hidden" style={{ background: C.white, borderColor: alpha(C.mint1, "44") }}>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b" style={{ borderColor: alpha(C.mint4, "44"), color: C.sub, background: alpha(C.mint4, "22") }}>
              {!movie && <th className={TH}>Episode</th>}
              <th className={TH}>Songs</th>
              <th className={TH}>Duration</th>
              <th className={TH}>Converted from</th>
              <th className={TH}>Client</th>
              <th className={TH}>Converted</th>
              <th className={TH} />
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.id} className="border-b last:border-0" style={{ borderColor: alpha(C.mint4, "33") }}>
                {!movie && (
                  <td className="px-4 py-2.5 font-medium whitespace-nowrap" style={{ color: C.dark }}>
                    Ep {r.episode_number}
                    {r.sent && <span className="ml-2 text-[0.625rem] font-semibold" style={{ color: T.green }}>sent</span>}
                  </td>
                )}
                <td className="px-4 py-2.5 text-xs" style={{ color: C.sub }}>{r.cues}</td>
                <td className="px-4 py-2.5 text-xs font-mono" style={{ color: C.sub }}>{fmtDur(r.duration_sec)}</td>
                <td className="px-4 py-2.5 text-xs" style={{ color: C.sub }}>
                  <FormatTag label={r.source_label} />
                  {r.source_filename && <div className="mt-1 max-w-[260px] truncate" title={r.source_filename}>{r.source_filename}</div>}
                </td>
                <td className="px-4 py-2.5 text-xs" style={{ color: C.sub }}>{r.client || "—"}</td>
                <td className="px-4 py-2.5 text-xs" style={{ color: C.sub }}>
                  {fmtDateTime(r.converted_at)}{r.converted_by ? <div>by {r.converted_by}</div> : null}
                </td>
                <td className="px-4 py-2.5 text-right">
                  <button onClick={() => remove(r)} title="Remove this converted cue sheet" className="p-1.5 rounded-lg hover:opacity-70" style={{ color: C.danger }}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length > EP_SHOWN && (
          <button onClick={() => setShowAll((v) => !v)} className="w-full px-4 py-2 border-t text-xs font-medium"
            style={{ borderColor: alpha(C.mint4, "44"), color: C.sub }}>
            {showAll ? "Show fewer" : `Show all ${rows.length} episodes`}
          </button>
        )}
      </div>

      {mailRequest && (
        <SocietyMailModal request={mailRequest} onClose={() => setMailRequest(null)}
          onSent={(row) => {
            pushToast({ kind: "success", title: `Emailed to ${row.society_name}`, body: `${row.project_title} · ${epWord} from ${row.mail_from}` });
            setReload((n) => n + 1);
          }} />
      )}
    </div>
  );
}

// What the file holds, before anything is saved.
function Preview({ preview, picked, setPicked, confirmed, setConfirmed, movie }) {
  const eps = preview.episodes;
  const all = eps.length > 0 && eps.every((e) => picked.has(e.episode_number));
  const toggle = (n) => setPicked((prev) => { const next = new Set(prev); if (next.has(n)) next.delete(n); else next.add(n); return next; });
  const replaces = eps.filter((e) => e.already_converted && picked.has(e.episode_number)).length;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap text-sm" style={{ color: C.dark }}>
        <FileSpreadsheet className="w-4 h-4" style={{ color: C.sub }} />
        <span className="font-medium">{preview.filename}</span>
        <FormatTag label={`${preview.format_label} format`} />
        <span className="text-xs" style={{ color: C.sub }}>
          {movie ? "1 cue sheet" : `${eps.length} episode${eps.length !== 1 ? "s" : ""}`}
          {preview.sheet_title ? ` · titled "${preview.sheet_title}"` : ""}
        </span>
      </div>

      <div className="rounded-lg px-4 py-3 text-xs flex items-start gap-2" style={{ background: T.greenBg, color: T.green }}>
        <Repeat className="w-4 h-4 shrink-0 mt-0.5" />
        <div>
          You get all three: IPRS, PRS and ASCAP. The {preview.format_label} sheet is rebuilt from what CueSync read, so check it against your file.
        </div>
      </div>

      {preview.title_mismatch && (
        <div className="rounded-lg px-4 py-3 text-sm" style={{ background: T.amberBg, color: T.orangeDeep, border: `1px solid ${T.amberBorder}` }}>
          <div className="font-semibold flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> This file is titled "{preview.sheet_title}", not "{preview.project.title}"</div>
          <label className="flex items-center gap-2 mt-2 text-xs cursor-pointer">
            <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
            It is the right file, the name is just written differently. Save it under {preview.project.title}.
          </label>
        </div>
      )}

      {preview.notes.length > 0 && (
        <div className="rounded-lg px-4 py-3 text-xs space-y-1" style={{ background: T.blueBg, color: T.blue }}>
          <div className="font-semibold flex items-center gap-2"><Info className="w-4 h-4" /> What a {preview.format_label} sheet can't tell the other formats</div>
          {preview.notes.map((n) => <div key={n}>• {n}</div>)}
        </div>
      )}

      <div className="rounded-xl border overflow-hidden" style={{ background: C.white, borderColor: alpha(C.mint1, "44") }}>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b" style={{ borderColor: alpha(C.mint4, "44"), color: C.sub, background: alpha(C.mint4, "22") }}>
              {!movie && (
                <th className="px-4 py-2.5 w-10">
                  <input type="checkbox" checked={all} title="Select all"
                    onChange={() => setPicked(all ? new Set() : new Set(eps.map((e) => e.episode_number)))} />
                </th>
              )}
              <th className={TH}>{movie ? "Cue sheet" : "Episode"}</th>
              <th className={TH}>Songs</th>
              <th className={TH}>Duration</th>
              <th className={TH}>Aired</th>
              <th className={TH}>What saving does</th>
            </tr>
          </thead>
          <tbody>
            {eps.map((e) => (
              <tr key={e.episode_number} className="border-b last:border-0" style={{ borderColor: alpha(C.mint4, "33") }}>
                {!movie && (
                  <td className="px-4 py-2.5"><input type="checkbox" checked={picked.has(e.episode_number)} onChange={() => toggle(e.episode_number)} /></td>
                )}
                <td className="px-4 py-2.5 font-medium whitespace-nowrap" style={{ color: C.dark }}>
                  {movie ? preview.project.title : `Ep ${e.episode_number}`}
                  {e.title && <span className="ml-2 text-xs font-normal" style={{ color: C.sub }}>{e.title}</span>}
                </td>
                <td className="px-4 py-2.5 text-xs" style={{ color: C.sub }}>{e.cues}</td>
                <td className="px-4 py-2.5 text-xs font-mono" style={{ color: C.sub }}>{fmtDur(e.duration_sec)}</td>
                <td className="px-4 py-2.5 text-xs" style={{ color: C.sub }}>{e.air_date || "—"}</td>
                <td className="px-4 py-2.5 text-xs" style={{ color: C.sub }}>
                  {e.already_converted
                    ? <span style={{ color: T.orange }}>Replaces the conversion saved earlier</span>
                    : <span style={{ color: T.green }}>New</span>}
                  {e.cue_sheet_status && (
                    <div>{movie ? "This movie" : `Ep ${e.episode_number}`} also has a cue sheet made in CueSync ({e.cue_sheet_status === "pending" ? "draft" : e.cue_sheet_status}). It is not changed.</div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {preview.skipped.length > 0 && (
        <div className="text-xs space-y-0.5" style={{ color: T.orange }}>
          <div className="font-semibold">Sheets left out</div>
          {preview.skipped.map((s) => <div key={s.sheet + s.reason}>• {s.sheet}: {s.reason}</div>)}
        </div>
      )}
      {replaces > 0 && (
        <div className="text-xs" style={{ color: T.orange }}>
          {movie ? "The conversion saved earlier for this movie is replaced." : `${replaces} episode${replaces !== 1 ? "s" : ""} converted earlier ${replaces !== 1 ? "are" : "is"} replaced by this file.`}
        </div>
      )}
    </div>
  );
}

function SavedGroup({ group, open, onToggle, clients, societies, refreshKey, onChanged, anchor }) {
  const Icon = isMovieType(group.project_type) ? Film : Layers;
  return (
    <div ref={anchor} className="rounded-xl border overflow-hidden" style={{ background: C.white, borderColor: alpha(C.mint1, "44") }}>
      <button onClick={onToggle} className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left"
        style={{ background: alpha(C.mint4, "22") }}>
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          <Icon className="w-3.5 h-3.5 shrink-0" style={{ color: C.mint1 }} />
          <span className="font-semibold text-sm" style={{ color: C.dark }}>{group.project_title}</span>
          <span className="text-[0.625rem] px-2 py-0.5 rounded-full" style={{ background: alpha(C.mint1, "33"), color: C.sub }}>
            {isMovieType(group.project_type) ? "Movie" : `Ep ${group.episodes} · ${group.episode_count} episode${group.episode_count !== 1 ? "s" : ""}`}
          </span>
          {group.formats.map((f) => <FormatTag key={f} label={`from ${f}`} />)}
          {group.clients.length > 0 && <span className="text-xs" style={{ color: C.sub }}>{group.clients.join(", ")}</span>}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-xs hidden sm:inline" style={{ color: C.sub }}>{fmtDateTime(group.last_converted_at)}</span>
          <ChevronDown className="w-4 h-4 transition-transform" style={{ color: C.sub, transform: open ? "rotate(180deg)" : "" }} />
        </div>
      </button>
      {open && (
        <div className="p-4 border-t" style={{ borderColor: alpha(C.mint4, "44") }}>
          <ConvertedSheets projectId={group.project_id} projectTitle={group.project_title} projectType={group.project_type}
            clients={clients} societies={societies} refreshKey={refreshKey} onChanged={onChanged} />
        </div>
      )}
    </div>
  );
}

/** Projects → Conversion: upload one of IPRS / PRS / ASCAP for a serial or movie and get all three. */
export default function ConversionTab() {
  const { pushToast } = useApp();
  const [projects, setProjects]   = useState([]);
  const [clients, setClients]     = useState([]);
  const [societies, setSocieties] = useState([]);
  const [saved, setSaved]         = useState(null);
  const [form, setForm] = useState({ type: "serial", project_id: "", client_id: "" });
  const [newTitle, setNewTitle]   = useState("");
  const [adding, setAdding]       = useState(false);
  const [file, setFile]           = useState(null);
  const [preview, setPreview]     = useState(null);
  const [picked, setPicked]       = useState(new Set());
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy]           = useState(null);   // "preview" | "save"
  const [openId, setOpenId]       = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const fileInput = useRef(null);
  const openAnchor = useRef(null);

  const loadSaved = () => api.listConversions().then(setSaved).catch(() => setSaved([]));

  useEffect(() => {
    api.projects().then(setProjects).catch(() => {});
    api.listClients().then((c) => setClients(c.filter((x) => x.is_active))).catch(() => {});
    api.listSocieties().then((s) => setSocieties(s.filter((x) => x.is_active))).catch(() => {});
    loadSaved();
  }, []);

  const movie = form.type === "movie";
  const word = movie ? "movie" : "serial";
  const options = projects.filter((p) => isMovieType(p.type) === movie).sort((a, b) => a.title.localeCompare(b.title));
  const isNew = form.project_id === NEW;
  const project = projects.find((p) => String(p.id) === String(form.project_id));

  const clearFile = () => {
    setFile(null); setPreview(null); setPicked(new Set()); setConfirmed(false);
    if (fileInput.current) fileInput.current.value = "";
  };
  const setType = (type) => { setForm((f) => ({ ...f, type, project_id: "" })); setNewTitle(""); clearFile(); };
  const setProject = (project_id) => { setForm((f) => ({ ...f, project_id })); clearFile(); };

  const addProject = async () => {
    const title = newTitle.trim();
    if (!title) { await showAlert(`Enter the ${word} title.`, { variant: "warn" }); return; }
    setAdding(true);
    try {
      const p = await api.createConversionProject({ title, type: form.type });
      setProjects((prev) => (prev.some((x) => x.id === p.id) ? prev : [...prev, p]));
      setForm((f) => ({ ...f, project_id: String(p.id) }));
      setNewTitle("");
      if (p.existing) pushToast({ kind: "info", title: `${p.title} already exists`, body: `It is picked for you instead of adding a second ${word}.` });
    } catch (ex) {
      await showAlert(ex.message, { title: "Not added", variant: "error" });
    } finally { setAdding(false); }
  };

  const chooseFile = async (f) => {
    if (!f) return;
    if (f.size > MAX_FILE_MB * 1024 * 1024) {
      clearFile();
      await showAlert(`This file is larger than ${MAX_FILE_MB} MB. Split it into fewer episodes and convert each part.`, { title: "File too large", variant: "warn" });
      return;
    }
    setFile(f); setPreview(null); setConfirmed(false);
    setBusy("preview");
    try {
      const p = await api.previewConversion(form.project_id, f);
      setPreview(p);
      setPicked(new Set(p.episodes.map((e) => e.episode_number)));
    } catch (ex) {
      clearFile();
      await showAlert(ex.message, { title: "This file can't be converted", variant: "error" });
    } finally { setBusy(null); }
  };

  const save = async () => {
    setBusy("save");
    try {
      const res = await api.saveConversion(form.project_id, form.client_id, file, [...picked], confirmed);
      const what = movie ? res.project_title : `${res.project_title} · Ep ${res.saved.length === 1 ? res.saved[0] : `${res.episode_from}–${res.episode_to}`}`;
      pushToast({ kind: "success", title: "Converted to IPRS, PRS and ASCAP", body: `${what} is saved. Download or email it below.` });
      clearFile();
      await loadSaved();
      setRefreshKey((n) => n + 1);
      setOpenId(res.project_id);
      setTimeout(() => openAnchor.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    } catch (ex) {
      await showAlert(ex.message, { title: "Not saved", variant: "error" });
    } finally { setBusy(null); }
  };

  const ready = !!project && !!form.client_id;
  const blocked = !preview ? "" : !picked.size ? "Tick at least one episode."
    : preview.title_mismatch && !confirmed ? "Confirm the file belongs to this title." : "";
  const count = picked.size;

  return (
    <div className="space-y-6">
      <div className="rounded-xl border p-5" style={{ background: C.white, borderColor: alpha(C.mint1, "44") }}>
        <h4 className="text-sm font-semibold" style={{ fontFamily: FONTS.serif, color: C.dark }}>Convert a cue sheet</h4>
        <p className="text-xs mb-4 mt-0.5" style={{ color: C.sub }}>
          Upload a finished cue sheet in IPRS, PRS or ASCAP format and get it in all three. It is saved under the serial or movie, so you can download or email it again later.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
          <div>
            <label className={LABEL} style={{ color: C.sub }}>1 · Type</label>
            <Select value={form.type} onChange={(e) => setType(e.target.value)} className={FIELD} style={fieldStyle()}>
              <option value="serial">Serial</option>
              <option value="movie">Movie</option>
            </Select>
          </div>
          <div>
            <label className={LABEL} style={{ color: C.sub }}>2 · {movie ? "Movie" : "Serial"}</label>
            <Select value={form.project_id} onChange={(e) => setProject(e.target.value)} className={FIELD} style={fieldStyle()}
              placeholder={`Select ${word}…`} searchable searchPlaceholder={`Search ${word}s…`}>
              <option value={NEW} data-keep>+ Add a new {word}</option>
              {options.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
            </Select>
          </div>
          <div>
            <label className={LABEL} style={{ color: C.sub }}>3 · Client</label>
            <Select value={form.client_id} onChange={(e) => setForm((f) => ({ ...f, client_id: e.target.value }))} className={FIELD} style={fieldStyle()}
              placeholder={clients.length ? "Select client…" : "No clients yet — add one under Clients"}
              searchable searchPlaceholder="Search clients…">
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </div>
        </div>

        {isNew && (
          <div className="flex items-end gap-2 flex-wrap mb-3 p-3 rounded-lg" style={{ background: alpha(C.mint4, "33") }}>
            <div className="flex-1 min-w-[220px]">
              <label className={LABEL} style={{ color: C.sub }}>New {word} title</label>
              <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} autoFocus maxLength={255}
                onKeyDown={(e) => { if (e.key === "Enter") addProject(); }}
                placeholder={movie ? "Movie title as written on the cue sheet" : "Serial title as written on the cue sheet"}
                className={FIELD} style={fieldStyle()} />
            </div>
            <button onClick={addProject} disabled={adding}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
              style={{ background: C.dark, color: C.mint4 }}>
              <Plus className="w-4 h-4" />{adding ? "Adding…" : `Add ${word}`}
            </button>
          </div>
        )}

        <div>
          <label className={LABEL} style={{ color: C.sub }}>4 · Cue sheet file (IPRS, PRS or ASCAP)</label>
          <input ref={fileInput} type="file" accept=".xlsx,.xls,.xlsm" className="hidden" onChange={(e) => chooseFile(e.target.files?.[0])} />
          <div className="flex items-center gap-3 flex-wrap">
            <button onClick={() => fileInput.current?.click()} disabled={!ready || busy !== null}
              title={ready ? "Excel file, one sheet per episode" : `Pick the ${word} and the client first`}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: C.mint4, color: C.dark, border: `1px dashed ${C.mint1}` }}>
              <FileUp className="w-4 h-4" />{busy === "preview" ? "Reading the file…" : file ? "Choose another file" : "Choose file"}
            </button>
            {!ready && <span className="text-xs" style={{ color: C.sub }}>Pick the {word} and the client first.</span>}
            {ready && !file && <span className="text-xs" style={{ color: C.sub }}>.xlsx or .xls{movie ? "" : ", one sheet per episode"}. CueSync works out which format it is.</span>}
            {file && preview && (
              <button onClick={clearFile} className="inline-flex items-center gap-1 text-xs" style={{ color: C.sub }}>
                <X className="w-3 h-3" /> Clear
              </button>
            )}
          </div>
        </div>

        {preview && (
          <div className="mt-5 pt-5 border-t space-y-4" style={{ borderColor: alpha(C.mint4, "66") }}>
            <Preview preview={preview} picked={picked} setPicked={setPicked} confirmed={confirmed} setConfirmed={setConfirmed} movie={movie} />
            <div className="flex items-center gap-3 flex-wrap">
              <button onClick={save} disabled={busy !== null || !!blocked}
                className="inline-flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold disabled:opacity-40"
                style={{ background: C.dark, color: C.mint4 }}>
                <CheckCircle2 className="w-4 h-4" />
                {busy === "save" ? "Converting…" : movie ? "Convert and save" : `Convert and save ${count} episode${count !== 1 ? "s" : ""}`}
              </button>
              {blocked && <span className="text-xs" style={{ color: T.orange }}>{blocked}</span>}
            </div>
          </div>
        )}
      </div>

      <div>
        <h4 className="text-sm font-semibold mb-3" style={{ fontFamily: FONTS.serif, color: C.dark }}>Saved conversions</h4>
        {saved === null ? (
          <div className="py-8 text-center text-sm" style={{ color: C.sub }}>Loading…</div>
        ) : saved.length === 0 ? (
          <div className="py-8 text-center text-sm" style={{ color: C.sub }}>Nothing converted yet.</div>
        ) : (
          <div className="space-y-3">
            {saved.map((g) => (
              <SavedGroup key={g.project_id} group={g} open={openId === g.project_id}
                anchor={openId === g.project_id ? openAnchor : null}
                onToggle={() => setOpenId((id) => (id === g.project_id ? null : g.project_id))}
                clients={clients} societies={societies} refreshKey={refreshKey} onChanged={loadSaved} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
