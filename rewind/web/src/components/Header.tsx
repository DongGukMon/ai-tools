import { Sun, Moon, ArrowUpDown } from "lucide-react";
import type { Session, TabId } from "../types";
import { useTheme } from "../lib/ThemeContext";

interface HeaderProps {
  session: Session;
  sortOrder: "newest" | "oldest";
  onToggleSort: () => void;
  activeTab: TabId;
}

export function Header({
  session,
  sortOrder,
  onToggleSort,
  activeTab,
}: HeaderProps) {
  const startTime = new Date(session.startedAt);
  const eventCount = session.events.length;
  const { theme, toggle } = useTheme();

  return (
    <header className="liquid-glass-header">
      <div className="max-w-4xl mx-auto px-6 py-4 relative z-[1]">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold text-slate-900 dark:text-neutral-100 tracking-tight">
            rewind
          </h1>
          <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-slate-200/60 dark:bg-neutral-800 text-slate-600 dark:text-neutral-400">
            {session.backend}
          </span>
          {session.model && (
            <span className="text-xs font-mono text-slate-500 dark:text-neutral-500">
              {session.model}
            </span>
          )}
          <div className="flex-1" />
          {activeTab === "timeline" && (
            <button
              onClick={onToggleSort}
              className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs text-slate-500 dark:text-neutral-400 hover:text-slate-800 dark:hover:text-neutral-200 hover:bg-slate-200/50 dark:hover:bg-neutral-800/50 transition-colors duration-150"
              aria-label={`Sort: ${sortOrder === "newest" ? "newest first" : "oldest first"}`}
            >
              <ArrowUpDown className="w-3.5 h-3.5" />
              <span>{sortOrder === "newest" ? "Newest" : "Oldest"}</span>
            </button>
          )}
          <button
            onClick={toggle}
            className="p-1.5 rounded-lg text-slate-500 dark:text-neutral-400 hover:text-slate-800 dark:hover:text-neutral-200 hover:bg-slate-200/50 dark:hover:bg-neutral-800/50 transition-colors duration-150"
            aria-label={`Switch to ${theme === "light" ? "dark" : "light"} theme`}
          >
            {theme === "light" ? (
              <Moon className="w-4 h-4" />
            ) : (
              <Sun className="w-4 h-4" />
            )}
          </button>
        </div>
        <div className="flex items-center gap-4 mt-1.5 text-xs text-slate-500 dark:text-neutral-500">
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
