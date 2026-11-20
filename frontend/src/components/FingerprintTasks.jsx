import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Clapperboard, ExternalLink, Fingerprint, MailCheck, MailQuestion, Tv } from "lucide-react";
import { C, FONTS, alpha, T } from "../styles/palette";
import Select from "./Select";
import { FingerprintDone } from "./NewWorkModal";
import { api } from "../utils/api";
import { fmtDateTime } from "../utils/format";
import { daysLabel, safeLink } from "../utils/newWork";
import { useApp } from "../context/AppContext";

// Editor Dashboard: the fingerprinting a Work Delegator assigned to this editor. They move it to In progress and
// tick Fingerprinting Completed, which is enabled by the service's email or by saying where the fingerprinting came from.

const LINE = alpha(C.mint1, "44");

function Task({ w, info, act, busy }) {
  const fp = w.fingerprint;
  const done = fp.status === "completed";
  const TypeIcon = w.work_type === "tv_show" ? Tv : Clapperboard;
  return (
    <li className="rounded-xl border p-4" style={{ background: C.white, borderColor: done ? LINE : alpha(T.purple, "66") }}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold break-words" style={{ color: C.dark }}>{w.title}</div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5 text-[0.6875rem]" style={{ color: C.sub }}>
            <span className="inline-flex items-center gap-1"><TypeIcon className="w-3 h-3" /> {w.work_type_label}</span>
            <span>Assigned{fp.assigned_by_name ? ` by ${fp.assigned_by_name}` : ""} on {fmtDateTime(fp.assigned_at)}</span>
            {w.bgm.received && <span>BGM received {fmtDateTime(w.bgm.at)}</span>}
            {w.video?.state === "available" && <span>Video: {w.video.source_label}{w.video.note ? ` (${w.video.note})` : ""}</span>}
            {safeLink(w.video_link) && (
              <a href={safeLink(w.video_link)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold hover:underline" style={{ color: C.mid }}>
                <ExternalLink className="w-3 h-3" /> Open video
              </a>
            )}
            {!done && fp.assigned_days > 0 && <span className="font-semibold" style={{ color: fp.assigned_days >= 5 ? T.orange : C.sub }}>with you for {daysLabel(fp.assigned_days)}</span>}
          </div>
        </div>
        {done ? (
          <span className="inline-flex items-center gap-1 text-[0.6875rem] font-semibold px-2 py-0.5 rounded" style={{ background: T.greenBg, color: T.green }}>
            <CheckCircle2 className="w-3.5 h-3.5" /> Completed {fmtDateTime(fp.done_at)}
          </span>
        ) : (
          <Select value={fp.status} disabled={busy} onChange={(e) => act(() => api.newWorkFingerprintStatus(w.id, e.target.value))}
            className="px-3 py-1.5 rounded-lg text-xs border font-semibold min-w-32" style={{ background: T.purpleBg, color: T.purple, borderColor: alpha(T.purple, "44") }}>
            <option value="assigned">Assigned</option>
            <option value="in_progress">In progress</option>
          </Select>
        )}
      </div>
      {w.remarks && <div className="text-xs mt-2 whitespace-pre-wrap break-words" style={{ color: C.sub }}>{w.remarks}</div>}
      {done ? (
        <div className="text-xs mt-2" style={{ color: C.sub }}>
          {fp.source === "manual" ? `Manual entry, no email. Fingerprinting came from: ${fp.source_note}` : `${info.sender_name} email: “${fp.mail?.subject || ""}”`}
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          <div className="flex items-start gap-2 text-xs rounded-lg px-3 py-2" style={{ background: fp.mail ? T.greenBg : T.amberBg, color: C.dark }}>
            {fp.mail ? <MailCheck className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: T.green }} /> : <MailQuestion className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: T.orange }} />}
            <span className="break-words">
              {fp.mail
                ? `Email received ${fmtDateTime(fp.mail.received_at)}: “${fp.mail.subject}”`
                : `No email yet from ${info.sender_name} on ${info.mailbox} for this title.`}
            </span>
          </div>
          <FingerprintDone w={w} mailInfo={info} act={act} busy={busy} />
        </div>
      )}
    </li>
  );
}

export default function FingerprintTasks() {
  const { notifications } = useApp();
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(() => api.myFingerprinting().then(setData).catch(() => {}), []);
  // A new assignment, or the service's email arriving, shows up without a refresh.
  const news = notifications.filter((n) => n.entity_type === "new_work" || n.entity_type === "new_work_reminder").length;
  useEffect(() => { load(); }, [load, news]);

  const act = async (fn) => {
    setBusy(true); setError("");
    try { await fn(); await load(); return true; }
    catch (ex) { setError(ex.message); return false; }
    finally { setBusy(false); }
  };

  if (!data?.works.length) return null;
  const open = data.works.filter((w) => w.fingerprint.status !== "completed");
  return (
    <section>
      <h4 className="text-base mb-2 flex flex-wrap items-center gap-2" style={{ fontFamily: FONTS.serif, color: C.dark }}>
        <Fingerprint className="w-4 h-4" style={{ color: T.purple }} /> Fingerprinting assigned to you
        {open.length > 0 && <span className="text-xs font-semibold" style={{ color: T.purple, fontFamily: FONTS.sans }}>{open.length} open</span>}
      </h4>
      {error && (
        <div className="rounded-lg px-3 py-2 mb-2 text-xs flex items-start gap-2" style={{ background: T.redBg, color: T.red }}>
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> <span className="break-words">{error}</span>
        </div>
      )}
      <ul className="space-y-2">{data.works.map((w) => <Task key={w.id} w={w} info={data} act={act} busy={busy} />)}</ul>
    </section>
  );
}
