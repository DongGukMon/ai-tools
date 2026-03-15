import type { Worktree } from "../../types";
import { useProjectStore } from "../../store/project";

interface Props {
  worktree: Worktree;
  projectId: string;
}

function WorktreeItem({ worktree, projectId }: Props) {
  const { selectedWorktree, selectWorktree, removeWorktree } =
    useProjectStore();
  const isSelected = selectedWorktree?.path === worktree.path;
  const isSource = worktree.name === "source";

  const handleRemove = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await removeWorktree(projectId, worktree.name);
    } catch (err) {
      console.error("Failed to remove worktree:", err);
    }
  };

  return (
    <div
      className={`worktree-item ${isSelected ? "selected" : ""}`}
      onClick={() => selectWorktree(worktree)}
      title={worktree.path}
    >
      <span className="worktree-branch">{worktree.branch || worktree.name}</span>
      {!isSource && (
        <button
          className="worktree-remove"
          onClick={handleRemove}
          title="Remove worktree"
        >
          ×
        </button>
      )}
    </div>
  );
}

export default WorktreeItem;
