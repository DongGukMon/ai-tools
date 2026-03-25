use crate::config::{grove_data_path, load_json_file_or_default, save_json_file};
use rand::Rng;
use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::{Path, PathBuf},
};

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

fn generate_mission_id() -> String {
    let mut rng = rand::rng();
    format!("{:08x}", rng.random::<u32>())
}

pub fn create_mission(name: &str) -> Result<Mission, String> {
    let path = missions_path()?;
    let dir = missions_dir()?;
    create_mission_with_paths(&path, &dir, name)
}

fn create_mission_with_paths(
    store_path: &Path,
    missions_dir: &Path,
    name: &str,
) -> Result<Mission, String> {
    let mut store = load_missions_from_path(store_path);

    let id = loop {
        let candidate = generate_mission_id();
        let already_exists = store.missions.iter().any(|mission| mission.id == candidate)
            || missions_dir.join(&candidate).exists();

        if !already_exists {
            break candidate;
        }
    };

    let mission_dir = missions_dir.join(&id);
    fs::create_dir_all(&mission_dir)
        .map_err(|e| format!("Failed to create mission directory: {e}"))?;

    let mission = Mission {
        id,
        name: name.to_string(),
        projects: vec![],
        mission_dir: mission_dir.to_string_lossy().to_string(),
    };

    store.missions.push(mission.clone());
    save_missions_to_path(store_path, &store)?;
    Ok(mission)
}

pub fn delete_mission(id: &str) -> Result<(), String> {
    let path = missions_path()?;
    let dir = missions_dir()?;
    delete_mission_with_paths(&path, &dir, id)
}

fn delete_mission_with_paths(
    store_path: &Path,
    missions_dir: &Path,
    id: &str,
) -> Result<(), String> {
    let mut store = load_missions_from_path(store_path);
    let mission = store
        .missions
        .iter()
        .find(|mission| mission.id == id)
        .cloned()
        .ok_or_else(|| format!("Mission not found: {id}"))?;

    for project in &mission.projects {
        crate::worktree_lifecycle::default_worktree_lifecycle().cleanup(&project.path);

        let worktree_dir = Path::new(&project.path);
        if worktree_dir.exists() {
            let _ = fs::remove_dir_all(worktree_dir);
        }
    }

    let mission_dir = missions_dir.join(id);
    if mission_dir.exists() {
        fs::remove_dir_all(&mission_dir)
            .map_err(|e| format!("Failed to remove mission directory: {e}"))?;
    }

    store.missions.retain(|mission| mission.id != id);
    save_missions_to_path(store_path, &store)
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

    #[test]
    fn create_mission_generates_id_and_creates_directory() {
        let path = temp_missions_path();
        let missions_dir = path.parent().unwrap().join("missions");

        let mission =
            create_mission_with_paths(&path, &missions_dir, "SDK v5 마이그레이션").unwrap();

        assert_eq!(mission.name, "SDK v5 마이그레이션");
        assert_eq!(mission.id.len(), 8);
        assert!(mission.id.chars().all(|ch| ch.is_ascii_hexdigit()));
        assert!(mission.projects.is_empty());
        assert!(missions_dir.join(&mission.id).exists());

        let store = load_missions_from_path(&path);
        assert_eq!(store.missions.len(), 1);
        assert_eq!(store.missions[0].id, mission.id);

        let _ = std::fs::remove_dir_all(path.parent().unwrap());
    }

    #[test]
    fn delete_mission_removes_directory_and_entry() {
        let path = temp_missions_path();
        let missions_dir = path.parent().unwrap().join("missions");

        let mission = create_mission_with_paths(&path, &missions_dir, "To Delete").unwrap();
        assert!(missions_dir.join(&mission.id).exists());

        delete_mission_with_paths(&path, &missions_dir, &mission.id).unwrap();

        assert!(!missions_dir.join(&mission.id).exists());

        let store = load_missions_from_path(&path);
        assert!(store.missions.is_empty());

        let _ = std::fs::remove_dir_all(path.parent().unwrap());
    }
}
