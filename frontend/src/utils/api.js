const BASE = (import.meta.env.VITE_API_URL || "").trim().replace(/\/+$/, "");
const TOKEN_KEY = "cuesync_token";
const USER_KEY = "cuesync_user";

function apiUrl(path) {
  return BASE ? `${BASE}${path}` : path;
}

// Origin that serves /api — the Gmail sign-in popup reports back from there.
export const API_ORIGIN = BASE ? new URL(BASE).origin : window.location.origin;

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (t) => localStorage.setItem(TOKEN_KEY, t),
  clear: () => { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(USER_KEY); },
};
export const userStore = {
  get: () => { try { return JSON.parse(localStorage.getItem(USER_KEY) || "null"); } catch { return null; } },
  set: (u) => localStorage.setItem(USER_KEY, JSON.stringify(u)),
};

async function request(path, { method = "GET", body, form, auth = true } = {}) {
  const headers = {};
  if (body) headers["Content-Type"] = "application/json";
  if (auth) {
    // Authorization header: used in local dev where cookies are cross-origin
    // In production (Docker/Nginx same-origin), httpOnly cookie is sent automatically
    const t = tokenStore.get();
    if (t) headers["Authorization"] = `Bearer ${t}`;
  }
  let res;
  try {
    res = await fetch(apiUrl(path), {
      method,
      headers,
      credentials: "include",  // always send httpOnly cookies (production security)
      body: form ? form : body ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `API request failed. Check backend availability and VITE_API_URL/proxy config. ${msg}`
    );
  }
  const ct = res.headers.get("content-type") || "";
  const data = ct.includes("application/json") ? await res.json() : await res.text();
  if (res.status === 401) {
    window.dispatchEvent(new CustomEvent("auth:expired"));
  }
  if (!res.ok) {
    const raw = (data && (data.detail || data.message)) || `${res.status} ${res.statusText}`;
    let msg;
    if (typeof raw === "string") {
      msg = raw;
    } else if (Array.isArray(raw)) {
      msg = raw.map(e => (e.msg || JSON.stringify(e)).replace(/^Value error,\s*/i, "")).join("\n");
    } else {
      msg = JSON.stringify(raw);
    }
    throw new Error(msg);
  }
  return data;
}

// Error text for a failed fetch: the backend's {"detail": …} message when present.
async function responseError(res) {
  const text = await res.text();
  try { return new Error(JSON.parse(text).detail || text || res.statusText); }
  catch { return new Error(text || res.statusText); }
}

// GET a file with auth and save it under `filename`. Returns the response (for headers).
async function downloadFile(path, filename) {
  const t = tokenStore.get();
  const res = await fetch(apiUrl(path), { credentials: "include", headers: t ? { Authorization: `Bearer ${t}` } : {} });
  if (!res.ok) throw await responseError(res);
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
  return res;
}

export const api = {
  base: BASE,
  health: () => request("/health", { auth: false }),
  googleConfig: () => request("/api/auth/google/config", { auth: false }),
  googleStartUrl: () => apiUrl(`/api/auth/google/start?origin=${encodeURIComponent(window.location.origin)}`),
  googleExchange: (ticket) => request("/api/auth/google/exchange", { method: "POST", body: { ticket }, auth: false }),
  login: (email, password) => {
    const form = new URLSearchParams({ username: email, password });
    return request("/api/auth/login", { method: "POST", form, auth: false });
  },
  me: () => request("/api/auth/me"),
  changePassword: (payload) => request("/api/auth/change-password", { method: "POST", body: payload }),
  markVersionSeen: (version) => request("/api/auth/seen-version", { method: "POST", body: { version } }),
  projects: () => request("/api/projects/"),
  getProject: (id) => request(`/api/projects/${id}`),
  createProject: (payload) => request("/api/projects/", { method: "POST", body: payload }),
  updateProject: (id, payload) => request(`/api/projects/${id}`, { method: "PUT", body: payload }),
  deleteProject: (id) => request(`/api/projects/${id}`, { method: "DELETE" }),
  deleteEpisode: (eid) => request(`/api/episodes/${eid}`, { method: "DELETE" }),
  listEpisodes: (pid) => request(`/api/episodes/project/${pid}`),
  getEpisode: (eid) => request(`/api/episodes/${eid}`),
  updateEpisode: (eid, payload) => request(`/api/episodes/${eid}`, { method: "PUT", body: payload }),
  listCues: (eid) => request(`/api/cues/episode/${eid}`),
  createCue: (eid, payload) => request(`/api/cues/episode/${eid}`, { method: "POST", body: payload }),
  updateCue: (cid, payload) => request(`/api/cues/${cid}`, { method: "PUT", body: payload }),
  deleteCue: (cid) => request(`/api/cues/${cid}`, { method: "DELETE" }),
  copyCue: (cid, targetEpisodeId) => request(`/api/cues/${cid}/copy-to/${targetEpisodeId}`, { method: "POST" }),
  upsertSongLibrary: (payload) => request(`/api/library/songs/upsert`, { method: "POST", body: payload }),
  lookupSong: (title, isrc) => request(`/api/library/songs/lookup?title=${encodeURIComponent(title || "")}&isrc=${encodeURIComponent(isrc || "")}`),
  searchSongs: (q = "", songCode = "", isrc = "") => request(`/api/library/songs?q=${encodeURIComponent(q)}&song_code=${encodeURIComponent(songCode)}&isrc=${encodeURIComponent(isrc)}`),
  lookupContributor: (name) => request(`/api/library/contributors/lookup?name=${encodeURIComponent(name || "")}`),
  searchContributors: (q = "", ipi = "") => request(`/api/library/contributors?q=${encodeURIComponent(q)}&ipi=${encodeURIComponent(ipi)}`),
  searchMembers: (q) => request(`/api/library/members?q=${encodeURIComponent(q || "")}`),
  lookupMember: (name) => request(`/api/library/members/lookup?name=${encodeURIComponent(name || "")}`),
  cleanupLibrary: () => request("/api/library/cleanup", { method: "POST" }),
  submitEpisode: (eid) => request(`/api/episodes/${eid}/submit`, { method: "POST" }),
  approveEpisode: (eid) => request(`/api/episodes/${eid}/approve`, { method: "POST" }),
  rejectEpisode: (eid, note) => request(`/api/episodes/${eid}/reject`, { method: "POST", body: { note } }),
  suggestEpisode: (eid, note) => request(`/api/episodes/${eid}/suggest`, { method: "POST", body: { note } }),
  markEpisodeOpened: (eid) => request(`/api/episodes/${eid}/open`, { method: "POST" }),
  listEpisodeActivity: (eid) => request(`/api/activity/episode/${eid}`),
  listProjectActivity: (pid) => request(`/api/activity/project/${pid}`),
  logout: () => request("/api/auth/logout", { method: "POST" }).catch(() => {}),

  downloadExport: (episodeId, society, filename) =>
    downloadFile(`/api/exports/episode/${episodeId}?society=${society}`, filename),
  uploadRough: async (pid, file) => {
    const fd = new FormData();
    fd.append("file", file);
    const t = tokenStore.get();
    let res;
    try {
      res = await fetch(apiUrl(`/api/uploads/rough/project/${pid}`), {
        method: "POST", body: fd, credentials: "include",
        headers: t ? { Authorization: `Bearer ${t}` } : {},
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Rough upload request failed. ${msg}`);
    }
    if (!res.ok) throw await responseError(res);
    return res.json();
  },
  previewRough: async (pid, file) => {
    const fd = new FormData();
    fd.append("file", file);
    const t = tokenStore.get();
    let res;
    try {
      res = await fetch(apiUrl(`/api/uploads/rough/project/${pid}/preview`), {
        method: "POST", body: fd, credentials: "include",
        headers: t ? { Authorization: `Bearer ${t}` } : {},
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Rough preview request failed. ${msg}`);
    }
    if (!res.ok) throw await responseError(res);
    return res.json();
  },
  commitRough: (pid, payload) =>
    request(`/api/uploads/rough/project/${pid}/commit`, { method: "POST", body: payload }),

  // ── Users ───────────────────────────────────────────────────────────────────
  listUsers: () => request("/api/users/"),
  createUser: (payload) => request("/api/users/", { method: "POST", body: payload }),
  listEditors: () => request("/api/users/editors"),
  updateUser: (uid, payload) => request(`/api/users/${uid}`, { method: "PUT", body: payload }),
  updateUserRole: (uid, role) => request(`/api/users/${uid}/role`, { method: "PUT", body: { role } }),
  toggleUserActive: (uid, is_active) => request(`/api/users/${uid}/active`, { method: "PUT", body: { is_active } }),
  deleteUser: (uid) => request(`/api/users/${uid}`, { method: "DELETE" }),

  // ── Delegations ─────────────────────────────────────────────────────────────
  listDelegations: () => request("/api/delegations/"),
  getDelegation: (id) => request(`/api/delegations/${id}`),
  createDelegation: (payload) => request("/api/delegations/", { method: "POST", body: payload }),
  updateDelegation: (id, payload) => request(`/api/delegations/${id}`, { method: "PUT", body: payload }),
  deleteDelegation: (id) => request(`/api/delegations/${id}`, { method: "DELETE" }),
  suggestProjects: (q) => request(`/api/delegations/projects/suggest?q=${encodeURIComponent(q || "")}`),
  editorActivity: (uid) => request(`/api/delegations/activity/editor/${uid}`),
  activityCalendar: (year) => request(`/api/delegations/activity/calendar?year=${year}`),

  // ── Society Submissions ─────────────────────────────────────────────────────
  listSubmissions: () => request("/api/society-submissions/"),
  createSubmission: (payload) => request("/api/society-submissions/", { method: "POST", body: payload }),
  submissionsBySerial: (pid) => request(`/api/society-submissions/serial/${pid}`),
  submissionStats: () => request("/api/society-submissions/stats/overview"),
  markSubmittedToIprs: (id) => request(`/api/society-submissions/${id}/submit-to-iprs`, { method: "POST" }),
  markAcceptedByIprs: (id) => request(`/api/society-submissions/${id}/accept-iprs`, { method: "POST" }),

  // ── Admin Dashboard ─────────────────────────────────────────────────────────
  adminInsights: () => request("/api/insights/dashboard"),
  editorInsights: () => request("/api/insights/editor-dashboard"),
  wdInsights: () => request("/api/insights/wd-dashboard"),
  reviewerCalendar: (year, clientId, societyId) => {
    const q = new URLSearchParams({ year: String(year) });
    if (clientId) q.set("client_id", clientId);
    if (societyId) q.set("society_id", societyId);
    return request(`/api/insights/reviewer-calendar?${q}`);
  },
  insightsCalendar: (year, clientId, societyId) => {
    const q = new URLSearchParams({ year: String(year) });
    if (clientId) q.set("client_id", clientId);
    if (societyId) q.set("society_id", societyId);
    return request(`/api/insights/calendar?${q}`);
  },

  // ── Notify Editor: the sender's own Gmail, and the emails ───────────────────
  myMailbox: () => request("/api/editor-notices/mailbox"),
  connectMyMailbox: () => request("/api/editor-notices/mailbox/connect", { method: "POST" }),
  disconnectMyMailbox: () => request("/api/editor-notices/mailbox", { method: "DELETE" }),
  previewEditorNotice: (editorId, period) => request(`/api/editor-notices/preview/${editorId}?period=${period}`),
  sendEditorNotice: (payload) => request("/api/editor-notices/send", { method: "POST", body: payload }),
  markEditorNoticeRead: (id) => request(`/api/editor-notices/${id}/read`, { method: "POST" }),

  // ── Weekly email reports ────────────────────────────────────────────────────
  reportStatus: () => request("/api/reports/status"),
  previewReport: (role) => request(`/api/reports/preview?role=${role}`),
  testReport: (role) => request("/api/reports/test", { method: "POST", body: { role } }),
  reportRecipients: () => request("/api/reports/recipients"),
  setReportRecipient: (id, enabled) => request(`/api/reports/recipients/${id}`, { method: "PUT", body: { enabled } }),

  // ── Clients + their Gmail connection ────────────────────────────────────────
  listClients: () => request("/api/clients/"),
  createClient: (payload) => request("/api/clients/", { method: "POST", body: payload }),
  updateClient: (id, payload) => request(`/api/clients/${id}`, { method: "PUT", body: payload }),
  deleteClient: (id) => request(`/api/clients/${id}`, { method: "DELETE" }),
  clientMailConfig: () => request("/api/clients/mail-config"),
  legacyClientNames: () => request("/api/clients/legacy-names"),
  linkClientNames: (id, names) => request(`/api/clients/${id}/link-names`, { method: "POST", body: { names } }),
  connectClientMailbox: (id) => request(`/api/clients/${id}/mailbox/connect`, { method: "POST" }),
  checkClientMailbox: (id) => request(`/api/clients/${id}/mailbox/check`, { method: "POST" }),
  disconnectClientMailbox: (id) => request(`/api/clients/${id}/mailbox`, { method: "DELETE" }),

  // ── Societies (where Send to Society emails go) ─────────────────────────────
  listSocieties: () => request("/api/societies/"),
  societyOptions: () => request("/api/societies/options"),
  createSociety: (payload) => request("/api/societies/", { method: "POST", body: payload }),
  updateSociety: (id, payload) => request(`/api/societies/${id}`, { method: "PUT", body: payload }),
  deleteSociety: (id) => request(`/api/societies/${id}`, { method: "DELETE" }),
  previewSocietyMail: (payload) => request("/api/society-submissions/mail/preview", { method: "POST", body: payload }),
  sendSocietyMail: (payload) => request("/api/society-submissions/mail/send", { method: "POST", body: payload }),
  approvedEpisodes: (pid, societyId) => request(`/api/society-submissions/approved-episodes/${pid}${societyId ? `?society_id=${societyId}` : ""}`),
  mailOverview: () => request("/api/society-submissions/mail/overview"),
  syncMail: () => request("/api/society-submissions/mail/sync", { method: "POST" }),
  keepWaiting: (id) => request(`/api/society-submissions/${id}/keep-waiting`, { method: "POST" }),
  confirmDetectedMail: (id, payload) => request(`/api/society-submissions/detected/${id}/confirm`, { method: "POST", body: payload }),
  dismissDetectedMail: (id) => request(`/api/society-submissions/detected/${id}/dismiss`, { method: "POST" }),

  // ── Notifications ───────────────────────────────────────────────────────────
  listNotifications: () => request("/api/notifications/"),
  unreadCount: () => request("/api/notifications/unread-count"),
  markNotifRead: (id) => request(`/api/notifications/${id}/read`, { method: "POST" }),
  markAllRead: () => request("/api/notifications/read-all", { method: "POST" }),

  // ── Stats & Review ──────────────────────────────────────────────────────────
  projectStats: () => request("/api/projects/stats/overview"),
  searchByBgComposer: (q) => request(`/api/projects/search/bg-composer?q=${encodeURIComponent(q || "")}`),
  submittedEpisodes: () => request("/api/activity/submitted-episodes"),
  editorActivityLog: (uid) => request(`/api/activity/editor/${uid}`),
  loginActivity: (limit = 500) => request(`/api/activity/logins?limit=${limit}`),

  // ── Reviewer serial/movie view ───────────────────────────────────────────────
  reviewerSerials: () => request("/api/activity/reviewer-serials"),
  reviewerSerialEpisodes: (pid) => request(`/api/activity/reviewer-serials/${pid}`),
  reviewerMovies: () => request("/api/activity/reviewer-movies"),

  // society: iprs | prs | ascap | workfile
  downloadBulkExport: (projectId, society, fromEp, toEp, filename) =>
    downloadFile(`/api/exports/bulk/project/${projectId}?society=${society}&from_ep=${fromEp}&to_ep=${toEp}`, filename),
  // One ZIP: IPRS + PRS + ASCAP + work file. Reports what the range actually contained.
  downloadBulkAll: async (projectId, fromEp, toEp, filename) => {
    const res = await downloadFile(`/api/exports/bulk/project/${projectId}/all?from_ep=${fromEp}&to_ep=${toEp}`, filename);
    return { workFiles: Number(res.headers.get("X-Work-Files") || 0), episodes: Number(res.headers.get("X-Episodes") || 0) };
  },

  // ── Work files (Source 1 format, one per episode) ───────────────────────────
  listWorkFiles: (pid) => request(`/api/work-files/project/${pid}`),
  previewWorkFiles: (pid, files) => {
    const fd = new FormData();
    files.forEach((f) => fd.append("files", f));
    return request(`/api/work-files/project/${pid}/preview`, { method: "POST", form: fd });
  },
  // serialConfirmed[i]: uploader confirmed file i belongs to this serial despite its title.
  uploadWorkFiles: (pid, files, episodeNumbers, serialConfirmed) => {
    const fd = new FormData();
    files.forEach((f) => fd.append("files", f));
    fd.append("episode_numbers", JSON.stringify(episodeNumbers));
    fd.append("serial_confirmed", JSON.stringify(serialConfirmed));
    return request(`/api/work-files/project/${pid}`, { method: "POST", form: fd });
  },
  deleteWorkFile: (pid, epNum) => request(`/api/work-files/project/${pid}/episode/${epNum}`, { method: "DELETE" }),
  downloadWorkFile: (pid, epNum, filename) => downloadFile(`/api/work-files/project/${pid}/episode/${epNum}`, filename),
};
