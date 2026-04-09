use crate::config::{grove_data_path, load_json_file_or_default, save_json_file};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct NoteStore {
    #[serde(default)]
    pub notes: HashMap<String, String>,
}

fn notes_path() -> Result<PathBuf, String> {
    grove_data_path("notes.json")
}

pub fn load_notes() -> Result<NoteStore, String> {
    let path = notes_path()?;
    load_json_file_or_default(&path)
}

pub fn save_note(key: &str, content: &str) -> Result<(), String> {
    let path = notes_path()?;
    let mut store: NoteStore = load_json_file_or_default(&path)?;
    let trimmed = content.trim();
    if trimmed.is_empty() {
        store.notes.remove(key);
    } else {
        store.notes.insert(key.to_string(), content.to_string());
    }
    save_json_file(&path, &store)
}

pub fn delete_note(key: &str) -> Result<(), String> {
    let path = notes_path()?;
    let mut store: NoteStore = load_json_file_or_default(&path)?;
    store.notes.remove(key);
    save_json_file(&path, &store)
}
