import { memo } from "react";
import type { CloningProject } from "../../types";
import { Spinner } from "../ui/spinner";
import { cn } from "../../lib/cn";

interface Props {
  project: CloningProject;
}

const CloningProjectItem = memo(function CloningProjectItem({ project }: Props) {
  const displayName = `${project.org}/${project.repo}`;

  return (
    <div className={cn("px-1.5 opacity-50 pointer-events-none select-none")}>
      <div
        className={cn(
          "flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-[13px] leading-5 text-foreground",
        )}
      >
        <Spinner className={cn("h-[15px] w-[15px] shrink-0 text-muted-foreground")} />
        <span className={cn("truncate font-medium")} title={displayName}>
          {displayName}
        </span>
        <span className={cn("ml-auto shrink-0 text-[11px] text-muted-foreground animate-pulse")}>
          Cloning...
        </span>
      </div>
    </div>
  );
});

export default CloningProjectItem;
