mod eventbus;
use grove_core::{
    AppConfig, BehindInfo, CommitInfo, CreatePtyRequest, CreatePtyRestore, CreatePtyResult,
    DetectedThemeResult, FileDiff, FileStatus, Project, PtyBellEvent,
    SaveTerminalSessionSnapshotRequest, TerminalSessionSnapshot, Worktree,
};

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
async fn get_terminal_theme() -> Result<DetectedThemeResult, String> {
    blocking(|| Ok(grove_core::terminal_theme::detect_terminal_theme())).await
}

#[tauri::command]
async fn get_app_config() -> Result<AppConfig, String> {
    blocking(|| Ok(grove_core::config::get_app_config_impl())).await
}

#[tauri::command]
async fn save_app_config(config: AppConfig) -> Result<(), String> {
    blocking(move || grove_core::config::save_app_config(&config)).await
}

#[tauri::command]
async fn save_terminal_layouts(layouts: String) -> Result<(), String> {
    blocking(move || grove_core::config::save_terminal_layouts_impl(&layouts)).await
}

#[tauri::command]
async fn load_terminal_layouts() -> Result<String, String> {
    blocking(grove_core::config::load_terminal_layouts_impl).await
}

#[tauri::command]
async fn save_panel_layouts(layouts: String) -> Result<(), String> {
    blocking(move || grove_core::config::save_panel_layouts_impl(&layouts)).await
}

#[tauri::command]
async fn load_panel_layouts() -> Result<String, String> {
    blocking(grove_core::config::load_panel_layouts_impl).await
}

// === GIT PROJECT COMMANDS (W2) ===

#[tauri::command]
async fn list_projects() -> Result<Vec<Project>, String> {
    blocking(grove_core::git_project::list_projects_impl).await
}

#[tauri::command]
async fn add_project(url: String) -> Result<Project, String> {
    blocking(move || grove_core::git_project::add_project_impl(&url)).await
}

#[tauri::command]
async fn create_project(name: String, path: String) -> Result<Project, String> {
    blocking(move || grove_core::git_project::create_project_impl(&name, &path)).await
}

#[tauri::command]
async fn remove_project(id: String) -> Result<(), String> {
    blocking(move || grove_core::git_project::remove_project_impl(&id)).await
}

#[tauri::command]
async fn is_source_dirty(project_id: String) -> Result<bool, String> {
    blocking(move || grove_core::git_project::is_source_dirty_impl(&project_id)).await
}

#[tauri::command]
async fn refresh_project(project_id: String) -> Result<Project, String> {
    blocking(move || grove_core::git_project::refresh_project_impl(&project_id)).await
}

#[tauri::command]
async fn add_worktree(
    project_id: String,
    name: String,
    _branch: String,
) -> Result<Worktree, String> {
    blocking(move || grove_core::git_project::add_worktree_impl(&project_id, &name)).await
}

#[tauri::command]
async fn remove_worktree(project_id: String, name: String) -> Result<(), String> {
    blocking(move || grove_core::git_project::remove_worktree_impl(&project_id, &name)).await
}

#[tauri::command]
async fn list_worktrees(project_id: String) -> Result<Vec<Worktree>, String> {
    blocking(move || grove_core::git_project::list_worktrees_impl(&project_id)).await
}

#[tauri::command]
async fn set_worktree_order(project_id: String, order: Vec<String>) -> Result<(), String> {
    blocking(move || grove_core::git_project::set_worktree_order_impl(&project_id, order)).await
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
    let request = CreatePtyRequest {
        pty_id,
        pane_id,
        worktree_path,
        cwd,
        cols,
        rows,
        restore,
    };
    let sink = eventbus::pty_sink(app_handle);

    blocking(move || grove_core::pty::create(request, sink)).await
}

#[tauri::command]
async fn write_pty(id: String, data: Vec<u8>) -> Result<(), String> {
    blocking(move || grove_core::pty::write(&id, &data)).await
}

#[tauri::command]
async fn resize_pty(id: String, cols: u16, rows: u16) -> Result<(), String> {
    blocking(move || grove_core::pty::resize(&id, cols, rows)).await
}

#[tauri::command]
async fn clear_pty_scrollback(pty_id: String) -> Result<(), String> {
    blocking(move || grove_core::pty::clear_scrollback(&pty_id)).await
}

#[tauri::command]
async fn close_pty(pty_id: String) -> Result<(), String> {
    blocking(move || grove_core::pty::close(&pty_id)).await
}

#[tauri::command]
async fn poll_pty_bells() -> Result<Vec<PtyBellEvent>, String> {
    blocking(grove_core::pty::poll_bell_events).await
}

#[tauri::command]
async fn save_terminal_session_snapshot(
    snapshot: SaveTerminalSessionSnapshotRequest,
) -> Result<TerminalSessionSnapshot, String> {
    blocking(move || grove_core::pty::save_terminal_session_snapshot(snapshot)).await
}

#[tauri::command]
async fn load_terminal_session_snapshot(
    worktree_path: String,
) -> Result<Option<TerminalSessionSnapshot>, String> {
    blocking(move || grove_core::pty::load_terminal_session_snapshot(&worktree_path)).await
}

// === GIT DIFF COMMANDS (W4) ===

#[tauri::command]
async fn get_status(worktree_path: String) -> Result<Vec<FileStatus>, String> {
    blocking(move || grove_core::git_diff::get_status_impl(&worktree_path)).await
}

#[tauri::command]
async fn get_commits(worktree_path: String, limit: u32) -> Result<Vec<CommitInfo>, String> {
    blocking(move || grove_core::git_diff::get_commits_impl(&worktree_path, limit)).await
}

#[tauri::command]
async fn get_working_diff(worktree_path: String, path: String) -> Result<FileDiff, String> {
    blocking(move || grove_core::git_diff::get_working_diff_impl(&worktree_path, &path)).await
}

#[tauri::command]
async fn get_commit_diff(worktree_path: String, hash: String) -> Result<Vec<FileDiff>, String> {
    blocking(move || grove_core::git_diff::get_commit_diff_impl(&worktree_path, &hash)).await
}

#[tauri::command]
async fn stage_file(worktree_path: String, path: String) -> Result<(), String> {
    blocking(move || grove_core::git_diff::stage_file_impl(&worktree_path, &path)).await
}

#[tauri::command]
async fn unstage_file(worktree_path: String, path: String) -> Result<(), String> {
    blocking(move || grove_core::git_diff::unstage_file_impl(&worktree_path, &path)).await
}

#[tauri::command]
async fn discard_file(worktree_path: String, path: String) -> Result<(), String> {
    blocking(move || grove_core::git_diff::discard_file_impl(&worktree_path, &path)).await
}

#[tauri::command]
async fn stage_hunk(worktree_path: String, path: String, hunk_index: u32) -> Result<(), String> {
    blocking(move || grove_core::git_diff::stage_hunk_impl(&worktree_path, &path, hunk_index)).await
}

#[tauri::command]
async fn unstage_hunk(worktree_path: String, path: String, hunk_index: u32) -> Result<(), String> {
    blocking(move || grove_core::git_diff::unstage_hunk_impl(&worktree_path, &path, hunk_index))
        .await
}

#[tauri::command]
async fn discard_hunk(worktree_path: String, path: String, hunk_index: u32) -> Result<(), String> {
    blocking(move || grove_core::git_diff::discard_hunk_impl(&worktree_path, &path, hunk_index))
        .await
}

#[tauri::command]
async fn stage_lines(
    worktree_path: String,
    path: String,
    hunk_index: u32,
    line_indices: Vec<u32>,
) -> Result<(), String> {
    blocking(move || {
        grove_core::git_diff::stage_lines_impl(&worktree_path, &path, hunk_index, &line_indices)
    })
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
        grove_core::git_diff::unstage_lines_impl(&worktree_path, &path, hunk_index, &line_indices)
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
        grove_core::git_diff::discard_lines_impl(&worktree_path, &path, hunk_index, &line_indices)
    })
    .await
}

// === GIT MERGE COMMANDS ===

#[tauri::command]
async fn get_behind_count(worktree_path: String) -> Result<BehindInfo, String> {
    blocking(move || grove_core::git_diff::get_behind_count_impl(&worktree_path)).await
}

#[tauri::command]
async fn merge_default_branch(worktree_path: String) -> Result<(), String> {
    blocking(move || grove_core::git_diff::merge_default_branch_impl(&worktree_path)).await
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
            save_terminal_layouts,
            load_terminal_layouts,
            save_panel_layouts,
            load_panel_layouts,
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
            set_worktree_order,
            // PTY (W3)
            create_pty,
            write_pty,
            resize_pty,
            clear_pty_scrollback,
            close_pty,
            poll_pty_bells,
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
