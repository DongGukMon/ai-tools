import { useCallback, useRef } from "react";
import type { FileDiff } from "../../types";
import DiffHunk from "./DiffHunk";
import { cn } from "../../lib/cn";
import { useDiffStore } from "../../store/diff";
import { useLineSelection } from "../../hooks/useLineSelection";


const EMPTY_SET = new Set<number>();

interface Props {
  diff: FileDiff | null;
  selectedFile: string | null;
  isStaged: boolean;
  isCommitView?: boolean;
}

export default function DiffViewer({ diff, selectedFile, isStaged, isCommitView }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const selectedLines = useDiffStore((s) => s.selectedLines);
  const { handleGutterClick: rawGutterClick, handleGutterMouseDown, handleGutterMouseEnter, handleGutterMouseUp } = useLineSelection(selectedFile ?? "");

  // Auto-focus container after gutter click so keyboard shortcuts work
  const handleGutterClick = useCallback(
    (lineIndex: number, shiftKey: boolean) => {
      rawGutterClick(lineIndex, shiftKey);
      containerRef.current?.focus();
    },
    [rawGutterClick],
  );
  const stageHunk = useDiffStore((s) => s.stageHunk);
  const unstageHunk = useDiffStore((s) => s.unstageHunk);
  const discardHunk = useDiffStore((s) => s.discardHunk);
  const stageLines = useDiffStore((s) => s.stageLines);
  const unstageLines = useDiffStore((s) => s.unstageLines);
  const clearSelection = useDiffStore((s) => s.clearSelection);

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

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!selectedFile) return;

      if (e.key === " ") {
        e.preventDefault();
        const fileLines = selectedFile ? (selectedLines.get(selectedFile) ?? EMPTY_SET) : EMPTY_SET;
        if (fileLines.size > 0) {
          // Group selected lines by hunk index
          const linesByHunk = new Map<number, number[]>();
          for (const lineIdx of fileLines) {
            if (!diff) continue;
            for (let hi = 0; hi < diff.hunks.length; hi++) {
              const hunk = diff.hunks[hi];
              if (hunk.lines.some((l) => l.index === lineIdx)) {
                const arr = linesByHunk.get(hi) ?? [];
                arr.push(lineIdx);
                linesByHunk.set(hi, arr);
                break;
              }
            }
          }
          const action = isStaged ? unstageLines : stageLines;
          for (const [hunkIdx, lines] of linesByHunk) {
            action(selectedFile, hunkIdx, lines);
          }
        } else if (diff && diff.hunks.length > 0) {
          const action = isStaged ? unstageHunk : stageHunk;
          action(selectedFile, 0);
        }
      }

      if (e.key === "Escape") {
        clearSelection();
      }
    },
    [selectedFile, selectedLines, diff, isStaged, stageLines, unstageLines, stageHunk, unstageHunk, clearSelection],
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
    <div ref={containerRef} className={cn("h-full overflow-y-auto outline-none")} tabIndex={0} onKeyDown={handleKeyDown}>
      {diff.hunks.map((hunk, i) => (
        <DiffHunk
          key={`${hunk.header}-${i}`}
          hunk={hunk}
          hunkIndex={i}
          filePath={selectedFile!}
          isFirst={i === 0}
          selectedLines={selectedLines.get(selectedFile!) ?? EMPTY_SET}
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
