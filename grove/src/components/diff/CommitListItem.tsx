import { GitCommit } from "lucide-react";
import type { CommitInfo } from "../../types";
import { formatCommitTime } from "../../lib/format-time";
import { cn } from "../../lib/cn";

interface Props {
  commit: CommitInfo;
  isSelected: boolean;
  onClick: () => void;
}

export default function CommitListItem({ commit, isSelected, onClick }: Props) {
  return (
    <div
      className={cn(
        "flex items-start gap-3 px-4 py-2 cursor-pointer transition-colors",
        {
          "bg-selected": isSelected,
          "hover:bg-secondary/30": !isSelected,
        },
      )}
      onClick={onClick}
    >
      <div className="mt-0.5">
        <GitCommit className="h-4 w-4 text-accent" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="truncate text-sm text-foreground">
          {commit.message.split("\n")[0]}
        </p>
        <div className="mt-1 flex items-baseline gap-2 text-xs text-muted-foreground">
          <span className="font-mono">{commit.shortHash}</span>
          <span>{commit.author}</span>
          <span>{formatCommitTime(commit.date)}</span>
        </div>
      </div>
    </div>
  );
}
