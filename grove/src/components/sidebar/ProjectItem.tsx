import { useState } from "react";
import type { Project } from "../../types";
import { useProjectStore } from "../../store/project";
import WorktreeItem from "./WorktreeItem";

interface Props {
  project: Project;
}

function ProjectItem({ project }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [adding, setAdding] = useState(false);
  const [worktreeName, setWorktreeName] = useState("");
  const { addWorktree, removeProject } = useProjectStore();

  const handleAddWorktree = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = worktreeName.trim();
    if (!name) return;
    try {
      await addWorktree(project.id, name);
      setWorktreeName("");
      setAdding(false);
    } catch (err) {
      console.error("Failed to add worktree:", err);
    }
  };

  const handleRemoveProject = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await removeProject(project.id);
    } catch (err) {
      console.error("Failed to remove project:", err);
    }
  };

  return (
    <div className="project-item">
      <div
        className="project-header"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="project-chevron">{expanded ? "\u25BE" : "\u25B8"}</span>
        <span className="project-name" title={project.url}>
          {project.org}/{project.repo}
        </span>
        <button
          className="project-remove"
          onClick={handleRemoveProject}
          title="Remove project"
        >
          ×
        </button>
      </div>
      {expanded && (
        <div className="project-worktrees">
          {project.worktrees.map((wt) => (
            <WorktreeItem
              key={wt.path}
              worktree={wt}
              projectId={project.id}
            />
          ))}
          {adding ? (
            <form className="add-worktree-form" onSubmit={handleAddWorktree}>
              <input
                className="add-worktree-input"
                type="text"
                placeholder="branch name"
                value={worktreeName}
                onChange={(e) => setWorktreeName(e.target.value)}
                autoFocus
                onBlur={() => {
                  if (!worktreeName.trim()) setAdding(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setAdding(false);
                }}
              />
            </form>
          ) : (
            <button
              className="add-worktree-btn"
              onClick={() => setAdding(true)}
            >
              + worktree
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default ProjectItem;
