import GoogleFonts from "./styles/fonts";
import { AppProvider, useApp } from "./context/AppContext";
import { DialogRoot } from "./components/Dialog";
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
      <DialogRoot />
      <div
        style={{
          position: "fixed",
          bottom: 10,
          right: 14,
          fontSize: 10,
          fontWeight: 500,
          color: "rgba(0,0,0,0.28)",
          letterSpacing: "0.03em",
          pointerEvents: "none",
          zIndex: 9999,
          userSelect: "none",
        }}
      >
        SK-Version 2.8
      </div>
    </AppProvider>
  );
}
