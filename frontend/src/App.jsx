import GoogleFonts from "./styles/fonts";
import { AppProvider, useApp } from "./context/AppContext";
import LoginPage from "./pages/LoginPage";
import SignupPage from "./pages/SignupPage";
import WorkspacePage from "./pages/WorkspacePage";
import SerialPage from "./pages/SerialPage";
import EpisodePage from "./pages/EpisodePage";

function Router() {
  const { screen } = useApp();
  if (screen === "login") return <LoginPage />;
  if (screen === "signup") return <SignupPage />;
  if (screen === "workspace") return <WorkspacePage />;
  if (screen === "serial") return <SerialPage />;
  if (screen === "episode") return <EpisodePage />;
  return null;
}

export default function App() {
  return (
    <AppProvider>
      <GoogleFonts />
      <Router />
    </AppProvider>
  );
}
