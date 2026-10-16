import GoogleFonts from "./styles/fonts";
import { AppProvider, useApp } from "./context/AppContext";
import { DialogRoot } from "./components/Dialog";
import ToastHost from "./components/ToastHost";
import WhatsNewModal from "./components/WhatsNewModal";
import LoginPage from "./pages/LoginPage";
import ChangePasswordPage from "./pages/ChangePasswordPage";
import WorkspacePage from "./pages/WorkspacePage";
import SerialPage from "./pages/SerialPage";
import EpisodePage from "./pages/EpisodePage";
import { APP_VERSION } from "./constants/version";
import { C } from "./styles/palette";

function Router() {
  const { screen, currentUser, mustChangePassword } = useApp();
  if (screen === "login" || !currentUser) return <LoginPage />;
  if (mustChangePassword) return <ChangePasswordPage />;
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
      <WhatsNewModal />
      <ToastHost />
      <DialogRoot />
      <div
        style={{
          position: "fixed",
          bottom: 10,
          right: 14,
          fontSize: "0.625rem",
          fontWeight: 600,
          color: C.muted,
          letterSpacing: "0.03em",
          pointerEvents: "none",
          zIndex: 9999,
          userSelect: "none",
        }}
      >
        V{APP_VERSION}
      </div>
    </AppProvider>
  );
}
