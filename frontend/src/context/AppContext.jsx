import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { api, tokenStore, userStore } from "../utils/api";

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(() => userStore.get());
  const [screen, setScreen] = useState(() => (userStore.get() ? "workspace" : "login"));
  const [projects, setProjects] = useState([]);
  const [activeProjectId, setActiveProjectId] = useState(null);
  const [activeEpisodeId, setActiveEpisodeId] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const notifTimer = useRef(null);

  const role = currentUser?.role || "viewer";
  const isAdmin = role === "admin";
  const isWD = role === "work_delegator";
  const isReviewer = role === "reviewer";
  const isEditor = role === "editor";
  const isPrivileged = isAdmin || isWD || isReviewer;

  const activeProject = projects.find((p) => p.id === activeProjectId) || null;
  const activeEpisode = activeProject?.episodes?.find((e) => e.id === activeEpisodeId) || null;

  // Fetch notifications from DB
  const fetchNotifications = useCallback(async () => {
    if (!userStore.get()) return;
    try {
      const rows = await api.listNotifications();
      setNotifications(rows);
      setUnreadCount(rows.filter((n) => !n.is_read).length);
    } catch (_) {}
  }, []);

  useEffect(() => {
    if (userStore.get()) {
      // Always refresh role from DB on mount — localStorage role can be stale if admin changed it
      api.me()
        .then((u) => { userStore.set(u); setCurrentUser(u); })
        .catch(() => { userStore.set(null); setCurrentUser(null); setScreen("login"); });
    }
  }, []);

  useEffect(() => {
    if (!currentUser) return;
    fetchNotifications();
    notifTimer.current = setInterval(fetchNotifications, 30000);
    return () => clearInterval(notifTimer.current);
  }, [currentUser, fetchNotifications]);

  useEffect(() => {
    const handle = () => {
      tokenStore.clear(); userStore.set(null); // clear both stores
      setCurrentUser(null); setScreen("login");
      setActiveProjectId(null); setActiveEpisodeId(null);
      setNotifications([]); setUnreadCount(0);
    };
    window.addEventListener("auth:expired", handle);
    return () => window.removeEventListener("auth:expired", handle);
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

  const updateProject = (pid, fn) => setProjects((prev) => prev.map((p) => (p.id === pid ? fn(p) : p)));
  const updateEpisode = (pid, eid, fn) =>
    updateProject(pid, (p) => ({ ...p, episodes: (p.episodes || []).map((e) => (e.id === eid ? fn(e) : e)) }));

  const goHome = () => { setScreen("workspace"); setActiveProjectId(null); setActiveEpisodeId(null); };

  const finishAuth = (res) => {
    if (res.access_token) tokenStore.set(res.access_token);
    const u = { ...res.user, avatar: (res.user.full_name || res.user.email).slice(0, 2).toUpperCase() };
    userStore.set(u);
    setCurrentUser(u);
    setScreen("workspace");
  };
  const login = async (email, password) => finishAuth(await api.login(email, password));
  const signup = async (payload) => finishAuth(await api.signup(payload));
  const logout = () => {
    api.logout();  // blacklists token server-side + clears httpOnly cookies
    tokenStore.clear(); setCurrentUser(null); setScreen("login");
    setActiveProjectId(null); setActiveEpisodeId(null);
    setNotifications([]); setUnreadCount(0);
    clearInterval(notifTimer.current);
  };

  const value = {
    currentUser, setCurrentUser,
    screen, setScreen,
    projects, setProjects,
    activeProjectId, setActiveProjectId,
    activeEpisodeId, setActiveEpisodeId,
    activeProject, activeEpisode,
    notifications, setNotifications,
    unreadCount, markRead, markAllRead, fetchNotifications,
    isAdmin, isWD, isReviewer, isEditor, isPrivileged, role,
    updateProject, updateEpisode,
    goHome, login, signup, logout,
  };
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export const useApp = () => {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside AppProvider");
  return ctx;
};
