use std::env;
use std::io::Read as _;
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
const LOGIN_SHELL_RETRY_ATTEMPTS: usize = 4;
const LOGIN_SHELL_RETRY_DELAY: Duration = Duration::from_millis(1500);
const PATH_MARKER: &str = "__GROVE_PATH__";

pub fn enriched_path() -> &'static str {
    static PATH: OnceLock<String> = OnceLock::new();
    PATH.get_or_init(|| {
        let base =
            resolve_login_shell_path().unwrap_or_else(|| env::var("PATH").unwrap_or_default());
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

pub fn preferred_ssh_auth_sock() -> Option<String> {
    resolve_with(normalize_env_value(env::var("SSH_AUTH_SOCK").ok()), || {
        cached_launchctl_ssh_auth_sock()
    })
}

#[cfg(test)]
mod tests {
    use super::{
        enriched_path, is_posix_like_shell, normalize_env_value, parse_path_marker,
        preferred_ssh_auth_sock, resolve_with, resolve_with_retry,
    };
    use std::sync::{Mutex, OnceLock};
    use std::time::Duration;

    fn env_lock() -> std::sync::MutexGuard<'static, ()> {
        static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
        LOCK.get_or_init(|| Mutex::new(())).lock().unwrap()
    }

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
