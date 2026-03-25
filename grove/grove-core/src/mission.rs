use crate::config::{grove_data_path, load_json_file_or_default, save_json_file};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MissionProject {
    pub project_id: String,
    pub branch: String,
    pub path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Mission {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub projects: Vec<MissionProject>,
    /// Absolute path to ~/.grove/missions/{id}. Populated at load time, not persisted.
    #[serde(skip)]
    pub mission_dir: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct MissionStore {
    #[serde(default)]
    pub missions: Vec<Mission>,
}

fn missions_path() -> Result<PathBuf, String> {
    grove_data_path("missions.json")
}

pub(crate) fn missions_dir() -> Result<PathBuf, String> {
    Ok(dirs::home_dir()
        .ok_or("No home dir")?
        .join(".grove")
        .join("missions"))
}

pub fn load_missions() -> MissionStore {
    let path = missions_path().unwrap_or_default();
    let dir = missions_dir().unwrap_or_default();
    let mut store = load_missions_from_path(&path);
    for mission in &mut store.missions {
        mission.mission_dir = dir.join(&mission.id).to_string_lossy().to_string();
    }
    store
}

pub(crate) fn load_missions_from_path(path: &Path) -> MissionStore {
    if !path.exists() {
        return MissionStore::default();
    }
    load_json_file_or_default(path).unwrap_or_default()
}

pub fn save_missions(store: &MissionStore) -> Result<(), String> {
    save_missions_to_path(&missions_path()?, store)
}

pub(crate) fn save_missions_to_path(path: &Path, store: &MissionStore) -> Result<(), String> {
    save_json_file(path, store)
}

#[cfg(test)]
mod tests {
    use super::*;
    use uuid::Uuid;

    fn temp_missions_path() -> PathBuf {
        std::env::temp_dir()
            .join(format!("grove-mission-tests-{}", Uuid::new_v4()))
            .join("missions.json")
    }

    #[test]
    fn load_missions_returns_empty_when_file_missing() {
        let path = temp_missions_path();
        let store = load_missions_from_path(&path);
        assert!(store.missions.is_empty());
    }

    #[test]
    fn save_and_load_missions_round_trips() {
        let path = temp_missions_path();
        let store = MissionStore {
            missions: vec![Mission {
                id: "abcd1234".into(),
                name: "Test Mission".into(),
                projects: vec![MissionProject {
                    project_id: "proj-uuid-1".into(),
                    branch: "mission/abcd1234".into(),
                    path: "/tmp/missions/abcd1234/my-repo".into(),
                }],
                mission_dir: String::new(),
            }],
        };

        save_missions_to_path(&path, &store).unwrap();

        let raw = std::fs::read_to_string(&path).unwrap();
        assert!(raw.contains("\"projectId\""));
        assert!(!raw.contains("missionDir"));

        let loaded = load_missions_from_path(&path);
        assert_eq!(loaded.missions.len(), 1);
        assert_eq!(loaded.missions[0].id, "abcd1234");
        assert_eq!(loaded.missions[0].name, "Test Mission");
        assert_eq!(loaded.missions[0].projects.len(), 1);

        let _ = std::fs::remove_dir_all(path.parent().unwrap());
    }
}
