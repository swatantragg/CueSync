export function fmtD(v) {
  if (!v) return "";
  if (typeof v === "string" && v.includes(":")) return v;
  if (typeof v === "number") {
    const s = Math.round(v * 86400);
    return `${String(Math.floor(s / 3600)).padStart(2, "0")}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  }
  return String(v);
}

export const now = () =>
  new Date().toLocaleString("en-IN", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });

// "15 Oct 2026, 4:05 pm" in the viewer's locale.
export function fmtDateTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString(undefined, { day: "2-digit", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
}

export function timeAgo(iso) {
  if (!iso) return "";
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 7 * 86400) return `${Math.floor(diff / 86400)}d ago`;
  return fmtDateTime(iso);
}

export const ACTION_LABEL = {
  upload: "Imported", create: "Added a song", update: "Edited", delete: "Removed a song",
  submit: "Submitted for review", approve: "Approved", reject: "Rejected", suggest: "Suggested changes",
  review_open: "Opened for review", login: "Signed in", logout: "Signed out", password_change: "Changed password",
  society_submit: "Logged society submission", submit_to_iprs: "Submitted to IPRS", accept_iprs: "IPRS accepted",
  client_add: "Added a client", client_edit: "Edited a client", client_remove: "Removed a client",
  client_link: "Linked old client names", mailbox_connect: "Connected client Gmail",
  mailbox_disconnect: "Disconnected client Gmail", mailbox_lost: "Client Gmail needs reconnecting",
  society_add: "Added a society", society_edit: "Edited a society", society_remove: "Removed a society",
  society_mail_sent: "Emailed cue sheets to society", society_reply: "Society replied", society_bounce: "Society email bounced",
  mail_detected: "Found email sent outside CueSync", detected_confirm: "Confirmed email sent outside CueSync",
  detected_dismiss: "Dismissed email", reply_keep_waiting: "Kept waiting after reply",
  conversion: "Converted cue sheets", conversion_project: "Added a title for Conversion", conversion_remove: "Removed a converted cue sheet",
  editor_notice: "Emailed an editor", user_mailbox_connect: "Connected own Gmail", user_mailbox_disconnect: "Disconnected own Gmail",
  new_work_add: "Added to the New Work List", new_work_edit: "Edited a new work", new_work_remove: "Removed a new work",
  new_work_bgm: "BGM received", new_work_skip: "Skipped a step", new_work_reopen: "Reopened a step",
  new_work_fp_assign: "Assigned fingerprinting", new_work_fp_status: "Fingerprinting status changed",
  new_work_fp_mail: "Fingerprinting email received", new_work_fp_mail_link: "Fingerprinting email linked by hand",
  new_work_fp_done: "Fingerprinting completed", new_work_cue_assign: "Allotted cue sheet work",
  new_work_cue_status: "Cue sheet status changed", new_work_cue_removed: "Cue sheet allotment removed",
  new_work_reminder: "Reminder sent", fp_mailbox_connect: "Connected the fingerprinting mailbox",
  fp_mailbox_disconnect: "Disconnected the fingerprinting mailbox", fp_mailbox_lost: "Fingerprinting mailbox needs reconnecting",
};
