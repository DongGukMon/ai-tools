import { useEffect } from "react";
import Layout from "./Layout";
import { ToastContainer } from "./components/ui/toast";
import { initBackendLogPipe } from "./lib/logger";

function App() {
  useEffect(() => {
    let cleanup: (() => void) | undefined;
    initBackendLogPipe().then((fn) => { cleanup = fn; });
    return () => { cleanup?.(); };
  }, []);

  return (
    <>
      <Layout />
      <ToastContainer />
    </>
  );
}

export default App;
