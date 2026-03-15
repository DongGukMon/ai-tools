import type { FileDiff, DiffHunk as DiffHunkType } from "../../types";
import DiffHunk from "./DiffHunk";

interface Props {
  diff: FileDiff | null;
  selectedFile: string | null;
  isViewingStaged: boolean;
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

/** Find the first hunk containing any selected lines and return [hunkIndex, matchedIndices]. */
function findSelectedHunk(
  hunks: DiffHunkType[],
  selectedLines: Set<number>,
): [number, number[]] | null {
  const lineIndices = new Set<number>();
  for (const hunk of hunks) {
    for (const line of hunk.lines) {
      lineIndices.add(line.index);
    }
  }

  for (let i = 0; i < hunks.length; i++) {
    const hunk = hunks[i];
    const matched = hunk.lines
      .filter((l) => selectedLines.has(l.index))
      .map((l) => l.index);
    if (matched.length > 0) {
      return [i, matched];
    }
  }
  return null;
}

export default function DiffViewer({
  diff,
  selectedFile,
  isViewingStaged,
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
      <div style={styles.empty}>
        <span style={{ color: "var(--text-secondary)", fontSize: 13 }}>
          Select a file to view diff
        </span>
      </div>
    );
  }

  if (diff.hunks.length === 0) {
    return (
      <div style={styles.empty}>
        <span style={{ color: "var(--text-secondary)", fontSize: 13 }}>
          No changes
        </span>
      </div>
    );
  }

  const hasSelection = selectedLines.size > 0;

  const applyToSelectedLines = (
    action: (path: string, hunkIndex: number, lineIndices: number[]) => Promise<void>,
  ) => {
    const result = findSelectedHunk(diff.hunks, selectedLines);
    if (result) {
      const [hunkIndex, lineIndices] = result;
      action(selectedFile, hunkIndex, lineIndices);
    }
    onClearSelection();
  };

  return (
    <div style={styles.container}>
      {/* Floating action bar for line-level operations */}
      {hasSelection && (
        <div style={styles.actionBar}>
          <span style={styles.actionBarText}>
            {selectedLines.size} line{selectedLines.size > 1 ? "s" : ""}{" "}
            selected
          </span>
          {!isViewingStaged && (
            <button
              style={styles.actionBarBtn}
              onClick={() => applyToSelectedLines(onStageLines)}
            >
              Stage Selected
            </button>
          )}
          {isViewingStaged && (
            <button
              style={styles.actionBarBtn}
              onClick={() => applyToSelectedLines(onUnstageLines)}
            >
              Unstage Selected
            </button>
          )}
          {!isViewingStaged && (
            <button
              style={{ ...styles.actionBarBtn, color: "#e06c75" }}
              onClick={() => applyToSelectedLines(onDiscardLines)}
            >
              Discard Selected
            </button>
          )}
          <button
            style={{ ...styles.actionBarBtn, color: "var(--text-secondary)" }}
            onClick={onClearSelection}
          >
            Clear
          </button>
        </div>
      )}

      {/* Hunks */}
      {diff.hunks.map((hunk, i) => (
        <DiffHunk
          key={`${hunk.header}-${i}`}
          hunk={hunk}
          hunkIndex={i}
          filePath={selectedFile}
          isViewingStaged={isViewingStaged}
          selectedLines={selectedLines}
          onToggleLine={onToggleLine}
          onStageHunk={() => onStageHunk(selectedFile, i)}
          onUnstageHunk={() => onUnstageHunk(selectedFile, i)}
          onDiscardHunk={() => onDiscardHunk(selectedFile, i)}
        />
      ))}
    </div>
  );
}

const styles = {
  container: {
    flex: 1,
    overflowY: "auto" as const,
    fontFamily: "monospace",
    fontSize: 12,
  },
  empty: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  actionBar: {
    position: "sticky" as const,
    top: 0,
    zIndex: 10,
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "6px 12px",
    background: "var(--bg-tertiary)",
    borderBottom: "1px solid var(--border-color)",
  },
  actionBarText: {
    fontSize: 12,
    color: "var(--text-secondary)",
    marginRight: "auto",
  },
  actionBarBtn: {
    background: "none",
    border: "1px solid var(--border-color)",
    color: "var(--text-primary)",
    fontSize: 11,
    padding: "3px 10px",
    borderRadius: 3,
    cursor: "pointer",
  },
};
