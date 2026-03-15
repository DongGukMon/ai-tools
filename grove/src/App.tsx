import { useEffect } from "react";
import Layout from "./Layout";
import { ToastContainer } from "./components/ui/toast";
import { initBackendLogPipe } from "./lib/logger";

function App() {
  useEffect(() => {
    let cancelled = false;
    let cleanup: (() => void) | undefined;
    initBackendLogPipe().then((fn) => {
      if (cancelled) { fn?.(); }
      else { cleanup = fn; }
    });
    return () => { cancelled = true; cleanup?.(); };
  }, []);

  return (
    <>
      <Layout />
      <ToastContainer />
    </>
  );
}

export default App;
