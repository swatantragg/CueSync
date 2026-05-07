const BASE = (import.meta.env.VITE_API_URL || "").trim().replace(/\/+$/, "");
const TOKEN_KEY = "cuesync_token";
const USER_KEY = "cuesync_user";

function apiUrl(path) {
  return BASE ? `${BASE}${path}` : path;
}

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
    const msg = (data && (data.detail || data.message)) || `${res.status} ${res.statusText}`;
    throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
  }
  return data;
}

export const api = {
  base: BASE,
  health: () => request("/health", { auth: false }),
  signup: (payload) => request("/api/auth/signup", { method: "POST", body: payload, auth: false }),
  login: (email, password) => {
    const form = new URLSearchParams({ username: email, password });
    return request("/api/auth/login", { method: "POST", form, auth: false });
  },
  me: () => request("/api/auth/me"),
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
  listEpisodeActivity: (eid) => request(`/api/activity/episode/${eid}`),
  listProjectActivity: (pid) => request(`/api/activity/project/${pid}`),
  logout: () => request("/api/auth/logout", { method: "POST" }).catch(() => {}),

  downloadExport: async (episodeId, society, filename) => {
    const t = tokenStore.get();
    const res = await fetch(apiUrl(`/api/exports/episode/${episodeId}?society=${society}`), {
      credentials: "include",
      headers: t ? { Authorization: `Bearer ${t}` } : {},
    });
    if (!res.ok) throw new Error((await res.text()) || res.statusText);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  },
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
    if (!res.ok) throw new Error((await res.text()) || res.statusText);
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
    if (!res.ok) throw new Error((await res.text()) || res.statusText);
    return res.json();
  },
  commitRough: (pid, payload) =>
    request(`/api/uploads/rough/project/${pid}/commit`, { method: "POST", body: payload }),

  // ── Users ───────────────────────────────────────────────────────────────────
  listUsers: () => request("/api/users/"),
  listEditors: () => request("/api/users/editors"),
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

  // ── Reviewer serial view ────────────────────────────────────────────────────
  reviewerSerials: () => request("/api/activity/reviewer-serials"),
  reviewerSerialEpisodes: (pid) => request(`/api/activity/reviewer-serials/${pid}`),

  downloadBulkExport: async (projectId, society, fromEp, toEp, filename) => {
    const t = tokenStore.get();
    const url = apiUrl(
      `/api/exports/bulk/project/${projectId}?society=${society}&from_ep=${fromEp}&to_ep=${toEp}`
    );
    const res = await fetch(url, { credentials: "include", headers: t ? { Authorization: `Bearer ${t}` } : {} });
    if (!res.ok) throw new Error((await res.text()) || res.statusText);
    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(a.href);
  },
};
