import { useEffect } from "react";
import Layout from "./Layout";
import { ToastContainer } from "./components/ui/toast";
import { OverlayContainer } from "./lib/overlay";
import { initBackendLogPipe } from "./lib/logger";
import { usePreventFullscreenEscape } from "./hooks/usePreventFullscreenEscape";
import { checkForUpdates } from "./lib/updater";
import { useToastStore } from "./store/toast";

function App() {
  usePreventFullscreenEscape();

  useEffect(() => {
    let cancelled = false;
    let cleanup: (() => void) | undefined;
    initBackendLogPipe().then((fn) => {
      if (cancelled) { fn?.(); }
      else { cleanup = fn; }
    });
    return () => { cancelled = true; cleanup?.(); };
  }, []);

  useEffect(() => {
    checkForUpdates((version) => {
      useToastStore.getState().addToast(
        "info",
        `Update available: v${version}. Restart the app to update.`,
      );
    });
  }, []);

  return (
    <>
      <Layout />
      <OverlayContainer />
      <ToastContainer />
    </>
  );
}

export default App;
