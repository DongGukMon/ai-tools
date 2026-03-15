import type { FileDiff } from "../../types";
import DiffHunk from "./DiffHunk";

interface Props {
  diff: FileDiff | null;
  selectedFile: string | null;
}

export default function DiffViewer({ diff, selectedFile }: Props) {
  if (!diff || !selectedFile) {
    return (
      <div className="flex items-center justify-center h-full">
        <span className="text-sm text-muted-foreground">
          Select a file to view diff
        </span>
      </div>
    );
  }

  if (diff.hunks.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <span className="text-sm text-muted-foreground">
          No changes
        </span>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      {diff.hunks.map((hunk, i) => (
        <DiffHunk
          key={`${hunk.header}-${i}`}
          hunk={hunk}
          hunkIndex={i}
          filePath={selectedFile}
          isFirst={i === 0}
          selectedLines={new Set()}
          onToggleLine={() => {}}
        />
      ))}
    </div>
  );
}
