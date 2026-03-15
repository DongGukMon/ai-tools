import type { CommitInfo, FileStatus } from "../../types";

interface Props {
  commits: CommitInfo[];
  fileStatuses: FileStatus[];
  selectedView: "changes" | CommitInfo;
  onSelectView: (view: "changes" | CommitInfo) => void;
}

export default function CommitList({
  commits,
  fileStatuses,
  selectedView,
  onSelectView,
}: Props) {
  const hasChanges = fileStatuses.length > 0;
  const isChangesSelected = selectedView === "changes";

  return (
    <div style={styles.container}>
      <div style={styles.header}>Commits</div>
      <div style={styles.list}>
        {/* Working changes entry */}
        <div
          style={{
            ...styles.item,
            ...(isChangesSelected ? styles.selected : {}),
          }}
          onClick={() => onSelectView("changes")}
        >
          <span style={styles.badge}>
            {hasChanges ? fileStatuses.length : 0}
          </span>
          <span style={styles.message}>Working Changes</span>
        </div>

        {/* Commit list */}
        {commits.map((commit) => {
          const isSelected =
            selectedView !== "changes" && selectedView.hash === commit.hash;
          return (
            <div
              key={commit.hash}
              style={{
                ...styles.item,
                ...(isSelected ? styles.selected : {}),
              }}
              onClick={() => onSelectView(commit)}
            >
              <span style={styles.hash}>{commit.shortHash}</span>
              <span style={styles.message}>
                {commit.message.split("\n")[0]}
              </span>
              <span style={styles.author}>{commit.author}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const styles = {
  container: {
    borderBottom: "1px solid var(--border-color)",
    flexShrink: 0,
  },
  header: {
    fontSize: 11,
    textTransform: "uppercase" as const,
    letterSpacing: "0.5px",
    color: "var(--text-secondary)",
    fontWeight: 600,
    padding: "8px 12px",
    borderBottom: "1px solid var(--border-color)",
    userSelect: "none" as const,
  },
  list: {
    maxHeight: 180,
    overflowY: "auto" as const,
  },
  item: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "4px 12px",
    cursor: "pointer",
    fontSize: 12,
    userSelect: "none" as const,
  },
  selected: {
    background: "var(--accent)",
    color: "#fff",
  },
  hash: {
    fontFamily: "monospace",
    fontSize: 11,
    color: "var(--text-secondary)",
    flexShrink: 0,
  },
  message: {
    flex: 1,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
  },
  author: {
    fontSize: 11,
    color: "var(--text-secondary)",
    flexShrink: 0,
  },
  badge: {
    background: "var(--accent)",
    color: "#fff",
    borderRadius: 8,
    padding: "0 6px",
    fontSize: 10,
    fontWeight: 600,
    flexShrink: 0,
    minWidth: 18,
    textAlign: "center" as const,
  },
};
