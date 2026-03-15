use std::env;
use std::process::Command;
use std::sync::OnceLock;

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

pub fn preferred_ssh_auth_sock() -> Option<String> {
    resolve_with(normalize_env_value(env::var("SSH_AUTH_SOCK").ok()), || {
        cached_launchctl_ssh_auth_sock()
    })
}

#[cfg(test)]
mod tests {
    use super::{normalize_env_value, preferred_ssh_auth_sock, resolve_with};
    use std::sync::{Mutex, OnceLock};

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
}
