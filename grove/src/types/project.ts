export interface Project {
  id: string;
  name: string;
  url: string;
  org: string;
  repo: string;
  sourcePath: string;
  worktrees: Worktree[];
}

export interface Worktree {
  name: string;
  path: string;
  branch: string;
}
