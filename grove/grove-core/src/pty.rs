use crate::{
    config,
    process_env::{enriched_path, preferred_ssh_auth_sock},
    worktree_lifecycle::WorktreeResource,
    CreatePtyInitialHydration, CreatePtyInitialHydrationSource, CreatePtyRequest, CreatePtyRestore,
    CreatePtyResult, CreatePtySessionState, PtyBellEvent, SaveTerminalSessionSnapshotRequest,
    TerminalPaneSnapshot, TerminalPaneSnapshotInput, TerminalRestoreCwdSource,
    TerminalSessionSnapshot,
};
use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtySize};
use sha2::{Digest, Sha256};
use std::collections::{HashMap, HashSet};
use std::env;
use std::fmt::Write as _;
use std::io::{Read, Write};
use std::process::{Command, Output};
use std::sync::{Arc, Mutex, OnceLock};

const MAX_SCROLLBACK_BYTES: usize = 256 * 1024;
const TMUX_NOT_FOUND_ERROR: &str = "tmux is required but was not found in PATH";
const TMUX_GROVE_MANAGED_OPTION: &str = "@grove_managed";
const TMUX_GROVE_WORKTREE_OPTION: &str = "@grove_worktree";
const TMUX_GROVE_PANE_ID_OPTION: &str = "@grove_pane_id";
const TMUX_STATUS_OPTION: &str = "status";
const TMUX_STATUS_OFF_VALUE: &str = "off";
const TMUX_MOUSE_OPTION: &str = "mouse";
const TMUX_MOUSE_ON_VALUE: &str = "on";
const TMUX_MONITOR_BELL_OPTION: &str = "monitor-bell";
const TMUX_MONITOR_BELL_ON_VALUE: &str = "on";
const TMUX_ESCAPE_TIME_OPTION: &str = "escape-time";
const TMUX_ESCAPE_TIME_VALUE: &str = "100";
const WORKTREE_HASH_LEN: usize = 12;
const PANE_PREFIX_LEN: usize = 8;
const PANE_HASH_LEN: usize = 4;

pub trait PtyEventSink: Send + Sync + 'static {
    fn on_output(&self, pty_id: &str, data: &[u8]);
}

#[derive(Clone, Debug)]
struct PtyRuntimeState {
    launch_cwd: String,
    process_id: Option<u32>,
    session_name: String,
    last_known_cwd: Option<String>,
    scrollback: Vec<u8>,
    scrollback_truncated: bool,
    last_bell_flag: bool,
}

impl PtyRuntimeState {
    fn new(
        launch_cwd: String,
        process_id: Option<u32>,
        session_name: String,
        restore: Option<&CreatePtyRestore>,
        initial_hydration: Option<&TmuxCapturedContent>,
    ) -> Self {
        let mut state = Self {
            launch_cwd,
            process_id,
            session_name,
            last_known_cwd: None,
            scrollback: Vec::new(),
            scrollback_truncated: false,
            last_bell_flag: false,
        };

        if let Some(restore) = restore {
            state.last_known_cwd = restore
                .last_known_cwd
                .as_deref()
                .map(str::trim)
                .filter(|cwd| !cwd.is_empty())
                .map(str::to_string);
            state.scrollback_truncated = restore.scrollback_truncated.unwrap_or(false);
            if let Some(scrollback) = restore.scrollback.as_deref() {
                state.append_scrollback(scrollback.as_bytes());
            }
        }

        if let Some(initial_hydration) = initial_hydration {
            state.scrollback_truncated = initial_hydration.truncated;
            state.append_scrollback(&initial_hydration.bytes);
        }

        state
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
    session_name: String,
    last_known_cwd: Option<String>,
    scrollback: Vec<u8>,
    scrollback_truncated: bool,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum TmuxCaptureScope {
    History,
    AlternateScreen,
    ModeScreen,
}

#[derive(Clone, Debug, PartialEq, Eq)]
struct TmuxCapturedContent {
    bytes: Vec<u8>,
    truncated: bool,
}

struct PtyInstance {
    session_name: String,
    worktree_path: String,
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
    request: CreatePtyRequest,
    sink: Arc<dyn PtyEventSink>,
) -> Result<CreatePtyResult, String> {
    let CreatePtyRequest {
        pty_id,
        pane_id,
        worktree_path,
        cwd,
        cols,
        rows,
        restore,
    } = request;

    let pty_id = required_arg("ptyId", &pty_id)?;
    let pane_id = required_arg("paneId", &pane_id)?;
    let worktree_path = required_arg("worktreePath", &worktree_path)?;
    let cwd = required_arg("cwd", &cwd)?;

    {
        let reg = registry().lock().map_err(|e| e.to_string())?;
        if reg.contains_key(pty_id.as_str()) {
            return Err(format!("PTY already exists: {pty_id}"));
        }
    }

    let session_name = grove_tmux_session_name(&worktree_path, &pane_id);
    let session_state = ensure_grove_tmux_session(&session_name, &worktree_path, &pane_id, &cwd)?;
    let initial_hydration_capture = match session_state {
        CreatePtySessionState::Attached => Some(capture_tmux_content_with_fallback(
            &session_name,
            tmux_capture_scope(
                tmux_pane_in_mode(&session_name)?,
                tmux_pane_alternate_on(&session_name)?,
            ),
        )?),
        CreatePtySessionState::Created => None,
    };
    let initial_hydration = initial_hydration_capture
        .as_ref()
        .map(create_tmux_initial_hydration);

    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| e.to_string())?;

    let mut cmd = CommandBuilder::new("tmux");
    cmd.arg("attach-session");
    cmd.arg("-t");
    cmd.arg(&session_name);
    cmd.cwd(&worktree_path);
    apply_portable_terminal_env(&mut cmd);

    let reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;

    let child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;
    let restore_seed = runtime_restore_seed(session_state, restore.as_ref());
    let tracked = Arc::new(Mutex::new(PtyRuntimeState::new(
        cwd.clone(),
        child.process_id(),
        session_name.clone(),
        restore_seed,
        initial_hydration_capture.as_ref(),
    )));
    drop(pair.slave);

    let reader_id = pty_id.clone();
    let tracked_for_reader = Arc::clone(&tracked);
    std::thread::spawn(move || {
        read_pty_output(reader, sink, reader_id, tracked_for_reader);
    });

    let instance = PtyInstance {
        session_name,
        worktree_path,
        writer,
        master: pair.master,
        child,
        tracked,
    };

    registry()
        .lock()
        .map_err(|e| e.to_string())?
        .insert(pty_id, instance);

    Ok(CreatePtyResult {
        session_state,
        initial_hydration,
    })
}

fn read_pty_output(
    mut reader: Box<dyn Read + Send>,
    sink: Arc<dyn PtyEventSink>,
    id: String,
    tracked: Arc<Mutex<PtyRuntimeState>>,
) {
    let mut buf = [0u8; 4096];
    loop {
        match reader.read(&mut buf) {
            Ok(0) => break,
            Ok(n) => {
                if let Ok(mut state) = tracked.lock() {
                    state.append_scrollback(&buf[..n]);
                }
                sink.on_output(&id, &buf[..n]);
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

pub fn clear_scrollback(id: &str) -> Result<(), String> {
    let (session_name, tracked) = {
        let reg = registry().lock().map_err(|e| e.to_string())?;
        let instance = reg
            .get(id)
            .ok_or_else(|| format!("PTY not found: {}", id))?;
        (instance.session_name.clone(), Arc::clone(&instance.tracked))
    };

    clear_tmux_history(&session_name)?;

    let mut state = tracked.lock().map_err(|e| e.to_string())?;
    state.scrollback.clear();
    state.scrollback_truncated = false;

    Ok(())
}

pub fn close(id: &str) -> Result<(), String> {
    let session_name = {
        let reg = registry().lock().map_err(|e| e.to_string())?;
        reg.get(id)
            .map(|instance| instance.session_name.clone())
            .ok_or_else(|| format!("PTY not found: {}", id))?
    };

    kill_tmux_session_if_exists(&session_name)?;

    let mut reg = registry().lock().map_err(|e| e.to_string())?;
    if let Some(mut instance) = reg.remove(id) {
        let _ = instance.child.kill();
    }

    Ok(())
}

pub fn close_ptys_for_worktree(worktree_path: &str) -> Result<(), String> {
    let matching_ids: Vec<String> = {
        let reg = registry().lock().map_err(|e| e.to_string())?;
        reg.iter()
            .filter(|(_, instance)| instance.worktree_path == worktree_path)
            .map(|(id, _)| id.clone())
            .collect()
    };

    for id in &matching_ids {
        if let Err(e) = close(id) {
            eprintln!("Warning: failed to close PTY {id} for worktree {worktree_path}: {e}");
        }
    }

    close_orphaned_tmux_sessions_for_worktree(worktree_path)?;

    Ok(())
}

pub fn poll_bell_events() -> Result<Vec<PtyBellEvent>, String> {
    let tracked_sessions = {
        let reg = registry().lock().map_err(|e| e.to_string())?;
        reg.iter()
            .map(|(pty_id, instance)| {
                (
                    pty_id.clone(),
                    instance.session_name.clone(),
                    Arc::clone(&instance.tracked),
                )
            })
            .collect::<Vec<_>>()
    };

    let mut events = Vec::new();

    for (pty_id, session_name, tracked) in tracked_sessions {
        let bell_flag = match tmux_window_bell_flag(&session_name) {
            Ok(value) => value,
            Err(error) if error == TMUX_NOT_FOUND_ERROR || tmux_session_missing(&error) => false,
            Err(error) => {
                return Err(format!(
                    "failed to poll tmux bell state for {session_name}: {error}"
                ));
            }
        };

        let mut state = tracked.lock().map_err(|e| e.to_string())?;
        if consume_bell_edge(&mut state.last_bell_flag, bell_flag) {
            events.push(PtyBellEvent { pty_id });
        }
    }

    Ok(events)
}

pub struct PtySessionResource;

impl WorktreeResource for PtySessionResource {
    fn name(&self) -> &str {
        "PTY sessions"
    }

    fn on_remove(&self, worktree_path: &str) -> Result<(), String> {
        close_ptys_for_worktree(worktree_path)
    }
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
        .and_then(resolve_live_cwd)
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
        session_name: state.session_name.clone(),
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

fn runtime_restore_seed<'a>(
    session_state: CreatePtySessionState,
    restore: Option<&'a CreatePtyRestore>,
) -> Option<&'a CreatePtyRestore> {
    match session_state {
        CreatePtySessionState::Created => restore,
        CreatePtySessionState::Attached => None,
    }
}

fn create_tmux_initial_hydration(capture: &TmuxCapturedContent) -> CreatePtyInitialHydration {
    CreatePtyInitialHydration {
        text: String::from_utf8_lossy(&capture.bytes).into_owned(),
        truncated: capture.truncated,
        source: CreatePtyInitialHydrationSource::TmuxCapture,
    }
}

fn tmux_capture_scope(pane_in_mode: bool, alternate_on: bool) -> TmuxCaptureScope {
    if pane_in_mode {
        TmuxCaptureScope::ModeScreen
    } else if alternate_on {
        TmuxCaptureScope::AlternateScreen
    } else {
        TmuxCaptureScope::History
    }
}

fn capture_tmux_content_with_fallback(
    session_name: &str,
    preferred_scope: TmuxCaptureScope,
) -> Result<TmuxCapturedContent, String> {
    match preferred_scope {
        TmuxCaptureScope::History => capture_tmux_content(session_name, TmuxCaptureScope::History),
        TmuxCaptureScope::AlternateScreen | TmuxCaptureScope::ModeScreen => {
            capture_tmux_content(session_name, preferred_scope)
                .or_else(|_| capture_tmux_content(session_name, TmuxCaptureScope::History))
        }
    }
}

fn capture_tmux_content(
    session_name: &str,
    scope: TmuxCaptureScope,
) -> Result<TmuxCapturedContent, String> {
    let output = match scope {
        TmuxCaptureScope::History => tmux_output([
            "capture-pane",
            "-e",
            "-p",
            "-J",
            "-S",
            "-",
            "-t",
            session_name,
        ])?,
        TmuxCaptureScope::AlternateScreen => {
            tmux_output(["capture-pane", "-a", "-e", "-p", "-J", "-t", session_name])?
        }
        TmuxCaptureScope::ModeScreen => {
            tmux_output(["capture-pane", "-M", "-e", "-p", "-J", "-t", session_name])?
        }
    };
    if !output.status.success() {
        return Err(format!(
            "failed to capture tmux pane for {session_name}: {}",
            tmux_output_message(&output)
        ));
    }

    let mut bytes = Vec::new();
    let mut truncated = false;
    append_scrollback_capped(
        &mut bytes,
        &mut truncated,
        output.stdout.as_slice(),
        MAX_SCROLLBACK_BYTES,
    );

    Ok(TmuxCapturedContent { bytes, truncated })
}

fn required_arg(name: &str, value: &str) -> Result<String, String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err(format!("{name} is required"));
    }

    Ok(trimmed.to_string())
}

fn apply_portable_terminal_env(cmd: &mut CommandBuilder) {
    cmd.env("PATH", enriched_path());
    cmd.env("TERM", "xterm-256color");
    let locale = preferred_utf8_locale();
    cmd.env("LC_ALL", &locale);
    cmd.env("LANG", &locale);
    cmd.env("LC_CTYPE", &locale);
    if let Some(ssh_auth_sock) = preferred_ssh_auth_sock() {
        cmd.env("SSH_AUTH_SOCK", ssh_auth_sock);
    }
}

fn apply_tmux_command_env(cmd: &mut Command) {
    cmd.env("PATH", enriched_path());
    let locale = preferred_utf8_locale();
    cmd.env("LC_ALL", &locale);
    cmd.env("LANG", &locale);
    cmd.env("LC_CTYPE", &locale);
    if let Some(ssh_auth_sock) = preferred_ssh_auth_sock() {
        cmd.env("SSH_AUTH_SOCK", ssh_auth_sock);
    }
}

fn grove_tmux_session_name(worktree_path: &str, pane_id: &str) -> String {
    format!(
        "grove-{}-{}",
        short_hash(worktree_path, WORKTREE_HASH_LEN),
        pane_short_id(pane_id)
    )
}

fn pane_short_id(pane_id: &str) -> String {
    let prefix: String = pane_id
        .chars()
        .filter(|ch| ch.is_ascii_alphanumeric())
        .map(|ch| ch.to_ascii_lowercase())
        .take(PANE_PREFIX_LEN)
        .collect();
    let hash = short_hash(pane_id, PANE_HASH_LEN);

    if prefix.is_empty() {
        hash
    } else {
        format!("{prefix}{hash}")
    }
}

fn short_hash(input: &str, len: usize) -> String {
    let digest = Sha256::digest(input.as_bytes());
    let mut hex = String::with_capacity(digest.len() * 2);
    for byte in digest {
        let _ = write!(&mut hex, "{byte:02x}");
    }
    hex.truncate(len);
    hex
}

fn ensure_grove_tmux_session(
    session_name: &str,
    worktree_path: &str,
    pane_id: &str,
    cwd: &str,
) -> Result<CreatePtySessionState, String> {
    if tmux_session_exists(session_name)? {
        verify_grove_tmux_session(session_name, worktree_path, pane_id)?;
        return Ok(CreatePtySessionState::Attached);
    }

    let created_session = create_tmux_session(session_name, cwd)?;
    if created_session {
        if let Err(error) = set_grove_tmux_metadata(session_name, worktree_path, pane_id) {
            let _ = kill_tmux_session_if_exists(session_name);
            return Err(error);
        }

        verify_grove_tmux_session(session_name, worktree_path, pane_id)?;
        return Ok(CreatePtySessionState::Created);
    }

    verify_grove_tmux_session(session_name, worktree_path, pane_id)?;
    Ok(CreatePtySessionState::Attached)
}

fn create_tmux_session(session_name: &str, cwd: &str) -> Result<bool, String> {
    let mut command = Command::new("tmux");
    command.args(["new-session", "-d", "-s", session_name, "-c", cwd]);
    apply_tmux_command_env(&mut command);
    let output = command.output().map_err(tmux_command_error)?;
    if output.status.success() {
        return Ok(true);
    }

    let message = tmux_output_message(&output);
    if message.contains("duplicate session") {
        return Ok(false);
    }

    Err(format!(
        "failed to create tmux session {session_name}: {message}"
    ))
}

fn set_grove_tmux_metadata(
    session_name: &str,
    worktree_path: &str,
    pane_id: &str,
) -> Result<(), String> {
    tmux_set_option(session_name, TMUX_GROVE_MANAGED_OPTION, "1")?;
    tmux_set_option(session_name, TMUX_GROVE_WORKTREE_OPTION, worktree_path)?;
    tmux_set_option(session_name, TMUX_GROVE_PANE_ID_OPTION, pane_id)?;
    enforce_grove_tmux_options(session_name)?;
    Ok(())
}

/// Options that must be applied on every session open — both new and existing.
/// Adding a new enforced option here guarantees it takes effect on the next
/// attach even for sessions created before the option existed.
fn enforce_grove_tmux_options(session_name: &str) -> Result<(), String> {
    tmux_set_option(session_name, TMUX_STATUS_OPTION, TMUX_STATUS_OFF_VALUE)?;
    tmux_set_option(session_name, TMUX_MOUSE_OPTION, TMUX_MOUSE_ON_VALUE)?;
    tmux_set_window_option(
        session_name,
        TMUX_MONITOR_BELL_OPTION,
        TMUX_MONITOR_BELL_ON_VALUE,
    )?;
    tmux_set_server_option(TMUX_ESCAPE_TIME_OPTION, TMUX_ESCAPE_TIME_VALUE)?;
    Ok(())
}

fn verify_grove_tmux_session(
    session_name: &str,
    worktree_path: &str,
    pane_id: &str,
) -> Result<(), String> {
    let managed = tmux_session_option(session_name, TMUX_GROVE_MANAGED_OPTION)?;
    if managed.as_deref() != Some("1") {
        return Err(format!(
            "tmux session {session_name} exists but is not a matching Grove-managed session"
        ));
    }

    let actual_worktree = tmux_session_option(session_name, TMUX_GROVE_WORKTREE_OPTION)?;
    if actual_worktree.as_deref() != Some(worktree_path) {
        return Err(format!(
            "tmux session {session_name} exists but belongs to a different worktree"
        ));
    }

    let actual_pane_id = tmux_session_option(session_name, TMUX_GROVE_PANE_ID_OPTION)?;
    if actual_pane_id.as_deref() != Some(pane_id) {
        return Err(format!(
            "tmux session {session_name} exists but belongs to a different pane"
        ));
    }

    enforce_grove_tmux_options(session_name)?;

    Ok(())
}

fn tmux_session_exists(session_name: &str) -> Result<bool, String> {
    let output = tmux_output(["has-session", "-t", session_name])?;
    match output.status.code() {
        Some(0) => Ok(true),
        Some(1) => Ok(false),
        _ => Err(format!(
            "failed to query tmux session {session_name}: {}",
            tmux_output_message(&output)
        )),
    }
}

fn tmux_set_server_option(option: &str, value: &str) -> Result<(), String> {
    let output = tmux_output(["set-option", "-sg", option, value])?;
    if output.status.success() {
        return Ok(());
    }

    Err(format!(
        "failed to set tmux server option {option}: {}",
        tmux_output_message(&output)
    ))
}

fn clear_tmux_history(target: &str) -> Result<(), String> {
    let output = tmux_output(["clear-history", "-t", target])?;
    if output.status.success() {
        return Ok(());
    }

    Err(format!(
        "failed to clear tmux history for {target}: {}",
        tmux_output_message(&output)
    ))
}

fn tmux_set_option(session_name: &str, option: &str, value: &str) -> Result<(), String> {
    let output = tmux_output(["set-option", "-q", "-t", session_name, option, value])?;
    if output.status.success() {
        return Ok(());
    }

    Err(format!(
        "failed to set tmux option {option} on {session_name}: {}",
        tmux_output_message(&output)
    ))
}

fn tmux_set_window_option(session_name: &str, option: &str, value: &str) -> Result<(), String> {
    let output = tmux_output(["set-window-option", "-q", "-t", session_name, option, value])?;
    if output.status.success() {
        return Ok(());
    }

    Err(format!(
        "failed to set tmux window option {option} on {session_name}: {}",
        tmux_output_message(&output)
    ))
}

fn tmux_session_option(session_name: &str, option: &str) -> Result<Option<String>, String> {
    let output = tmux_output(["show-options", "-qv", "-t", session_name, option])?;
    if output.status.success() {
        let value = String::from_utf8_lossy(&output.stdout).trim().to_string();
        return if value.is_empty() {
            Ok(None)
        } else {
            Ok(Some(value))
        };
    }

    let message = tmux_output_message(&output);
    if output.status.code() == Some(1)
        && (message.contains("invalid option")
            || message.contains("unknown option")
            || message.contains("no option")
            || message.is_empty())
    {
        return Ok(None);
    }

    Err(format!(
        "failed to query tmux option {option} on {session_name}: {message}"
    ))
}

fn kill_tmux_session_if_exists(session_name: &str) -> Result<(), String> {
    let output = tmux_output(["kill-session", "-t", session_name])?;
    if output.status.success() {
        return Ok(());
    }

    let message = tmux_output_message(&output);
    if output.status.code() == Some(1)
        && (message.contains("can't find session") || message.contains("no server running"))
    {
        return Ok(());
    }

    Err(format!(
        "failed to kill tmux session {session_name}: {message}"
    ))
}

fn close_orphaned_tmux_sessions_for_worktree(worktree_path: &str) -> Result<(), String> {
    for session_name in list_grove_tmux_sessions()? {
        let managed = match tmux_session_option(&session_name, TMUX_GROVE_MANAGED_OPTION) {
            Ok(value) => value,
            Err(error) if tmux_session_missing(&error) => continue,
            Err(error) => {
                eprintln!(
                    "Warning: failed to inspect tmux session {session_name} for worktree {worktree_path}: {error}"
                );
                continue;
            }
        };
        if managed.as_deref() != Some("1") {
            continue;
        }

        let session_worktree = match tmux_session_option(&session_name, TMUX_GROVE_WORKTREE_OPTION)
        {
            Ok(value) => value,
            Err(error) if tmux_session_missing(&error) => continue,
            Err(error) => {
                eprintln!(
                    "Warning: failed to inspect tmux session {session_name} for worktree {worktree_path}: {error}"
                );
                continue;
            }
        };
        if session_worktree.as_deref() != Some(worktree_path) {
            continue;
        }

        if let Err(error) = kill_tmux_session_if_exists(&session_name) {
            eprintln!(
                "Warning: failed to close orphaned tmux session {session_name} for worktree {worktree_path}: {error}"
            );
        }
    }

    Ok(())
}

fn list_grove_tmux_sessions() -> Result<Vec<String>, String> {
    let output = match tmux_output(["list-sessions", "-F", "#{session_name}"]) {
        Ok(output) => output,
        Err(error) if error == TMUX_NOT_FOUND_ERROR => return Ok(Vec::new()),
        Err(error) => return Err(error),
    };
    if !output.status.success() {
        let message = tmux_output_message(&output);
        if message.contains("no server running") {
            return Ok(Vec::new());
        }

        return Err(format!("failed to list tmux sessions: {message}"));
    }

    Ok(String::from_utf8_lossy(&output.stdout)
        .lines()
        .map(str::trim)
        .filter(|session_name| !session_name.is_empty() && session_name.starts_with("grove-"))
        .map(str::to_string)
        .collect())
}

fn tmux_session_missing(error: &str) -> bool {
    error.contains("can't find session") || error.contains("no server running")
}

fn tmux_output<const N: usize>(args: [&str; N]) -> Result<Output, String> {
    Command::new("tmux")
        .args(args)
        .env("PATH", enriched_path())
        .output()
        .map_err(tmux_command_error)
}

fn tmux_command_error(error: std::io::Error) -> String {
    if error.kind() == std::io::ErrorKind::NotFound {
        TMUX_NOT_FOUND_ERROR.to_string()
    } else {
        format!("failed to execute tmux: {error}")
    }
}

fn tmux_output_message(output: &Output) -> String {
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    if !stderr.is_empty() {
        return stderr;
    }

    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if !stdout.is_empty() {
        return stdout;
    }

    format!("tmux exited with status {}", output.status)
}

fn tmux_pane_in_mode(session_name: &str) -> Result<bool, String> {
    Ok(tmux_display_message_value(session_name, "#{pane_in_mode}")?.as_deref() == Some("1"))
}

fn tmux_pane_alternate_on(session_name: &str) -> Result<bool, String> {
    Ok(tmux_display_message_value(session_name, "#{alternate_on}")?.as_deref() == Some("1"))
}

fn tmux_window_bell_flag(session_name: &str) -> Result<bool, String> {
    Ok(tmux_display_message_value(session_name, "#{window_bell_flag}")?.as_deref() == Some("1"))
}

fn tmux_display_message_value(session_name: &str, format: &str) -> Result<Option<String>, String> {
    let output = tmux_output(["display-message", "-p", "-t", session_name, format])?;
    if !output.status.success() {
        return Err(format!(
            "failed to read tmux display message for {session_name}: {}",
            tmux_output_message(&output)
        ));
    }

    let value = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if value.is_empty() {
        Ok(None)
    } else {
        Ok(Some(value))
    }
}

fn resolve_live_cwd(runtime_state: &PtyRuntimeSnapshot) -> Option<String> {
    resolve_tmux_session_cwd(&runtime_state.session_name)
        .or_else(|| resolve_process_cwd(runtime_state.process_id))
}

fn resolve_tmux_session_cwd(session_name: &str) -> Option<String> {
    tmux_display_message_value(session_name, "#{pane_current_path}")
        .ok()
        .flatten()
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

fn consume_bell_edge(previous_flag: &mut bool, current_flag: bool) -> bool {
    let triggered = current_flag && !*previous_flag;
    *previous_flag = current_flag;
    triggered
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::TerminalPaneSnapshotInput;
    use std::thread::sleep;
    use std::time::{Duration, SystemTime, UNIX_EPOCH};

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

    #[test]
    fn runtime_state_seeds_restore_scrollback_before_live_output() {
        let restore = CreatePtyRestore {
            last_known_cwd: None,
            scrollback: Some("abc".into()),
            scrollback_truncated: Some(false),
        };
        let mut state = PtyRuntimeState::new(
            "/tmp/grove/worktree".into(),
            None,
            "grove-test".into(),
            Some(&restore),
            None,
        );

        state.append_scrollback(b"def");

        assert_eq!(state.scrollback, b"abcdef");
        assert!(!state.scrollback_truncated);
    }

    #[test]
    fn runtime_state_preserves_restore_seed_truncation_metadata() {
        let restore = CreatePtyRestore {
            last_known_cwd: None,
            scrollback: Some("abc".into()),
            scrollback_truncated: Some(true),
        };
        let state = PtyRuntimeState::new(
            "/tmp/grove/worktree".into(),
            None,
            "grove-test".into(),
            Some(&restore),
            None,
        );

        assert_eq!(state.scrollback, b"abc");
        assert!(state.scrollback_truncated);
    }

    #[test]
    fn consume_bell_edge_only_triggers_on_rising_edge() {
        let mut previous = false;

        assert!(consume_bell_edge(&mut previous, true));
        assert!(!consume_bell_edge(&mut previous, true));
        assert!(!consume_bell_edge(&mut previous, false));
        assert!(consume_bell_edge(&mut previous, true));
    }

    #[test]
    fn runtime_state_applies_cap_after_seeded_and_live_output_combine() {
        let restore = CreatePtyRestore {
            last_known_cwd: None,
            scrollback: Some(format!("0123{}", "a".repeat(MAX_SCROLLBACK_BYTES - 6))),
            scrollback_truncated: Some(false),
        };
        let mut state = PtyRuntimeState::new(
            "/tmp/grove/worktree".into(),
            None,
            "grove-test".into(),
            Some(&restore),
            None,
        );

        state.append_scrollback(b"bcde");

        let scrollback = String::from_utf8_lossy(&state.scrollback);
        assert_eq!(state.scrollback.len(), MAX_SCROLLBACK_BYTES);
        assert!(scrollback.starts_with("23"));
        assert!(scrollback.ends_with("bcde"));
        assert!(state.scrollback_truncated);
    }

    #[test]
    fn runtime_state_seeds_last_known_cwd_from_restore_metadata() {
        let restore = CreatePtyRestore {
            last_known_cwd: Some("/tmp/grove/restored".into()),
            scrollback: None,
            scrollback_truncated: None,
        };
        let state = PtyRuntimeState::new(
            "/tmp/grove/worktree".into(),
            None,
            "grove-test".into(),
            Some(&restore),
            None,
        );

        assert_eq!(state.last_known_cwd.as_deref(), Some("/tmp/grove/restored"));
        assert!(state.scrollback.is_empty());
        assert!(!state.scrollback_truncated);
    }

    #[test]
    fn grove_tmux_session_name_is_stable_and_namespaced() {
        let session_name = grove_tmux_session_name(
            "/tmp/grove/worktree",
            "550e8400-e29b-41d4-a716-446655440000",
        );

        assert!(session_name.starts_with("grove-"));
        assert_eq!(session_name, "grove-40c3d931f1d8-550e8400a3a9".to_string());
    }

    #[test]
    fn pane_short_id_falls_back_to_hash_when_sanitized_prefix_is_empty() {
        assert_eq!(pane_short_id("---"), short_hash("---", PANE_HASH_LEN));
    }

    #[test]
    fn runtime_restore_seed_only_applies_to_new_sessions() {
        let restore = CreatePtyRestore {
            last_known_cwd: Some("/tmp/grove/restored".into()),
            scrollback: Some("seed".into()),
            scrollback_truncated: Some(true),
        };

        assert!(runtime_restore_seed(CreatePtySessionState::Attached, Some(&restore)).is_none());
        assert_eq!(
            runtime_restore_seed(CreatePtySessionState::Created, Some(&restore))
                .and_then(|seed| seed.scrollback.as_deref()),
            Some("seed")
        );
    }

    #[test]
    fn runtime_state_seeds_attached_scrollback_from_initial_hydration() {
        let capture = TmuxCapturedContent {
            bytes: b"live tmux buffer".to_vec(),
            truncated: true,
        };

        let state = PtyRuntimeState::new(
            "/tmp/grove".into(),
            Some(123),
            "grove-session".into(),
            None,
            Some(&capture),
        );

        assert_eq!(state.scrollback, b"live tmux buffer");
        assert!(state.scrollback_truncated);
    }

    #[test]
    fn tmux_capture_scope_prefers_mode_then_alternate_then_history() {
        assert_eq!(tmux_capture_scope(true, true), TmuxCaptureScope::ModeScreen);
        assert_eq!(
            tmux_capture_scope(false, true),
            TmuxCaptureScope::AlternateScreen
        );
        assert_eq!(tmux_capture_scope(false, false), TmuxCaptureScope::History);
    }

    #[test]
    fn create_tmux_initial_hydration_returns_live_tmux_content() {
        if Command::new("tmux").arg("-V").output().is_err() {
            return;
        }

        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let session_name = format!("grove-test-hydration-{nonce}");
        let worktree_path = env::current_dir().unwrap();
        let worktree_path = worktree_path.to_string_lossy().into_owned();
        let pane_id = format!("pane-{nonce}");
        let marker = format!("hydrate-{nonce}");

        let _ = kill_tmux_session_if_exists(&session_name);
        ensure_grove_tmux_session(&session_name, &worktree_path, &pane_id, &worktree_path).unwrap();

        sleep(Duration::from_millis(150));
        tmux_output([
            "send-keys",
            "-t",
            &session_name,
            &format!("printf '{marker}\\n'"),
            "Enter",
        ])
        .unwrap();
        sleep(Duration::from_millis(150));

        let hydration = create_tmux_initial_hydration(
            &capture_tmux_content_with_fallback(&session_name, TmuxCaptureScope::History).unwrap(),
        );
        assert_eq!(
            hydration.source,
            CreatePtyInitialHydrationSource::TmuxCapture
        );
        assert!(!hydration.truncated);
        assert!(hydration.text.contains(&marker));

        kill_tmux_session_if_exists(&session_name).unwrap();
    }

    #[test]
    fn ensure_grove_tmux_session_reports_created_then_attached_and_forces_status_off() {
        if Command::new("tmux").arg("-V").output().is_err() {
            return;
        }

        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let session_name = format!("grove-test-{nonce}");
        let worktree_path = env::current_dir().unwrap();
        let worktree_path = worktree_path.to_string_lossy().into_owned();
        let pane_id = format!("pane-{nonce}");

        let _ = kill_tmux_session_if_exists(&session_name);

        let first =
            ensure_grove_tmux_session(&session_name, &worktree_path, &pane_id, &worktree_path)
                .unwrap();
        assert_eq!(first, CreatePtySessionState::Created);
        assert_eq!(
            tmux_session_option(&session_name, TMUX_STATUS_OPTION)
                .unwrap()
                .as_deref(),
            Some(TMUX_STATUS_OFF_VALUE)
        );
        assert_eq!(
            tmux_session_option(&session_name, TMUX_MOUSE_OPTION)
                .unwrap()
                .as_deref(),
            Some(TMUX_MOUSE_ON_VALUE)
        );

        tmux_set_option(&session_name, TMUX_STATUS_OPTION, "on").unwrap();

        let second =
            ensure_grove_tmux_session(&session_name, &worktree_path, &pane_id, &worktree_path)
                .unwrap();
        assert_eq!(second, CreatePtySessionState::Attached);
        assert_eq!(
            tmux_session_option(&session_name, TMUX_STATUS_OPTION)
                .unwrap()
                .as_deref(),
            Some(TMUX_STATUS_OFF_VALUE)
        );
        assert_eq!(
            tmux_session_option(&session_name, TMUX_MOUSE_OPTION)
                .unwrap()
                .as_deref(),
            Some(TMUX_MOUSE_ON_VALUE)
        );

        kill_tmux_session_if_exists(&session_name).unwrap();
    }

    #[test]
    fn enforce_grove_tmux_options_restores_overridden_values_on_attach() {
        if Command::new("tmux").arg("-V").output().is_err() {
            return;
        }

        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let session_name = format!("grove-test-enforce-{nonce}");
        let worktree_path = env::current_dir().unwrap();
        let worktree_path = worktree_path.to_string_lossy().into_owned();
        let pane_id = format!("pane-{nonce}");

        let _ = kill_tmux_session_if_exists(&session_name);

        // Create session — enforced options are set.
        ensure_grove_tmux_session(&session_name, &worktree_path, &pane_id, &worktree_path).unwrap();

        // Simulate user or external process overriding every enforced option.
        tmux_set_option(&session_name, TMUX_STATUS_OPTION, "on").unwrap();
        tmux_set_option(&session_name, TMUX_MOUSE_OPTION, "off").unwrap();

        // Re-attach — ensure all enforced options are restored.
        let state =
            ensure_grove_tmux_session(&session_name, &worktree_path, &pane_id, &worktree_path)
                .unwrap();
        assert_eq!(state, CreatePtySessionState::Attached);
        assert_eq!(
            tmux_session_option(&session_name, TMUX_STATUS_OPTION)
                .unwrap()
                .as_deref(),
            Some(TMUX_STATUS_OFF_VALUE),
            "status must be restored to off on attach"
        );
        assert_eq!(
            tmux_session_option(&session_name, TMUX_MOUSE_OPTION)
                .unwrap()
                .as_deref(),
            Some(TMUX_MOUSE_ON_VALUE),
            "mouse must be restored to on on attach"
        );

        kill_tmux_session_if_exists(&session_name).unwrap();
    }

    #[test]
    fn close_ptys_for_worktree_kills_orphaned_tmux_sessions() {
        if Command::new("tmux").arg("-V").output().is_err() {
            return;
        }

        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let session_name = format!("grove-test-orphan-{nonce}");
        let worktree_path = env::temp_dir().join(format!("grove-worktree-{nonce}"));
        std::fs::create_dir_all(&worktree_path).unwrap();
        let worktree_path = worktree_path.to_string_lossy().into_owned();
        let pane_id = format!("pane-{nonce}");

        let _ = kill_tmux_session_if_exists(&session_name);
        ensure_grove_tmux_session(&session_name, &worktree_path, &pane_id, &worktree_path).unwrap();
        assert!(tmux_session_exists(&session_name).unwrap());

        // This reproduces the restart case: the tmux session exists, but no live PTY
        // instance was registered in memory.
        close_ptys_for_worktree(&worktree_path).unwrap();

        assert!(!tmux_session_exists(&session_name).unwrap());

        let _ = std::fs::remove_dir_all(&worktree_path);
    }

    #[test]
    fn clear_scrollback_resets_runtime_buffer() {
        let tracked = Arc::new(Mutex::new(PtyRuntimeState::new(
            "/tmp/grove/worktree".into(),
            None,
            "grove-test".into(),
            None,
            None,
        )));

        {
            let mut state = tracked.lock().unwrap();
            state.append_scrollback(b"hello");
            state.scrollback_truncated = true;
        }

        {
            let mut state = tracked.lock().unwrap();
            state.scrollback.clear();
            state.scrollback_truncated = false;
        }

        let state = tracked.lock().unwrap();
        assert!(state.scrollback.is_empty());
        assert!(!state.scrollback_truncated);
    }
}
