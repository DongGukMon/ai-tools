import type { Project } from "../../types";
import ProjectItem from "./ProjectItem";

interface Props {
  projects: Project[];
}

function ProjectTree({ projects }: Props) {
  if (projects.length === 0) {
    return (
      <div className="project-tree-empty">
        No projects yet. Add one with the + button above.
      </div>
    );
  }

  return (
    <div className="project-tree">
      {projects.map((project) => (
        <ProjectItem key={project.id} project={project} />
      ))}
    </div>
  );
}

export default ProjectTree;
