import { invoke } from "@tauri-apps/api/core";
import type {
  TerminalTheme,
  AppConfig,
  Project,
  Worktree,
  BehindInfo,
  FileStatus,
  CommitInfo,
  FileDiff,
} from "../types";

// Terminal session snapshots are keyed by stable paneId. ptyId is only an
// optional runtime lookup handle for backend-enriched scrollback/cwd capture.
export type TerminalRestoreCwdSource = "launchCwd" | "lastKnownCwd";

export interface CreatePtyRestore {
  lastKnownCwd?: string | null;
  scrollback?: string | null;
  scrollbackTruncated?: boolean | null;
}

export interface CreatePtyRequest {
  ptyId: string;
  paneId: string;
  worktreePath: string;
  cwd: string;
  cols: number;
  rows: number;
  restore?: CreatePtyRestore | null;
}

export type CreatePtySessionState = "attached" | "created";

export interface CreatePtyInitialHydration {
  text: string;
  truncated: boolean;
  source: "tmuxCapture";
}

export interface CreatePtyResult {
  sessionState: CreatePtySessionState;
  initialHydration?: CreatePtyInitialHydration | null;
}

export interface TerminalPaneSnapshotInput {
  paneId: string;
  ptyId?: string | null;
  launchCwd?: string | null;
}

export interface SaveTerminalSessionSnapshotRequest {
  worktreePath: string;
  panes: TerminalPaneSnapshotInput[];
}

export interface TerminalPaneSnapshot {
  paneId: string;
  scrollback: string;
  scrollbackTruncated: boolean;
  launchCwd: string;
  lastKnownCwd: string | null;
  restoreCwd: string;
  restoreCwdSource: TerminalRestoreCwdSource;
}

export interface TerminalSessionSnapshot {
  worktreePath: string;
  panes: TerminalPaneSnapshot[];
}

export function getCommandErrorMessage(error: unknown): string {
  const raw =
    typeof error === "string"
      ? error
      : error instanceof Error
        ? error.message
        : String(error);
  const message = sanitizeCommandErrorMessage(raw);
  return message || "Unknown error";
}

function sanitizeCommandErrorMessage(message: string): string {
  return message
    .replace(/^Error invoking command '[^']+':\s*/i, "")
    .replace(/^Error:\s*/i, "")
    .replace(/Cloning into '[^']+'\.{3}/g, "Cloning repository...")
    .replace(/(https?:\/\/)([^@\s/]+(?::[^@\s/]+)?@)/gi, "$1***@")
    .replace(
      /(^|[\s('"])(\/(?:Users|home|private|tmp|var|Volumes)[^'"\s)\n]*)/g,
      "$1[path]",
    )
    .trim();
}

// === CONFIG/THEME COMMANDS (W1) ===

export async function getTerminalTheme(): Promise<{ theme: TerminalTheme; detected: boolean }> {
  return invoke<{ theme: TerminalTheme; detected: boolean }>("get_terminal_theme");
}

export async function getAppConfig(): Promise<AppConfig> {
  return invoke<AppConfig>("get_app_config");
}

export async function saveAppConfig(config: AppConfig): Promise<void> {
  return invoke("save_app_config", { config });
}

// === TERMINAL LAYOUT PERSISTENCE ===

export async function saveTerminalLayouts(layouts: string): Promise<void> {
  return invoke("save_terminal_layouts", { layouts });
}

export async function loadTerminalLayouts(): Promise<string> {
  return invoke<string>("load_terminal_layouts");
}

export async function savePanelLayouts(layouts: string): Promise<void> {
  return invoke("save_panel_layouts", { layouts });
}

export async function loadPanelLayouts(): Promise<string> {
  return invoke<string>("load_panel_layouts");
}

// === GIT PROJECT COMMANDS (W2) ===

export async function listProjects(): Promise<Project[]> {
  return invoke<Project[]>("list_projects");
}

export async function addProject(url: string): Promise<Project> {
  return invoke<Project>("add_project", { url });
}

export async function createProject(
  name: string,
  path: string,
): Promise<Project> {
  return invoke<Project>("create_project", { name, path });
}

export async function removeProject(id: string): Promise<void> {
  return invoke("remove_project", { id });
}

export async function refreshProject(projectId: string): Promise<Project> {
  return invoke<Project>("refresh_project", { projectId });
}

export async function addWorktree(
  projectId: string,
  name: string,
  branch: string,
): Promise<Worktree> {
  return invoke<Worktree>("add_worktree", { projectId, name, branch });
}

export async function removeWorktree(
  projectId: string,
  name: string,
): Promise<void> {
  return invoke("remove_worktree", { projectId, name });
}

export async function listWorktrees(projectId: string): Promise<Worktree[]> {
  return invoke<Worktree[]>("list_worktrees", { projectId });
}

// === PTY COMMANDS (W3) ===

export async function createPty(
  request: CreatePtyRequest,
): Promise<CreatePtyResult> {
  return invoke<CreatePtyResult>("create_pty", { ...request });
}

export async function writePty(id: string, data: number[]): Promise<void> {
  return invoke("write_pty", { id, data });
}

export async function resizePty(
  id: string,
  cols: number,
  rows: number,
): Promise<void> {
  return invoke("resize_pty", { id, cols, rows });
}

export async function closePty(ptyId: string): Promise<void> {
  return invoke("close_pty", { ptyId });
}

export async function saveTerminalSessionSnapshot(
  snapshot: SaveTerminalSessionSnapshotRequest,
): Promise<TerminalSessionSnapshot> {
  return invoke<TerminalSessionSnapshot>("save_terminal_session_snapshot", {
    snapshot,
  });
}

export async function loadTerminalSessionSnapshot(
  worktreePath: string,
): Promise<TerminalSessionSnapshot | null> {
  return invoke<TerminalSessionSnapshot | null>("load_terminal_session_snapshot", {
    worktreePath,
  });
}

// === GIT DIFF COMMANDS (W4) ===

export async function getStatus(worktreePath: string): Promise<FileStatus[]> {
  return invoke<FileStatus[]>("get_status", { worktreePath });
}

export async function getCommits(
  worktreePath: string,
  limit: number,
): Promise<CommitInfo[]> {
  return invoke<CommitInfo[]>("get_commits", { worktreePath, limit });
}

export async function getWorkingDiff(
  worktreePath: string,
  path: string,
): Promise<FileDiff> {
  return invoke<FileDiff>("get_working_diff", { worktreePath, path });
}

export async function getCommitDiff(
  worktreePath: string,
  hash: string,
): Promise<FileDiff[]> {
  return invoke<FileDiff[]>("get_commit_diff", { worktreePath, hash });
}

export async function stageFile(
  worktreePath: string,
  path: string,
): Promise<void> {
  return invoke("stage_file", { worktreePath, path });
}

export async function unstageFile(
  worktreePath: string,
  path: string,
): Promise<void> {
  return invoke("unstage_file", { worktreePath, path });
}

export async function discardFile(
  worktreePath: string,
  path: string,
): Promise<void> {
  return invoke("discard_file", { worktreePath, path });
}

export async function stageHunk(
  worktreePath: string,
  path: string,
  hunkIndex: number,
): Promise<void> {
  return invoke("stage_hunk", { worktreePath, path, hunkIndex });
}

export async function unstageHunk(
  worktreePath: string,
  path: string,
  hunkIndex: number,
): Promise<void> {
  return invoke("unstage_hunk", { worktreePath, path, hunkIndex });
}

export async function discardHunk(
  worktreePath: string,
  path: string,
  hunkIndex: number,
): Promise<void> {
  return invoke("discard_hunk", { worktreePath, path, hunkIndex });
}

export async function stageLines(
  worktreePath: string,
  path: string,
  hunkIndex: number,
  lineIndices: number[],
): Promise<void> {
  return invoke("stage_lines", { worktreePath, path, hunkIndex, lineIndices });
}

export async function unstageLines(
  worktreePath: string,
  path: string,
  hunkIndex: number,
  lineIndices: number[],
): Promise<void> {
  return invoke("unstage_lines", {
    worktreePath,
    path,
    hunkIndex,
    lineIndices,
  });
}

export async function discardLines(
  worktreePath: string,
  path: string,
  hunkIndex: number,
  lineIndices: number[],
): Promise<void> {
  return invoke("discard_lines", {
    worktreePath,
    path,
    hunkIndex,
    lineIndices,
  });
}

// === GIT MERGE COMMANDS ===

export async function getBehindCount(
  worktreePath: string,
): Promise<BehindInfo> {
  return invoke<BehindInfo>("get_behind_count", { worktreePath });
}

export async function mergeDefaultBranch(
  worktreePath: string,
): Promise<void> {
  return invoke("merge_default_branch", { worktreePath });
}
