import { useState } from "react";
import { Columns2, GitBranch, Monitor, Play, Rows2, Settings, X } from "lucide-react";
import { useTerminalCommandPipeline } from "../../hooks/useTerminalCommandPipeline";
import type { TerminalCommandDefinition } from "../../lib/terminal-command-pipeline";
import { useTerminalStore, countLeaves } from "../../store/terminal";
import ThemeSettings from "./ThemeSettings";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { cn } from "../../lib/cn";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";

const terminalCommandIcons = {
  settings: Settings,
  "split-horizontal": Columns2,
  "split-vertical": Rows2,
  close: X,
  play: Play,
} satisfies Record<TerminalCommandDefinition["icon"], typeof Settings>;

export default function TerminalToolbar() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const activeWorktree = useTerminalStore((s) => s.activeWorktree);
  const activeSession = useTerminalStore((s) =>
    s.activeWorktree ? s.sessions[s.activeWorktree] : null,
  );
  const { commands, executeCommand, isCommandEnabled } =
    useTerminalCommandPipeline({
      openThemeSettings: () => setSettingsOpen((open) => !open),
    });
  const splitCount = activeSession ? countLeaves(activeSession) : 0;
  const worktreeLabel = getWorktreeLabel(activeWorktree);
  const shellLabel =
    splitCount > 0 ? `${splitCount} ${splitCount === 1 ? "shell" : "shells"}` : "Idle";

  return (
    <>
      <div
        className={cn(
          "shrink-0 border-b border-white/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.94),rgba(249,250,251,0.88))] px-4 py-4",
        )}
      >
        <div className={cn("flex items-start justify-between gap-4")}>
          <div className={cn("flex min-w-0 items-start gap-3")}>
            <div
              className={cn(
                "flex size-10 shrink-0 items-center justify-center rounded-2xl bg-[var(--color-primary-light)] text-[var(--color-primary)] shadow-xs",
              )}
            >
              <Monitor size={18} strokeWidth={1.8} />
            </div>
            <div className={cn("min-w-0")}>
              <div className={cn("flex flex-wrap items-center gap-2")}>
                <h2 className={cn("text-sm font-semibold text-[var(--color-text)]")}>
                  Terminal
                </h2>
                <Badge
                  variant={activeWorktree ? "secondary" : "outline"}
                  className={cn(
                    "rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em]",
                  )}
                >
                  {activeWorktree ? "Active" : "Standby"}
                </Badge>
                <Badge
                  variant="outline"
                  className={cn(
                    "rounded-full border-white/80 bg-white/80 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-text-secondary)]",
                  )}
                >
                  {shellLabel}
                </Badge>
              </div>
              <p className={cn("mt-1 truncate text-[12px] text-[var(--color-text-secondary)]")}>
                {activeWorktree
                  ? "Center-panel shell chrome for the selected worktree."
                  : "Select a worktree to open or restore its terminal session."}
              </p>
            </div>
          </div>

          <div
            className={cn(
              "flex shrink-0 items-center gap-1 rounded-[18px] border border-white/80 bg-white/82 p-1 shadow-xs backdrop-blur",
            )}
          >
          {commands.map((command) => {
            const Icon = terminalCommandIcons[command.icon];
            const destructive = command.id === "terminal-close";

            return (
              <Tooltip key={command.id}>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className={cn(
                      "size-8 rounded-xl border border-transparent text-[var(--color-text-secondary)] shadow-none disabled:opacity-35",
                      {
                        "hover:border-[var(--color-danger-bg)] hover:bg-[var(--color-danger-bg)] hover:text-[var(--color-danger)]":
                          destructive,
                        "hover:border-white hover:bg-[var(--color-bg-secondary)] hover:text-[var(--color-text)]":
                          !destructive,
                      },
                    )}
                    onClick={() => {
                      executeCommand(command).catch(() => {});
                    }}
                    disabled={!isCommandEnabled(command)}
                    aria-label={command.title}
                  >
                    <Icon size={15} strokeWidth={1.7} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" sideOffset={8}>
                  {command.title}
                </TooltipContent>
              </Tooltip>
            );
          })}
          </div>
        </div>

        <div
          className={cn(
            "mt-4 flex items-center gap-3 rounded-[20px] border border-white/80 bg-white/82 px-3 py-3 shadow-xs backdrop-blur",
          )}
        >
          <div
            className={cn(
              "flex size-9 shrink-0 items-center justify-center rounded-2xl bg-[var(--color-bg-secondary)] text-[var(--color-primary)]",
            )}
          >
            <GitBranch size={16} strokeWidth={1.8} />
          </div>
          <div className={cn("min-w-0 flex-1")}>
            <div
              className={cn(
                "flex flex-wrap items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-text-tertiary)]",
              )}
            >
              <span>Worktree path</span>
              {activeWorktree ? (
                <Badge
                  variant="outline"
                  className={cn(
                    "rounded-full border-white/80 bg-white px-2 py-0.5 text-[10px] font-semibold text-[var(--color-text-secondary)]",
                  )}
                >
                  {worktreeLabel ?? "Terminal"}
                </Badge>
              ) : null}
            </div>
            <p className={cn("mt-1 truncate font-mono text-[11px] text-[var(--color-text)]")}>
              {activeWorktree ?? "Select a worktree from the sidebar to open a shell."}
            </p>
          </div>
        </div>
      </div>
      <ThemeSettings
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
    </>
  );
}

function getWorktreeLabel(path: string | null): string | null {
  if (!path) {
    return null;
  }

  const segments = path.split(/[/\\]+/).filter(Boolean);
  return segments[segments.length - 1] ?? path;
}
