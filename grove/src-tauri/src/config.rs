use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

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
pub struct GroveConfig {
    pub projects: Vec<ProjectEntry>,
}

fn config_path() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".grove")
        .join("config.json")
}

pub fn load_config() -> GroveConfig {
    let path = config_path();
    if !path.exists() {
        return GroveConfig::default();
    }
    let content = fs::read_to_string(&path).unwrap_or_default();
    serde_json::from_str(&content).unwrap_or_default()
}

pub fn save_config(config: &GroveConfig) -> Result<(), String> {
    let path = config_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create config dir: {e}"))?;
    }
    let content = serde_json::to_string_pretty(config)
        .map_err(|e| format!("Failed to serialize config: {e}"))?;
    fs::write(&path, content).map_err(|e| format!("Failed to write config: {e}"))
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
