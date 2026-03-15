import { useEffect, useState, type ReactNode } from "react";
import { AlertTriangle, FolderOpen, Monitor } from "lucide-react";
import { useTerminalStore, countLeaves } from "../../store/terminal";
import { useProjectStore } from "../../store/project";
import { getTerminalTheme, getAppConfig, getCommandErrorMessage } from "../../lib/tauri";
import { runCommand } from "../../lib/command";
import { useTerminal } from "../../hooks/useTerminal";
import SplitContainer from "./SplitContainer";
import TerminalToolbar from "./TerminalToolbar";
import { cn } from "../../lib/cn";
import { Badge } from "../ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../ui/card";
import { Spinner } from "../ui/spinner";

export default function TerminalPanel() {
  const sessions = useTerminalStore((s) => s.sessions);
  const activeWorktree = useTerminalStore((s) => s.activeWorktree);
  const theme = useTerminalStore((s) => s.theme);
  const loadTheme = useTerminalStore((s) => s.loadTheme);
  const setActiveWorktree = useTerminalStore((s) => s.setActiveWorktree);
  const selectedWorktree = useProjectStore((s) => s.selectedWorktree);
  const { createTerminal } = useTerminal();
  const [error, setError] = useState<string | null>(null);

  // Load theme + default worktree
  useEffect(() => {
    async function init() {
      try {
        await useTerminalStore.getState().initLayouts();
        const config = await runCommand(() => getAppConfig(), {
          errorToast: false,
        });
        // Use saved theme override if available, otherwise detect
        if (config.terminalTheme) {
          const detected = await runCommand(() => getTerminalTheme(), {
            errorToast: false,
          });
          // Merge: saved theme takes precedence, fill gaps from detected
          loadTheme({ ...detected, ...config.terminalTheme });
        } else {
          const t = await runCommand(() => getTerminalTheme(), {
            errorToast: false,
          });
          loadTheme(t);
        }
        if (!useTerminalStore.getState().activeWorktree) {
          const home = config.baseDir.replace(/[/\\]\.grove$/, "");
          setActiveWorktree(home || "/tmp");
        }
      } catch (e) {
        setError(getCommandErrorMessage(e));
      }
    }
    init();
  }, [loadTheme, setActiveWorktree]);

  // Sync sidebar -> terminal
  useEffect(() => {
    setActiveWorktree(selectedWorktree?.path ?? null);
  }, [selectedWorktree?.path, setActiveWorktree]);

  // Create session for new worktree
  useEffect(() => {
    if (!activeWorktree || !theme) return;
    if (sessions[activeWorktree]) return;
    createTerminal(activeWorktree).catch((e) => {
      setError(getCommandErrorMessage(e));
    });
  }, [activeWorktree, createTerminal, sessions, theme]);

  if (error) {
    return (
      <TerminalShell>
        <StateCard
          tone="danger"
          icon={AlertTriangle}
          title="Terminal shell unavailable"
          description="The center-panel shell could not finish initializing with the current configuration."
          badge="Error"
        >
          {error}
        </StateCard>
      </TerminalShell>
    );
  }

  if (!theme) {
    return (
      <TerminalShell>
        <StateCard
          tone="loading"
          title="Preparing terminal chrome"
          description="Loading the saved theme and layout state before any shells are restored."
          badge="Theme"
        />
      </TerminalShell>
    );
  }

  const sessionEntries = Object.entries(sessions);
  const activeSession = activeWorktree ? sessions[activeWorktree] : null;
  const splitCount = activeSession ? countLeaves(activeSession) : 0;
  const activeWorktreeLabel = getWorktreeLabel(activeWorktree);

  return (
    <TerminalShell>
      <TerminalToolbar />
      <div className={cn("relative min-h-0 flex-1 overflow-hidden")}>
        {!activeWorktree ? (
          <StateCard
            icon={FolderOpen}
            title="Select a worktree"
            description="Choose a worktree from the sidebar to open or restore its terminal session."
            badge="Standby"
          >
            Saved split layouts reopen automatically when they exist.
          </StateCard>
        ) : !activeSession ? (
          <StateCard
            tone="loading"
            title="Opening terminal"
            description="Spinning up the selected shell and restoring any saved split layout."
            badge={activeWorktreeLabel ?? "Worktree"}
          >
            {splitCount > 1
              ? `Restoring ${splitCount} saved shells for this worktree.`
              : "Preparing the first shell for this worktree."}
          </StateCard>
        ) : (
          // Render ALL sessions, show/hide via CSS - preserves xterm state
          sessionEntries.map(([path, node]) => (
            <div
              key={path}
              className={cn("absolute inset-0 p-3")}
              style={{ display: path === activeWorktree ? "block" : "none" }}
            >
              <SplitContainer node={node} />
            </div>
          ))
        )}
      </div>
    </TerminalShell>
  );
}

function TerminalShell({ children }: { children: ReactNode }) {
  return (
    <div
      className={cn(
        "relative flex h-full min-h-0 flex-col overflow-hidden bg-[radial-gradient(circle_at_top,rgba(134,239,172,0.18),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.98),rgba(243,245,247,0.94))] px-3 py-3",
      )}
    >
      <div
        className={cn(
          "pointer-events-none absolute inset-x-0 top-0 h-32 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.82),transparent_70%)]",
        )}
      />
      <div
        className={cn(
          "relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-[28px] border border-white/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.92),rgba(245,247,249,0.96))] shadow-[var(--shadow-md)] ring-1 ring-black/5",
        )}
      >
        {children}
      </div>
    </div>
  );
}

function StateCard({
  tone = "default",
  icon: Icon = Monitor,
  title,
  description,
  badge,
  children,
}: {
  tone?: "default" | "danger" | "loading";
  icon?: typeof Monitor;
  title: string;
  description: string;
  badge?: string;
  children?: ReactNode;
}) {
  const badgeVariant =
    tone === "danger" ? "danger" : tone === "loading" ? "secondary" : "outline";

  return (
    <div className={cn("flex h-full items-center justify-center p-6")}>
      <Card
        className={cn(
          "w-full max-w-lg gap-0 rounded-[24px] border-white/70 bg-white/88 py-0 shadow-[var(--shadow-sm)] backdrop-blur",
        )}
      >
        <CardHeader className={cn("gap-0 border-b border-white/60 px-6 py-6")}>
          <div className={cn("flex items-start gap-4")}>
            <div
              className={cn(
                "flex size-12 shrink-0 items-center justify-center rounded-2xl shadow-xs",
                {
                  "bg-[var(--color-danger-bg)] text-[var(--color-danger)]":
                    tone === "danger",
                  "bg-[var(--color-primary-light)] text-[var(--color-primary)]":
                    tone === "default" || tone === "loading",
                },
              )}
            >
              {tone === "loading" ? (
                <Spinner className={cn("size-5")} />
              ) : (
                <Icon className={cn("size-5")} strokeWidth={1.7} />
              )}
            </div>
            <div className={cn("min-w-0 flex-1")}>
              <div className={cn("flex flex-wrap items-center gap-2")}>
                <CardTitle className={cn("text-[15px] font-semibold text-[var(--color-text)]")}>
                  {title}
                </CardTitle>
                {badge ? (
                  <Badge
                    variant={badgeVariant}
                    className={cn(
                      "rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em]",
                    )}
                  >
                    {badge}
                  </Badge>
                ) : null}
              </div>
              <CardDescription
                className={cn(
                  "mt-2 max-w-[44ch] text-[13px] leading-6 text-[var(--color-text-secondary)]",
                )}
              >
                {description}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        {children ? (
          <CardContent className={cn("px-6 py-4 text-[12px] leading-6 text-[var(--color-text-secondary)]")}>
            <div
              className={cn(
                "rounded-2xl bg-[var(--color-bg-secondary)] px-4 py-3",
                { "font-mono text-[11px]": tone === "danger" },
              )}
            >
              {children}
            </div>
          </CardContent>
        ) : null}
      </Card>
    </div>
  );
}

function getWorktreeLabel(path: string | null): string | null {
  if (!path) {
    return null;
  }

  const segments = path.split(/[/\\]+/).filter(Boolean);
  return segments[segments.length - 1] ?? path;
}
