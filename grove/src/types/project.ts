export interface Project {
  id: string;
  name: string;
  url: string;
  org: string;
  repo: string;
  sourcePath: string;
  worktrees: Worktree[];
  sourceDirty: boolean;
}

export interface Worktree {
  name: string;
  path: string;
  branch: string;
}
