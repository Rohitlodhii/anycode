import { RouterProvider } from "@tanstack/react-router";
import React, { useEffect } from "react";
import { createRoot } from "react-dom/client";
import { useTranslation } from "react-i18next";
import { updateAppLanguage } from "./actions/language";
import { syncWithLocalTheme } from "./actions/theme";
import { initCodexEventDispatcher } from "./lib/codex-events";
import { useSessionStore } from "./stores/session-store";
import { router } from "./utils/routes";
import "./localization/i18n";

export default function App() {
  const { i18n } = useTranslation();

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
    const { sessions, setSessionConnecting } = useSessionStore.getState();
    for (const session of Object.values(sessions)) {
      if (!session.isArchived) {
        setSessionConnecting(session.id);
        window.codex.ensureAgent(session.id, session.projectPath).catch(() => {
          useSessionStore.getState().setSessionError(session.id, "Failed to reconnect");
        });
      }
    }
  }, []);

  return <RouterProvider router={router} />;
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
