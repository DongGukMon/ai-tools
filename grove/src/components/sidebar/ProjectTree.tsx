import type { Project } from "../../types";
import { cn } from "../../lib/cn";
import ProjectItem from "./ProjectItem";

interface Props {
  projects: Project[];
}

function ProjectTree({ projects }: Props) {
  return (
    <div className={cn("space-y-3 pb-4")}>
      {projects.map((project) => (
        <ProjectItem key={project.id} project={project} />
      ))}
    </div>
  );
}

export default ProjectTree;
