import { invoke } from "@tauri-apps/api/core";
import type {
  TerminalTheme,
  AppConfig,
  Project,
  Worktree,
  FileStatus,
  CommitInfo,
  FileDiff,
} from "../types";

// === CONFIG/THEME COMMANDS (W1) ===

export async function getTerminalTheme(): Promise<TerminalTheme> {
  return invoke<TerminalTheme>("get_terminal_theme");
}

export async function getAppConfig(): Promise<AppConfig> {
  return invoke<AppConfig>("get_app_config");
}

export async function saveAppConfig(config: AppConfig): Promise<void> {
  return invoke("save_app_config", { config });
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
  id: string,
  cwd: string,
  cols: number,
  rows: number,
): Promise<void> {
  return invoke("create_pty", { id, cwd, cols, rows });
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

export async function closePty(id: string): Promise<void> {
  return invoke("close_pty", { id });
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
