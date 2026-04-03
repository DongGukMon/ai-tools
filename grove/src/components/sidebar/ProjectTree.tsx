import { useState, useMemo, useCallback } from "react";
import {
  DndContext,
  closestCenter,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { restrictToVerticalAxis, restrictToParentElement } from "@dnd-kit/modifiers";
import type { Project, CloningProject } from "../../types";
import { useProjectStore } from "../../store/project";
import { cn } from "../../lib/cn";
import ProjectItem from "./ProjectItem";
import CloningProjectItem from "./CloningProjectItem";

interface Props {
  projects: Project[];
  cloningProjects: CloningProject[];
}

function ProjectTree({ projects, cloningProjects }: Props) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const reorderProjects = useProjectStore((s) => s.reorderProjects);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
  );

  const projectIds = useMemo(() => projects.map((p) => p.id), [projects]);

  const activeProject = useMemo(
    () => (activeId ? projects.find((p) => p.id === activeId) ?? null : null),
    [activeId, projects],
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveId(null);
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const oldIndex = projectIds.indexOf(active.id as string);
      const newIndex = projectIds.indexOf(over.id as string);
      if (oldIndex === -1 || newIndex === -1) return;

      const newIds = arrayMove(projectIds, oldIndex, newIndex);
      reorderProjects(newIds);
    },
    [projectIds, reorderProjects],
  );

  const handleDragCancel = useCallback(() => {
    setActiveId(null);
  }, []);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[restrictToVerticalAxis, restrictToParentElement]}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <SortableContext items={projectIds} strategy={verticalListSortingStrategy}>
        <div className={cn("space-y-1 py-0.5")}>
          {projects.map((project) => (
            <ProjectItem key={project.id} project={project} />
          ))}
          {cloningProjects.map((cp) => (
            <CloningProjectItem key={cp.id} project={cp} />
          ))}
        </div>
      </SortableContext>
      <DragOverlay>
        {activeProject ? <ProjectItem project={activeProject} /> : null}
      </DragOverlay>
    </DndContext>
  );
}

export default ProjectTree;
