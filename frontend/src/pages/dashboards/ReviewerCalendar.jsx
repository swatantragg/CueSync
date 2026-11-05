import { api } from "../../utils/api";
import { NamedTable, QuarterCalendar, SocietySplit, plural } from "./AdminInsights";

// Reviewer's Activity Calendar (/api/insights/reviewer-calendar): review work and society emails, month by month in IST.
// An episode counts once per month and per action, however many times it went back and forth.
const REVIEW_COLS = [["submitted", "Submitted"], ["approved", "Approved"], ["rejected", "Rejected"], ["changes", "Changes"], ["sent_episodes", "Sent"]];

const CONFIG = {
  title: "Activity calendar",
  note: (societyName) => `Review work and society emails per month${societyName ? ` · email columns count ${societyName} only` : ""}. Click a month for its weeks, societies, clients and reviewers.`,
  load: (year, clientId, societyId) => api.reviewerCalendar(year, clientId, societyId),
  gridClass: "lg:grid-cols-2",
  cols: [
    { key: "submitted", label: "Submitted", hint: "Episodes sent for review" },
    { key: "approved", label: "Approved" },
    { key: "rejected", label: "Rejected" },
    { key: "changes", label: "Changes", hint: "Sent back with suggested changes" },
    { key: "to_review", label: "To review", hint: "Still waiting for a reviewer; submitted that month" },
    { key: "sent_episodes", label: "Sent", hint: "Episodes emailed to a society", title: (x) => (x.sent_reports ? plural(x.sent_reports, "email") : undefined) },
    { key: "waiting_reply", label: "Waiting", hint: "Emails sent that month with no reply yet" },
    { key: "accepted", label: "Accepted", hint: "Emails accepted by the society that month" },
    { key: "failed", label: "Failed", hint: "Emails sent that month that bounced" },
  ],
  progress: (q) => (q.submitted ? Math.round(((q.reviewed || 0) / q.submitted) * 100) : null),
  progressNote: (q, done) => `${done == null ? "Nothing submitted this quarter" : `${Math.min(100, done)}% of submitted episodes reviewed`} · ${plural(q.sent_reports || 0, "email")} to societies`,
  summary: (x) => `${x.submitted || 0} submitted · ${x.reviewed || 0} reviewed · ${x.to_review || 0} to review · ${x.ready_to_send || 0} approved, not sent · ${x.sent_episodes || 0} sent in ${plural(x.sent_reports || 0, "email")} · ${x.replied || 0} replied · ${x.failed || 0} failed`,
  detail: (x) => (
    <div className="grid lg:grid-cols-2 gap-4 p-3">
      <NamedTable title="By week" first="Dates" nameKey="label" rows={x.weeks || []} empty="No weeks." cols={REVIEW_COLS} />
      <SocietySplit societies={x.societies} />
      <NamedTable title="By client" rows={x.clients || []} empty="No work this month." cols={REVIEW_COLS} />
      <NamedTable title="By reviewer" first="Reviewer" rows={x.reviewers || []} empty="No reviews this month." cols={REVIEW_COLS.slice(1)} />
    </div>
  ),
  legend: [
    ["Submitted", "episodes sent for review that month"],
    ["Approved, Rejected, Changes", "reviewers' decisions that month"],
    ["To review", "still waiting now, under the month last submitted"],
    ["Sent", "episodes emailed to a society, bounced emails not counted"],
    ["Waiting", "emails sent that month with no reply yet"],
    ["Accepted", "emails the society accepted that month"],
    ["Failed", "emails sent that month that bounced"],
  ],
};

export default function ReviewerCalendar({ reloadKey }) {
  return <QuarterCalendar reloadKey={reloadKey} config={CONFIG} />;
}
