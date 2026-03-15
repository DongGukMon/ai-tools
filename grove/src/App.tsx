import Layout from "./Layout";
import { AppShell } from "./components/shell/AppShell";
import { ToastContainer } from "./components/ui/toast";

function App() {
  return (
    <>
      <AppShell>
        <Layout />
      </AppShell>
      <ToastContainer />
    </>
  );
}

export default App;
