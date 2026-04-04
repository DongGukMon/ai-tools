import type { Project } from "../types";

export interface ProjectOrgGroup {
  org: string;
  projects: Project[];
}

interface ProjectDisplayNameOptions {
  showOrgPrefix?: boolean;
}

export function groupProjectsByOrg(projects: Project[]): ProjectOrgGroup[] {
  const grouped = new Map<string, ProjectOrgGroup>();

  for (const project of projects) {
    let group = grouped.get(project.org);
    if (!group) {
      group = { org: project.org, projects: [] };
      grouped.set(project.org, group);
    }
    group.projects.push(project);
  }

  return Array.from(grouped.values());
}

export function orderProjectOrgGroups(
  groups: ProjectOrgGroup[],
  projectOrgOrder: string[],
): ProjectOrgGroup[] {
  const groupedByOrg = new Map(groups.map((group) => [group.org, group]));
  const ordered: ProjectOrgGroup[] = [];

  for (const org of projectOrgOrder) {
    const group = groupedByOrg.get(org);
    if (!group) continue;
    ordered.push(group);
    groupedByOrg.delete(org);
  }

  for (const group of groups) {
    if (groupedByOrg.has(group.org)) {
      ordered.push(group);
    }
  }

  return ordered;
}

export function getProjectDisplayName(
  project: Project,
  options: ProjectDisplayNameOptions = {},
): string {
  if (project.name !== project.repo) {
    return project.name;
  }

  if (options.showOrgPrefix === false || !project.org.trim()) {
    return project.repo;
  }

  return `${project.org}/${project.repo}`;
}

export function applyOrgProjectOrder(
  projects: Project[],
  org: string,
  reorderedOrgProjectIds: string[],
): string[] {
  const orgProjectIds = projects
    .filter((project) => project.org === org)
    .map((project) => project.id);

  if (
    orgProjectIds.length !== reorderedOrgProjectIds.length ||
    orgProjectIds.some((id) => !reorderedOrgProjectIds.includes(id))
  ) {
    return projects.map((project) => project.id);
  }

  let nextOrgIndex = 0;
  return projects.map((project) => {
    if (project.org !== org) {
      return project.id;
    }

    const reorderedId = reorderedOrgProjectIds[nextOrgIndex];
    nextOrgIndex += 1;
    return reorderedId;
  });
}

export function moveProjectOrg(
  orderedOrgs: string[],
  org: string,
  direction: "up" | "down",
): string[] {
  const currentIndex = orderedOrgs.indexOf(org);
  if (currentIndex === -1) return orderedOrgs;

  const nextIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
  if (nextIndex < 0 || nextIndex >= orderedOrgs.length) {
    return orderedOrgs;
  }

  const next = [...orderedOrgs];
  const [moved] = next.splice(currentIndex, 1);
  next.splice(nextIndex, 0, moved);
  return next;
}
