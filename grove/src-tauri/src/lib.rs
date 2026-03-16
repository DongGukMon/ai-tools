mod config;
mod eventbus;
mod git_diff;
mod git_project;
mod logger;
mod process_env;
mod pty;
mod terminal_theme;

use config::AppConfig;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

// === TYPES ===

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub id: String,
    pub name: String,
    pub url: String,
    pub org: String,
    pub repo: String,
    pub source_path: String,
    pub worktrees: Vec<Worktree>,
    pub source_dirty: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Worktree {
    pub name: String,
    pub path: String,
    pub branch: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PtySession {
    pub id: String,
    pub worktree_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalPaneSnapshotInput {
    pub pane_id: String,
    #[serde(default)]
    pub pty_id: Option<String>,
    #[serde(default)]
    pub launch_cwd: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreatePtyRestore {
    #[serde(default)]
    pub last_known_cwd: Option<String>,
    #[serde(default)]
    pub scrollback: Option<String>,
    #[serde(default)]
    pub scrollback_truncated: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum TerminalRestoreCwdSource {
    LaunchCwd,
    LastKnownCwd,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalPaneSnapshot {
    pub pane_id: String,
    pub scrollback: String,
    pub scrollback_truncated: bool,
    pub launch_cwd: String,
    pub last_known_cwd: Option<String>,
    pub restore_cwd: String,
    pub restore_cwd_source: TerminalRestoreCwdSource,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalSessionSnapshot {
    pub worktree_path: String,
    #[serde(default)]
    pub panes: Vec<TerminalPaneSnapshot>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveTerminalSessionSnapshotRequest {
    pub worktree_path: String,
    #[serde(default)]
    pub panes: Vec<TerminalPaneSnapshotInput>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalSessionSnapshotStore {
    #[serde(default = "default_terminal_session_snapshot_version")]
    pub version: u32,
    #[serde(default)]
    pub worktrees: HashMap<String, TerminalSessionSnapshot>,
}

fn default_terminal_session_snapshot_version() -> u32 {
    1
}

impl Default for TerminalSessionSnapshotStore {
    fn default() -> Self {
        Self {
            version: default_terminal_session_snapshot_version(),
            worktrees: HashMap::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileStatus {
    pub path: String,
    pub status: String,
    pub staged: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommitInfo {
    pub hash: String,
    pub short_hash: String,
    pub message: String,
    pub author: String,
    pub date: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiffLine {
    #[serde(rename = "type")]
    pub line_type: String,
    pub content: String,
    pub old_line_number: Option<u32>,
    pub new_line_number: Option<u32>,
    pub index: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiffHunk {
    pub header: String,
    pub lines: Vec<DiffLine>,
    pub old_start: u32,
    pub old_count: u32,
    pub new_start: u32,
    pub new_count: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileDiff {
    pub path: String,
    pub old_path: Option<String>,
    pub status: String,
    pub hunks: Vec<DiffHunk>,
}

// === CONFIG/THEME COMMANDS (W1) ===

#[tauri::command]
fn get_terminal_theme() -> terminal_theme::DetectedThemeResult {
    terminal_theme::detect_terminal_theme()
}

#[tauri::command]
fn get_app_config() -> AppConfig {
    let saved = config::load_app_config();
    AppConfig {
        base_dir: saved.base_dir,
        terminal_theme: saved
            .terminal_theme
            .or_else(|| Some(terminal_theme::detect_terminal_theme().theme)),
    }
}

#[tauri::command]
fn save_app_config(config: AppConfig) -> Result<(), String> {
    config::save_app_config(&config)
}

// === GIT PROJECT COMMANDS (W2) ===

#[tauri::command]
fn list_projects() -> Result<Vec<Project>, String> {
    git_project::list_projects_impl()
}

#[tauri::command]
fn add_project(url: String) -> Result<Project, String> {
    git_project::add_project_impl(&url)
}

#[tauri::command]
fn create_project(name: String, path: String) -> Result<Project, String> {
    git_project::create_project_impl(&name, &path)
}

#[tauri::command]
fn remove_project(id: String) -> Result<(), String> {
    git_project::remove_project_impl(&id)
}

#[tauri::command]
fn is_source_dirty(project_id: String) -> Result<bool, String> {
    git_project::is_source_dirty_impl(&project_id)
}

#[tauri::command]
fn refresh_project(project_id: String) -> Result<Project, String> {
    git_project::refresh_project_impl(&project_id)
}

#[tauri::command]
fn add_worktree(project_id: String, name: String, _branch: String) -> Result<Worktree, String> {
    git_project::add_worktree_impl(&project_id, &name)
}

#[tauri::command]
fn remove_worktree(project_id: String, name: String) -> Result<(), String> {
    git_project::remove_worktree_impl(&project_id, &name)
}

#[tauri::command]
fn list_worktrees(project_id: String) -> Result<Vec<Worktree>, String> {
    git_project::list_worktrees_impl(&project_id)
}

// === PTY COMMANDS (W3) ===

#[tauri::command]
fn create_pty(
    app_handle: tauri::AppHandle,
    id: String,
    cwd: String,
    cols: u16,
    rows: u16,
    restore: Option<CreatePtyRestore>,
) -> Result<(), String> {
    pty::create(app_handle, id, cwd, cols, rows, restore)
}

#[tauri::command]
fn write_pty(id: String, data: Vec<u8>) -> Result<(), String> {
    pty::write(&id, &data)
}

#[tauri::command]
fn resize_pty(id: String, cols: u16, rows: u16) -> Result<(), String> {
    pty::resize(&id, cols, rows)
}

#[tauri::command]
fn close_pty(id: String) -> Result<(), String> {
    pty::close(&id)
}

#[tauri::command]
fn save_terminal_session_snapshot(
    snapshot: SaveTerminalSessionSnapshotRequest,
) -> Result<TerminalSessionSnapshot, String> {
    pty::save_terminal_session_snapshot(snapshot)
}

#[tauri::command]
fn load_terminal_session_snapshot(
    worktree_path: String,
) -> Result<Option<TerminalSessionSnapshot>, String> {
    pty::load_terminal_session_snapshot(&worktree_path)
}

// === GIT DIFF COMMANDS (W4) ===

#[tauri::command]
fn get_status(worktree_path: String) -> Result<Vec<FileStatus>, String> {
    git_diff::get_status_impl(&worktree_path)
}

#[tauri::command]
fn get_commits(worktree_path: String, limit: u32) -> Result<Vec<CommitInfo>, String> {
    git_diff::get_commits_impl(&worktree_path, limit)
}

#[tauri::command]
fn get_working_diff(worktree_path: String, path: String) -> Result<FileDiff, String> {
    git_diff::get_working_diff_impl(&worktree_path, &path)
}

#[tauri::command]
fn get_commit_diff(worktree_path: String, hash: String) -> Result<Vec<FileDiff>, String> {
    git_diff::get_commit_diff_impl(&worktree_path, &hash)
}

#[tauri::command]
fn stage_file(worktree_path: String, path: String) -> Result<(), String> {
    git_diff::stage_file_impl(&worktree_path, &path)
}

#[tauri::command]
fn unstage_file(worktree_path: String, path: String) -> Result<(), String> {
    git_diff::unstage_file_impl(&worktree_path, &path)
}

#[tauri::command]
fn discard_file(worktree_path: String, path: String) -> Result<(), String> {
    git_diff::discard_file_impl(&worktree_path, &path)
}

#[tauri::command]
fn stage_hunk(worktree_path: String, path: String, hunk_index: u32) -> Result<(), String> {
    git_diff::stage_hunk_impl(&worktree_path, &path, hunk_index)
}

#[tauri::command]
fn unstage_hunk(worktree_path: String, path: String, hunk_index: u32) -> Result<(), String> {
    git_diff::unstage_hunk_impl(&worktree_path, &path, hunk_index)
}

#[tauri::command]
fn discard_hunk(worktree_path: String, path: String, hunk_index: u32) -> Result<(), String> {
    git_diff::discard_hunk_impl(&worktree_path, &path, hunk_index)
}

#[tauri::command]
fn stage_lines(
    worktree_path: String,
    path: String,
    hunk_index: u32,
    line_indices: Vec<u32>,
) -> Result<(), String> {
    git_diff::stage_lines_impl(&worktree_path, &path, hunk_index, &line_indices)
}

#[tauri::command]
fn unstage_lines(
    worktree_path: String,
    path: String,
    hunk_index: u32,
    line_indices: Vec<u32>,
) -> Result<(), String> {
    git_diff::unstage_lines_impl(&worktree_path, &path, hunk_index, &line_indices)
}

#[tauri::command]
fn discard_lines(
    worktree_path: String,
    path: String,
    hunk_index: u32,
    line_indices: Vec<u32>,
) -> Result<(), String> {
    git_diff::discard_lines_impl(&worktree_path, &path, hunk_index, &line_indices)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BehindInfo {
    pub behind: u32,
    pub default_branch: String,
}

// === GIT MERGE COMMANDS ===

#[tauri::command]
fn get_behind_count(worktree_path: String) -> Result<BehindInfo, String> {
    git_diff::get_behind_count_impl(&worktree_path)
}

#[tauri::command]
fn merge_default_branch(worktree_path: String) -> Result<(), String> {
    git_diff::merge_default_branch_impl(&worktree_path)
}

// === APP SETUP ===

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            // Config/Theme (W1)
            get_terminal_theme,
            get_app_config,
            save_app_config,
            config::save_terminal_layouts,
            config::load_terminal_layouts,
            config::save_panel_layouts,
            config::load_panel_layouts,
            // Git Project (W2)
            list_projects,
            add_project,
            create_project,
            remove_project,
            is_source_dirty,
            refresh_project,
            add_worktree,
            remove_worktree,
            list_worktrees,
            // PTY (W3)
            create_pty,
            write_pty,
            resize_pty,
            close_pty,
            save_terminal_session_snapshot,
            load_terminal_session_snapshot,
            // Git Diff (W4)
            get_status,
            get_commits,
            get_working_diff,
            get_commit_diff,
            stage_file,
            unstage_file,
            discard_file,
            stage_hunk,
            unstage_hunk,
            discard_hunk,
            stage_lines,
            unstage_lines,
            discard_lines,
            // Git Merge
            get_behind_count,
            merge_default_branch,
        ])
        .setup(|app| {
            eventbus::init(app.handle());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
