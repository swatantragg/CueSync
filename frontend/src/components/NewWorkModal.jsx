import { useEffect, useState } from "react";
import {
  AlertTriangle, Check, CheckCircle2, ChevronDown, ChevronRight, Clapperboard, Lock, MailCheck, MailQuestion, Minus, Pencil,
  SkipForward, Trash2, Tv, Undo2, X,
} from "lucide-react";
import { C, FONTS, alpha, T } from "../styles/palette";
import Select from "./Select";
import Timeline from "./Timeline";
import { StageBadge } from "./NewWorkSummary";
import { showAlert, showConfirm } from "./Dialog";
import { api } from "../utils/api";
import { fmtDateTime } from "../utils/format";
import { daysLabel } from "../utils/newWork";
import { useApp } from "../context/AppContext";

// One new movie or TV show, as three steps: BGM received → fingerprinting → cue sheet work.
// A step stays locked until the one before it is completed or skipped with a reason; the server enforces the same.

const TYPES = [["movie", "Movie", Clapperboard], ["tv_show", "TV Show", Tv]];
const MIN_REASON = 5;
const LINE = alpha(C.mint1, "55");
const field = "w-full px-3 py-2 rounded-lg text-sm border focus:outline-none";
const fieldStyle = { background: C.white, color: C.dark, borderColor: alpha(C.mint1, "88") };
const label = "block text-[0.6875rem] font-semibold mb-1";

function Btn({ kind = "plain", children, ...rest }) {
  const style = kind === "dark" ? { background: C.dark, color: C.mint4 }
    : kind === "danger" ? { background: T.redBg, color: T.red }
    : kind === "link" ? { color: C.sub }
    : { background: C.mint4, color: C.dark };
  return (
    <button type="button" {...rest}
      className={`inline-flex items-center gap-1.5 rounded-lg text-xs font-semibold whitespace-nowrap hover:opacity-85 disabled:opacity-40 disabled:cursor-not-allowed ${kind === "link" ? "hover:underline" : "px-3 py-1.5"}`}
      style={style}>
      {children}
    </button>
  );
}

// A big tick box with its label, e.g. "BGM Received".
function Tick({ checked, disabled, onChange, children, hint }) {
  return (
    <label className={`flex items-start gap-2.5 ${disabled ? "cursor-not-allowed" : "cursor-pointer"}`} title={disabled ? hint : undefined}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 w-[18px] h-[18px] shrink-0" style={{ accentColor: C.ok }} />
      <span className="text-sm font-semibold" style={{ color: disabled && !checked ? C.muted : C.dark }}>{children}</span>
    </label>
  );
}

// "Skip this step" → asks why before it does anything.
function SkipStep({ what, onSkip, busy }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  if (!open) return <Btn kind="link" onClick={() => setOpen(true)}><SkipForward className="w-3.5 h-3.5" /> Skip this step</Btn>;
  const ok = reason.trim().length >= MIN_REASON;
  return (
    <div className="w-full rounded-lg border p-3" style={{ borderColor: T.amberBorder, background: T.amberBg }}>
      <label className={label} style={{ color: C.dark }}>Why is {what} being skipped? The reason is saved in the tracking log.</label>
      <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} autoFocus placeholder="Reason for skipping…"
        className={`${field} resize-none`} style={fieldStyle} />
      <div className="flex flex-wrap justify-end gap-2 mt-2">
        <Btn kind="link" onClick={() => { setOpen(false); setReason(""); }}>Cancel</Btn>
        <Btn kind="dark" disabled={!ok || busy} onClick={() => onSkip(reason.trim())}><SkipForward className="w-3.5 h-3.5" /> Skip step</Btn>
      </div>
    </div>
  );
}

function StepCard({ n, title, state, locked, lockedText, badge, children }) {
  // state: done | skipped | current | locked
  const tone = state === "done" ? [T.green, T.greenBg] : state === "skipped" ? [T.grayMid, T.grayBg] : state === "locked" ? [C.muted, "transparent"] : [C.dark, C.mint4];
  const Icon = state === "done" ? Check : state === "skipped" ? Minus : state === "locked" ? Lock : null;
  return (
    <section className="rounded-xl border" style={{ background: C.white, borderColor: state === "current" ? C.mid : LINE, opacity: locked ? 0.72 : 1 }}>
      <header className="px-4 py-3 flex items-center gap-3">
        <span className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
          style={{ background: tone[1], color: tone[0], border: `1.5px solid ${tone[0]}` }}>
          {Icon ? <Icon className="w-3.5 h-3.5" /> : n}
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-[0.625rem] font-bold uppercase tracking-widest" style={{ color: C.sub }}>Step {n}</div>
          <div className="text-sm font-semibold" style={{ color: C.dark }}>{title}</div>
        </div>
        <span className="text-[0.625rem] font-semibold px-2 py-0.5 rounded whitespace-nowrap" style={{ background: tone[1], color: tone[0] }}>
          {badge || (state === "done" ? "Completed" : state === "skipped" ? "Skipped" : state === "locked" ? "Locked" : "Open")}
        </span>
      </header>
      {locked
        ? <div className="px-4 pb-3.5 pl-14 flex items-center gap-1.5 text-xs" style={{ color: C.sub }}><Lock className="w-3 h-3 shrink-0" /> {lockedText}</div>
        : <div className="px-4 pb-4 sm:pl-14 space-y-3">{children}</div>}
    </section>
  );
}

const Fact = ({ children }) => <div className="text-xs" style={{ color: C.sub }}>{children}</div>;

function Skipped({ by, at, reason, onReopen, canReopen, why }) {
  return (
    <>
      <Fact>Skipped{by ? ` by ${by}` : ""}{at ? ` on ${fmtDateTime(at)}` : ""}.</Fact>
      <div className="text-xs rounded-lg px-3 py-2" style={{ background: T.grayBg, color: C.dark }}><b>Reason:</b> {reason}</div>
      {onReopen && <Btn kind="link" disabled={!canReopen} title={canReopen ? undefined : why} onClick={onReopen}><Undo2 className="w-3.5 h-3.5" /> Reopen this step</Btn>}
    </>
  );
}

// ─── Step 1 ──────────────────────────────────────────────────────────────────
function BgmStep({ w, act, busy, canEdit }) {
  const b = w.bgm;
  const fpStarted = w.fingerprint.status !== "not_assigned";
  const why = "Fingerprinting has already started. Unassign or reopen it first.";
  const state = b.state === "received" ? "done" : b.state === "skipped" ? "skipped" : "current";
  return (
    <StepCard n={1} title="BGM received" state={state}>
      {b.state === "skipped" ? (
        <Skipped by={b.by_name} at={b.at} reason={b.skip_reason} canReopen={!fpStarted} why={why}
          onReopen={canEdit ? () => act(() => api.newWorkReopen(w.id, "bgm")) : null} />
      ) : (
        <>
          <Tick checked={b.received} disabled={busy || !canEdit || (b.received && fpStarted)} hint={b.received ? why : undefined}
            onChange={(on) => act(() => api.newWorkBgm(w.id, on))}>
            BGM Received
          </Tick>
          <Fact>
            {b.received
              ? `Received on ${fmtDateTime(b.at)}${b.by_name ? `, ticked by ${b.by_name}` : ""}.`
              : `Awaiting BGM for ${daysLabel(w.days_in_stage) || "0 days"}. Tick the box when the BGM arrives; the date is recorded automatically.`}
          </Fact>
          {!b.received && canEdit && <SkipStep what="the BGM step" busy={busy} onSkip={(reason) => act(() => api.newWorkSkip(w.id, "bgm", reason))} />}
        </>
      )}
    </StepCard>
  );
}

// ─── Step 2 ──────────────────────────────────────────────────────────────────
function MailBox({ w, mail, act, busy, canEdit }) {
  const linked = w.fingerprint.mail;
  const [pick, setPick] = useState("");
  const waiting = mail?.unlinked || [];
  if (linked) {
    return (
      <div className="rounded-lg border px-3 py-2.5 flex items-start gap-2.5" style={{ borderColor: T.greenBorder, background: T.greenBg }}>
        <MailCheck className="w-4 h-4 mt-0.5 shrink-0" style={{ color: T.green }} />
        <div className="flex-1 min-w-0 text-xs" style={{ color: C.dark }}>
          <div className="font-semibold break-words">Email received {fmtDateTime(linked.received_at)}: “{linked.subject}”</div>
          <div style={{ color: C.sub }}>
            {linked.from}{linked.auto ? " · matched to this work automatically by its title" : linked.linked_by_name ? ` · linked by ${linked.linked_by_name}` : ""}
          </div>
        </div>
        {canEdit && w.fingerprint.status !== "completed" && (
          <Btn kind="link" disabled={busy} onClick={() => act(() => api.newWorkLinkMail(w.id, null))}>Not this work</Btn>
        )}
      </div>
    );
  }
  return (
    <div className="rounded-lg border px-3 py-2.5" style={{ borderColor: T.amberBorder, background: T.amberBg }}>
      <div className="flex items-start gap-2.5">
        <MailQuestion className="w-4 h-4 mt-0.5 shrink-0" style={{ color: T.orange }} />
        <div className="flex-1 min-w-0 text-xs" style={{ color: C.dark }}>
          <div className="font-semibold break-words">
            No email yet from {mail?.sender_name || "the fingerprinting service"} &lt;{mail?.sender}&gt; on {mail?.mailbox}
          </div>
          <div style={{ color: C.sub }}>
            {mail?.connected
              ? "The Fingerprinting Completed box unlocks when an email naming this title arrives."
              : "That mailbox is not connected to CueSync yet, so emails can't be seen. An Admin connects it once under New Work → BMAT emails."}
          </div>
        </div>
      </div>
      {canEdit && waiting.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mt-2 pl-6">
          <Select value={pick} onChange={(e) => setPick(e.target.value)} className="px-2.5 py-1.5 rounded-lg text-xs border min-w-56 max-w-full" style={fieldStyle}
            placeholder="An email arrived but wasn't matched? Pick it…">
            {waiting.map((m) => <option key={m.id} value={m.id}>{`${new Date(m.received_at).toLocaleDateString()} · ${m.subject}`}</option>)}
          </Select>
          <Btn disabled={!pick || busy} onClick={() => act(() => api.newWorkLinkMail(w.id, Number(pick)))}>Link this email</Btn>
        </div>
      )}
    </div>
  );
}

export function FingerprintDone({ w, mailInfo, act, busy }) {
  // The box is enabled by the service's email, or by saying where the fingerprinting came from.
  const [note, setNote] = useState("");
  const fp = w.fingerprint;
  const hasNote = note.trim().length >= MIN_REASON;
  const unlocked = fp.status !== "not_assigned" && (!!fp.mail || hasNote);
  const sender = mailInfo?.sender_name || "BMAT Vericast Team";
  return (
    <div className="space-y-2">
      {!fp.mail && (
        <div>
          <label className={label} style={{ color: C.dark }}>
            Didn't get the {sender} email? Say where the fingerprinting came from to enable the box.
          </label>
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} disabled={busy || fp.status === "not_assigned"}
            placeholder="e.g. Report downloaded from the Vericast portal; sent on WhatsApp by…" className={field} style={fieldStyle} />
        </div>
      )}
      <Tick checked={false} disabled={busy || !unlocked}
        hint={fp.status === "not_assigned" ? "Assign the fingerprinting to someone first." : `Waiting for the ${sender} email, or type where the fingerprinting came from.`}
        onChange={() => act(() => api.newWorkFingerprintDone(w.id, fp.mail ? null : note.trim()))}>
        Fingerprinting Completed
      </Tick>
      <Fact>
        {fp.status === "not_assigned" ? "Assign it to someone first."
          : fp.mail ? "The email has arrived, so the box is enabled. The completion date is recorded automatically."
          : hasNote ? "Enabled by your note. It is saved as a manual entry in the tracking log."
          : "Locked until the email arrives, or until you say where the fingerprinting came from."}
      </Fact>
    </div>
  );
}

function FingerprintStep({ w, mail, editors, act, busy, canEdit }) {
  const fp = w.fingerprint;
  const locked = w.locked.fingerprint;
  const cueStarted = w.cue.status !== "not_assigned";
  const state = locked ? "locked" : fp.status === "completed" ? "done" : fp.status === "skipped" ? "skipped" : "current";
  const why = "The cue sheet step has already started. Remove its allotment or reopen it first.";
  const reopen = canEdit ? () => act(() => api.newWorkReopen(w.id, "fingerprint")) : null;
  const options = editors.some((e) => e.id === fp.assigned_to) || !fp.assigned_to ? editors : [...editors, { id: fp.assigned_to, full_name: `${fp.assigned_to_name || "Unknown"} (inactive)` }];
  return (
    <StepCard n={2} title="Fingerprinting" state={state} locked={locked} lockedText="Opens when the BGM is received, or that step is skipped.">
      {fp.status === "skipped" ? (
        <Skipped by={fp.done_by_name} at={fp.done_at} reason={fp.skip_reason} canReopen={!cueStarted} why={why} onReopen={reopen} />
      ) : fp.status === "completed" ? (
        <>
          <Tick checked disabled onChange={() => {}}>Fingerprinting Completed</Tick>
          <Fact>
            Completed on {fmtDateTime(fp.done_at)}{fp.done_by_name ? `, ticked by ${fp.done_by_name}` : ""}.
            {fp.assigned_to_name ? ` Done by ${fp.assigned_to_name}, assigned ${fmtDateTime(fp.assigned_at)}.` : ""}
          </Fact>
          {fp.source === "manual"
            ? <div className="text-xs rounded-lg px-3 py-2" style={{ background: T.amberBg, color: C.dark }}><b>Manual entry, no email.</b> Fingerprinting came from: {fp.source_note}</div>
            : fp.mail && <MailBox w={w} mail={mail} act={act} busy={busy} canEdit={false} />}
          {reopen && <Btn kind="link" disabled={cueStarted} title={cueStarted ? why : undefined} onClick={reopen}><Undo2 className="w-3.5 h-3.5" /> Reopen this step</Btn>}
        </>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={label} style={{ color: C.sub }}>Assign fingerprinting to</label>
              <Select value={fp.assigned_to ? String(fp.assigned_to) : ""} disabled={busy || !canEdit} className={field} style={fieldStyle}
                onChange={(e) => act(() => api.newWorkAssignFingerprint(w.id, e.target.value ? Number(e.target.value) : null))}>
                <option value="">Not assigned</option>
                {options.map((e) => <option key={e.id} value={e.id}>{e.full_name}</option>)}
              </Select>
            </div>
            <div>
              <label className={label} style={{ color: C.sub }}>Fingerprinting status</label>
              <Select value={fp.status} disabled={busy || fp.status === "not_assigned"} className={field} style={fieldStyle}
                onChange={(e) => act(() => api.newWorkFingerprintStatus(w.id, e.target.value))}>
                {fp.status === "not_assigned" && <option value="not_assigned">Not assigned</option>}
                <option value="assigned">Assigned</option>
                <option value="in_progress">In progress</option>
              </Select>
            </div>
          </div>
          {fp.assigned_to && (
            <Fact>
              Assigned to {fp.assigned_to_name}{fp.assigned_by_name ? ` by ${fp.assigned_by_name}` : ""} on {fmtDateTime(fp.assigned_at)}.
              {fp.started_at ? ` In progress since ${fmtDateTime(fp.started_at)}.` : ""}
            </Fact>
          )}
          <MailBox w={w} mail={mail} act={act} busy={busy} canEdit={canEdit} />
          <FingerprintDone w={w} mailInfo={mail} act={act} busy={busy} />
          {canEdit && <SkipStep what="fingerprinting" busy={busy} onSkip={(reason) => act(() => api.newWorkSkip(w.id, "fingerprint", reason))} />}
        </>
      )}
    </StepCard>
  );
}

// ─── Step 3 ──────────────────────────────────────────────────────────────────
function CueStep({ w, editors, clients, act, busy, canEdit }) {
  const cue = w.cue;
  const movie = w.work_type === "movie";
  const [form, setForm] = useState({ assigned_to: "", client_id: "", channel: "", episode_range: "", week_target: "", notes: "" });
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const locked = w.locked.cue;
  const state = locked ? "locked" : cue.status === "completed" ? "done" : cue.status === "skipped" ? "skipped" : "current";

  const allot = () => act(() => api.newWorkAllot(w.id, {
    assigned_to: Number(form.assigned_to),
    client_id: form.client_id ? Number(form.client_id) : null,
    channel: form.channel.trim() || null,
    episode_range: form.episode_range.trim() || null,
    week_target: form.week_target ? parseInt(form.week_target, 10) : null,
    notes: form.notes.trim() || null,
  }), "allot");

  return (
    <StepCard n={3} title="Cue sheet work delegation" state={state} locked={locked} lockedText="Opens when fingerprinting is completed, or that step is skipped."
      badge={["assigned", "in_progress"].includes(cue.status) ? cue.status_label : null}>
      {cue.status === "skipped" ? (
        <Skipped at={cue.done_at} reason={cue.skip_reason} canReopen
          onReopen={canEdit ? () => act(() => api.newWorkReopen(w.id, "cue")) : null} />
      ) : cue.status === "not_assigned" ? (
        canEdit ? (
          <>
            <Fact>Cue sheet allocation has been pending for {daysLabel(w.days_in_stage) || "0 days"}. Allotting it creates the {movie ? "movie" : "serial"} and gives the editor the work, the same as New Delegation.</Fact>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={label} style={{ color: C.sub }}>Assign cue sheet work to *</label>
                <Select value={form.assigned_to} onChange={set("assigned_to")} className={field} style={fieldStyle} placeholder="Select editor…">
                  {editors.map((e) => <option key={e.id} value={e.id}>{e.full_name}</option>)}
                </Select>
              </div>
              <div>
                <label className={label} style={{ color: C.sub }}>Client</label>
                <Select value={form.client_id} onChange={set("client_id")} className={field} style={fieldStyle}>
                  <option value="">No client</option>
                  {clients.filter((c) => c.is_active).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
              </div>
              {!movie && (
                <>
                  <div>
                    <label className={label} style={{ color: C.sub }}>Channel</label>
                    <input value={form.channel} onChange={set("channel")} placeholder="TV channel" className={field} style={fieldStyle} />
                  </div>
                  <div>
                    <label className={label} style={{ color: C.sub }}>Episode range</label>
                    <input value={form.episode_range} onChange={set("episode_range")} placeholder="e.g. 1-30" className={field} style={fieldStyle} />
                  </div>
                </>
              )}
              <div>
                <label className={label} style={{ color: C.sub }}>Week target</label>
                <input type="number" min="0" value={form.week_target} onChange={set("week_target")} placeholder="0" className={field} style={fieldStyle} />
              </div>
              <div className={movie ? "" : "sm:col-span-2"}>
                <label className={label} style={{ color: C.sub }}>Notes</label>
                <input value={form.notes} onChange={set("notes")} placeholder="Optional notes for the editor" className={field} style={fieldStyle} />
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <SkipStep what="cue sheet work (this closes the work without a cue sheet)" busy={busy} onSkip={(reason) => act(() => api.newWorkSkip(w.id, "cue", reason))} />
              <Btn kind="dark" disabled={!form.assigned_to || busy} onClick={allot}><CheckCircle2 className="w-3.5 h-3.5" /> Allot cue sheet work</Btn>
            </div>
          </>
        ) : <Fact>Cue sheet work is not allotted yet.</Fact>
      ) : (
        <>
          <Fact>
            Allotted to {cue.assigned_to_name || "an editor"}{cue.assigned_by_name ? ` by ${cue.assigned_by_name}` : ""}{cue.assigned_at ? ` on ${fmtDateTime(cue.assigned_at)}` : ""}.
            {[cue.client && ` Client: ${cue.client}.`, cue.episode_range && ` Episodes ${cue.episode_range}.`, cue.week_target && ` Target ${cue.week_target} a week.`].filter(Boolean).join("")}
            {cue.status === "completed" && cue.done_at ? ` Completed on ${fmtDateTime(cue.done_at)}.` : ""}
          </Fact>
          {cue.delegation_id ? (
            <div className="flex flex-wrap items-center gap-3">
              <div className="w-48 max-w-full">
                <label className={label} style={{ color: C.sub }}>Cue sheet status</label>
                <Select value={cue.status} disabled={busy || !canEdit} className={field} style={fieldStyle}
                  onChange={(e) => act(() => api.newWorkCueStatus(w.id, e.target.value), "allot")}>
                  <option value="assigned">Assigned</option>
                  <option value="in_progress">In progress</option>
                  <option value="completed">Completed</option>
                </Select>
              </div>
              <div className="text-[0.6875rem] flex-1 min-w-40" style={{ color: C.sub }}>
                To change the editor, episodes or target, or to take the work back, edit the allotment under Editors and their serials.
              </div>
            </div>
          ) : <Fact>The allotment itself was deleted later; the work stays recorded as completed.</Fact>}
        </>
      )}
    </StepCard>
  );
}

// ─── Add a new work ──────────────────────────────────────────────────────────
function AddForm({ initial, onCreated, onClose }) {
  const [form, setForm] = useState({ title: initial?.title || "", work_type: initial?.work_type || "movie", remarks: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) { setError("Enter the movie or TV show name."); return; }
    setBusy(true); setError("");
    try { onCreated(await api.createNewWork({ title: form.title.trim(), work_type: form.work_type, remarks: form.remarks.trim() || null })); }
    catch (ex) { setError(ex.message); }
    finally { setBusy(false); }
  };
  return (
    <form onSubmit={submit} className="p-5 sm:p-6 space-y-4">
      <p className="text-xs" style={{ color: C.sub }}>
        Add the name as soon as you have it, even before the BGM arrives. It starts as <b>Awaiting BGM</b> and moves through three steps:
        BGM received, fingerprinting, then cue sheet work. Each step opens when the one before it is completed or skipped.
      </p>
      <div>
        <label className={label} style={{ color: C.sub }}>Movie / TV show name *</label>
        <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} autoFocus maxLength={500}
          placeholder="e.g. Movie ABC" className={field} style={fieldStyle} />
      </div>
      <div>
        <span className={label} style={{ color: C.sub }}>Work type</span>
        <div className="flex gap-2">
          {TYPES.map(([key, text, Icon]) => (
            <button key={key} type="button" onClick={() => setForm((f) => ({ ...f, work_type: key }))} aria-pressed={form.work_type === key}
              className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold border"
              style={form.work_type === key ? { background: C.dark, color: C.mint4, borderColor: C.dark } : { background: C.white, color: C.dark, borderColor: alpha(C.mint1, "88") }}>
              <Icon className="w-4 h-4" /> {text}
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className={label} style={{ color: C.sub }}>Remarks / notes</label>
        <textarea value={form.remarks} onChange={(e) => setForm((f) => ({ ...f, remarks: e.target.value }))} rows={2} maxLength={5000}
          placeholder="Optional" className={`${field} resize-none`} style={fieldStyle} />
      </div>
      {error && <div className="text-xs" style={{ color: C.danger }}>{error}</div>}
      <div className="flex justify-end gap-3">
        <Btn kind="link" onClick={onClose}>Cancel</Btn>
        <Btn kind="dark" disabled={busy} onClick={submit}>{busy ? "Adding…" : "Add to New Work List"}</Btn>
      </div>
    </form>
  );
}

// Name, type and remarks of an existing work.
function Details({ w, act, busy, onCancel }) {
  const [form, setForm] = useState({ title: w.title, work_type: w.work_type, remarks: w.remarks || "" });
  return (
    <div className="rounded-xl border p-4 space-y-3" style={{ background: C.white, borderColor: LINE }}>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="sm:col-span-2">
          <label className={label} style={{ color: C.sub }}>Movie / TV show name</label>
          <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} maxLength={500} className={field} style={fieldStyle} />
        </div>
        <div>
          <label className={label} style={{ color: C.sub }}>Work type</label>
          <Select value={form.work_type} disabled={!!w.cue.delegation_id} title={w.cue.delegation_id ? "Fixed once the cue sheet work is allotted" : undefined}
            onChange={(e) => setForm((f) => ({ ...f, work_type: e.target.value }))} className={field} style={fieldStyle}>
            {TYPES.map(([key, text]) => <option key={key} value={key}>{text}</option>)}
          </Select>
        </div>
      </div>
      <div>
        <label className={label} style={{ color: C.sub }}>Remarks / notes</label>
        <textarea value={form.remarks} onChange={(e) => setForm((f) => ({ ...f, remarks: e.target.value }))} rows={2} maxLength={5000} className={`${field} resize-none`} style={fieldStyle} />
      </div>
      <div className="flex justify-end gap-3">
        <Btn kind="link" onClick={onCancel}>Cancel</Btn>
        <Btn kind="dark" disabled={busy || !form.title.trim()}
          onClick={() => act(() => api.updateNewWork(w.id, { title: form.title.trim(), work_type: form.work_type, remarks: form.remarks.trim() || null })).then((ok) => ok && onCancel())}>
          Save
        </Btn>
      </div>
    </div>
  );
}

/**
 * workId: an existing work to open; without it the modal starts with the Add form (`initial` pre-fills it).
 * onChanged(kind): something was saved ("allot" when the cue sheet allotment changed, so delegations need reloading).
 */
export default function NewWorkModal({ workId, initial, onClose, onChanged }) {
  const { isAdmin, pushToast } = useApp();
  const [id, setId] = useState(workId || null);
  const [data, setData] = useState(null);       // { work, history }
  const [mail, setMail] = useState(null);
  const [editors, setEditors] = useState([]);
  const [clients, setClients] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [showLog, setShowLog] = useState(false);

  useEffect(() => {
    api.listEditors().then(setEditors).catch(() => {});
    api.listClients().then(setClients).catch(() => {});
    api.newWorkMail().then(setMail).catch(() => {});
  }, []);
  useEffect(() => {
    if (!id) return;
    api.getNewWork(id).then(setData).catch((e) => setError(e.message));
  }, [id]);

  // Runs one change, shows the work as the server now has it, and tells the page behind to refresh.
  const act = async (fn, kind = "work") => {
    setBusy(true); setError("");
    try {
      setData(await fn());
      onChanged?.(kind);
      if (kind !== "work") api.newWorkMail().then(setMail).catch(() => {});
      return true;
    } catch (ex) {
      setError(ex.message);
      return false;
    } finally { setBusy(false); }
  };
  const linked = async (fn) => { const ok = await act(fn); if (ok) api.newWorkMail().then(setMail).catch(() => {}); return ok; };

  const remove = async () => {
    const ok = await showConfirm(`Remove "${w.title}" from the New Work List? Use this only for an entry added by mistake. Its tracking log is kept.`,
      { title: "Remove this work?", variant: "danger", confirmLabel: "Remove" });
    if (!ok) return;
    try { await api.deleteNewWork(w.id); pushToast({ kind: "success", title: `${w.title} removed` }); onChanged?.("work"); onClose(); }
    catch (ex) { await showAlert(ex.message, { title: "Could not remove", variant: "error" }); }
  };

  const w = data?.work;
  const TypeIcon = w?.work_type === "tv_show" ? Tv : Clapperboard;
  return (
    <div className="cs-backdrop fixed inset-0 z-50 flex items-center justify-center">
      <div className="cs-glass w-full max-w-3xl rounded-2xl overflow-hidden" role="dialog" aria-modal="true" aria-label={w ? w.title : "New work"}
        style={{ fontFamily: FONTS.sans, color: C.dark }}>
        <div className="px-5 sm:px-6 py-4 border-b flex items-start gap-3" style={{ borderColor: LINE }}>
          <div className="flex-1 min-w-0">
            <h3 className="text-xl leading-tight break-words" style={{ fontFamily: FONTS.serif, color: C.dark }}>{w ? w.title : "New Work"}</h3>
            {w ? (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-[0.6875rem]" style={{ color: C.sub }}>
                <span className="inline-flex items-center gap-1 font-semibold"><TypeIcon className="w-3.5 h-3.5" /> {w.work_type_label}</span>
                <StageBadge work={w} />
                <span>Added {fmtDateTime(w.created_at)}{w.created_by_name ? ` by ${w.created_by_name}` : ""}</span>
                <span>Last updated {fmtDateTime(w.updated_at)}</span>
              </div>
            ) : <div className="text-[0.6875rem] mt-1" style={{ color: C.sub }}>A new movie or TV show to track</div>}
          </div>
          {w && <button onClick={() => setEditing((v) => !v)} title="Edit name, type and remarks" className="p-1.5 rounded-lg hover:bg-black/5"><Pencil className="w-4 h-4" style={{ color: C.sub }} /></button>}
          {w && isAdmin && <button onClick={remove} title="Remove (added by mistake)" className="p-1.5 rounded-lg hover:bg-black/5"><Trash2 className="w-4 h-4" style={{ color: C.danger }} /></button>}
          <button onClick={onClose} aria-label="Close" className="p-1.5 rounded-lg hover:bg-black/5"><X className="w-4 h-4" style={{ color: C.sub }} /></button>
        </div>

        {!id ? (
          <AddForm initial={initial} onClose={onClose} onCreated={(d) => { setData(d); setId(d.work.id); onChanged?.("work"); }} />
        ) : !w ? (
          <div className="p-10 text-center text-sm" style={{ color: error ? C.danger : C.sub }}>{error || "Loading…"}</div>
        ) : (
          <div className="p-5 sm:p-6 space-y-3" style={{ background: alpha(C.mint4, "44") }}>
            {error && (
              <div className="rounded-lg px-3 py-2 text-xs flex items-start gap-2" style={{ background: T.redBg, color: T.red }}>
                <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> <span className="break-words">{error}</span>
              </div>
            )}
            {w.reminder?.due && (
              <div className="rounded-lg px-3 py-2 text-xs flex items-start gap-2" style={{ background: T.orangeBg, color: C.dark }}>
                <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: T.orange }} />
                <span>{w.reminder.long_message || w.reminder.message}</span>
              </div>
            )}
            {editing
              ? <Details w={w} act={act} busy={busy} onCancel={() => setEditing(false)} />
              : w.remarks && <div className="text-xs rounded-lg px-3 py-2 whitespace-pre-wrap break-words" style={{ background: C.white, color: C.dark, border: `1px solid ${LINE}` }}><b>Remarks:</b> {w.remarks}</div>}

            <BgmStep w={w} act={act} busy={busy} canEdit />
            <FingerprintStep w={w} mail={mail} editors={editors} act={linked} busy={busy} canEdit />
            <CueStep w={w} editors={editors} clients={clients} act={act} busy={busy} canEdit />

            <div className="rounded-xl border overflow-hidden" style={{ background: C.white, borderColor: LINE }}>
              <button onClick={() => setShowLog((v) => !v)} className="w-full px-4 py-3 flex items-center gap-2 text-left">
                {showLog ? <ChevronDown className="w-4 h-4" style={{ color: C.muted }} /> : <ChevronRight className="w-4 h-4" style={{ color: C.muted }} />}
                <span className="text-sm font-semibold" style={{ color: C.dark }}>Tracking log</span>
                <span className="text-[0.6875rem]" style={{ color: C.sub }}>{data.history.length} entr{data.history.length === 1 ? "y" : "ies"}: every manual and automatic step</span>
              </button>
              {showLog && <div className="border-t max-h-96 overflow-auto" style={{ borderColor: LINE }}><Timeline rows={data.history} /></div>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
