export interface Project {
  id: string;
  name: string;
  url: string;
  org: string;
  repo: string;
  sourcePath: string;
  worktrees: Worktree[];
  sourceHasChanges: boolean;
  sourceBehindRemote: boolean;
  baseBranch: string | null;
  resolvedDefaultBranch: string;
  collapsed: boolean;
}

export interface Worktree {
  name: string;
  path: string;
  branch: string;
}

export type WorktreePullRequestStatus = "open" | "merged" | "unknown";

export interface WorktreePullRequest {
  url: string;
  status: WorktreePullRequestStatus;
}

export interface EnvSyncConfig {
  include_patterns: string[];
}
