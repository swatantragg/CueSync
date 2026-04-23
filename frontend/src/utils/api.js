const BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";
const TOKEN_KEY = "cuesync_token";
const USER_KEY = "cuesync_user";

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
    const t = tokenStore.get();
    if (t) headers["Authorization"] = `Bearer ${t}`;
  }
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: form ? form : body ? JSON.stringify(body) : undefined,
  });
  const ct = res.headers.get("content-type") || "";
  const data = ct.includes("application/json") ? await res.json() : await res.text();
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
  submitEpisode: (eid) => request(`/api/episodes/${eid}/submit`, { method: "POST" }),
  approveEpisode: (eid) => request(`/api/episodes/${eid}/approve`, { method: "POST" }),
  rejectEpisode: (eid, note) => request(`/api/episodes/${eid}/reject`, { method: "POST", body: { note } }),
  suggestEpisode: (eid, note) => request(`/api/episodes/${eid}/suggest`, { method: "POST", body: { note } }),
  listEpisodeActivity: (eid) => request(`/api/activity/episode/${eid}`),
  listProjectActivity: (pid) => request(`/api/activity/project/${pid}`),
  downloadExport: async (episodeId, society, filename) => {
    const t = tokenStore.get();
    const res = await fetch(`${BASE}/api/exports/episode/${episodeId}?society=${society}`, {
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
    const res = await fetch(`${BASE}/api/uploads/rough/project/${pid}`, {
      method: "POST", body: fd, headers: t ? { Authorization: `Bearer ${t}` } : {},
    });
    if (!res.ok) throw new Error((await res.text()) || res.statusText);
    return res.json();
  },
  previewRough: async (pid, file) => {
    const fd = new FormData();
    fd.append("file", file);
    const t = tokenStore.get();
    const res = await fetch(`${BASE}/api/uploads/rough/project/${pid}/preview`, {
      method: "POST", body: fd, headers: t ? { Authorization: `Bearer ${t}` } : {},
    });
    if (!res.ok) throw new Error((await res.text()) || res.statusText);
    return res.json();
  },
  commitRough: (pid, payload) =>
    request(`/api/uploads/rough/project/${pid}/commit`, { method: "POST", body: payload }),
};
