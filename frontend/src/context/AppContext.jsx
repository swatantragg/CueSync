import { createContext, useContext, useEffect, useState } from "react";
import { api, tokenStore, userStore } from "../utils/api";

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(() => userStore.get());
  const [screen, setScreen] = useState(() => (tokenStore.get() && userStore.get() ? "workspace" : "login"));
  const [projects, setProjects] = useState([]);
  const [activeProjectId, setActiveProjectId] = useState(null);
  const [activeEpisodeId, setActiveEpisodeId] = useState(null);
  const [notifications, setNotifications] = useState([]);

  const activeProject = projects.find((p) => p.id === activeProjectId) || null;
  const activeEpisode = activeProject?.episodes.find((e) => e.id === activeEpisodeId) || null;
  const isAdmin = currentUser?.role === "admin";

  useEffect(() => {
    if (tokenStore.get() && !currentUser) {
      api.me().then((u) => { userStore.set(u); setCurrentUser(u); }).catch(() => tokenStore.clear());
    }
  }, []);

  const updateProject = (pid, fn) => setProjects((prev) => prev.map((p) => (p.id === pid ? fn(p) : p)));
  const updateEpisode = (pid, eid, fn) =>
    updateProject(pid, (p) => ({ ...p, episodes: p.episodes.map((e) => (e.id === eid ? fn(e) : e)) }));

  const goHome = () => { setScreen("workspace"); setActiveProjectId(null); setActiveEpisodeId(null); };

  const finishAuth = (res) => {
    tokenStore.set(res.access_token);
    const u = { ...res.user, avatar: (res.user.full_name || res.user.email).slice(0, 2).toUpperCase() };
    userStore.set(u);
    setCurrentUser(u);
    setScreen("workspace");
  };
  const login = async (email, password) => finishAuth(await api.login(email, password));
  const signup = async (payload) => finishAuth(await api.signup(payload));
  const logout = () => { tokenStore.clear(); setCurrentUser(null); setScreen("login"); setActiveProjectId(null); setActiveEpisodeId(null); };

  const value = {
    currentUser, setCurrentUser,
    screen, setScreen,
    projects, setProjects,
    activeProjectId, setActiveProjectId,
    activeEpisodeId, setActiveEpisodeId,
    activeProject, activeEpisode,
    notifications, setNotifications,
    isAdmin, updateProject, updateEpisode,
    goHome, login, signup, logout,
  };
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export const useApp = () => {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside AppProvider");
  return ctx;
};
