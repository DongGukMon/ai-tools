import type { Project } from "../../types";
import ProjectItem from "./ProjectItem";

interface Props {
  projects: Project[];
}

function ProjectTree({ projects }: Props) {
  return (
    <div className="space-y-1">
      {projects.map((project) => (
        <ProjectItem key={project.id} project={project} />
      ))}
    </div>
  );
}

export default ProjectTree;
