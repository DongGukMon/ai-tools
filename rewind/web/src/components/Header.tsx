import type { Session } from "../types";

interface HeaderProps {
  session: Session;
}

export function Header({ session }: HeaderProps) {
  const startTime = new Date(session.startedAt);
  const eventCount = session.events.length;

  return (
    <header className="sticky top-0 z-10 border-b border-neutral-800 bg-neutral-950/80 backdrop-blur-md">
      <div className="max-w-4xl mx-auto px-6 py-4">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold text-neutral-100 tracking-tight">
            rewind
          </h1>
          <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-neutral-800 text-neutral-400">
            {session.backend}
          </span>
          {session.model && (
            <span className="text-xs font-mono text-neutral-500">
              {session.model}
            </span>
          )}
        </div>
        <div className="flex items-center gap-4 mt-1.5 text-xs text-neutral-500">
          <span>{startTime.toLocaleString()}</span>
          <span>{eventCount} events</span>
          {session.cwd && (
            <span className="font-mono truncate max-w-sm">{session.cwd}</span>
          )}
        </div>
      </div>
    </header>
  );
}
