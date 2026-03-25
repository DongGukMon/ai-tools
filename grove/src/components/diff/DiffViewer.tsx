import { useCallback, useRef } from "react";
import type { FileDiff } from "../../types";
import DiffHunk from "./DiffHunk";
import { cn } from "../../lib/cn";
import { useDiffStore } from "../../store/diff";
import { useLineSelection } from "../../hooks/useLineSelection";

const EMPTY_SET = new Set<number>();

interface Props {
  diffs: FileDiff[];
  isStaged: boolean;
  isCommitView?: boolean;
}

export default function DiffViewer({ diffs, isStaged, isCommitView }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const selectedLines = useDiffStore((s) => s.selectedLines);
  const stageLines = useDiffStore((s) => s.stageLines);
  const unstageLines = useDiffStore((s) => s.unstageLines);
  const clearSelection = useDiffStore((s) => s.clearSelection);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === " ") {
        e.preventDefault();
        // Find first file with selected lines and act on those
        for (const diff of diffs) {
          const fileLines = selectedLines.get(diff.path);
          if (fileLines && fileLines.size > 0) {
            const linesByHunk = new Map<number, number[]>();
            for (const lineIdx of fileLines) {
              for (let hi = 0; hi < diff.hunks.length; hi++) {
                if (diff.hunks[hi].lines.some((l) => l.index === lineIdx)) {
                  const arr = linesByHunk.get(hi) ?? [];
                  arr.push(lineIdx);
                  linesByHunk.set(hi, arr);
                  break;
                }
              }
            }
            const action = isStaged ? unstageLines : stageLines;
            for (const [hunkIdx, lines] of linesByHunk) {
              action(diff.path, hunkIdx, lines);
            }
            break;
          }
        }
      }
      if (e.key === "Escape") {
        clearSelection();
      }
    },
    [diffs, selectedLines, isStaged, stageLines, unstageLines, clearSelection],
  );

  if (diffs.length === 0) {
    return (
      <div className={cn("flex items-center justify-center h-full")}>
        <span className={cn("text-sm text-muted-foreground")}>Select files to view diff</span>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={cn("h-full overflow-y-auto outline-none")}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onClick={(e) => {
        // Click on empty space (not on a gutter line or button) clears line selection
        if (!(e.target as HTMLElement).closest("[data-gutter-line]")) {
          clearSelection();
        }
      }}
    >
      {diffs.map((diff, fi) => (
        <FileDiffSection
          key={diff.path}
          diff={diff}
          isFirst={fi === 0}
          isStaged={isStaged}
          isCommitView={isCommitView}
          selectedLines={selectedLines.get(diff.path) ?? EMPTY_SET}
          containerRef={containerRef}
        />
      ))}
    </div>
  );
}

function FileDiffSection({
  diff,
  isFirst,
  isStaged,
  isCommitView,
  selectedLines,
  containerRef,
}: {
  diff: FileDiff;
  isFirst: boolean;
  isStaged: boolean;
  isCommitView?: boolean;
  selectedLines: Set<number>;
  containerRef: React.RefObject<HTMLDivElement | null>;
}) {
  const { handleGutterClick: rawGutterClick, handleGutterMouseDown, handleGutterMouseEnter, handleGutterMouseUp } =
    useLineSelection(diff.path);

  const handleGutterClick = useCallback(
    (lineIndex: number, shiftKey: boolean) => {
      rawGutterClick(lineIndex, shiftKey);
      containerRef.current?.focus();
    },
    [rawGutterClick, containerRef],
  );

  const stageHunk = useDiffStore((s) => s.stageHunk);
  const unstageHunk = useDiffStore((s) => s.unstageHunk);
  const discardHunk = useDiffStore((s) => s.discardHunk);

  const added = diff.hunks.reduce((s, h) => s + h.lines.filter((l) => l.type === "add").length, 0);
  const removed = diff.hunks.reduce((s, h) => s + h.lines.filter((l) => l.type === "remove").length, 0);

  const statusColor: Record<string, string> = {
    modified: "rgba(234, 179, 8, 0.7)",
    added: "rgba(63, 185, 80, 0.7)",
    deleted: "rgba(248, 81, 73, 0.7)",
    renamed: "rgba(99, 163, 255, 0.7)",
    untracked: "rgba(63, 185, 80, 0.7)",
  };

  return (
    <div className={cn({ "mt-2": !isFirst })}>
      {/* File header */}
      <div
        className={cn("flex items-center gap-1.5 px-3 py-1.5 sticky top-0 z-10")}
        style={{ background: "rgba(99, 163, 255, 0.06)", borderBottom: "1px solid rgba(255, 255, 255, 0.06)" }}
      >
        <span
          className={cn("text-[10px] font-semibold uppercase")}
          style={{ color: statusColor[diff.status] ?? "rgba(255, 255, 255, 0.4)" }}
        >
          {diff.status[0]}
        </span>
        <span className={cn("text-[11px] text-muted-foreground truncate flex-1 font-sans")}>
          {diff.path}
        </span>
        <span className={cn("text-[10px] text-muted-foreground/40 shrink-0")}>
          {added > 0 && `+${added}`}{added > 0 && removed > 0 && " "}{removed > 0 && `-${removed}`}
        </span>
      </div>

      {/* Hunks */}
      {diff.hunks.map((hunk, i) => (
        <DiffHunk
          key={`${hunk.header}-${i}`}
          hunk={hunk}
          hunkIndex={i}
          filePath={diff.path}
          isFirst={false}
          selectedLines={selectedLines}
          isStaged={isStaged}
          onStageHunk={isCommitView ? undefined : stageHunk}
          onUnstageHunk={isCommitView ? undefined : unstageHunk}
          onDiscardHunk={isCommitView ? undefined : discardHunk}
          onGutterClick={handleGutterClick}
          onGutterMouseDown={handleGutterMouseDown}
          onGutterMouseEnter={handleGutterMouseEnter}
          onGutterMouseUp={handleGutterMouseUp}
        />
      ))}
    </div>
  );
}
