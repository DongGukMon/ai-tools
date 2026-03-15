import { CircleDot, GitCommit, History } from "lucide-react";
import type { CommitInfo, FileStatus } from "../../types";
import { cn } from "../../lib/cn";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";

interface Props {
  commits: CommitInfo[];
  fileStatuses: FileStatus[];
  selectedView: "changes" | CommitInfo;
  onSelectView: (view: "changes" | CommitInfo) => void;
}

export default function CommitList({
  commits,
  fileStatuses,
  selectedView,
  onSelectView,
}: Props) {
  const hasChanges = fileStatuses.length > 0;
  const isChangesSelected = selectedView === "changes";
  const stagedCount = fileStatuses.filter((file) => file.staged).length;
  const unstagedCount = fileStatuses.length - stagedCount;

  return (
    <div
      className={cn(
        "shrink-0 border-b border-[var(--color-border)] bg-[var(--color-bg-secondary)]",
      )}
    >
      <div
        className={cn(
          "flex items-center justify-between px-4 pb-2 pt-3 select-none",
        )}
      >
        <div className={cn("min-w-0")}>
          <div
            className={cn(
              "flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]",
            )}
          >
            <History size={11} />
            <span>History</span>
          </div>
          <p
            className={cn(
              "mt-1 text-[13px] font-semibold text-[var(--color-text)]",
            )}
          >
            Commits
          </p>
        </div>
        <Badge
          variant="secondary"
          className={cn(
            "rounded-full border border-[var(--color-border-light)] bg-white px-2 py-0 text-[10px] font-semibold text-[var(--color-text-secondary)] shadow-xs",
          )}
        >
          {commits.length + 1}
        </Badge>
      </div>

      <div className={cn("max-h-[240px] overflow-y-auto px-3 pb-3")}>
        <div className={cn("space-y-1.5")}>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={cn(
              "h-auto w-full justify-start rounded-xl border px-3 py-3 text-left shadow-xs transition-all",
              {
                "border-[var(--color-primary-border)] bg-white text-[var(--color-text)]":
                  isChangesSelected,
                "border-transparent bg-transparent text-[var(--color-text)] hover:border-[var(--color-border-light)] hover:bg-white/80":
                  !isChangesSelected,
              },
            )}
            onClick={() => onSelectView("changes")}
          >
            <div className={cn("flex w-full items-start gap-3")}>
              <div
                className={cn(
                  "flex size-8 shrink-0 items-center justify-center rounded-xl border bg-white",
                  {
                    "border-[var(--color-primary-border)] text-[var(--color-primary)]":
                      isChangesSelected,
                    "border-[var(--color-border-light)] text-[var(--color-text-secondary)]":
                      !isChangesSelected,
                  },
                )}
              >
                <CircleDot
                  size={14}
                  strokeWidth={2.25}
                  className={cn({
                    "text-[var(--color-primary)]": hasChanges,
                    "text-[var(--color-text-muted)]": !hasChanges,
                  })}
                />
              </div>
              <div className={cn("min-w-0 flex-1")}>
                <div className={cn("flex items-center gap-2")}>
                  <span className={cn("truncate text-[13px] font-semibold")}>
                    Working Changes
                  </span>
                  {hasChanges && (
                    <Badge
                      variant="secondary"
                      className={cn(
                        "rounded-full border border-[var(--color-primary-border)] bg-[var(--color-primary-light)] px-2 py-0 text-[10px] font-semibold text-[var(--color-primary)]",
                      )}
                    >
                      {fileStatuses.length}
                    </Badge>
                  )}
                </div>
                <p
                  className={cn(
                    "mt-1 text-[11px] leading-relaxed text-[var(--color-text-secondary)]",
                  )}
                >
                  {hasChanges
                    ? `${stagedCount} staged • ${unstagedCount} unstaged`
                    : "No local changes in this worktree"}
                </p>
              </div>
            </div>
          </Button>

          {commits.map((commit) => {
            const isSelected =
              selectedView !== "changes" && selectedView.hash === commit.hash;

            return (
              <Button
                key={commit.hash}
                type="button"
                variant="ghost"
                size="sm"
                className={cn(
                  "h-auto w-full justify-start rounded-xl border px-3 py-3 text-left shadow-xs transition-all",
                  {
                    "border-[var(--color-primary-border)] bg-white text-[var(--color-text)]":
                      isSelected,
                    "border-transparent bg-transparent text-[var(--color-text)] hover:border-[var(--color-border-light)] hover:bg-white/80":
                      !isSelected,
                  },
                )}
                onClick={() => onSelectView(commit)}
              >
                <div className={cn("flex w-full items-start gap-3")}>
                  <div
                    className={cn(
                      "flex size-8 shrink-0 items-center justify-center rounded-xl border bg-white",
                      {
                        "border-[var(--color-primary-border)] text-[var(--color-primary)]":
                          isSelected,
                        "border-[var(--color-border-light)] text-[var(--color-text-secondary)]":
                          !isSelected,
                      },
                    )}
                  >
                    <GitCommit size={14} strokeWidth={2} />
                  </div>
                  <div className={cn("min-w-0 flex-1")}>
                    <div className={cn("flex items-center gap-2")}>
                      <span
                        className={cn("min-w-0 flex-1 truncate text-[12px]", {
                          "font-semibold": isSelected,
                          "font-medium": !isSelected,
                        })}
                      >
                        {commit.message.split("\n")[0]}
                      </span>
                      <Badge
                        variant="outline"
                        className={cn(
                          "rounded-full border-[var(--color-border-light)] bg-white px-2 py-0 font-mono text-[10px] font-semibold text-[var(--color-text-secondary)]",
                        )}
                      >
                        {commit.shortHash}
                      </Badge>
                    </div>
                    <div
                      className={cn(
                        "mt-1 flex items-center gap-1.5 text-[11px] text-[var(--color-text-secondary)]",
                      )}
                    >
                      <span className={cn("truncate")}>{commit.author}</span>
                      <span className={cn("text-[var(--color-text-muted)]")}>
                        •
                      </span>
                      <span className={cn("truncate")}>{commit.date}</span>
                    </div>
                  </div>
                </div>
              </Button>
            );
          })}
        </div>
      </div>

      {commits.length === 0 && !hasChanges && (
        <div
          className={cn(
            "px-4 pb-4 text-[11px] text-[var(--color-text-tertiary)]",
          )}
        >
          No commits available for this worktree yet.
        </div>
      )}
    </div>
  );
}
