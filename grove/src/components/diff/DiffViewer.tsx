import { useCallback } from "react";
import type { FileDiff } from "../../types";
import DiffHunk from "./DiffHunk";
import { cn } from "../../lib/cn";
import { useDiffStore } from "../../store/diff";
import { useLineSelection } from "../../hooks/useLineSelection";


interface Props {
  diff: FileDiff | null;
  selectedFile: string | null;
  isStaged: boolean;
  isCommitView?: boolean;
}

export default function DiffViewer({ diff, selectedFile, isStaged, isCommitView }: Props) {
  const selectedLines = useDiffStore((s) => s.selectedLines);
  const { handleGutterClick, handleGutterMouseDown, handleGutterMouseEnter, handleGutterMouseUp } = useLineSelection();
  const stageHunk = useDiffStore((s) => s.stageHunk);
  const unstageHunk = useDiffStore((s) => s.unstageHunk);
  const discardHunk = useDiffStore((s) => s.discardHunk);

  const handleStageHunk = useCallback(
    (filePath: string, hunkIndex: number) => stageHunk(filePath, hunkIndex),
    [stageHunk],
  );
  const handleUnstageHunk = useCallback(
    (filePath: string, hunkIndex: number) => unstageHunk(filePath, hunkIndex),
    [unstageHunk],
  );
  const handleDiscardHunk = useCallback(
    (filePath: string, hunkIndex: number) => discardHunk(filePath, hunkIndex),
    [discardHunk],
  );

  if (!diff || !selectedFile) {
    return (
      <div className={cn("flex items-center justify-center h-full")}>
        <span className={cn("text-sm text-muted-foreground")}>
          Select a file to view diff
        </span>
      </div>
    );
  }

  if (diff.hunks.length === 0) {
    return (
      <div className={cn("flex items-center justify-center h-full")}>
        <span className={cn("text-sm text-muted-foreground")}>
          No changes
        </span>
      </div>
    );
  }

  return (
    <div className={cn("h-full overflow-y-auto")}>
      {diff.hunks.map((hunk, i) => (
        <DiffHunk
          key={`${hunk.header}-${i}`}
          hunk={hunk}
          hunkIndex={i}
          filePath={selectedFile!}
          isFirst={i === 0}
          selectedLines={selectedLines}
          isStaged={isStaged}
          onStageHunk={isCommitView ? undefined : handleStageHunk}
          onUnstageHunk={isCommitView ? undefined : handleUnstageHunk}
          onDiscardHunk={isCommitView ? undefined : handleDiscardHunk}
          onGutterClick={handleGutterClick}
          onGutterMouseDown={handleGutterMouseDown}
          onGutterMouseEnter={handleGutterMouseEnter}
          onGutterMouseUp={handleGutterMouseUp}
        />
      ))}
    </div>
  );
}
