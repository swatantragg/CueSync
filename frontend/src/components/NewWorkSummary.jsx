import { useEffect, useState } from "react";
import {
  AlarmClock, BellRing, CheckCircle2, ChevronRight, ClipboardList, Clock, Fingerprint, Hourglass, Inbox, ListPlus, Music, UserPlus,
} from "lucide-react";
import { C, FONTS, alpha, T } from "../styles/palette";
import { api } from "../utils/api";

// The ten New Work numbers shown on the Work Delegator and Admin dashboards and at the top of the New Work tab.
// `onPick(status)` opens the list filtered to what the tile counts.

export const STAGE_TONE = {
  awaiting_bgm: [T.orange, T.orangeBg],
  fp_not_assigned: [T.red, T.redBg],
  fp_assigned: [T.purple, T.purpleBg],
  fp_in_progress: [T.purple, T.purpleBg],
  cue_pending: [T.orangeDeep, T.amberBg],
  cue_assigned: [T.blue, T.blueBg],
  cue_in_progress: [T.blue, T.blueBg],
  completed: [T.green, T.greenBg],
  closed: [T.grayMid, T.grayBg],
};

export function StageBadge({ work }) {
  const [fg, bg] = STAGE_TONE[work.stage] || STAGE_TONE.closed;
  return (
    <span className="inline-block text-[0.625rem] px-2 py-0.5 rounded font-semibold whitespace-nowrap" style={{ background: bg, color: fg }}>
      {work.stage_label}
    </span>
  );
}

function Tile({ Icon, tone, label, value, sub, onClick }) {
  return (
    <button onClick={onClick} disabled={!onClick}
      className="text-left rounded-xl border px-3.5 py-3 transition enabled:hover:shadow-sm disabled:cursor-default min-w-0"
      style={{ background: C.white, borderColor: alpha(C.mint1, "44") }}>
      <div className="flex items-start gap-1.5 text-[0.6875rem] font-medium leading-tight" style={{ color: C.sub }}>
        <Icon className="w-3.5 h-3.5 shrink-0 mt-px" style={{ color: tone }} /> <span>{label}</span>
      </div>
      <div className="text-2xl font-semibold mt-1" style={{ color: C.dark, fontVariantNumeric: "tabular-nums" }}>{value}</div>
      {sub && <div className="text-[0.625rem] mt-0.5 leading-snug" style={{ color: C.sub }}>{sub}</div>}
    </button>
  );
}

export function NewWorkTiles({ summary: s, onPick }) {
  const pick = (status, extra) => (onPick ? () => onPick({ status, ...extra }) : undefined);
  const also = (n, text) => (n ? `${n} ${text}` : undefined);
  return (
    <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
      <Tile Icon={ListPlus} tone={C.sub} label="Total new works added" value={s.total}
        sub={`${s.movies} movie${s.movies === 1 ? "" : "s"} · ${s.tv_shows} TV show${s.tv_shows === 1 ? "" : "s"}`} onClick={pick("")} />
      <Tile Icon={Clock} tone={T.orange} label="Awaiting BGM" value={s.awaiting_bgm} onClick={pick("awaiting_bgm")} />
      <Tile Icon={Music} tone={T.teal} label="BGM received" value={s.bgm_received}
        sub={also(s.bgm_skipped, "more skipped this step")} onClick={pick("g:bgm_received")} />
      <Tile Icon={UserPlus} tone={T.red} label="Fingerprinting not assigned" value={s.fp_not_assigned} onClick={pick("fp_not_assigned")} />
      <Tile Icon={Fingerprint} tone={T.purple} label="Fingerprinting in progress" value={s.fp_in_progress}
        sub={also(s.fp_assigned, "more assigned, not started")} onClick={pick("g:fp_active")} />
      <Tile Icon={CheckCircle2} tone={T.green} label="Fingerprinting completed" value={s.fp_completed}
        sub={also(s.fp_skipped, "more skipped this step")} onClick={pick("g:fp_completed")} />
      <Tile Icon={Inbox} tone={T.orangeDeep} label="Cue sheet allocation pending" value={s.cue_pending} onClick={pick("cue_pending")} />
      <Tile Icon={ClipboardList} tone={T.blue} label="Cue sheet in progress" value={s.cue_in_progress}
        sub={also(s.cue_assigned, "more assigned, not started")} onClick={pick("g:cue_active")} />
      <Tile Icon={CheckCircle2} tone={C.ok} label="Completed works" value={s.completed}
        sub={also(s.closed, "more closed without a cue sheet")} onClick={pick("completed")} />
      <Tile Icon={Hourglass} tone={s.pending_30 ? T.red : s.pending_15 ? T.orange : C.muted} label="Pending over 15 / 30 days"
        value={`${s.pending_15} / ${s.pending_30}`} sub="since added, cue sheet work not allotted"
        onClick={pick("g:pending", { pending: "15" })} />
    </div>
  );
}

// Dashboard card: the tiles plus the reminders that are due right now.
export default function NewWorkSummary({ reloadKey, onOpen }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    api.newWorkSummary()
      .then((d) => { if (live) { setData(d); setError(""); } })
      .catch((e) => { if (live) setError(e.message || "Couldn't load the New Work numbers"); });
    return () => { live = false; };
  }, [reloadKey]);

  if (!data) return error ? <div className="rounded-xl border px-4 py-3 text-xs" style={{ background: C.white, borderColor: alpha(C.mint1, "44"), color: C.danger }}>{error}</div> : null;
  const due = data.reminders;
  return (
    <section className="rounded-xl border" style={{ background: alpha(C.mint4, "55"), borderColor: alpha(C.mint1, "44") }}>
      <header className="px-4 pt-3.5 pb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="text-base leading-tight" style={{ fontFamily: FONTS.serif, color: C.dark }}>New work tracking</h4>
          <div className="text-[0.6875rem] mt-0.5" style={{ color: C.sub }}>
            New movies and TV shows, from BGM received to fingerprinting to cue sheet work. Click a number to see those works.
          </div>
        </div>
        {onOpen && (
          <button onClick={() => onOpen({ status: "" })}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold hover:opacity-90" style={{ background: C.dark, color: C.mint4 }}>
            Open New Work <ChevronRight className="w-3.5 h-3.5" />
          </button>
        )}
      </header>
      <div className="px-4 pb-4 space-y-3">
        <NewWorkTiles summary={data.summary} onPick={onOpen} />
        {due.length > 0 && (
          <div className="rounded-xl border" style={{ background: C.white, borderColor: alpha(C.mint1, "44") }}>
            <button onClick={onOpen ? () => onOpen({ status: "g:reminders", view: "reminders" }) : undefined} disabled={!onOpen}
              className="w-full px-4 py-2.5 flex items-center gap-2 text-left border-b disabled:cursor-default" style={{ borderColor: alpha(C.mint1, "44") }}>
              <BellRing className="w-3.5 h-3.5 shrink-0" style={{ color: T.orange }} />
              <span className="text-xs font-semibold" style={{ color: C.dark }}>
                {data.summary.reminders} follow-up{data.summary.reminders === 1 ? "" : "s"} due
              </span>
              <span className="text-[0.6875rem]" style={{ color: C.sub }}>longest pending first</span>
            </button>
            <ul className="divide-y max-h-56 overflow-auto" style={{ borderColor: alpha(C.mint4, "99") }}>
              {due.map((r) => (
                <li key={r.id} className="px-4 py-2 flex items-start gap-2 text-xs">
                  <AlarmClock className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: r.level >= 30 ? T.red : r.level ? T.orange : C.muted }} />
                  <span className="flex-1 min-w-0" style={{ color: C.dark }}>{r.message}</span>
                  {r.level > 0 && (
                    <span className="shrink-0 text-[0.625rem] font-bold px-1.5 py-0.5 rounded"
                      style={{ background: r.level >= 30 ? T.redBg : T.orangeBg, color: r.level >= 30 ? T.red : T.orange }}>{r.level}+ days</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
