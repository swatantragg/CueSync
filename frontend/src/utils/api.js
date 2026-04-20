const BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

async function request(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
    ...opts,
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  const ct = res.headers.get("content-type") || "";
  return ct.includes("application/json") ? res.json() : res.text();
}

export const api = {
  base: BASE,
  health: () => request("/health"),
  root: () => request("/"),
  login: (email, password) => {
    const body = new URLSearchParams({ username: email, password });
    return fetch(`${BASE}/api/auth/login`, { method: "POST", body }).then((r) => r.json());
  },
  get: (p, token) => request(p, { headers: token ? { Authorization: `Bearer ${token}` } : {} }),
  post: (p, data, token) =>
    request(p, { method: "POST", body: JSON.stringify(data), headers: token ? { Authorization: `Bearer ${token}` } : {} }),
};
