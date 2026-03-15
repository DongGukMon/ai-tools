import type { DiffHunk as DiffHunkType } from "../../types";
import DiffLine from "./DiffLine";

interface Props {
  hunk: DiffHunkType;
  hunkIndex: number;
  filePath: string;
  isViewingStaged: boolean;
  selectedLines: Set<number>;
  onToggleLine: (index: number) => void;
  onStageHunk: () => void;
  onUnstageHunk: () => void;
  onDiscardHunk: () => void;
}

export default function DiffHunk({
  hunk,
  isViewingStaged,
  selectedLines,
  onToggleLine,
  onStageHunk,
  onUnstageHunk,
  onDiscardHunk,
}: Props) {
  return (
    <div style={styles.container}>
      {/* Hunk header */}
      <div style={styles.header}>
        <span style={styles.headerText}>{hunk.header}</span>
        <span style={styles.actions}>
          {!isViewingStaged && (
            <>
              <button
                style={styles.actionBtn}
                onClick={onStageHunk}
                title="Stage hunk"
              >
                Stage
              </button>
              <button
                style={{ ...styles.actionBtn, color: "#e06c75" }}
                onClick={onDiscardHunk}
                title="Discard hunk"
              >
                Discard
              </button>
            </>
          )}
          {isViewingStaged && (
            <button
              style={styles.actionBtn}
              onClick={onUnstageHunk}
              title="Unstage hunk"
            >
              Unstage
            </button>
          )}
        </span>
      </div>

      {/* Lines */}
      {hunk.lines.map((line) => (
        <DiffLine
          key={line.index}
          line={line}
          isSelected={selectedLines.has(line.index)}
          onToggle={() => onToggleLine(line.index)}
          showCheckbox={line.type !== "context"}
        />
      ))}
    </div>
  );
}

const styles = {
  container: {
    borderBottom: "1px solid var(--border-color)",
  },
  header: {
    display: "flex",
    alignItems: "center",
    padding: "4px 12px",
    background: "rgba(0, 122, 204, 0.1)",
    borderBottom: "1px solid var(--border-color)",
    fontSize: 11,
    color: "var(--text-secondary)",
    userSelect: "none" as const,
  },
  headerText: {
    flex: 1,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
    fontFamily: "monospace",
  },
  actions: {
    display: "flex",
    gap: 6,
    flexShrink: 0,
    marginLeft: 8,
  },
  actionBtn: {
    background: "none",
    border: "1px solid var(--border-color)",
    color: "var(--text-primary)",
    fontSize: 10,
    padding: "2px 8px",
    borderRadius: 3,
    cursor: "pointer",
  },
};
