use crate::tool_hooks;
use std::collections::HashMap;
use std::env;
use std::io::Read as _;
#[cfg(unix)]
use std::os::unix::fs::FileTypeExt as _;
use std::process::{Command, Stdio};
use std::sync::OnceLock;
use std::time::{Duration, Instant};

fn normalize_env_value(value: Option<String>) -> Option<String> {
    value.and_then(|value| {
        let trimmed = value.trim();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_string())
        }
    })
}

#[cfg(target_os = "macos")]
fn launchctl_getenv(key: &str) -> Option<String> {
    let output = Command::new("launchctl")
        .args(["getenv", key])
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    normalize_env_value(Some(String::from_utf8_lossy(&output.stdout).to_string()))
}

#[cfg(not(target_os = "macos"))]
fn launchctl_getenv(_key: &str) -> Option<String> {
    None
}

fn resolve_with<F>(env_value: Option<String>, fallback: F) -> Option<String>
where
    F: FnOnce() -> Option<String>,
{
    env_value.or_else(fallback)
}

fn parse_env_var_from_ps_output(output: &str, key: &str) -> Option<String> {
    let prefix = format!("{key}=");
    output
        .split_whitespace()
        .find_map(|segment| segment.strip_prefix(&prefix).map(str::to_string))
        .and_then(|value| normalize_env_value(Some(value)))
}

fn process_parent_id(pid: u32) -> Option<u32> {
    let output = Command::new("ps")
        .args(["-o", "ppid=", "-p", &pid.to_string()])
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }

    String::from_utf8_lossy(&output.stdout)
        .trim()
        .parse::<u32>()
        .ok()
}

fn process_env_var(pid: u32, key: &str) -> Option<String> {
    let output = Command::new("ps")
        .args(["eww", "-p", &pid.to_string()])
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }

    parse_env_var_from_ps_output(&String::from_utf8_lossy(&output.stdout), key)
}

fn ancestor_process_env_var(key: &str) -> Option<String> {
    let mut pid = std::process::id();
    for _ in 0..8 {
        let parent = process_parent_id(pid)?;
        if parent <= 1 {
            return None;
        }

        if let Some(value) = process_env_var(parent, key) {
            return Some(value);
        }

        pid = parent;
    }

    None
}

#[cfg(target_os = "macos")]
fn cached_launchctl_ssh_auth_sock() -> Option<String> {
    static SSH_AUTH_SOCK: OnceLock<Option<String>> = OnceLock::new();
    SSH_AUTH_SOCK
        .get_or_init(|| launchctl_getenv("SSH_AUTH_SOCK"))
        .clone()
}

#[cfg(not(target_os = "macos"))]
fn cached_launchctl_ssh_auth_sock() -> Option<String> {
    None
}

const LOGIN_SHELL_TIMEOUT: Duration = Duration::from_secs(2);
const LOGIN_SHELL_COMMAND_TIMEOUT: Duration = Duration::from_secs(15);
const LOGIN_SHELL_RETRY_ATTEMPTS: usize = 4;
const LOGIN_SHELL_RETRY_DELAY: Duration = Duration::from_millis(1500);
const PATH_MARKER: &str = "__GROVE_PATH__";
const ENV_MARKER: &str = "__GROVE_ENV__";
const SHELL_ENV_KEYS: &[&str] = &[
    "PATH",
    "SSH_AUTH_SOCK",
    "GH_TOKEN_SENDBIRD",
    "GH_TOKEN_SENDBIRD_PLAYGROUND",
    "GH_TOKEN_RICH_AUTOMATION",
];

fn shell_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\"'\"'"))
}

fn grove_real_zdotdir() -> String {
    let real_zdotdir = env::var("ZDOTDIR").unwrap_or_default();
    let grove_zsh = tool_hooks::grove_zdotdir();

    if !real_zdotdir.is_empty() && grove_zsh.as_deref() != Some(real_zdotdir.as_str()) {
        return real_zdotdir;
    }

    dirs::home_dir()
        .map(|home| home.to_string_lossy().into_owned())
        .unwrap_or_default()
}

fn shell_command(shell: &str, interactive: bool, command: &str) -> Command {
    let mut child = Command::new(shell);
    if interactive {
        child.args(["-i", "-c", command]);
        if let Some(zdotdir) = tool_hooks::grove_zdotdir() {
            child.env("GROVE_REAL_ZDOTDIR", grove_real_zdotdir());
            child.env("ZDOTDIR", zdotdir);
        }
    } else {
        child.args(["-l", "-c", command]);
    }
    child
}

fn shell_output(command: &str, interactive: bool) -> Result<String, String> {
    let shell = env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());
    if !is_posix_like_shell(&shell) {
        return Err(format!("Unsupported shell: {shell}"));
    }

    let mut child = shell_command(&shell, interactive, command)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to launch shell: {e}"))?;

    let start = Instant::now();
    loop {
        match child
            .try_wait()
            .map_err(|e| format!("Failed to poll shell: {e}"))?
        {
            Some(status) => {
                let output = child
                    .wait_with_output()
                    .map_err(|e| format!("Failed to read shell output: {e}"))?;
                if !status.success() {
                    return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
                }
                return Ok(String::from_utf8_lossy(&output.stdout).to_string());
            }
            None if start.elapsed() >= LOGIN_SHELL_COMMAND_TIMEOUT => {
                let _ = child.kill();
                let _ = child.wait();
                let shell_mode = if interactive { "interactive" } else { "login" };
                return Err(format!(
                    "{shell_mode} shell command timed out after {}s",
                    LOGIN_SHELL_COMMAND_TIMEOUT.as_secs()
                ));
            }
            None => std::thread::sleep(Duration::from_millis(50)),
        }
    }
}

fn shell_env_snapshot_command() -> String {
    let keys = SHELL_ENV_KEYS
        .iter()
        .map(|key| shell_quote(key))
        .collect::<Vec<_>>()
        .join(" ");
    format!(
        "printf '%s\\n' {marker}; \
for key in {keys}; do \
  value=\"$(/usr/bin/printenv \"$key\" 2>/dev/null || true)\"; \
  printf '%s=%s\\n' \"$key\" \"$value\"; \
done; \
printf '%s\\n' {marker}",
        marker = shell_quote(ENV_MARKER),
    )
}

fn merge_path_candidates(primary: Option<String>, secondary: Option<String>) -> Option<String> {
    let mut merged = Vec::new();
    for candidate in [primary, secondary].into_iter().flatten() {
        for entry in candidate.split(':') {
            let trimmed = entry.trim();
            if trimmed.is_empty() || merged.iter().any(|existing| existing == trimmed) {
                continue;
            }
            merged.push(trimmed.to_string());
        }
    }

    if merged.is_empty() {
        None
    } else {
        Some(merged.join(":"))
    }
}

pub fn enriched_path() -> &'static str {
    static PATH: OnceLock<String> = OnceLock::new();
    PATH.get_or_init(|| {
        let base = merge_path_candidates(preferred_env_var("PATH"), resolve_login_shell_path())
            .unwrap_or_else(|| env::var("PATH").unwrap_or_default());
        match dirs::home_dir().and_then(|h| h.join(".grove/bin").to_str().map(String::from)) {
            Some(grove_bin) => format!("{grove_bin}:{base}"),
            None => base,
        }
    })
    .as_str()
}

#[cfg(target_os = "macos")]
fn resolve_login_shell_path() -> Option<String> {
    resolve_with_retry(
        LOGIN_SHELL_RETRY_ATTEMPTS,
        LOGIN_SHELL_RETRY_DELAY,
        resolve_login_shell_path_once,
    )
}

#[cfg(target_os = "macos")]
fn resolve_login_shell_path_once() -> Option<String> {
    let shell = env::var("SHELL").ok()?;
    if !is_posix_like_shell(&shell) {
        return None;
    }

    let mut child = Command::new(&shell)
        .args([
            "-l",
            "-c",
            &format!(
                "printf '\\n{m}\\n%s\\n{m}' \"$(/usr/bin/printenv PATH)\"",
                m = PATH_MARKER
            ),
        ])
        .stdin(Stdio::null())
        .stderr(Stdio::null())
        .stdout(Stdio::piped())
        .spawn()
        .ok()?;

    let start = Instant::now();
    loop {
        match child.try_wait().ok()? {
            Some(_) => break,
            None if start.elapsed() >= LOGIN_SHELL_TIMEOUT => {
                let _ = child.kill();
                let _ = child.wait();
                return None;
            }
            None => std::thread::sleep(Duration::from_millis(50)),
        }
    }

    let mut stdout = String::new();
    child.stdout.take()?.read_to_string(&mut stdout).ok()?;
    parse_path_marker(&stdout)
}

#[cfg(not(target_os = "macos"))]
fn resolve_login_shell_path() -> Option<String> {
    None
}

fn resolve_with_retry<T, F>(attempts: usize, delay: Duration, mut resolver: F) -> Option<T>
where
    F: FnMut() -> Option<T>,
{
    if attempts == 0 {
        return None;
    }

    for attempt_idx in 0..attempts {
        if let Some(value) = resolver() {
            return Some(value);
        }

        if attempt_idx + 1 < attempts {
            std::thread::sleep(delay);
        }
    }

    None
}

fn is_posix_like_shell(shell: &str) -> bool {
    let basename = std::path::Path::new(shell)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("");
    matches!(basename, "bash" | "zsh" | "sh" | "dash" | "ksh")
}

fn parse_path_marker(output: &str) -> Option<String> {
    let start_tag = format!("{PATH_MARKER}\n");
    let end_tag = format!("\n{PATH_MARKER}");

    let start = output.find(&start_tag)? + start_tag.len();
    let end = output.rfind(&end_tag)?;
    if start >= end {
        return None;
    }

    let path = output[start..end].trim();
    if path.is_empty() {
        None
    } else {
        Some(path.to_string())
    }
}

fn parse_env_marker_output(output: &str) -> HashMap<String, String> {
    let start_tag = format!("{ENV_MARKER}\n");
    let end_tag = format!("\n{ENV_MARKER}");

    let Some(start) = output.find(&start_tag).map(|idx| idx + start_tag.len()) else {
        return HashMap::new();
    };
    let Some(end) = output.rfind(&end_tag) else {
        return HashMap::new();
    };
    if start >= end {
        return HashMap::new();
    }

    output[start..end]
        .lines()
        .filter_map(|line| {
            let (key, value) = line.split_once('=')?;
            normalize_env_value(Some(value.to_string())).map(|value| (key.to_string(), value))
        })
        .collect()
}

#[cfg(target_os = "macos")]
fn resolve_interactive_shell_env_once() -> Option<HashMap<String, String>> {
    let output = shell_output(&shell_env_snapshot_command(), true).ok()?;
    Some(parse_env_marker_output(&output))
}

#[cfg(target_os = "macos")]
fn interactive_shell_env() -> &'static HashMap<String, String> {
    static ENV: OnceLock<HashMap<String, String>> = OnceLock::new();
    ENV.get_or_init(|| {
        resolve_with_retry(
            LOGIN_SHELL_RETRY_ATTEMPTS,
            LOGIN_SHELL_RETRY_DELAY,
            resolve_interactive_shell_env_once,
        )
        .unwrap_or_default()
    })
}

#[cfg(not(target_os = "macos"))]
fn interactive_shell_env() -> &'static HashMap<String, String> {
    static ENV: OnceLock<HashMap<String, String>> = OnceLock::new();
    ENV.get_or_init(HashMap::new)
}

pub fn preferred_env_var(key: &str) -> Option<String> {
    resolve_with(normalize_env_value(env::var(key).ok()), || {
        interactive_shell_env().get(key).cloned()
    })
}

fn validated_shell_ssh_auth_sock(value: Option<String>) -> Option<String> {
    let value = normalize_env_value(value)?;
    let metadata = std::fs::metadata(&value).ok()?;
    #[cfg(unix)]
    {
        if metadata.file_type().is_socket() {
            return Some(value);
        }
    }

    #[cfg(not(unix))]
    {
        if metadata.is_file() {
            return Some(value);
        }
    }

    None
}

fn validated_ancestor_ssh_auth_sock() -> Option<String> {
    validated_shell_ssh_auth_sock(ancestor_process_env_var("SSH_AUTH_SOCK"))
}

fn preferred_ssh_auth_sock_from(
    env_value: Option<String>,
    launchctl_value: Option<String>,
    ancestor_value: Option<String>,
    shell_value: Option<String>,
) -> Option<String> {
    resolve_with(normalize_env_value(env_value), || {
        resolve_with(normalize_env_value(launchctl_value), || {
            resolve_with(validated_shell_ssh_auth_sock(ancestor_value), || {
                validated_shell_ssh_auth_sock(shell_value)
            })
        })
    })
}

pub fn preferred_ssh_auth_sock() -> Option<String> {
    // `19a8ad9` started sourcing SSH_AUTH_SOCK from interactive shell env
    // rendering. That lets shell-specific or stale agent sockets override the
    // launchd session socket that refresh/sync previously relied on.
    // Keep SSH on the pre-refactor trust path and use shell-derived values
    // only as a last resort.
    preferred_ssh_auth_sock_from(
        env::var("SSH_AUTH_SOCK").ok(),
        cached_launchctl_ssh_auth_sock(),
        validated_ancestor_ssh_auth_sock(),
        interactive_shell_env().get("SSH_AUTH_SOCK").cloned(),
    )
}

pub fn subprocess_env_pairs() -> Vec<(String, String)> {
    let mut pairs = vec![("PATH".to_string(), enriched_path().to_string())];
    if let Some(ssh_auth_sock) = preferred_ssh_auth_sock() {
        pairs.push(("SSH_AUTH_SOCK".to_string(), ssh_auth_sock));
    }
    pairs
}

pub fn interactive_shell_output(command: &str) -> Result<String, String> {
    #[cfg(target_os = "macos")]
    {
        shell_output(command, true)
    }

    #[cfg(not(target_os = "macos"))]
    {
        shell_output(command, false)
    }
}

pub fn login_shell_output(command: &str) -> Result<String, String> {
    shell_output(command, false)
}

#[cfg(test)]
mod tests {
    use super::{
        enriched_path, is_posix_like_shell, merge_path_candidates, normalize_env_value,
        parse_env_marker_output, parse_env_var_from_ps_output, parse_path_marker,
        preferred_env_var, preferred_ssh_auth_sock, preferred_ssh_auth_sock_from, resolve_with,
        resolve_with_retry,
    };
    use crate::test_support::env_lock;
    use std::collections::HashMap;
    #[cfg(unix)]
    use std::os::unix::net::UnixListener;
    use std::path::PathBuf;
    use std::time::Duration;
    use uuid::Uuid;

    #[test]
    fn preferred_ssh_auth_sock_prefers_process_env() {
        let _lock = env_lock();
        let original = std::env::var("SSH_AUTH_SOCK").ok();
        unsafe {
            std::env::set_var("SSH_AUTH_SOCK", "/tmp/grove-test.sock");
        }

        assert_eq!(
            preferred_ssh_auth_sock().as_deref(),
            Some("/tmp/grove-test.sock")
        );

        match original {
            Some(value) => unsafe {
                std::env::set_var("SSH_AUTH_SOCK", value);
            },
            None => unsafe {
                std::env::remove_var("SSH_AUTH_SOCK");
            },
        }
    }

    #[test]
    fn preferred_ssh_auth_sock_uses_launchctl_fallback_when_env_missing() {
        let resolved = resolve_with(None, || Some("/tmp/launchctl.sock".to_string()));

        assert_eq!(resolved, Some("/tmp/launchctl.sock".to_string()));
    }

    #[cfg(unix)]
    #[test]
    fn preferred_ssh_auth_sock_uses_valid_shell_socket_when_other_sources_missing() {
        let socket_path = PathBuf::from(format!("/tmp/gssh-{}.sock", Uuid::new_v4().simple()));
        let listener = UnixListener::bind(&socket_path).unwrap();

        let resolved = preferred_ssh_auth_sock_from(
            None,
            None,
            None,
            Some(socket_path.to_string_lossy().into_owned()),
        );

        assert_eq!(resolved.as_deref(), socket_path.to_str());

        drop(listener);
        let _ = std::fs::remove_file(socket_path);
    }

    #[test]
    fn preferred_ssh_auth_sock_rejects_invalid_shell_socket_path() {
        let missing_path = PathBuf::from("/tmp/grove-missing-shell-ssh-auth.sock");
        let resolved = preferred_ssh_auth_sock_from(
            None,
            None,
            None,
            Some(missing_path.to_string_lossy().into_owned()),
        );

        assert_eq!(resolved, None);
    }

    #[cfg(unix)]
    #[test]
    fn preferred_ssh_auth_sock_prefers_launchctl_over_shell_rendering() {
        let launchctl_path =
            PathBuf::from(format!("/tmp/glaunchctl-{}.sock", Uuid::new_v4().simple()));
        let shell_path = PathBuf::from(format!("/tmp/gshell-{}.sock", Uuid::new_v4().simple()));
        let launchctl_listener = UnixListener::bind(&launchctl_path).unwrap();
        let shell_listener = UnixListener::bind(&shell_path).unwrap();

        let resolved = preferred_ssh_auth_sock_from(
            None,
            Some(launchctl_path.to_string_lossy().into_owned()),
            None,
            Some(shell_path.to_string_lossy().into_owned()),
        );

        assert_eq!(resolved.as_deref(), launchctl_path.to_str());

        drop(launchctl_listener);
        drop(shell_listener);
        let _ = std::fs::remove_file(launchctl_path);
        let _ = std::fs::remove_file(shell_path);
    }

    #[cfg(unix)]
    #[test]
    fn preferred_ssh_auth_sock_uses_ancestor_when_process_and_launchctl_are_missing() {
        let ancestor_path =
            PathBuf::from(format!("/tmp/gancestor-{}.sock", Uuid::new_v4().simple()));
        let shell_path = PathBuf::from(format!("/tmp/gshell-{}.sock", Uuid::new_v4().simple()));
        let ancestor_listener = UnixListener::bind(&ancestor_path).unwrap();
        let shell_listener = UnixListener::bind(&shell_path).unwrap();

        let resolved = preferred_ssh_auth_sock_from(
            None,
            None,
            Some(ancestor_path.to_string_lossy().into_owned()),
            Some(shell_path.to_string_lossy().into_owned()),
        );

        assert_eq!(resolved.as_deref(), ancestor_path.to_str());

        drop(ancestor_listener);
        drop(shell_listener);
        let _ = std::fs::remove_file(ancestor_path);
        let _ = std::fs::remove_file(shell_path);
    }

    #[test]
    fn parse_env_var_from_ps_output_extracts_requested_value() {
        let output = "PID TTY STAT TIME COMMAND HOME=/Users/airenkang SSH_AUTH_SOCK=/tmp/agent.sock PATH=/usr/bin";
        assert_eq!(
            parse_env_var_from_ps_output(output, "SSH_AUTH_SOCK").as_deref(),
            Some("/tmp/agent.sock")
        );
        assert_eq!(
            parse_env_var_from_ps_output(output, "HOME").as_deref(),
            Some("/Users/airenkang")
        );
    }

    #[test]
    fn preferred_env_var_prefers_process_env() {
        let _lock = env_lock();
        let original = std::env::var("GH_TOKEN_SENDBIRD").ok();
        unsafe {
            std::env::set_var("GH_TOKEN_SENDBIRD", "test-token");
        }

        assert_eq!(
            preferred_env_var("GH_TOKEN_SENDBIRD").as_deref(),
            Some("test-token")
        );

        match original {
            Some(value) => unsafe {
                std::env::set_var("GH_TOKEN_SENDBIRD", value);
            },
            None => unsafe {
                std::env::remove_var("GH_TOKEN_SENDBIRD");
            },
        }
    }

    #[test]
    fn normalize_env_value_ignores_blank_values() {
        assert_eq!(
            normalize_env_value(Some("  /private/tmp/agent.sock \n".to_string())),
            Some("/private/tmp/agent.sock".to_string())
        );
        assert_eq!(normalize_env_value(Some("   ".to_string())), None);
    }

    #[test]
    fn parse_path_marker_extracts_path_between_markers() {
        let output = "Welcome!\n\n__GROVE_PATH__\n/usr/bin:/opt/homebrew/bin\n__GROVE_PATH__";
        assert_eq!(
            parse_path_marker(output),
            Some("/usr/bin:/opt/homebrew/bin".to_string())
        );
    }

    #[test]
    fn parse_path_marker_returns_none_on_missing_markers() {
        assert_eq!(parse_path_marker("no markers here"), None);
        assert_eq!(parse_path_marker(""), None);
    }

    #[test]
    fn parse_path_marker_returns_none_on_empty_path() {
        let output = "__GROVE_PATH__\n\n__GROVE_PATH__";
        assert_eq!(parse_path_marker(output), None);
    }

    #[test]
    fn parse_env_marker_output_extracts_non_empty_values() {
        let output =
            "noise\n__GROVE_ENV__\nPATH=/usr/bin:/bin\nSSH_AUTH_SOCK=\nGH_TOKEN_SENDBIRD=abc123\n__GROVE_ENV__\nnoise";
        let expected = HashMap::from([
            ("PATH".to_string(), "/usr/bin:/bin".to_string()),
            ("GH_TOKEN_SENDBIRD".to_string(), "abc123".to_string()),
        ]);

        assert_eq!(parse_env_marker_output(output), expected);
    }

    #[test]
    fn merge_path_candidates_preserves_order_and_deduplicates() {
        assert_eq!(
            merge_path_candidates(
                Some("/a:/b:/bin".to_string()),
                Some("/bin:/c:/a".to_string())
            ),
            Some("/a:/b:/bin:/c".to_string())
        );
    }

    #[test]
    fn is_posix_like_shell_recognizes_common_shells() {
        assert!(is_posix_like_shell("/bin/zsh"));
        assert!(is_posix_like_shell("/bin/bash"));
        assert!(is_posix_like_shell("/usr/bin/dash"));
        assert!(!is_posix_like_shell("/usr/bin/fish"));
        assert!(!is_posix_like_shell("/usr/bin/nu"));
    }

    #[test]
    fn enriched_path_returns_non_empty() {
        assert!(!enriched_path().is_empty());
    }

    #[test]
    fn resolve_with_retry_retries_until_success() {
        let mut attempts = 0;
        let resolved = resolve_with_retry(4, Duration::ZERO, || {
            attempts += 1;
            if attempts == 4 {
                Some("resolved".to_string())
            } else {
                None
            }
        });

        assert_eq!(resolved.as_deref(), Some("resolved"));
        assert_eq!(attempts, 4);
    }

    #[test]
    fn resolve_with_retry_stops_after_attempt_limit() {
        let mut attempts = 0;
        let resolved = resolve_with_retry::<String, _>(4, Duration::ZERO, || {
            attempts += 1;
            None
        });

        assert_eq!(resolved, None);
        assert_eq!(attempts, 4);
    }
}
