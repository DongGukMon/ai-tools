use crate::{
    config, process_env::preferred_ssh_auth_sock, SaveTerminalSessionSnapshotRequest,
    TerminalPaneSnapshot, TerminalPaneSnapshotInput, TerminalRestoreCwdSource,
    TerminalSessionSnapshot,
};
use base64::Engine;
use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtySize};
use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::env;
use std::io::{Read, Write};
#[cfg(target_os = "macos")]
use std::process::Command;
use std::sync::{Arc, Mutex, OnceLock};
use tauri::Emitter;

const MAX_SCROLLBACK_BYTES: usize = 256 * 1024;

#[derive(Serialize, Clone)]
pub struct PtyOutput {
    pub id: String,
    pub data: String,
}

#[derive(Clone, Debug)]
struct PtyRuntimeState {
    launch_cwd: String,
    process_id: Option<u32>,
    last_known_cwd: Option<String>,
    scrollback: Vec<u8>,
    scrollback_truncated: bool,
}

impl PtyRuntimeState {
    fn new(launch_cwd: String, process_id: Option<u32>) -> Self {
        Self {
            launch_cwd,
            process_id,
            last_known_cwd: None,
            scrollback: Vec::new(),
            scrollback_truncated: false,
        }
    }

    fn append_scrollback(&mut self, chunk: &[u8]) {
        append_scrollback_capped(
            &mut self.scrollback,
            &mut self.scrollback_truncated,
            chunk,
            MAX_SCROLLBACK_BYTES,
        );
    }
}

#[derive(Clone, Debug)]
struct PtyRuntimeSnapshot {
    launch_cwd: String,
    process_id: Option<u32>,
    last_known_cwd: Option<String>,
    scrollback: Vec<u8>,
    scrollback_truncated: bool,
}

struct PtyInstance {
    writer: Box<dyn Write + Send>,
    master: Box<dyn MasterPty + Send>,
    child: Box<dyn portable_pty::Child + Send + Sync>,
    tracked: Arc<Mutex<PtyRuntimeState>>,
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
    cmd.arg("-l");
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
    let tracked = Arc::new(Mutex::new(PtyRuntimeState::new(
        cwd.clone(),
        child.process_id(),
    )));
    drop(pair.slave);

    let reader_id = id.clone();
    let tracked_for_reader = Arc::clone(&tracked);
    std::thread::spawn(move || {
        read_pty_output(reader, app_handle, reader_id, tracked_for_reader);
    });

    let instance = PtyInstance {
        writer,
        master: pair.master,
        child,
        tracked,
    };

    registry()
        .lock()
        .map_err(|e| e.to_string())?
        .insert(id, instance);

    Ok(())
}

fn read_pty_output(
    mut reader: Box<dyn Read + Send>,
    app_handle: tauri::AppHandle,
    id: String,
    tracked: Arc<Mutex<PtyRuntimeState>>,
) {
    let engine = base64::engine::general_purpose::STANDARD;
    let mut buf = [0u8; 4096];
    loop {
        match reader.read(&mut buf) {
            Ok(0) => break,
            Ok(n) => {
                if let Ok(mut state) = tracked.lock() {
                    state.append_scrollback(&buf[..n]);
                }
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

pub fn save_terminal_session_snapshot(
    request: SaveTerminalSessionSnapshotRequest,
) -> Result<TerminalSessionSnapshot, String> {
    let worktree_path = request.worktree_path.trim();
    if worktree_path.is_empty() {
        return Err("worktreePath is required".to_string());
    }

    let mut seen_pane_ids = HashSet::new();
    let mut panes = Vec::with_capacity(request.panes.len());
    for pane in &request.panes {
        let pane_id = pane.pane_id.trim();
        if pane_id.is_empty() {
            return Err("paneId is required for every terminal snapshot pane".to_string());
        }
        if !seen_pane_ids.insert(pane_id.to_string()) {
            return Err(format!(
                "Duplicate paneId in terminal snapshot request: {pane_id}"
            ));
        }
        panes.push(build_pane_snapshot(pane)?);
    }

    let snapshot = TerminalSessionSnapshot {
        worktree_path: worktree_path.to_string(),
        panes,
    };

    let mut store = config::load_terminal_session_snapshot_store()?;
    store
        .worktrees
        .insert(worktree_path.to_string(), snapshot.clone());
    config::save_terminal_session_snapshot_store(&store)?;

    Ok(snapshot)
}

pub fn load_terminal_session_snapshot(
    worktree_path: &str,
) -> Result<Option<TerminalSessionSnapshot>, String> {
    let store = config::load_terminal_session_snapshot_store()?;
    Ok(store.worktrees.get(worktree_path).cloned())
}

fn build_pane_snapshot(input: &TerminalPaneSnapshotInput) -> Result<TerminalPaneSnapshot, String> {
    let runtime_state = input
        .pty_id
        .as_deref()
        .filter(|pty_id| !pty_id.trim().is_empty())
        .map(runtime_snapshot_for_pty)
        .transpose()?
        .flatten();

    let launch_cwd = match runtime_state.as_ref() {
        Some(runtime_state) => runtime_state.launch_cwd.clone(),
        None => input
            .launch_cwd
            .as_deref()
            .map(str::trim)
            .filter(|cwd| !cwd.is_empty())
            .map(str::to_string)
            .ok_or_else(|| {
                format!(
                    "launchCwd is required when pane {} has no live ptyId",
                    input.pane_id
                )
            })?,
    };

    let last_known_cwd = runtime_state
        .as_ref()
        .and_then(|state| resolve_process_cwd(state.process_id))
        .or_else(|| {
            runtime_state
                .as_ref()
                .and_then(|state| state.last_known_cwd.clone())
        });

    if let (Some(pty_id), Some(cwd)) = (input.pty_id.as_deref(), last_known_cwd.as_deref()) {
        cache_last_known_cwd(pty_id, cwd)?;
    }

    let scrollback = runtime_state
        .as_ref()
        .map(|state| String::from_utf8_lossy(&state.scrollback).into_owned())
        .unwrap_or_default();
    let scrollback_truncated = runtime_state
        .as_ref()
        .map(|state| state.scrollback_truncated)
        .unwrap_or(false);

    let (restore_cwd, restore_cwd_source) = match last_known_cwd.clone() {
        Some(cwd) => (cwd, TerminalRestoreCwdSource::LastKnownCwd),
        None => (launch_cwd.clone(), TerminalRestoreCwdSource::LaunchCwd),
    };

    Ok(TerminalPaneSnapshot {
        pane_id: input.pane_id.trim().to_string(),
        scrollback,
        scrollback_truncated,
        launch_cwd,
        last_known_cwd,
        restore_cwd,
        restore_cwd_source,
    })
}

fn runtime_snapshot_for_pty(pty_id: &str) -> Result<Option<PtyRuntimeSnapshot>, String> {
    let tracked = {
        let reg = registry().lock().map_err(|e| e.to_string())?;
        reg.get(pty_id)
            .map(|instance| Arc::clone(&instance.tracked))
    };

    let Some(tracked) = tracked else {
        return Ok(None);
    };

    let state = tracked.lock().map_err(|e| e.to_string())?;
    Ok(Some(PtyRuntimeSnapshot {
        launch_cwd: state.launch_cwd.clone(),
        process_id: state.process_id,
        last_known_cwd: state.last_known_cwd.clone(),
        scrollback: state.scrollback.clone(),
        scrollback_truncated: state.scrollback_truncated,
    }))
}

fn cache_last_known_cwd(pty_id: &str, cwd: &str) -> Result<(), String> {
    let tracked = {
        let reg = registry().lock().map_err(|e| e.to_string())?;
        reg.get(pty_id)
            .map(|instance| Arc::clone(&instance.tracked))
    };

    let Some(tracked) = tracked else {
        return Ok(());
    };

    let mut state = tracked.lock().map_err(|e| e.to_string())?;
    state.last_known_cwd = Some(cwd.to_string());
    Ok(())
}

fn append_scrollback_capped(
    scrollback: &mut Vec<u8>,
    scrollback_truncated: &mut bool,
    chunk: &[u8],
    limit: usize,
) {
    if limit == 0 || chunk.is_empty() {
        return;
    }

    scrollback.extend_from_slice(chunk);
    if scrollback.len() > limit {
        let overflow = scrollback.len() - limit;
        scrollback.drain(..overflow);
        *scrollback_truncated = true;
    }
}

fn resolve_process_cwd(process_id: Option<u32>) -> Option<String> {
    let process_id = process_id?;

    #[cfg(target_os = "linux")]
    {
        std::fs::read_link(format!("/proc/{process_id}/cwd"))
            .ok()
            .map(|path| path.to_string_lossy().into_owned())
    }

    #[cfg(target_os = "macos")]
    {
        let output = Command::new("lsof")
            .args(["-a", "-d", "cwd", "-Fn", "-p", &process_id.to_string()])
            .output()
            .ok()?;
        if !output.status.success() {
            return None;
        }

        String::from_utf8(output.stdout)
            .ok()?
            .lines()
            .find_map(|line| line.strip_prefix('n').map(str::to_string))
            .filter(|cwd| !cwd.trim().is_empty())
    }

    #[cfg(not(any(target_os = "linux", target_os = "macos")))]
    {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::TerminalPaneSnapshotInput;

    #[test]
    fn detects_utf8_locale_variants() {
        assert!(is_utf8_locale("ko_KR.UTF-8"));
        assert!(is_utf8_locale("en_US.UTF8"));
        assert!(!is_utf8_locale("C"));
    }

    #[test]
    fn scrollback_cap_discards_oldest_bytes() {
        let mut scrollback = b"abc".to_vec();
        let mut truncated = false;

        append_scrollback_capped(&mut scrollback, &mut truncated, b"def", 4);

        assert_eq!(scrollback, b"cdef");
        assert!(truncated);
    }

    #[test]
    fn pane_snapshot_falls_back_to_launch_cwd_without_live_pty() {
        let snapshot = build_pane_snapshot(&TerminalPaneSnapshotInput {
            pane_id: "pane-1".into(),
            pty_id: None,
            launch_cwd: Some("/tmp/grove/worktree".into()),
        })
        .unwrap();

        assert_eq!(snapshot.pane_id, "pane-1");
        assert_eq!(snapshot.launch_cwd, "/tmp/grove/worktree");
        assert_eq!(snapshot.restore_cwd, "/tmp/grove/worktree");
        assert_eq!(
            snapshot.restore_cwd_source,
            TerminalRestoreCwdSource::LaunchCwd
        );
        assert!(snapshot.last_known_cwd.is_none());
        assert!(snapshot.scrollback.is_empty());
        assert!(!snapshot.scrollback_truncated);
    }
}
