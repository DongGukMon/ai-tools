use crate::process_env::preferred_ssh_auth_sock;
use base64::Engine;
use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtySize};
use serde::Serialize;
use std::collections::HashMap;
use std::env;
use std::io::{Read, Write};
use std::sync::{Mutex, OnceLock};
use tauri::Emitter;

#[derive(Serialize, Clone)]
pub struct PtyOutput {
    pub id: String,
    pub data: String,
}

struct PtyInstance {
    writer: Box<dyn Write + Send>,
    master: Box<dyn MasterPty + Send>,
    child: Box<dyn portable_pty::Child + Send + Sync>,
}

fn registry() -> &'static Mutex<HashMap<String, PtyInstance>> {
    static PTY_REGISTRY: OnceLock<Mutex<HashMap<String, PtyInstance>>> = OnceLock::new();
    PTY_REGISTRY.get_or_init(|| Mutex::new(HashMap::new()))
}

fn is_utf8_locale(locale: &str) -> bool {
    let upper = locale.to_ascii_uppercase();
    upper.contains("UTF-8") || upper.contains("UTF8")
}

fn preferred_utf8_locale() -> String {
    for key in ["LC_ALL", "LC_CTYPE", "LANG"] {
        if let Ok(value) = env::var(key) {
            let trimmed = value.trim();
            if !trimmed.is_empty() && is_utf8_locale(trimmed) {
                return trimmed.to_string();
            }
        }
    }

    "C.UTF-8".to_string()
}

pub fn create(
    app_handle: tauri::AppHandle,
    id: String,
    cwd: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| e.to_string())?;

    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string());
    let mut cmd = CommandBuilder::new(&shell);
    cmd.cwd(&cwd);
    cmd.env("TERM", "xterm-256color");
    let locale = preferred_utf8_locale();
    cmd.env("LC_ALL", &locale);
    cmd.env("LANG", &locale);
    cmd.env("LC_CTYPE", &locale);
    if let Some(ssh_auth_sock) = preferred_ssh_auth_sock() {
        cmd.env("SSH_AUTH_SOCK", &ssh_auth_sock);
    }

    let reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;

    let child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;
    drop(pair.slave);

    let reader_id = id.clone();
    std::thread::spawn(move || {
        read_pty_output(reader, app_handle, reader_id);
    });

    let instance = PtyInstance {
        writer,
        master: pair.master,
        child,
    };

    registry()
        .lock()
        .map_err(|e| e.to_string())?
        .insert(id, instance);

    Ok(())
}

fn read_pty_output(mut reader: Box<dyn Read + Send>, app_handle: tauri::AppHandle, id: String) {
    let engine = base64::engine::general_purpose::STANDARD;
    let mut buf = [0u8; 4096];
    loop {
        match reader.read(&mut buf) {
            Ok(0) => break,
            Ok(n) => {
                let data = engine.encode(&buf[..n]);
                let _ = app_handle.emit(
                    "pty-output",
                    PtyOutput {
                        id: id.clone(),
                        data,
                    },
                );
            }
            Err(_) => break,
        }
    }
}

pub fn write(id: &str, data: &[u8]) -> Result<(), String> {
    let mut reg = registry().lock().map_err(|e| e.to_string())?;
    let instance = reg
        .get_mut(id)
        .ok_or_else(|| format!("PTY not found: {}", id))?;
    instance.writer.write_all(data).map_err(|e| e.to_string())
}

pub fn resize(id: &str, cols: u16, rows: u16) -> Result<(), String> {
    let reg = registry().lock().map_err(|e| e.to_string())?;
    let instance = reg
        .get(id)
        .ok_or_else(|| format!("PTY not found: {}", id))?;
    instance
        .master
        .resize(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| e.to_string())
}

pub fn close(id: &str) -> Result<(), String> {
    let mut reg = registry().lock().map_err(|e| e.to_string())?;
    if let Some(mut instance) = reg.remove(id) {
        let _ = instance.child.kill();
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_utf8_locale_variants() {
        assert!(is_utf8_locale("ko_KR.UTF-8"));
        assert!(is_utf8_locale("en_US.UTF8"));
        assert!(!is_utf8_locale("C"));
    }
}
