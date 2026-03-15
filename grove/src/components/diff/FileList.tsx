import { useState } from "react";
import { FileText, ChevronDown, ChevronRight } from "lucide-react";
import type { FileStatus } from "../../types";
import { cn } from "../../lib/cn";

interface Props {
  fileStatuses: FileStatus[];
  selectedFile: string | null;
  onSelectFile: (path: string | null) => void;
}

export default function FileList({
  fileStatuses,
  selectedFile,
  onSelectFile,
}: Props) {
  const [expanded, setExpanded] = useState(true);

  if (fileStatuses.length === 0) {
    return (
      <div className="border-b border-border py-4 text-sm text-muted-foreground text-center">
        No changes
      </div>
    );
  }

  return (
    <div className="border-b border-border shrink-0">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-4 py-2 hover:bg-secondary/30 transition-colors"
      >
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
        )}
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Files
        </span>
        <span className="ml-1 rounded-full bg-accent/20 px-2 py-0.5 text-xs font-medium text-accent">
          {fileStatuses.length}
        </span>
      </button>
      {expanded && (
        <div className="max-h-[150px] overflow-y-auto pb-2">
          {fileStatuses.map((file) => (
            <div
              key={file.path}
              className={cn(
                "flex w-full items-center gap-2 px-4 py-1.5 cursor-pointer text-sm transition-colors",
                {
                  "bg-selected": selectedFile === file.path,
                  "text-muted-foreground hover:bg-secondary/30 hover:text-foreground":
                    selectedFile !== file.path,
                },
              )}
              onClick={() => onSelectFile(file.path)}
            >
              <FileText className="h-3.5 w-3.5 shrink-0" />
              <span className={cn("min-w-0 truncate", {
                "font-medium": selectedFile === file.path,
              })}>
                {file.path}
              </span>
              <span
                className={cn("ml-auto shrink-0 text-xs font-medium uppercase", {
                  "text-success": file.status === "added" || file.status === "untracked",
                  "text-warning": file.status === "modified",
                  "text-destructive": file.status === "deleted",
                })}
              >
                {file.status[0].toUpperCase()}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
