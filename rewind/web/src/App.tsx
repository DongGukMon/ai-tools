import { useEffect, useState } from "react";
import type { Session } from "./types";
import { Timeline } from "./components/Timeline";
import { Header } from "./components/Header";

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token") ?? "";

    fetch(`./api/session?token=${token}`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(setSession)
      .catch((err) => setError(err.message));
  }, []);

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-red-400 text-sm font-mono">{error}</div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-neutral-500 text-sm">Loading session...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <Header session={session} />
      <Timeline events={session.events} />
    </div>
  );
}
