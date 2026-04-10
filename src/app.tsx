import { RouterProvider } from "@tanstack/react-router";
import React, { useEffect } from "react";
import { createRoot } from "react-dom/client";
import { useTranslation } from "react-i18next";
import { updateAppLanguage } from "./actions/language";
import { syncWithLocalTheme } from "./actions/theme";
import { initCodexEventDispatcher } from "./lib/codex-events";
import { StartupGate } from "./components/startup-gate";
import { LoadingScreen } from "./components/loading-screen";
import { Toaster } from "./components/ui/sonner";
import { useSessionStore } from "./stores/session-store";
import { router } from "./utils/routes";
import "./localization/i18n";
import "react-diff-view/style/index.css";

export default function App() {
  const { i18n } = useTranslation();
  const hasHydrated = useSessionStore((state) => state.hasHydrated);
  const [bootStarted, setBootStarted] = React.useState(false);
  const [appReady, setAppReady] = React.useState(false);
  const [loadingStatus, setLoadingStatus] = React.useState("Initializing...");
  const [loadingError, setLoadingError] = React.useState<string | undefined>();

  useEffect(() => {
    document.documentElement.classList.add("dark");
    syncWithLocalTheme();
    updateAppLanguage(i18n);
  }, [i18n]);

  useEffect(() => {
    const cleanup = initCodexEventDispatcher();
    return cleanup;
  }, []);

  // Subscribe to session:ready events from the main process
  useEffect(() => {
    const unsubscribe = window.codex.onSessionReady((payload) => {
      const { setSessionReady } = useSessionStore.getState();
      setSessionReady(payload.sessionId, payload.session);
    });
    return unsubscribe;
  }, []);

  // On app load, reconnect all non-archived persisted sessions
  useEffect(() => {
    if (!hasHydrated) {
      return;
    }

    const initializeApp = async () => {
      try {
        setBootStarted(true);
        setLoadingStatus("Starting Codex...");

        const { sessions, setSessionConnecting } = useSessionStore.getState();
        
        // Reconnect all non-archived sessions
        const reconnectPromises = Object.values(sessions)
          .filter((session) => !session.isArchived)
          .map(async (session) => {
            setSessionConnecting(session.id);
            try {
              await window.codex.ensureAgent(session.id, session.projectPath);
            } catch (error) {
              useSessionStore.getState().setSessionError(session.id, "Failed to reconnect");
            }
          });

        await Promise.all(reconnectPromises);

        setLoadingStatus("Loading workspace...");
        
        // Add a small delay to ensure everything is ready
        await new Promise((resolve) => setTimeout(resolve, 300));

        setLoadingStatus("Ready");
        
        // Fade out after 500ms
        setTimeout(() => setAppReady(true), 500);
      } catch (error) {
        console.error("Failed to initialize app:", error);
        setLoadingError(
          error instanceof Error ? error.message : "Failed to initialize application"
        );
      }
    };

    initializeApp();
  }, [hasHydrated]);

  const handleRetry = () => {
    setLoadingError(undefined);
    setAppReady(false);
    setLoadingStatus("Initializing...");
    // Trigger re-initialization by resetting hasHydrated state
    window.location.reload();
  };

  return (
    <>
      <LoadingScreen
        status={loadingStatus}
        error={loadingError}
        onRetry={handleRetry}
        isVisible={!appReady}
      />
      <StartupGate isReady={hasHydrated && bootStarted}>
        <RouterProvider router={router} />
        <Toaster />
      </StartupGate>
    </>
  );
}

const container = document.getElementById("app");
if (!container) {
  throw new Error('Root element with id "app" not found');
}
const root = createRoot(container);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
