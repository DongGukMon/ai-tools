use crate::terminal_theme::TerminalTheme;
use crate::TerminalSessionSnapshotStore;
use serde::{de::DeserializeOwned, Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectEntry {
    pub id: String,
    pub name: String,
    pub url: String,
    pub org: String,
    pub repo: String,
    pub source_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(default, rename_all = "camelCase")]
pub struct GroveConfig {
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub projects: Vec<ProjectEntry>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub base_dir: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub terminal_theme: Option<TerminalTheme>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppConfig {
    pub base_dir: String,
    pub terminal_theme: Option<TerminalTheme>,
}

pub fn default_base_dir() -> String {
    dirs::home_dir()
        .map(|p| p.join(".grove"))
        .unwrap_or_else(|| PathBuf::from(".grove"))
        .to_string_lossy()
        .to_string()
}

fn config_path() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".grove")
        .join("config.json")
}

fn grove_data_path(filename: &str) -> Result<PathBuf, String> {
    Ok(dirs::home_dir()
        .ok_or("No home dir")?
        .join(".grove")
        .join(filename))
}

fn load_json_file_or_default<T>(path: &Path) -> Result<T, String>
where
    T: DeserializeOwned + Default,
{
    if !path.exists() {
        return Ok(T::default());
    }

    let content =
        fs::read_to_string(path).map_err(|e| format!("Failed to read {}: {e}", path.display()))?;
    serde_json::from_str(&content).map_err(|e| format!("Failed to parse {}: {e}", path.display()))
}

fn save_json_file<T>(path: &Path, value: &T) -> Result<(), String>
where
    T: Serialize,
{
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create dir: {e}"))?;
    }

    let content = serde_json::to_string_pretty(value)
        .map_err(|e| format!("Failed to serialize {}: {e}", path.display()))?;
    fs::write(path, content).map_err(|e| format!("Failed to write {}: {e}", path.display()))
}

pub fn load_config() -> GroveConfig {
    load_config_from_path(&config_path())
}

fn load_config_from_path(path: &Path) -> GroveConfig {
    if !path.exists() {
        return GroveConfig::default();
    }
    let content = fs::read_to_string(path).unwrap_or_default();
    serde_json::from_str(&content).unwrap_or_default()
}

pub fn save_config(config: &GroveConfig) -> Result<(), String> {
    save_config_to_path(&config_path(), config)
}

fn save_config_to_path(path: &Path, config: &GroveConfig) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create config dir: {e}"))?;
    }
    let content = serde_json::to_string_pretty(config)
        .map_err(|e| format!("Failed to serialize config: {e}"))?;
    fs::write(path, content).map_err(|e| format!("Failed to write config: {e}"))
}

pub fn load_app_config() -> AppConfig {
    let path = config_path();
    load_app_config_from_path(&path)
}

fn load_app_config_from_path(path: &Path) -> AppConfig {
    let config = load_config_from_path(path);
    AppConfig {
        base_dir: config
            .base_dir
            .filter(|base_dir| !base_dir.trim().is_empty())
            .unwrap_or_else(default_base_dir),
        terminal_theme: config.terminal_theme,
    }
}

pub fn save_app_config(config: &AppConfig) -> Result<(), String> {
    save_app_config_to_path(&config_path(), config)
}

fn save_app_config_to_path(path: &Path, app_config: &AppConfig) -> Result<(), String> {
    let mut config = load_config_from_path(path);
    config.base_dir = Some(app_config.base_dir.clone());
    config.terminal_theme = app_config.terminal_theme.clone();
    save_config_to_path(path, &config)
}

fn terminal_session_snapshots_path() -> Result<PathBuf, String> {
    grove_data_path("terminal-session-snapshots.json")
}

pub fn load_terminal_session_snapshot_store() -> Result<TerminalSessionSnapshotStore, String> {
    load_terminal_session_snapshot_store_from_path(&terminal_session_snapshots_path()?)
}

fn load_terminal_session_snapshot_store_from_path(
    path: &Path,
) -> Result<TerminalSessionSnapshotStore, String> {
    load_json_file_or_default(path)
}

pub fn save_terminal_session_snapshot_store(
    store: &TerminalSessionSnapshotStore,
) -> Result<(), String> {
    save_terminal_session_snapshot_store_to_path(&terminal_session_snapshots_path()?, store)
}

fn save_terminal_session_snapshot_store_to_path(
    path: &Path,
    store: &TerminalSessionSnapshotStore,
) -> Result<(), String> {
    save_json_file(path, store)
}

pub fn get_app_config_impl() -> AppConfig {
    let saved = load_app_config();
    AppConfig {
        base_dir: saved.base_dir,
        terminal_theme: saved
            .terminal_theme
            .or_else(|| Some(crate::terminal_theme::detect_terminal_theme().theme)),
    }
}

// ── Panel layout persistence ──

pub fn save_panel_layouts_impl(layouts: &str) -> Result<(), String> {
    let path = grove_data_path("panel-layouts.json")?;
    fs::create_dir_all(path.parent().unwrap()).map_err(|e| e.to_string())?;
    fs::write(&path, layouts).map_err(|e| e.to_string())
}

pub fn load_panel_layouts_impl() -> Result<String, String> {
    let path = grove_data_path("panel-layouts.json")?;
    if path.exists() {
        fs::read_to_string(&path).map_err(|e| e.to_string())
    } else {
        Ok("{}".to_string())
    }
}

// ── Terminal layout persistence ──

pub fn save_terminal_layouts_impl(layouts: &str) -> Result<(), String> {
    let path = grove_data_path("terminal-layouts.json")?;
    fs::create_dir_all(path.parent().unwrap()).map_err(|e| e.to_string())?;
    fs::write(&path, layouts).map_err(|e| e.to_string())
}

pub fn load_terminal_layouts_impl() -> Result<String, String> {
    let path = grove_data_path("terminal-layouts.json")?;
    if path.exists() {
        fs::read_to_string(&path).map_err(|e| e.to_string())
    } else {
        Ok("{}".to_string())
    }
}

// ── Worktree data cleanup ──

pub fn remove_terminal_layouts_for_worktree(worktree_path: &str) -> Result<(), String> {
    let raw = load_terminal_layouts_impl()?;
    let mut map: serde_json::Map<String, serde_json::Value> =
        serde_json::from_str(&raw).map_err(|e| format!("Failed to parse terminal-layouts.json: {e}"))?;
    if map.remove(worktree_path).is_some() {
        let updated = serde_json::to_string_pretty(&map)
            .map_err(|e| format!("Failed to serialize terminal-layouts.json: {e}"))?;
        save_terminal_layouts_impl(&updated)?;
    }
    Ok(())
}

pub fn remove_terminal_session_snapshot_for_worktree(worktree_path: &str) -> Result<(), String> {
    let mut store = load_terminal_session_snapshot_store()?;
    if store.worktrees.remove(worktree_path).is_some() {
        save_terminal_session_snapshot_store(&store)?;
    }
    Ok(())
}

pub fn remove_panel_layouts_for_worktree(worktree_path: &str) -> Result<(), String> {
    let raw = load_panel_layouts_impl()?;
    let mut map: serde_json::Map<String, serde_json::Value> =
        serde_json::from_str(&raw).map_err(|e| format!("Failed to parse panel-layouts.json: {e}"))?;
    if map.remove(worktree_path).is_some() {
        let updated = serde_json::to_string_pretty(&map)
            .map_err(|e| format!("Failed to serialize panel-layouts.json: {e}"))?;
        save_panel_layouts_impl(&updated)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        TerminalPaneSnapshot, TerminalRestoreCwdSource, TerminalSessionSnapshot,
        TerminalSessionSnapshotStore,
    };
    use uuid::Uuid;

    fn temp_config_path() -> PathBuf {
        std::env::temp_dir()
            .join(format!("grove-config-tests-{}", Uuid::new_v4()))
            .join("config.json")
    }

    fn temp_snapshot_store_path() -> PathBuf {
        std::env::temp_dir()
            .join(format!("grove-snapshot-tests-{}", Uuid::new_v4()))
            .join("terminal-session-snapshots.json")
    }

    fn write_fixture(path: &Path, content: &str) {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).unwrap();
        }
        fs::write(path, content).unwrap();
    }

    fn sample_theme() -> TerminalTheme {
        TerminalTheme {
            background: "#000000".into(),
            foreground: "#ffffff".into(),
            cursor: "#cccccc".into(),
            black: "#111111".into(),
            red: "#222222".into(),
            green: "#333333".into(),
            yellow: "#444444".into(),
            blue: "#555555".into(),
            magenta: "#666666".into(),
            cyan: "#777777".into(),
            white: "#888888".into(),
            bright_black: "#999999".into(),
            bright_red: "#aaaaaa".into(),
            bright_green: "#bbbbbb".into(),
            bright_yellow: "#cccccc".into(),
            bright_blue: "#dddddd".into(),
            bright_magenta: "#eeeeee".into(),
            bright_cyan: "#fafafa".into(),
            bright_white: "#fefefe".into(),
            font_family: "Menlo".into(),
            font_size: 13.0,
        }
    }

    fn sample_project() -> ProjectEntry {
        ProjectEntry {
            id: "project-1".into(),
            name: "grove".into(),
            url: "https://github.com/bang9/grove.git".into(),
            org: "bang9".into(),
            repo: "grove".into(),
            source_path: "/tmp/grove/source".into(),
        }
    }

    fn sample_snapshot_store() -> TerminalSessionSnapshotStore {
        let mut store = TerminalSessionSnapshotStore::default();
        store.worktrees.insert(
            "/tmp/grove/worktree".into(),
            TerminalSessionSnapshot {
                worktree_path: "/tmp/grove/worktree".into(),
                panes: vec![TerminalPaneSnapshot {
                    pane_id: "pane-1".into(),
                    scrollback: "ls -la\n".into(),
                    scrollback_truncated: false,
                    launch_cwd: "/tmp/grove/worktree".into(),
                    last_known_cwd: Some("/tmp/grove/worktree/src".into()),
                    restore_cwd: "/tmp/grove/worktree/src".into(),
                    restore_cwd_source: TerminalRestoreCwdSource::LastKnownCwd,
                }],
            },
        );
        store
    }

    #[test]
    fn load_config_supports_legacy_projects_only_shape() {
        let path = temp_config_path();
        write_fixture(
            &path,
            r#"{
  "projects": [
    {
      "id": "project-1",
      "name": "grove",
      "url": "https://github.com/bang9/grove.git",
      "org": "bang9",
      "repo": "grove",
      "source_path": "/tmp/grove/source"
    }
  ]
}"#,
        );

        let config = load_config_from_path(&path);

        assert_eq!(config.projects.len(), 1);
        assert_eq!(config.projects[0].id, "project-1");
        assert_eq!(config.base_dir, None);
        assert!(config.terminal_theme.is_none());

        let _ = fs::remove_dir_all(path.parent().unwrap());
    }

    #[test]
    fn load_config_supports_legacy_app_only_shape() {
        let path = temp_config_path();
        write_fixture(
            &path,
            r##"{
  "baseDir": "/Users/test/.grove",
  "terminalTheme": {
    "background": "#000000",
    "foreground": "#ffffff",
    "cursor": "#cccccc",
    "black": "#111111",
    "red": "#222222",
    "green": "#333333",
    "yellow": "#444444",
    "blue": "#555555",
    "magenta": "#666666",
    "cyan": "#777777",
    "white": "#888888",
    "brightBlack": "#999999",
    "brightRed": "#aaaaaa",
    "brightGreen": "#bbbbbb",
    "brightYellow": "#cccccc",
    "brightBlue": "#dddddd",
    "brightMagenta": "#eeeeee",
    "brightCyan": "#fafafa",
    "brightWhite": "#fefefe",
    "fontFamily": "Menlo",
    "fontSize": 13.0
  }
}"##,
        );

        let config = load_config_from_path(&path);

        assert!(config.projects.is_empty());
        assert_eq!(config.base_dir.as_deref(), Some("/Users/test/.grove"));
        assert_eq!(
            config
                .terminal_theme
                .as_ref()
                .map(|theme| theme.font_family.as_str()),
            Some("Menlo")
        );

        let _ = fs::remove_dir_all(path.parent().unwrap());
    }

    #[test]
    fn load_app_config_preserves_saved_base_dir() {
        let path = temp_config_path();
        write_fixture(
            &path,
            &serde_json::to_string_pretty(&AppConfig {
                base_dir: "/Users/test/.grove".into(),
                terminal_theme: None,
            })
            .unwrap(),
        );

        let app_config = load_app_config_from_path(&path);

        assert_eq!(app_config.base_dir, "/Users/test/.grove");

        let _ = fs::remove_dir_all(path.parent().unwrap());
    }

    #[test]
    fn load_app_config_falls_back_to_default_base_dir() {
        let path = temp_config_path();
        write_fixture(&path, r#"{"projects":[]}"#);

        let app_config = load_app_config_from_path(&path);

        assert_eq!(app_config.base_dir, default_base_dir());

        let _ = fs::remove_dir_all(path.parent().unwrap());
    }

    #[test]
    fn save_app_config_preserves_existing_projects() {
        let path = temp_config_path();
        write_fixture(
            &path,
            r#"{
  "projects": [
    {
      "id": "project-1",
      "name": "grove",
      "url": "https://github.com/bang9/grove.git",
      "org": "bang9",
      "repo": "grove",
      "source_path": "/tmp/grove/source"
    }
  ]
}"#,
        );

        save_app_config_to_path(
            &path,
            &AppConfig {
                base_dir: "/Users/test/.grove".into(),
                terminal_theme: Some(sample_theme()),
            },
        )
        .unwrap();

        let config = load_config_from_path(&path);

        assert_eq!(config.projects.len(), 1);
        assert_eq!(config.projects[0].id, "project-1");
        assert_eq!(config.base_dir.as_deref(), Some("/Users/test/.grove"));
        assert!(config.terminal_theme.is_some());

        let _ = fs::remove_dir_all(path.parent().unwrap());
    }

    #[test]
    fn save_config_preserves_existing_app_settings() {
        let path = temp_config_path();
        let theme = sample_theme();
        write_fixture(
            &path,
            &serde_json::to_string_pretty(&AppConfig {
                base_dir: "/Users/test/.grove".into(),
                terminal_theme: Some(theme.clone()),
            })
            .unwrap(),
        );

        let mut config = load_config_from_path(&path);
        config.projects.push(sample_project());
        save_config_to_path(&path, &config).unwrap();

        let saved = load_config_from_path(&path);

        assert_eq!(saved.projects.len(), 1);
        assert_eq!(saved.base_dir.as_deref(), Some("/Users/test/.grove"));
        assert_eq!(
            saved
                .terminal_theme
                .as_ref()
                .map(|saved_theme| saved_theme.background.as_str()),
            Some(theme.background.as_str())
        );

        let _ = fs::remove_dir_all(path.parent().unwrap());
    }

    #[test]
    fn load_terminal_session_snapshot_store_defaults_when_missing() {
        let path = temp_snapshot_store_path();

        let store = load_terminal_session_snapshot_store_from_path(&path).unwrap();

        assert_eq!(store.version, 1);
        assert!(store.worktrees.is_empty());
    }

    #[test]
    fn save_terminal_session_snapshot_store_round_trips() {
        let path = temp_snapshot_store_path();
        let store = sample_snapshot_store();

        save_terminal_session_snapshot_store_to_path(&path, &store).unwrap();
        let loaded = load_terminal_session_snapshot_store_from_path(&path).unwrap();

        assert_eq!(loaded.version, 1);
        let snapshot = loaded.worktrees.get("/tmp/grove/worktree").unwrap();
        assert_eq!(snapshot.panes.len(), 1);
        assert_eq!(snapshot.panes[0].pane_id, "pane-1");
        assert_eq!(
            snapshot.panes[0].restore_cwd_source,
            TerminalRestoreCwdSource::LastKnownCwd
        );

        let _ = fs::remove_dir_all(path.parent().unwrap());
    }
}
