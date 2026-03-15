import { GitCommit } from "lucide-react";
import type { CommitInfo, FileStatus } from "../../types";
import { cn } from "../../lib/cn";

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

  return (
    <div className={cn("border-b border-[var(--color-border)] shrink-0")}>
      {/* Section header */}
      <div className={cn("text-[11px] uppercase tracking-wider font-medium text-[var(--color-text-tertiary)] px-3 h-[28px] flex items-center border-b border-[var(--color-border)] select-none")}>
        Commits
      </div>

      <div className={cn("max-h-[180px] overflow-y-auto")}>
        {/* Working changes entry */}
        <div
          className={cn(
            "flex items-center gap-2.5 px-3 h-[32px] cursor-pointer select-none overflow-hidden transition-colors duration-100",
            {
              "bg-[var(--color-primary-light)] border-l-[3px] border-l-[var(--color-primary)]":
                isChangesSelected,
              "hover:bg-[var(--color-bg-tertiary)] border-l-[3px] border-l-transparent":
                !isChangesSelected,
            },
          )}
          onClick={() => onSelectView("changes")}
        >
          {/* Blue dot indicator */}
          <span
            className={cn(
              "w-[7px] h-[7px] rounded-full shrink-0",
              {
                "bg-[var(--color-primary)]": hasChanges,
                "bg-[var(--color-text-muted)]": !hasChanges,
              },
            )}
          />
          <span
            className={cn("flex-1 truncate text-[13px] text-[var(--color-text)]", {
              "font-medium": isChangesSelected,
            })}
          >
            Working Changes
          </span>
          {hasChanges && (
            <span className={cn("text-[11px] font-mono text-[var(--color-text-tertiary)] tabular-nums")}>
              {fileStatuses.length}
            </span>
          )}
        </div>

        {/* Commit list */}
        {commits.map((commit) => {
          const isSelected =
            selectedView !== "changes" && selectedView.hash === commit.hash;
          return (
            <div
              key={commit.hash}
              className={cn(
                "flex items-center gap-2 px-3 h-[32px] cursor-pointer select-none overflow-hidden transition-colors duration-100",
                {
                  "bg-[var(--color-primary-light)] border-l-[3px] border-l-[var(--color-primary)]":
                    isSelected,
                  "hover:bg-[var(--color-bg-tertiary)] border-l-[3px] border-l-transparent":
                    !isSelected,
                },
              )}
              onClick={() => onSelectView(commit)}
            >
              <GitCommit
                size={12}
                className={cn("shrink-0 text-[var(--color-text-tertiary)]")}
              />
              <span className={cn("font-mono text-[11px] shrink-0 text-[var(--color-text-tertiary)]")}>
                {commit.shortHash}
              </span>
              <span
                className={cn("min-w-0 flex-1 truncate text-[12px] text-[var(--color-text)]", {
                  "font-medium": isSelected,
                })}
              >
                {commit.message.split("\n")[0]}
              </span>
              <span className={cn("text-[11px] shrink-0 truncate max-w-[80px] text-[var(--color-text-tertiary)]")}>
                {commit.author}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
