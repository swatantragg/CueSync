import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { api, tokenStore, userStore } from "../utils/api";
import { applyFontSize, loadPrefs, savePrefs } from "../utils/prefs";
import { applyTheme } from "../styles/palette";
import { APP_VERSION } from "../constants/version";

const AppContext = createContext(null);
const TOAST_MS = 3000;

const withAvatar = (u) => (u ? { ...u, avatar: (u.full_name || u.email || "?").slice(0, 2).toUpperCase() } : u);

export function AppProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(() => userStore.get());
  const [screen, setScreen] = useState(() => (userStore.get() ? "workspace" : "login"));
  const [projects, setProjects] = useState([]);
  const [activeProjectId, setActiveProjectId] = useState(null);
  const [activeEpisodeId, setActiveEpisodeId] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [prefs, setPrefs] = useState(loadPrefs);
  const [toasts, setToasts] = useState([]);
  const notifTimer = useRef(null);
  // Notification ids already on screen; null until the first fetch seeds it (no toasts for old ones).
  const seenNotifIds = useRef(null);
  const pendingLoginSummary = useRef(false);

  const role = currentUser?.role || "viewer";
  const isAdmin = role === "admin";
  // Hidden role: only the super admin's own /me payload ever carries this flag.
  const isSuperAdmin = isAdmin && !!currentUser?.is_super_admin;
  const isWD = role === "work_delegator";
  const isReviewer = role === "reviewer";
  const isEditor = role === "editor";
  const isPrivileged = isAdmin || isWD || isReviewer;
  const mustChangePassword = !!currentUser?.must_change_password;
  const showWhatsNew = !!currentUser && !mustChangePassword && currentUser.last_seen_version !== APP_VERSION;

  const activeProject = projects.find((p) => p.id === activeProjectId) || null;
  const activeEpisode = activeProject?.episodes?.find((e) => e.id === activeEpisodeId) || null;

  // ── Toasts ────────────────────────────────────────────────────────────────
  const dismissToast = useCallback((id) => setToasts((prev) => prev.filter((t) => t.id !== id)), []);
  const pushToast = useCallback((toast) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const duration = toast.duration || TOAST_MS;
    setToasts((prev) => [...prev.slice(-3), { kind: "info", ...toast, id, duration }]);
    setTimeout(() => dismissToast(id), duration);
  }, [dismissToast]);

  // ── Preferences ───────────────────────────────────────────────────────────
  const updatePrefs = (patch) => setPrefs((prev) => {
    const next = { ...prev, ...patch };
    savePrefs(next);
    return next;
  });
  const setFontSize = (key) => { applyFontSize(key); updatePrefs({ fontSize: key }); };
  // Palette values are CSS variables, so applying the theme restyles everything immediately.
  const setTheme = (name) => { applyTheme(name, prefs.mode); updatePrefs({ theme: name }); };
  const setMode = (mode) => { applyTheme(prefs.theme, mode); updatePrefs({ mode }); };

  // "System" follows the OS appearance live.
  useEffect(() => {
    if (prefs.mode !== "system" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme(prefs.theme, "system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [prefs.mode, prefs.theme]);

  // ── Notifications ─────────────────────────────────────────────────────────
  // `silent` marks everything as seen without toasting (used right after the user's own action).
  const fetchNotifications = useCallback(async ({ silent = false } = {}) => {
    if (!userStore.get()) return;
    try {
      const rows = await api.listNotifications();
      setNotifications(rows);
      setUnreadCount(rows.filter((n) => !n.is_read).length);
      const seen = seenNotifIds.current;
      const fresh = seen && !silent ? rows.filter((n) => !n.is_read && !seen.has(n.id)) : [];
      seenNotifIds.current = new Set(rows.map((n) => n.id));
      fresh.slice(0, 3).reverse().forEach((n) => pushToast({
        title: n.title, body: n.body, kind: n.entity_type === "delegation" ? "assign" : "info",
      }));
    } catch (_) {}
  }, [pushToast]);

  const showLoginSummary = useCallback(async (u) => {
    if (u?.role !== "editor") return;
    try {
      const rows = await api.listDelegations();
      const active = rows.filter((d) => d.status !== "completed");
      if (!active.length) return;
      pushToast({
        kind: "assign",
        title: `${active.length} work item${active.length !== 1 ? "s" : ""} assigned to you`,
        items: active.map((d) => `${d.serial_name}${d.episode_range ? ` · Ep ${d.episode_range}` : ""}`),
      });
    } catch (_) {}
  }, [pushToast]);

  useEffect(() => {
    if (userStore.get()) {
      // Always refresh role from DB on mount — localStorage role can be stale if admin changed it
      api.me()
        .then((u) => { const next = withAvatar(u); userStore.set(next); setCurrentUser(next); })
        .catch(() => { userStore.set(null); setCurrentUser(null); setScreen("login"); });
    }
  }, []);

  useEffect(() => {
    if (!currentUser?.id || mustChangePassword) return;
    fetchNotifications();
    notifTimer.current = setInterval(fetchNotifications, 30000);
    if (pendingLoginSummary.current) {
      pendingLoginSummary.current = false;
      showLoginSummary(currentUser);
    }
    return () => clearInterval(notifTimer.current);
  }, [currentUser?.id, mustChangePassword, fetchNotifications, showLoginSummary]);

  const resetSession = () => {
    tokenStore.clear(); userStore.set(null);
    setCurrentUser(null); setScreen("login");
    setActiveProjectId(null); setActiveEpisodeId(null);
    setNotifications([]); setUnreadCount(0); setToasts([]);
    seenNotifIds.current = null;
    clearInterval(notifTimer.current);
  };

  useEffect(() => {
    window.addEventListener("auth:expired", resetSession);
    return () => window.removeEventListener("auth:expired", resetSession);
  }, []);

  const markRead = async (id) => {
    await api.markNotifRead(id).catch(() => {});
    setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, is_read: true } : n));
    setUnreadCount((c) => Math.max(0, c - 1));
  };

  const markAllRead = async () => {
    await api.markAllRead().catch(() => {});
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    setUnreadCount(0);
  };

  // always normalise project type to lowercase so comparisons are consistent
  const normaliseProject = (p) => ({ ...p, type: (p.type || "serial").toLowerCase() });
  const safeSetProjects = (arg) =>
    setProjects((prev) => {
      const next = typeof arg === "function" ? arg(prev) : arg;
      return next.map(normaliseProject);
    });
  const updateProject = (pid, fn) =>
    safeSetProjects((prev) => prev.map((p) => (p.id === pid ? normaliseProject(fn(p)) : p)));
  const updateEpisode = (pid, eid, fn) =>
    updateProject(pid, (p) => ({ ...p, episodes: (p.episodes || []).map((e) => (e.id === eid ? fn(e) : e)) }));

  const goHome = () => { setScreen("workspace"); setActiveProjectId(null); setActiveEpisodeId(null); };

  const applyUser = (u) => {
    const next = withAvatar(u);
    userStore.set(next);
    setCurrentUser(next);
    return next;
  };

  const login = async (email, password) => {
    const res = await api.login(email, password);
    if (res.access_token) tokenStore.set(res.access_token);
    seenNotifIds.current = null;
    pendingLoginSummary.current = true;
    applyUser(res.user);
    setScreen("workspace");
  };
  const changePassword = async (payload) => applyUser(await api.changePassword(payload));
  const dismissWhatsNew = async () => {
    applyUser({ ...currentUser, last_seen_version: APP_VERSION });
    try { applyUser(await api.markVersionSeen(APP_VERSION)); } catch (_) {}
  };
  const logout = () => {
    api.logout();  // blacklists token server-side + clears httpOnly cookies
    resetSession();
  };

  const value = {
    currentUser, setCurrentUser,
    screen, setScreen,
    projects, setProjects: safeSetProjects,
    activeProjectId, setActiveProjectId,
    activeEpisodeId, setActiveEpisodeId,
    activeProject, activeEpisode,
    notifications, setNotifications,
    unreadCount, markRead, markAllRead, fetchNotifications,
    toasts, pushToast, dismissToast,
    prefs, setFontSize, setTheme, setMode,
    isAdmin, isSuperAdmin, isWD, isReviewer, isEditor, isPrivileged, role,
    mustChangePassword, changePassword, showWhatsNew, dismissWhatsNew,
    updateProject, updateEpisode,
    goHome, login, logout,
  };
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export const useApp = () => {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside AppProvider");
  return ctx;
};
