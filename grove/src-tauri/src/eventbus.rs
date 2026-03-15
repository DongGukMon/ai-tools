use serde::Serialize;
use std::sync::OnceLock;
use tauri::{AppHandle, Emitter};

static APP_HANDLE: OnceLock<AppHandle> = OnceLock::new();

/// Initialize the event bus with the app handle. Call once at setup.
pub fn init(app: &AppHandle) {
    let _ = APP_HANDLE.set(app.clone());
}

/// Emit an event to the frontend. No-op if app handle is not yet initialized.
pub fn emit<T: Serialize + Clone>(event: &str, payload: &T) {
    if let Some(handle) = APP_HANDLE.get() {
        let _ = handle.emit(event, payload.clone());
    }
}
