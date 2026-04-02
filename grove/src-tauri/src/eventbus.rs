use base64::Engine;
use serde::Serialize;
use std::sync::Arc;
use tauri::{AppHandle, Emitter};

#[derive(Serialize, Clone)]
struct PtyOutputPayload {
    id: String,
    data: String,
}

pub struct TauriEventSink(pub AppHandle);

impl grove_core::PtyEventSink for TauriEventSink {
    fn on_output(&self, pty_id: &str, data: &[u8]) {
        let payload = PtyOutputPayload {
            id: pty_id.to_string(),
            data: base64::engine::general_purpose::STANDARD.encode(data),
        };
        let _ = self.0.emit("pty-output", payload);
    }
}

#[derive(Serialize, Clone)]
struct LogPayload {
    level: String,
    tag: String,
    message: String,
}

pub struct TauriLogSink(pub AppHandle);

impl grove_core::LogEventSink for TauriLogSink {
    fn on_log(&self, level: &str, tag: &str, message: &str) {
        let payload = LogPayload {
            level: level.to_string(),
            tag: tag.to_string(),
            message: message.to_string(),
        };
        let _ = self.0.emit("grove:log", payload);
    }
}

pub struct TauriUrlOpenSink(pub AppHandle);

impl grove_core::UrlOpenSink for TauriUrlOpenSink {
    fn on_url(&self, url: &str) {
        let _ = self.0.emit("grove:open-url", url.to_string());
    }
}

pub fn init(app: &AppHandle) {
    grove_core::logger::set_log_sink(Arc::new(TauriLogSink(app.clone())));
    grove_core::url_open::start(Arc::new(TauriUrlOpenSink(app.clone())));
}

pub fn pty_sink(app: AppHandle) -> Arc<dyn grove_core::PtyEventSink> {
    Arc::new(TauriEventSink(app))
}
