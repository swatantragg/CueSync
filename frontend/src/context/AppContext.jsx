import { createContext, useContext, useState } from "react";
import { buildSeedData, buildNotifications } from "../data/seed";

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [screen, setScreen] = useState("login");
  const [projects, setProjects] = useState(buildSeedData);
  const [activeProjectId, setActiveProjectId] = useState(null);
  const [activeEpisodeId, setActiveEpisodeId] = useState(null);
  const [notifications, setNotifications] = useState(buildNotifications);

  const activeProject = projects.find((p) => p.id === activeProjectId) || null;
  const activeEpisode = activeProject?.episodes.find((e) => e.id === activeEpisodeId) || null;
  const isAdmin = currentUser?.role === "admin";

  const updateProject = (pid, fn) => setProjects((prev) => prev.map((p) => (p.id === pid ? fn(p) : p)));
  const updateEpisode = (pid, eid, fn) =>
    updateProject(pid, (p) => ({ ...p, episodes: p.episodes.map((e) => (e.id === eid ? fn(e) : e)) }));

  const goHome = () => { setScreen("workspace"); setActiveProjectId(null); setActiveEpisodeId(null); };
  const logout = () => { setCurrentUser(null); setScreen("login"); setActiveProjectId(null); setActiveEpisodeId(null); };

  const value = {
    currentUser, setCurrentUser,
    screen, setScreen,
    projects, setProjects,
    activeProjectId, setActiveProjectId,
    activeEpisodeId, setActiveEpisodeId,
    activeProject, activeEpisode,
    notifications, setNotifications,
    isAdmin, updateProject, updateEpisode, goHome, logout,
  };
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export const useApp = () => {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside AppProvider");
  return ctx;
};
