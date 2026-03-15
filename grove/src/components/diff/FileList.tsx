import type { FileStatus } from "../../types";

interface Props {
  fileStatuses: FileStatus[];
  selectedFile: string | null;
  isViewingStaged: boolean;
  onSelectFile: (path: string | null, staged?: boolean) => void;
  onStageFile: (path: string) => Promise<void>;
  onUnstageFile: (path: string) => Promise<void>;
  onDiscardFile: (path: string) => Promise<void>;
}

export default function FileList({
  fileStatuses,
  selectedFile,
  isViewingStaged,
  onSelectFile,
  onStageFile,
  onUnstageFile,
  onDiscardFile,
}: Props) {
  const staged = fileStatuses.filter((f) => f.staged);
  const unstaged = fileStatuses.filter((f) => !f.staged);

  return (
    <div style={styles.container}>
      {/* Staged section */}
      {staged.length > 0 && (
        <div>
          <div style={styles.sectionHeader}>
            Staged ({staged.length})
          </div>
          {staged.map((file) => (
            <FileItem
              key={`staged-${file.path}`}
              file={file}
              isSelected={
                selectedFile === file.path && isViewingStaged
              }
              onClick={() => onSelectFile(file.path, true)}
              actions={
                <button
                  style={styles.actionBtn}
                  title="Unstage"
                  onClick={(e) => {
                    e.stopPropagation();
                    onUnstageFile(file.path);
                  }}
                >
                  -
                </button>
              }
            />
          ))}
        </div>
      )}

      {/* Unstaged section */}
      {unstaged.length > 0 && (
        <div>
          <div style={styles.sectionHeader}>
            Unstaged ({unstaged.length})
          </div>
          {unstaged.map((file) => (
            <FileItem
              key={`unstaged-${file.path}`}
              file={file}
              isSelected={
                selectedFile === file.path && !isViewingStaged
              }
              onClick={() => onSelectFile(file.path, false)}
              actions={
                <>
                  <button
                    style={styles.actionBtn}
                    title="Stage"
                    onClick={(e) => {
                      e.stopPropagation();
                      onStageFile(file.path);
                    }}
                  >
                    +
                  </button>
                  <button
                    style={{ ...styles.actionBtn, color: "#e06c75" }}
                    title="Discard"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDiscardFile(file.path);
                    }}
                  >
                    ×
                  </button>
                </>
              }
            />
          ))}
        </div>
      )}

      {fileStatuses.length === 0 && (
        <div style={styles.empty}>No changes</div>
      )}
    </div>
  );
}

function FileItem({
  file,
  isSelected,
  onClick,
  actions,
}: {
  file: FileStatus;
  isSelected: boolean;
  onClick: () => void;
  actions: React.ReactNode;
}) {
  const statusColor = {
    modified: "#e5c07b",
    added: "#98c379",
    deleted: "#e06c75",
    renamed: "#61afef",
    untracked: "#98c379",
  }[file.status] ?? "var(--text-secondary)";

  const statusChar = file.status[0].toUpperCase();
  const fileName = file.path.split("/").pop() ?? file.path;
  const dirPath = file.path.includes("/")
    ? file.path.substring(0, file.path.lastIndexOf("/"))
    : "";

  return (
    <div
      style={{
        ...styles.fileItem,
        ...(isSelected ? styles.fileSelected : {}),
      }}
      onClick={onClick}
    >
      <span
        style={{
          ...styles.statusBadge,
          color: statusColor,
        }}
      >
        {statusChar}
      </span>
      <span style={styles.fileName}>{fileName}</span>
      {dirPath && <span style={styles.dirPath}>{dirPath}/</span>}
      <span style={styles.fileActions}>{actions}</span>
    </div>
  );
}

const styles = {
  container: {
    borderBottom: "1px solid var(--border-color)",
    flexShrink: 0,
    maxHeight: 200,
    overflowY: "auto" as const,
  },
  sectionHeader: {
    fontSize: 11,
    textTransform: "uppercase" as const,
    letterSpacing: "0.5px",
    color: "var(--text-secondary)",
    fontWeight: 600,
    padding: "6px 12px 2px",
    userSelect: "none" as const,
  },
  fileItem: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "3px 12px",
    cursor: "pointer",
    fontSize: 12,
    userSelect: "none" as const,
  },
  fileSelected: {
    background: "var(--accent)",
    color: "#fff",
  },
  statusBadge: {
    fontWeight: 700,
    fontSize: 11,
    width: 14,
    textAlign: "center" as const,
    flexShrink: 0,
  },
  fileName: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
  },
  dirPath: {
    fontSize: 11,
    color: "var(--text-secondary)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
    flex: 1,
  },
  fileActions: {
    display: "flex",
    gap: 2,
    marginLeft: "auto",
    flexShrink: 0,
    opacity: 0.7,
  },
  actionBtn: {
    background: "none",
    border: "none",
    color: "var(--text-secondary)",
    fontSize: 14,
    cursor: "pointer",
    padding: "0 3px",
    lineHeight: 1,
    fontWeight: 700,
  },
  empty: {
    padding: 12,
    color: "var(--text-secondary)",
    fontSize: 12,
    textAlign: "center" as const,
  },
};
