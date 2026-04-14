export type {
  Project,
  Worktree,
  WorktreePullRequest,
  WorktreePullRequestStatus,
  ProjectEnvSyncConfig,
  CloningProject,
  StartCloneResult,
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

export type ProjectViewMode = "default" | "group-by-orgs";

export interface IdeMenuItem {
  id: string;
  displayName?: string;
  openCommand?: string;
}

export type GitGuiMenuItem = IdeMenuItem;

export interface GrovePreferences {
  terminalLinkOpenMode: TerminalLinkOpenMode;
  projectViewMode: ProjectViewMode;
  collapsedProjectOrgs: string[];
  projectOrgOrder: string[];
  ideMenuItems: IdeMenuItem[];
  gitGuiMenuItems: GitGuiMenuItem[];
}

export interface AppConfig {
  baseDir: string;
  terminalTheme?: Partial<import("./terminal").TerminalTheme>;
  preferences: GrovePreferences;
}
