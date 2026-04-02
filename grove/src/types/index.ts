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
export type {
  EnvValueSource,
  PathDiagnostics,
  ProcessEnvDiagnostics,
  SshAuthSockDiagnostics,
  SubprocessEnvVar,
} from "./env";

export type TerminalLinkOpenMode =
  | "external"
  | "internal"
  | "external-with-localhost-internal";

export interface PreferredIde {
  id: string;
  displayName?: string;
  openCommand?: string;
}

export interface GrovePreferences {
  terminalLinkOpenMode: TerminalLinkOpenMode;
  preferredIde: PreferredIde | null;
}

export interface AppConfig {
  baseDir: string;
  terminalTheme?: Partial<import("./terminal").TerminalTheme>;
  preferences: GrovePreferences;
}
