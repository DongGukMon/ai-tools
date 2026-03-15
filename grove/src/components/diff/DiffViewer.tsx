import type { FileDiff, DiffHunk as DiffHunkType } from "../../types";
import DiffHunk from "./DiffHunk";

interface Props {
  diff: FileDiff | null;
  selectedFile: string | null;
  isViewingStaged: boolean;
  readOnly?: boolean;
  selectedLines: Set<number>;
  onToggleLine: (index: number) => void;
  onClearSelection: () => void;
  onStageHunk: (path: string, hunkIndex: number) => Promise<void>;
  onUnstageHunk: (path: string, hunkIndex: number) => Promise<void>;
  onDiscardHunk: (path: string, hunkIndex: number) => Promise<void>;
  onStageLines: (
    path: string,
    hunkIndex: number,
    lineIndices: number[],
  ) => Promise<void>;
  onUnstageLines: (
    path: string,
    hunkIndex: number,
    lineIndices: number[],
  ) => Promise<void>;
  onDiscardLines: (
    path: string,
    hunkIndex: number,
    lineIndices: number[],
  ) => Promise<void>;
}

function findSelectedHunk(
  hunks: DiffHunkType[],
  selectedLines: Set<number>,
): [number, number[]] | null {
  for (let i = 0; i < hunks.length; i++) {
    const matched = hunks[i].lines
      .filter((l) => selectedLines.has(l.index))
      .map((l) => l.index);
    if (matched.length > 0) return [i, matched];
  }
  return null;
}

export default function DiffViewer({
  diff,
  selectedFile,
  isViewingStaged,
  readOnly = false,
  selectedLines,
  onToggleLine,
  onClearSelection,
  onStageHunk,
  onUnstageHunk,
  onDiscardHunk,
  onStageLines,
  onUnstageLines,
  onDiscardLines,
}: Props) {
  if (!diff || !selectedFile) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <span className="text-[13px] text-[var(--color-text-tertiary)]">
          Select a file to view diff
        </span>
      </div>
    );
  }

  if (diff.hunks.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <span className="text-[13px] text-[var(--color-text-tertiary)]">
          No changes
        </span>
      </div>
    );
  }

  const hasSelection = !readOnly && selectedLines.size > 0;

  const applyToSelectedLines = (
    action: (path: string, hunkIndex: number, lineIndices: number[]) => Promise<void>,
  ) => {
    const result = findSelectedHunk(diff.hunks, selectedLines);
    if (result) {
      action(selectedFile, result[0], result[1]);
    }
    onClearSelection();
  };

  return (
    <div className="flex-1 overflow-y-auto" style={{ scrollSnapType: "y proximity" }}>
      {/* Floating selection bar */}
      {hasSelection && (
        <div className="sticky top-0 z-10 flex items-center gap-2 px-3 h-[32px] bg-[var(--color-bg-secondary)] border-b border-[var(--color-border)] shadow-sm">
          <span className="text-[11px] text-[var(--color-text-secondary)] mr-auto font-medium">
            {selectedLines.size} line{selectedLines.size > 1 ? "s" : ""} selected
          </span>
          {!isViewingStaged && (
            <>
              <button
                className="px-2.5 py-1 text-[11px] font-medium rounded-full border border-[var(--color-border)] bg-white text-[var(--color-text)] hover:bg-[var(--color-bg-tertiary)] transition-colors"
                onClick={() => applyToSelectedLines(onStageLines)}
              >
                Stage
              </button>
              <button
                className="px-2.5 py-1 text-[11px] font-medium rounded-full border border-[var(--color-border)] bg-white text-[var(--color-danger)] hover:bg-[var(--color-danger-bg)] transition-colors"
                onClick={() => applyToSelectedLines(onDiscardLines)}
              >
                Discard
              </button>
            </>
          )}
          {isViewingStaged && (
            <button
              className="px-2.5 py-1 text-[11px] font-medium rounded-full border border-[var(--color-border)] bg-white text-[var(--color-text)] hover:bg-[var(--color-bg-tertiary)] transition-colors"
              onClick={() => applyToSelectedLines(onUnstageLines)}
            >
              Unstage
            </button>
          )}
          <button
            className="px-2.5 py-1 text-[11px] font-medium rounded-full border border-[var(--color-border)] bg-white text-[var(--color-text-tertiary)] hover:bg-[var(--color-bg-tertiary)] transition-colors"
            onClick={onClearSelection}
          >
            Clear
          </button>
        </div>
      )}

      {/* Diff hunks */}
      <div className="p-3">
        <div className="border border-[var(--color-border)] rounded-lg overflow-hidden">
          {diff.hunks.map((hunk, i) => (
            <DiffHunk
              key={`${hunk.header}-${i}`}
              hunk={hunk}
              hunkIndex={i}
              filePath={selectedFile}
              isViewingStaged={isViewingStaged}
              isFirst={i === 0}
              readOnly={readOnly}
              selectedLines={selectedLines}
              onToggleLine={onToggleLine}
              onStageHunk={() => onStageHunk(selectedFile, i)}
              onUnstageHunk={() => onUnstageHunk(selectedFile, i)}
              onDiscardHunk={() => onDiscardHunk(selectedFile, i)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
