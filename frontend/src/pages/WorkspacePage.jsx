import { useApp } from "../context/AppContext";
import AdminDashboard from "./dashboards/AdminDashboard";
import WDDashboard from "./dashboards/WDDashboard";
import ReviewerDashboard from "./dashboards/ReviewerDashboard";
import EditorDashboard from "./dashboards/EditorDashboard";
import ProjectsTab from "./dashboards/ProjectsTab";

export default function WorkspacePage() {
  const { role } = useApp();

  if (role === "admin") return <AdminDashboard />;
  if (role === "work_delegator") return <WDDashboard />;
  if (role === "reviewer") return <ReviewerDashboard />;
  if (role === "editor") return <EditorDashboard />;
  return <ProjectsTab />;
}
