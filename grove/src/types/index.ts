export type {
  Project,
  Worktree,
  WorktreePullRequest,
  WorktreePullRequestStatus,
} from "./project";
export type { Mission, MissionProject } from "./mission";
export type {
  TerminalTheme,
  PtySession,
  SplitNode,
} from "./terminal";
export type {
  BehindInfo,
  CommitInfo,
  FileStatus,
  DiffLine,
  DiffHunk,
  FileDiff,
} from "./diff";
export type { AppTab, AppTabType } from "./tab";

export interface AppConfig {
  baseDir: string;
  terminalTheme?: Partial<import("./terminal").TerminalTheme>;
}
