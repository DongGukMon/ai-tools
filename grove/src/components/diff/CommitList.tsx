import { GitCommit } from "lucide-react";
import type { CommitInfo, FileStatus } from "../../types";

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
    <div className="border-b border-[var(--color-border)] shrink-0">
      {/* Section header */}
      <div className="text-[11px] uppercase tracking-wider font-medium text-[var(--color-text-tertiary)] px-3 h-[28px] flex items-center border-b border-[var(--color-border)] select-none">
        Commits
      </div>

      <div className="max-h-[180px] overflow-y-auto">
        {/* Working changes entry */}
        <div
          className={`flex items-center gap-2.5 px-3 h-[32px] cursor-pointer select-none transition-colors duration-100 ${
            isChangesSelected
              ? "bg-[var(--color-primary-light)] border-l-[3px] border-l-[var(--color-primary)]"
              : "hover:bg-[var(--color-bg-tertiary)] border-l-[3px] border-l-transparent"
          }`}
          onClick={() => onSelectView("changes")}
        >
          {/* Blue dot indicator */}
          <span
            className={`w-[7px] h-[7px] rounded-full shrink-0 ${
              hasChanges ? "bg-[var(--color-primary)]" : "bg-[var(--color-text-muted)]"
            }`}
          />
          <span className={`flex-1 truncate text-[13px] ${isChangesSelected ? "font-medium text-[var(--color-text)]" : "text-[var(--color-text)]"}`}>
            Working Changes
          </span>
          {hasChanges && (
            <span className="text-[11px] font-mono text-[var(--color-text-tertiary)] tabular-nums">
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
              className={`flex items-center gap-2 px-3 h-[32px] cursor-pointer select-none transition-colors duration-100 ${
                isSelected
                  ? "bg-[var(--color-primary-light)] border-l-[3px] border-l-[var(--color-primary)]"
                  : "hover:bg-[var(--color-bg-tertiary)] border-l-[3px] border-l-transparent"
              }`}
              onClick={() => onSelectView(commit)}
            >
              <GitCommit
                size={12}
                className="shrink-0 text-[var(--color-text-tertiary)]"
              />
              <span className="font-mono text-[11px] shrink-0 text-[var(--color-text-tertiary)]">
                {commit.shortHash}
              </span>
              <span className={`flex-1 truncate text-[12px] ${isSelected ? "text-[var(--color-text)] font-medium" : "text-[var(--color-text)]"}`}>
                {commit.message.split("\n")[0]}
              </span>
              <span className="text-[11px] shrink-0 text-[var(--color-text-tertiary)]">
                {commit.author}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
