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
