use crate::terminal_theme::TerminalTheme;
use serde::{Deserialize, Serialize};
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

// ── Terminal layout persistence ──

#[tauri::command]
pub fn save_terminal_layouts(layouts: String) -> Result<(), String> {
    let path = dirs::home_dir()
        .ok_or("No home dir")?
        .join(".grove")
        .join("terminal-layouts.json");
    fs::create_dir_all(path.parent().unwrap()).map_err(|e| e.to_string())?;
    fs::write(&path, layouts).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn load_terminal_layouts() -> Result<String, String> {
    let path = dirs::home_dir()
        .ok_or("No home dir")?
        .join(".grove")
        .join("terminal-layouts.json");
    if path.exists() {
        fs::read_to_string(&path).map_err(|e| e.to_string())
    } else {
        Ok("{}".to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use uuid::Uuid;

    fn temp_config_path() -> PathBuf {
        std::env::temp_dir()
            .join(format!("grove-config-tests-{}", Uuid::new_v4()))
            .join("config.json")
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
            url: "https://github.com/sendbird/grove.git".into(),
            org: "sendbird".into(),
            repo: "grove".into(),
            source_path: "/tmp/grove/source".into(),
        }
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
      "url": "https://github.com/sendbird/grove.git",
      "org": "sendbird",
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
      "url": "https://github.com/sendbird/grove.git",
      "org": "sendbird",
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
}
