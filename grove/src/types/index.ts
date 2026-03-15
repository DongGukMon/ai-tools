export type { Project, Worktree } from "./project";
export type {
  TerminalTheme,
  PtySession,
  SplitNode,
} from "./terminal";
export type {
  CommitInfo,
  FileStatus,
  DiffLine,
  DiffHunk,
  FileDiff,
} from "./diff";

export interface AppConfig {
  baseDir: string;
  terminalTheme?: Partial<import("./terminal").TerminalTheme>;
}
