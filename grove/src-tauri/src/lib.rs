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

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum CreatePtySessionState {
    Attached,
    Created,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum CreatePtyInitialHydrationSource {
    TmuxCapture,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CreatePtyInitialHydration {
    pub text: String,
    pub truncated: bool,
    pub source: CreatePtyInitialHydrationSource,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CreatePtyResult {
    pub session_state: CreatePtySessionState,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub initial_hydration: Option<CreatePtyInitialHydration>,
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

// === Async helper ===

async fn blocking<T, F>(f: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T, String> + Send + 'static,
{
    tokio::task::spawn_blocking(f)
        .await
        .map_err(|e| e.to_string())?
}

// === CONFIG/THEME COMMANDS (W1) ===

#[tauri::command]
async fn get_terminal_theme() -> Result<terminal_theme::DetectedThemeResult, String> {
    blocking(|| Ok(terminal_theme::detect_terminal_theme())).await
}

#[tauri::command]
async fn get_app_config() -> Result<AppConfig, String> {
    blocking(|| {
        let saved = config::load_app_config();
        Ok(AppConfig {
            base_dir: saved.base_dir,
            terminal_theme: saved
                .terminal_theme
                .or_else(|| Some(terminal_theme::detect_terminal_theme().theme)),
        })
    })
    .await
}

#[tauri::command]
async fn save_app_config(config: AppConfig) -> Result<(), String> {
    blocking(move || config::save_app_config(&config)).await
}

// === GIT PROJECT COMMANDS (W2) ===

#[tauri::command]
async fn list_projects() -> Result<Vec<Project>, String> {
    blocking(git_project::list_projects_impl).await
}

#[tauri::command]
async fn add_project(url: String) -> Result<Project, String> {
    blocking(move || git_project::add_project_impl(&url)).await
}

#[tauri::command]
async fn create_project(name: String, path: String) -> Result<Project, String> {
    blocking(move || git_project::create_project_impl(&name, &path)).await
}

#[tauri::command]
async fn remove_project(id: String) -> Result<(), String> {
    blocking(move || git_project::remove_project_impl(&id)).await
}

#[tauri::command]
async fn is_source_dirty(project_id: String) -> Result<bool, String> {
    blocking(move || git_project::is_source_dirty_impl(&project_id)).await
}

#[tauri::command]
async fn refresh_project(project_id: String) -> Result<Project, String> {
    blocking(move || git_project::refresh_project_impl(&project_id)).await
}

#[tauri::command]
async fn add_worktree(project_id: String, name: String, _branch: String) -> Result<Worktree, String> {
    blocking(move || git_project::add_worktree_impl(&project_id, &name)).await
}

#[tauri::command]
async fn remove_worktree(project_id: String, name: String) -> Result<(), String> {
    blocking(move || git_project::remove_worktree_impl(&project_id, &name)).await
}

#[tauri::command]
async fn list_worktrees(project_id: String) -> Result<Vec<Worktree>, String> {
    blocking(move || git_project::list_worktrees_impl(&project_id)).await
}

// === PTY COMMANDS (W3) ===

#[tauri::command]
async fn create_pty(
    app_handle: tauri::AppHandle,
    pty_id: String,
    pane_id: String,
    worktree_path: String,
    cwd: String,
    cols: u16,
    rows: u16,
    restore: Option<CreatePtyRestore>,
) -> Result<CreatePtyResult, String> {
    blocking(move || {
        pty::create(
            app_handle,
            pty_id,
            pane_id,
            worktree_path,
            cwd,
            cols,
            rows,
            restore,
        )
    })
    .await
}

#[tauri::command]
async fn write_pty(id: String, data: Vec<u8>) -> Result<(), String> {
    blocking(move || pty::write(&id, &data)).await
}

#[tauri::command]
async fn resize_pty(id: String, cols: u16, rows: u16) -> Result<(), String> {
    blocking(move || pty::resize(&id, cols, rows)).await
}

#[tauri::command]
async fn close_pty(pty_id: String) -> Result<(), String> {
    blocking(move || pty::close(&pty_id)).await
}

#[tauri::command]
async fn save_terminal_session_snapshot(
    snapshot: SaveTerminalSessionSnapshotRequest,
) -> Result<TerminalSessionSnapshot, String> {
    blocking(move || pty::save_terminal_session_snapshot(snapshot)).await
}

#[tauri::command]
async fn load_terminal_session_snapshot(
    worktree_path: String,
) -> Result<Option<TerminalSessionSnapshot>, String> {
    blocking(move || pty::load_terminal_session_snapshot(&worktree_path)).await
}

// === GIT DIFF COMMANDS (W4) ===

#[tauri::command]
async fn get_status(worktree_path: String) -> Result<Vec<FileStatus>, String> {
    blocking(move || git_diff::get_status_impl(&worktree_path)).await
}

#[tauri::command]
async fn get_commits(worktree_path: String, limit: u32) -> Result<Vec<CommitInfo>, String> {
    blocking(move || git_diff::get_commits_impl(&worktree_path, limit)).await
}

#[tauri::command]
async fn get_working_diff(worktree_path: String, path: String) -> Result<FileDiff, String> {
    blocking(move || git_diff::get_working_diff_impl(&worktree_path, &path)).await
}

#[tauri::command]
async fn get_commit_diff(worktree_path: String, hash: String) -> Result<Vec<FileDiff>, String> {
    blocking(move || git_diff::get_commit_diff_impl(&worktree_path, &hash)).await
}

#[tauri::command]
async fn stage_file(worktree_path: String, path: String) -> Result<(), String> {
    blocking(move || git_diff::stage_file_impl(&worktree_path, &path)).await
}

#[tauri::command]
async fn unstage_file(worktree_path: String, path: String) -> Result<(), String> {
    blocking(move || git_diff::unstage_file_impl(&worktree_path, &path)).await
}

#[tauri::command]
async fn discard_file(worktree_path: String, path: String) -> Result<(), String> {
    blocking(move || git_diff::discard_file_impl(&worktree_path, &path)).await
}

#[tauri::command]
async fn stage_hunk(worktree_path: String, path: String, hunk_index: u32) -> Result<(), String> {
    blocking(move || git_diff::stage_hunk_impl(&worktree_path, &path, hunk_index)).await
}

#[tauri::command]
async fn unstage_hunk(worktree_path: String, path: String, hunk_index: u32) -> Result<(), String> {
    blocking(move || git_diff::unstage_hunk_impl(&worktree_path, &path, hunk_index)).await
}

#[tauri::command]
async fn discard_hunk(worktree_path: String, path: String, hunk_index: u32) -> Result<(), String> {
    blocking(move || git_diff::discard_hunk_impl(&worktree_path, &path, hunk_index)).await
}

#[tauri::command]
async fn stage_lines(
    worktree_path: String,
    path: String,
    hunk_index: u32,
    line_indices: Vec<u32>,
) -> Result<(), String> {
    blocking(move || git_diff::stage_lines_impl(&worktree_path, &path, hunk_index, &line_indices))
        .await
}

#[tauri::command]
async fn unstage_lines(
    worktree_path: String,
    path: String,
    hunk_index: u32,
    line_indices: Vec<u32>,
) -> Result<(), String> {
    blocking(move || {
        git_diff::unstage_lines_impl(&worktree_path, &path, hunk_index, &line_indices)
    })
    .await
}

#[tauri::command]
async fn discard_lines(
    worktree_path: String,
    path: String,
    hunk_index: u32,
    line_indices: Vec<u32>,
) -> Result<(), String> {
    blocking(move || {
        git_diff::discard_lines_impl(&worktree_path, &path, hunk_index, &line_indices)
    })
    .await
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BehindInfo {
    pub behind: u32,
    pub default_branch: String,
}

// === GIT MERGE COMMANDS ===

#[tauri::command]
async fn get_behind_count(worktree_path: String) -> Result<BehindInfo, String> {
    blocking(move || git_diff::get_behind_count_impl(&worktree_path)).await
}

#[tauri::command]
async fn merge_default_branch(worktree_path: String) -> Result<(), String> {
    blocking(move || git_diff::merge_default_branch_impl(&worktree_path)).await
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
