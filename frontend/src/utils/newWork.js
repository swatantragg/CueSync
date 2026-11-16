// New Work List: the statuses a work moves through and the list's filters. Plain functions, no React.

export const STAGES = [
  ["awaiting_bgm", "Awaiting BGM"],
  ["fp_not_assigned", "Fingerprinting not assigned"],
  ["fp_assigned", "Fingerprinting assigned"],
  ["fp_in_progress", "Fingerprinting in progress"],
  ["cue_pending", "Cue sheet allocation pending"],
  ["cue_assigned", "Cue sheet assigned"],
  ["cue_in_progress", "Cue sheet in progress"],
  ["completed", "Completed"],
  ["closed", "Closed without a cue sheet"],
];

// Filters that span several statuses; the dashboard tiles open the list with these.
export const GROUPS = [
  ["g:pending", "Pending (cue sheet not allotted)", (w) => !!w.reminder],
  ["g:reminders", "Reminder due", (w) => !!w.reminder?.due],
  ["g:bgm_received", "BGM received", (w) => w.bgm.state === "received"],
  ["g:fp_active", "Fingerprinting assigned or in progress", (w) => w.stage === "fp_assigned" || w.stage === "fp_in_progress"],
  ["g:fp_completed", "Fingerprinting completed", (w) => w.fingerprint.status === "completed"],
  ["g:cue_active", "Cue sheet assigned or in progress", (w) => w.stage === "cue_assigned" || w.stage === "cue_in_progress"],
];

export const PENDING_OPTIONS = [["5", "5+ days"], ["15", "15+ days"], ["30", "30+ days"]];

export function matchesStatus(w, status) {
  if (!status) return true;
  const group = GROUPS.find(([key]) => key === status);
  return group ? group[2](w) : w.stage === status;
}

// pending: whole days since the work was added while its cue sheet work is still not allotted.
export function filterWorks(works, { q = "", type = "", status = "", person = "", pending = "" } = {}) {
  const needle = q.trim().toLowerCase();
  const days = Number(pending) || 0;
  return works.filter((w) => {
    if (type && w.work_type !== type) return false;
    if (!matchesStatus(w, status)) return false;
    if (person && String(w.fingerprint.assigned_to ?? "") !== String(person) && String(w.cue.assigned_to ?? "") !== String(person)) return false;
    if (days && !(w.days_open != null && w.days_open >= days)) return false;
    if (!needle) return true;
    return [w.title, w.remarks, w.fingerprint.assigned_to_name, w.cue.assigned_to_name, w.cue.client]
      .some((v) => (v || "").toLowerCase().includes(needle));
  });
}

// Everyone a work is assigned to, for the "assigned person" filter.
export function assignees(works) {
  const seen = new Map();
  for (const w of works) {
    if (w.fingerprint.assigned_to) seen.set(w.fingerprint.assigned_to, w.fingerprint.assigned_to_name || "Unknown");
    if (w.cue.assigned_to) seen.set(w.cue.assigned_to, w.cue.assigned_to_name || "Unknown");
  }
  return [...seen].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
}

export const daysLabel = (n) => (n == null ? "" : n === 0 ? "today" : n === 1 ? "1 day" : `${n} days`);
