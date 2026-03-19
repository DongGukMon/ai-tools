import { GitMerge } from "lucide-react";
import { IconButton } from "../ui/button";
import { Spinner } from "../ui/spinner";
import { cn } from "../../lib/cn";


interface Props {
  behindCount: number;
  merging: boolean;
  onMerge: () => void;
}

export default function CommitListHeader({
  behindCount,
  merging,
  onMerge,
}: Props) {
  return (
    <div className={cn("flex items-center border-b border-border px-4 h-9 select-none")}>
      <span className={cn("text-xs font-medium uppercase tracking-wider text-muted-foreground")}>
        Commits
      </span>
      {behindCount > 0 && (
        <div className={cn("ml-auto flex items-center gap-1.5")}>
          <span className={cn("rounded-full bg-accent/20 px-2 py-0.5 text-xs font-medium text-accent")}>
            {"\u2193"}{behindCount}
          </span>
          <IconButton
            onClick={onMerge}
            disabled={merging}
            title="Merge default branch"
          >
            {merging ? (
              <Spinner className="size-3.5" />
            ) : (
              <GitMerge className="size-3.5" />
            )}
          </IconButton>
        </div>
      )}
    </div>
  );
}
