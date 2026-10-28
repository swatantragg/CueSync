import { C, T, alpha } from "../styles/palette";
import { ACTION_LABEL, fmtDateTime, timeAgo } from "../utils/format";
import { useApp } from "../context/AppContext";

// Dot colour per audit action; anything else is a neutral theme tone.
const DOT = {
  approve: T.green, accept_iprs: T.green, login: T.green,
  reject: T.red, delete: T.red,
  suggest: T.blue, update: T.blue,
  submit: T.purple, society_submit: T.purple, submit_to_iprs: T.purple, review_open: T.purple2,
  password_change: T.orange, logout: T.grayMid,
};

// Detail prefixes that only repeat the action title ("Rejected — note" → "note").
const REPEATED = /^(Approved episode|Submitted for approval|Opened cue sheet for review|Rejected|Suggested changes|Signed in|Signed out|Changed password)\.?\s*[—·-]?\s*/i;

const COLS = { gridTemplateColumns: "minmax(9rem, 13rem) minmax(0, 1fr) auto" };

const titleCase = (s) => (s || "").replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

export const initialsOf = (name) => (name || "??").trim().split(/\s+/).map((s) => s[0]).join("").slice(0, 2).toUpperCase();

// Audit row → timeline title (what happened) + body (the details, minus a repeated prefix).
export function activityText(action, details) {
  return {
    title: ACTION_LABEL[action] || titleCase(action),
    body: (details || "").replace(REPEATED, "").trim() || null,
  };
}

function WhoPill({ name, me }) {
  return (
    <span className="inline-flex items-center gap-1.5 max-w-full pl-1 pr-2.5 py-0.5 rounded-full" style={{ background: alpha(C.mint1, me ? "66" : "33") }}>
      <span className="w-5 h-5 rounded-full flex items-center justify-center text-[0.5rem] font-bold shrink-0"
        style={{ background: me ? C.dark : C.mint1, color: me ? C.mint1 : C.dark }}>
        {initialsOf(name)}
      </span>
      <span className="text-sm font-semibold truncate" style={{ color: C.dark }}>{name || "System"}</span>
    </span>
  );
}

// Vertical activity timeline: WHO | WHAT | DATE AND TIME, one dot per audit row on a rail, in the order given.
// Rows carry user_name/user_role when they come from mixed users; `who` names the actor otherwise.
export default function Timeline({ rows, who, showEmail = false }) {
  const { currentUser } = useApp();
  return (
    <div className="px-4 py-3">
      <div className="grid gap-x-6 pb-1.5 text-[0.625rem] font-bold uppercase tracking-widest" style={{ ...COLS, color: C.sub }}>
        <span className="pl-5">Who</span>
        <span>What</span>
        <span className="text-right">Date and time</span>
      </div>
      <ol className="relative">
        <span aria-hidden className="absolute left-[0.3125rem] top-3 bottom-3 w-px" style={{ background: C.mint1 }} />
        {rows.map((r) => {
          const { title, body } = activityText(r.action, r.details);
          const sub = [r.user_role && titleCase(r.user_role), showEmail && r.user_email].filter(Boolean).join(" · ");
          return (
            <li key={r.id} className="relative grid gap-x-6 py-2" style={COLS}>
              <span aria-hidden className="absolute left-0 top-[0.9rem] w-[0.6875rem] h-[0.6875rem] rounded-full"
                style={{ background: DOT[r.action] || C.muted, boxShadow: `0 0 0 3px ${C.white}` }} />
              <div className="pl-5 min-w-0">
                <WhoPill name={r.user_name || who} me={currentUser && r.user_id != null && r.user_id === currentUser.id} />
                {sub && <div className="text-[0.625rem] mt-1 pl-1 truncate" style={{ color: C.sub }}>{sub}</div>}
              </div>
              <div className="min-w-0 pt-0.5">
                <div className="text-sm font-semibold" style={{ color: C.dark }}>{title}</div>
                {body && <div className="text-xs mt-0.5 break-words" style={{ color: C.sub }}>{body}</div>}
              </div>
              <div className="pt-1 text-xs text-right whitespace-nowrap" style={{ color: C.sub }} title={timeAgo(r.at)}>
                {fmtDateTime(r.at) || "—"}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
