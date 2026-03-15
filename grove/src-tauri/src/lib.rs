mod config;
mod git_project;
mod terminal_theme;

use serde::{Deserialize, Serialize};

// === TYPES ===

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppConfig {
    pub base_dir: String,
    pub terminal_theme: Option<terminal_theme::TerminalTheme>,
}

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
fn get_terminal_theme() -> terminal_theme::TerminalTheme {
    terminal_theme::detect_terminal_theme()
}

#[tauri::command]
fn get_app_config() -> AppConfig {
    let base_dir = dirs::home_dir()
        .map(|p| p.join(".grove"))
        .unwrap_or_else(|| std::path::PathBuf::from(".grove"))
        .to_string_lossy()
        .to_string();

    AppConfig {
        base_dir,
        terminal_theme: Some(terminal_theme::detect_terminal_theme()),
    }
}

#[tauri::command]
fn save_app_config(_config: AppConfig) -> Result<(), String> {
    // Config persistence will be implemented with the config module
    Ok(())
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
fn create_pty(_worktree_path: String) -> PtySession {
    todo!()
}

#[tauri::command]
fn write_pty(_id: String, _data: String) {
    todo!()
}

#[tauri::command]
fn resize_pty(_id: String, _cols: u32, _rows: u32) {
    todo!()
}

#[tauri::command]
fn close_pty(_id: String) {
    todo!()
}

// === GIT DIFF COMMANDS (W4) ===

#[tauri::command]
fn get_status(_worktree_path: String) -> Vec<FileStatus> {
    todo!()
}

#[tauri::command]
fn get_commits(_worktree_path: String, _limit: u32) -> Vec<CommitInfo> {
    todo!()
}

#[tauri::command]
fn get_working_diff(_worktree_path: String, _path: String) -> FileDiff {
    todo!()
}

#[tauri::command]
fn get_commit_diff(_worktree_path: String, _hash: String) -> Vec<FileDiff> {
    todo!()
}

#[tauri::command]
fn stage_file(_worktree_path: String, _path: String) {
    todo!()
}

#[tauri::command]
fn unstage_file(_worktree_path: String, _path: String) {
    todo!()
}

#[tauri::command]
fn discard_file(_worktree_path: String, _path: String) {
    todo!()
}

#[tauri::command]
fn stage_hunk(_worktree_path: String, _path: String, _hunk_index: u32) {
    todo!()
}

#[tauri::command]
fn unstage_hunk(_worktree_path: String, _path: String, _hunk_index: u32) {
    todo!()
}

#[tauri::command]
fn discard_hunk(_worktree_path: String, _path: String, _hunk_index: u32) {
    todo!()
}

#[tauri::command]
fn stage_lines(_worktree_path: String, _path: String, _hunk_index: u32, _line_indices: Vec<u32>) {
    todo!()
}

#[tauri::command]
fn unstage_lines(
    _worktree_path: String,
    _path: String,
    _hunk_index: u32,
    _line_indices: Vec<u32>,
) {
    todo!()
}

#[tauri::command]
fn discard_lines(
    _worktree_path: String,
    _path: String,
    _hunk_index: u32,
    _line_indices: Vec<u32>,
) {
    todo!()
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
            // Git Project (W2)
            list_projects,
            add_project,
            create_project,
            remove_project,
            add_worktree,
            remove_worktree,
            list_worktrees,
            // PTY (W3)
            create_pty,
            write_pty,
            resize_pty,
            close_pty,
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
