import { useEffect } from "react";
import Layout from "./Layout";
import { ToastContainer } from "./components/ui/toast";
import { initBackendLogPipe } from "./lib/logger";

function App() {
  useEffect(() => {
    initBackendLogPipe();
  }, []);

  return (
    <>
      <Layout />
      <ToastContainer />
    </>
  );
}

export default App;
