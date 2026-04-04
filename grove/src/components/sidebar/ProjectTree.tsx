import { useState, useMemo, useCallback } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
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
import { usePreferencesStore } from "../../store/preferences";
import { cn } from "../../lib/cn";
import { applyOrgProjectOrder, groupProjectsByOrg } from "../../lib/project-view";
import ProjectItem from "./ProjectItem";
import CloningProjectItem from "./CloningProjectItem";
import { Button } from "../ui/button";

interface Props {
  projects: Project[];
  cloningProjects: CloningProject[];
}

interface ProjectOrgSectionProps {
  org: string;
  projects: Project[];
  collapsed: boolean;
  onToggle: () => void;
  onReorder: (projectIds: string[]) => void;
}

interface SortableProjectListProps {
  projects: Project[];
  onReorder: (projectIds: string[]) => void;
  showOrgPrefix?: boolean;
  className?: string;
}

function SortableProjectList({
  projects,
  onReorder,
  showOrgPrefix = true,
  className,
}: SortableProjectListProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const projectIds = useMemo(() => projects.map((project) => project.id), [projects]);
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
  );

  const activeProject = useMemo(
    () => (activeId ? projects.find((project) => project.id === activeId) ?? null : null),
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

      onReorder(arrayMove(projectIds, oldIndex, newIndex));
    },
    [onReorder, projectIds],
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
        <div className={cn("space-y-1 py-0.5", className)}>
          {projects.map((project) => (
            <ProjectItem
              key={project.id}
              project={project}
              showOrgPrefix={showOrgPrefix}
            />
          ))}
        </div>
      </SortableContext>
      <DragOverlay>
        {activeProject ? (
          <ProjectItem project={activeProject} showOrgPrefix={showOrgPrefix} />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function ProjectOrgSection({
  org,
  projects,
  collapsed,
  onToggle,
  onReorder,
}: ProjectOrgSectionProps) {
  return (
    <div className={cn("px-1.5")}>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className={cn(
          "group h-auto w-full justify-start gap-2 rounded-lg border-0 px-2.5 py-1.5 text-[13px] transition-all duration-150",
          "cursor-pointer select-none text-foreground hover:bg-secondary/50 hover:text-foreground",
        )}
        onClick={onToggle}
      >
        {collapsed ? (
          <ChevronRight className={cn("h-[15px] w-[15px] shrink-0 text-muted-foreground")} />
        ) : (
          <ChevronDown className={cn("h-[15px] w-[15px] shrink-0 text-muted-foreground")} />
        )}
        <span className={cn("min-w-0 flex-1 truncate text-left font-medium")}>{org}</span>
        <span className={cn("shrink-0 text-[11px] text-muted-foreground")}>
          {projects.length}
        </span>
      </Button>

      <div
        className={cn("grid transition-[grid-template-rows] duration-200 ease-out", {
          "grid-rows-[1fr]": !collapsed,
          "grid-rows-[0fr]": collapsed,
        })}
      >
        <div className={cn("overflow-hidden")}>
          <SortableProjectList
            projects={projects}
            onReorder={onReorder}
            showOrgPrefix={false}
            className={cn("ml-4 border-l border-border/80 pl-2")}
          />
        </div>
      </div>
    </div>
  );
}

function ProjectTree({ projects, cloningProjects }: Props) {
  const projectViewMode = usePreferencesStore((s) => s.projectViewMode);
  const collapsedProjectOrgs = usePreferencesStore((s) => s.collapsedProjectOrgs);
  const setProjectOrgCollapsed = usePreferencesStore((s) => s.setProjectOrgCollapsed);
  const reorderProjects = useProjectStore((s) => s.reorderProjects);

  const orgGroups = useMemo(() => groupProjectsByOrg(projects), [projects]);
  const collapsedOrgSet = useMemo(
    () => new Set(collapsedProjectOrgs),
    [collapsedProjectOrgs],
  );

  const handleOrgReorder = useCallback(
    (org: string, reorderedOrgProjectIds: string[]) => {
      const reorderedIds = applyOrgProjectOrder(
        projects,
        org,
        reorderedOrgProjectIds,
      );
      reorderProjects(reorderedIds);
    },
    [projects, reorderProjects],
  );

  return (
    <>
      {projectViewMode === "group-by-orgs" ? (
        <div className={cn("space-y-1 py-0.5")}>
          {orgGroups.map((group) => (
            <ProjectOrgSection
              key={group.org}
              org={group.org}
              projects={group.projects}
              collapsed={collapsedOrgSet.has(group.org)}
              onToggle={() =>
                setProjectOrgCollapsed(group.org, !collapsedOrgSet.has(group.org))
              }
              onReorder={(projectIds) => handleOrgReorder(group.org, projectIds)}
            />
          ))}
          {cloningProjects.map((cp) => (
            <CloningProjectItem key={cp.id} project={cp} />
          ))}
        </div>
      ) : (
        <>
          <SortableProjectList projects={projects} onReorder={reorderProjects} />
          {cloningProjects.length > 0 && (
            <div className={cn("mt-1 space-y-1")}>
              {cloningProjects.map((cp) => (
                <CloningProjectItem key={cp.id} project={cp} />
              ))}
            </div>
          )}
        </>
      )}
    </>
  );
}

export default ProjectTree;
