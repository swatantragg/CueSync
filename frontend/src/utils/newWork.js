// New Work List: the statuses a work moves through and the list's filters. Plain functions, no React.

export const STAGES = [
  ["awaiting_bgm", "Awaiting BGM"],
  ["awaiting_video", "Waiting for video"],
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
  ["g:video", "Waiting for video (in theatres)", (w) => !!w.video?.waiting],
  ["g:video_overdue", "No video long after release", (w) => !!w.video?.overdue],
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
// release: "upcoming" (date still ahead), "week" (released in the last 7 days), "none" (no date entered).
export function filterWorks(works, { q = "", type = "", status = "", person = "", pending = "", client = "", release = "" } = {}) {
  const needle = q.trim().toLowerCase();
  const days = Number(pending) || 0;
  return works.filter((w) => {
    if (type && w.work_type !== type) return false;
    if (!matchesStatus(w, status)) return false;
    if (person && String(w.fingerprint.assigned_to ?? "") !== String(person) && String(w.cue.assigned_to ?? "") !== String(person)) return false;
    if (days && !(w.days_open != null && w.days_open >= days)) return false;
    if (client && String(w.client_id ?? "") !== String(client)) return false;
    if (release && !matchesRelease(w, release)) return false;
    if (!needle) return true;
    return [w.title, w.remarks, w.fingerprint.assigned_to_name, w.cue.assigned_to_name, w.cue.client, w.client_name]
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

export const RELEASE_OPTIONS = [["upcoming", "Release date ahead"], ["week", "Released in the last 7 days"], ["none", "No release date"]];

export function matchesRelease(w, release) {
  const r = w.release;
  if (release === "none") return !r;
  if (release === "upcoming") return !!r && r.days < 0;
  if (release === "week") return !!r && r.days >= 0 && r.days <= 7;
  return true;
}

// The clients the works name, for the client filter.
export function workClients(works) {
  const seen = new Map();
  for (const w of works) if (w.client_id) seen.set(w.client_id, w.client_name || "Unknown");
  return [...seen].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
}

// A video link to put in an <a href>: web addresses only, so a stored "javascript:" can never run.
export function safeLink(url) {
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:" ? u.href : null;
  } catch { return null; }
}

// Dates as the server sends them (yyyy-mm-dd, no time): worked on in UTC so no time zone shifts the day.
export const RELEASE_FOLLOW_UP = 7;

export function todayISO(now = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

export function addDays(iso, n) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export const fmtDate = (iso) => (iso ? new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "");

// What a release date entered today will bring: the same rule as the server (only dates still ahead get an update).
// Theatres first: fingerprinting waits for the video (OTT or a copy from the client).
export const RELEASE_TYPES = [["theatrical", "Theatres first"], ["ott", "OTT"], ["tv", "TV"]];
export const releaseTypesFor = (workType) => (workType === "movie" ? RELEASE_TYPES : RELEASE_TYPES.filter(([k]) => k !== "theatrical"));
export const OTT_WINDOWS = [[56, "8 weeks (usual for Hindi films)"], [28, "4 weeks (usual for South Indian films)"]];
export const VIDEO_SOURCES = [["ott", "Streaming on OTT"], ["client", "Copy sent by the client"], ["tv", "Shown on TV"], ["other", "Other"]];
export const VIDEO_CHECK_DAYS = 7;

// When a theatrical release is expected on OTT: the OTT date, or the usual gap after release.
export function expectedOtt({ release_date, ott_date, ott_window_days }) {
  if (ott_date) return ott_date;
  return release_date ? addDays(release_date, Number(ott_window_days) || 56) : "";
}

export function ottHint(form, today = todayISO()) {
  const exp = expectedOtt(form);
  if (!exp) return `No date known yet: CueSync asks every ${VIDEO_CHECK_DAYS} days, starting a week after it is added, until the video is available.`;
  const what = form.ott_date ? `the OTT date, ${fmtDate(exp)}` : `${fmtDate(exp)}, the usual gap after release`;
  return exp >= today
    ? `Fingerprinting waits for the video. CueSync asks whether it is on OTT on ${what}, then every ${VIDEO_CHECK_DAYS} days until it is.`
    : `Fingerprinting waits for the video. ${fmtDate(exp)} has passed, so CueSync asks again within ${VIDEO_CHECK_DAYS} days, then every ${VIDEO_CHECK_DAYS} days.`;
}

export function releaseHint(iso, today = todayISO()) {
  if (!iso) return "";
  const follow = addDays(iso, RELEASE_FOLLOW_UP);
  if (iso > today) return `You'll get an update on the release day, ${fmtDate(iso)}, and ${RELEASE_FOLLOW_UP} days after, on ${fmtDate(follow)}.`;
  if (follow > today) return `Already released, so the only update comes ${RELEASE_FOLLOW_UP} days after the release, on ${fmtDate(follow)}.`;
  return `Released more than ${RELEASE_FOLLOW_UP} days ago, so no release update will be sent.`;
}

export const daysLabel = (n) => (n == null ? "" : n === 0 ? "today" : n === 1 ? "1 day" : `${n} days`);
