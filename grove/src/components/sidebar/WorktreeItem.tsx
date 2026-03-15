import { useState } from "react";
import { GitBranch, X } from "lucide-react";
import type { Worktree } from "../../types";
import { useProjectStore } from "../../store/project";

interface Props {
  worktree: Worktree;
  projectId: string;
}

function WorktreeItem({ worktree, projectId }: Props) {
  const [removing, setRemoving] = useState(false);
  const { selectedWorktree, selectWorktree, removeWorktree } =
    useProjectStore();
  const isSelected = selectedWorktree?.path === worktree.path;
  const isSource = worktree.name === "source";

  const handleRemove = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setRemoving(true);
    try {
      await removeWorktree(projectId, worktree.name);
    } catch (err) {
      setRemoving(false);
      console.error("Failed to remove worktree:", err);
    }
  };

  const displayName = worktree.branch || worktree.name;
  // Show "main" with a special indicator for the source worktree
  const label = isSource ? `${displayName}` : displayName;

  return (
    <div
      className={`group flex items-center gap-2 px-2.5 h-[30px] rounded-lg cursor-pointer select-none transition-all duration-100 ${
        removing ? "animate-fade-out pointer-events-none opacity-50" : ""
      } ${
        isSelected
          ? "bg-white shadow-sm text-[var(--color-primary)]"
          : "text-[#6b7280] hover:bg-white/60 hover:text-[#374151]"
      }`}
      onClick={() => !removing && selectWorktree(worktree)}
      title={worktree.path}
    >
      <GitBranch
        size={13}
        strokeWidth={isSelected ? 2.5 : 2}
        className={`shrink-0 ${isSelected ? "text-[var(--color-primary)]" : "text-[#9ca3af]"}`}
      />
      <span className={`min-w-0 flex-1 text-[13px] truncate ${isSelected ? "font-semibold" : "font-medium"}`}>
        {label}
      </span>
      {isSource && (
        <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md ${
          isSelected ? "bg-[var(--color-primary-bg)] text-[var(--color-primary)]" : "bg-[#f0f1f3] text-[#9ca3af]"
        }`}>
          src
        </span>
      )}
      {!isSource && (
        <button
          className={`flex items-center justify-center w-[18px] h-[18px] rounded-md transition-all duration-100 ${
            isSelected
              ? "opacity-50 hover:opacity-100 text-[var(--color-primary)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger-bg)]"
              : "opacity-0 group-hover:opacity-100 text-[#9ca3af] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger-bg)]"
          }`}
          onClick={handleRemove}
          title="Remove worktree"
        >
          <X size={11} strokeWidth={2} />
        </button>
      )}
    </div>
  );
}

export default WorktreeItem;
