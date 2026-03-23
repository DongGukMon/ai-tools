use std::path::Path;
use std::sync::OnceLock;

pub const TMUX_GROVE_AI_STATUS_OPTION: &str = "@grove_ai_status";

/// Tools that lack a hook system and need PTY idle timeout detection.
/// Tools with hooks (e.g. Claude Code via `--settings`) report status directly.
const HOOKLESS_TOOLS: &[&str] = &["codex"];

/// Returns true if the given AI status belongs to a tool without hooks.
pub fn needs_idle_detection(ai_status: Option<&str>) -> bool {
    ai_status.is_some_and(|s| HOOKLESS_TOOLS.iter().any(|t| s.starts_with(t)))
}

/// Returns true if the status suffix is `:running`.
pub fn is_running(ai_status: Option<&str>) -> bool {
    ai_status.is_some_and(|s| s.ends_with(":running"))
}

/// Returns true if the status suffix is `:idle`.
pub fn is_idle(ai_status: Option<&str>) -> bool {
    ai_status.is_some_and(|s| s.ends_with(":idle"))
}

/// Converts a status to its `:running` variant (e.g. "codex:idle" → "codex:running").
pub fn to_running(ai_status: &str) -> String {
    let tool = ai_status.split(':').next().unwrap_or(ai_status);
    format!("{tool}:running")
}

/// Converts a status to its `:idle` variant (e.g. "codex:running" → "codex:idle").
pub fn to_idle(ai_status: &str) -> String {
    let tool = ai_status.split(':').next().unwrap_or(ai_status);
    format!("{tool}:idle")
}

pub fn ensure_installed() {
    static INIT: OnceLock<()> = OnceLock::new();
    INIT.get_or_init(|| {
        if let Err(error) = install() {
            eprintln!("Warning: failed to install Grove CLI wrappers: {error}");
        }
    });
}

fn install() -> Result<(), String> {
    let Some(home) = dirs::home_dir() else {
        return Ok(());
    };

    let bin_dir = home.join(".grove").join("bin");
    std::fs::create_dir_all(&bin_dir)
        .map_err(|error| format!("failed to create {}: {error}", bin_dir.display()))?;

    let grove_hook = bin_dir.join("grove-hook");
    write_executable(&grove_hook, grove_hook_script())?;

    let claude_wrapper = bin_dir.join("claude");
    write_executable(&claude_wrapper, &claude_wrapper_script(&grove_hook))?;

    let codex_wrapper = bin_dir.join("codex");
    write_executable(&codex_wrapper, &codex_wrapper_script())?;

    install_zdotdir(&home)?;

    Ok(())
}

/// Creates `~/.grove/zsh/` with wrapper rc files that source the user's
/// real dotfiles and then prepend `~/.grove/bin` to PATH.  This ensures
/// the Grove claude wrapper is found first regardless of what the user's
/// `.zshrc` does to PATH.
pub(crate) fn install_zdotdir(home: &std::path::Path) -> Result<(), String> {
    let zsh_dir = home.join(".grove").join("zsh");
    std::fs::create_dir_all(&zsh_dir)
        .map_err(|e| format!("failed to create {}: {e}", zsh_dir.display()))?;

    let grove_bin = home.join(".grove").join("bin");
    let grove_bin_str = grove_bin.to_string_lossy();

    // .zshenv — runs for ALL zsh invocations (login, non-login, scripts)
    std::fs::write(
        zsh_dir.join(".zshenv"),
        r#"# Grove-managed — sources real .zshenv then ensures Grove PATH.
source "${GROVE_REAL_ZDOTDIR:-$HOME}/.zshenv" 2>/dev/null; true
"#,
    )
    .map_err(|e| format!("failed to write .zshenv: {e}"))?;

    // .zprofile — login shells only (lets path_helper run via /etc/zprofile, then sources user's)
    std::fs::write(
        zsh_dir.join(".zprofile"),
        r#"# Grove-managed — sources real .zprofile.
source "${GROVE_REAL_ZDOTDIR:-$HOME}/.zprofile" 2>/dev/null; true
"#,
    )
    .map_err(|e| format!("failed to write .zprofile: {e}"))?;

    // .zshrc — interactive shells; prepends ~/.grove/bin AFTER all user config
    std::fs::write(
        zsh_dir.join(".zshrc"),
        format!(
            r#"# Grove-managed — sources real .zshrc then ensures Grove PATH.
source "${{GROVE_REAL_ZDOTDIR:-$HOME}}/.zshrc" 2>/dev/null; true
export PATH="{grove_bin_str}:$PATH"
"#
        ),
    )
    .map_err(|e| format!("failed to write .zshrc: {e}"))?;

    // .zlogin — login shells, after .zshrc
    std::fs::write(
        zsh_dir.join(".zlogin"),
        r#"# Grove-managed — sources real .zlogin.
source "${GROVE_REAL_ZDOTDIR:-$HOME}/.zlogin" 2>/dev/null; true
"#,
    )
    .map_err(|e| format!("failed to write .zlogin: {e}"))?;

    Ok(())
}

/// Returns the Grove-managed ZDOTDIR path when it has been installed.
pub fn grove_zdotdir() -> Option<String> {
    let home = dirs::home_dir()?;
    let zsh_dir = home.join(".grove").join("zsh");
    if zsh_dir.is_dir() {
        Some(zsh_dir.to_string_lossy().into_owned())
    } else {
        None
    }
}

fn write_executable(path: &Path, content: &str) -> Result<(), String> {
    std::fs::write(path, content)
        .map_err(|error| format!("failed to write {}: {error}", path.display()))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o755))
            .map_err(|error| format!("failed to chmod {}: {error}", path.display()))?;
    }
    Ok(())
}

fn grove_hook_script() -> &'static str {
    r#"#!/usr/bin/env bash
# Grove hook dispatcher. Usage: grove-hook <tool> <event>
# Sets tmux @grove_ai_status in "tool:status" format.
TOOL="$1"; EVENT="$2"
[ -z "$GROVE_TMUX_SESSION" ] && exit 0
grove_ai() { tmux set-option -q -t "$GROVE_TMUX_SESSION" @grove_ai_status "$1" 2>/dev/null; }
grove_ai_clear() { tmux set-option -qu -t "$GROVE_TMUX_SESSION" @grove_ai_status 2>/dev/null; }
case "$TOOL" in
  claude)
    case "$EVENT" in
      SessionStart)          grove_ai "claude:idle" ;;
      UserPromptSubmit)      grove_ai "claude:running" ;;
      Stop)                  grove_ai "claude:idle" ;;
      StopFailure|Notification) grove_ai "claude:attention" ;;
      SessionEnd|cleanup)    grove_ai_clear ;;
    esac ;;
esac
"#
}

/// Common shell helper: find real binary by scanning PATH, skipping our own bin dir.
fn find_real_binary_fn(tool: &str) -> String {
    format!(
        r#"find_real_{tool}() {{
  local self_dir; self_dir="$(cd "$(dirname "$0")" && pwd)"
  local IFS=:; for d in $PATH; do
    [[ "$d" == "$self_dir" ]] && continue
    [[ -x "$d/{tool}" ]] && printf '%s' "$d/{tool}" && return 0
  done; return 1
}}"#
    )
}

/// Common lifecycle: set @grove_ai_status on start, clear on exit.
fn grove_lifecycle_trap(tool: &str) -> String {
    format!(
        r#"grove_ai_cleanup() {{ tmux set-option -qu -t "$GROVE_TMUX_SESSION" @grove_ai_status 2>/dev/null; }}
trap grove_ai_cleanup EXIT INT TERM HUP
tmux set-option -q -t "$GROVE_TMUX_SESSION" @grove_ai_status "{tool}:idle" 2>/dev/null"#
    )
}

fn claude_wrapper_script(grove_hook_path: &Path) -> String {
    let grove_hook_path = grove_hook_path.to_string_lossy();
    let find_fn = find_real_binary_fn("claude");
    let lifecycle = grove_lifecycle_trap("claude");
    format!(
        r#"#!/usr/bin/env bash
# Grove-managed Claude Code wrapper — lifecycle tracking + hooks for fine-grained status.
{find_fn}
REAL_CLAUDE="$(find_real_claude)" || {{ echo "claude: not found" >&2; exit 127; }}
[ -z "$GROVE_TMUX_SESSION" ] && exec "$REAL_CLAUDE" "$@"
{lifecycle}
GROVE_HOOK="{grove_hook_path}"
HOOKS_JSON='{{"hooks":{{"SessionStart":[{{"matcher":"","hooks":[{{"type":"command","command":"'"'"'{grove_hook_path}'"'"' claude SessionStart","timeout":5}}]}}],"Stop":[{{"matcher":"","hooks":[{{"type":"command","command":"'"'"'{grove_hook_path}'"'"' claude Stop","timeout":5}}]}}],"StopFailure":[{{"matcher":"","hooks":[{{"type":"command","command":"'"'"'{grove_hook_path}'"'"' claude StopFailure","timeout":5}}]}}],"Notification":[{{"matcher":"","hooks":[{{"type":"command","command":"'"'"'{grove_hook_path}'"'"' claude Notification","timeout":5}}]}}],"UserPromptSubmit":[{{"matcher":"","hooks":[{{"type":"command","command":"'"'"'{grove_hook_path}'"'"' claude UserPromptSubmit","timeout":5}}]}}],"SessionEnd":[{{"matcher":"","hooks":[{{"type":"command","command":"'"'"'{grove_hook_path}'"'"' claude SessionEnd","timeout":1}}]}}]}}}}'
"$REAL_CLAUDE" --settings "$HOOKS_JSON" "$@"
"#
    )
}

fn codex_wrapper_script() -> String {
    let find_fn = find_real_binary_fn("codex");
    let lifecycle = grove_lifecycle_trap("codex");
    format!(
        r#"#!/usr/bin/env bash
# Grove-managed Codex wrapper — lifecycle tracking.
{find_fn}
REAL_CODEX="$(find_real_codex)" || {{ echo "codex: not found" >&2; exit 127; }}
[ -z "$GROVE_TMUX_SESSION" ] && exec "$REAL_CODEX" "$@"
{lifecycle}
"$REAL_CODEX" "$@"
"#
    )
}

#[cfg(test)]
mod tests {
    use super::{
        claude_wrapper_script, codex_wrapper_script, ensure_installed, grove_hook_script,
        grove_zdotdir, TMUX_GROVE_AI_STATUS_OPTION,
    };
    use std::env;
    use std::fs;
    use std::path::{Path, PathBuf};
    use std::process::Output;
    use uuid::Uuid;

    const ENSURE_INSTALLED_CHILD_ENV: &str = "GROVE_TOOL_HOOKS_CHILD";

    fn unique_test_dir(prefix: &str) -> PathBuf {
        std::env::temp_dir().join(format!("{prefix}-{}", Uuid::new_v4()))
    }

    fn assert_subprocess_success(output: &Output, context: &str) {
        if output.status.success() {
            return;
        }

        panic!(
            "{context} failed\nstdout:\n{}\nstderr:\n{}",
            String::from_utf8_lossy(&output.stdout),
            String::from_utf8_lossy(&output.stderr)
        );
    }

    #[test]
    fn needs_idle_detection_only_for_hookless_tools() {
        use super::{is_idle, is_running, needs_idle_detection, to_idle, to_running};

        // Codex — hookless, needs idle detection
        assert!(needs_idle_detection(Some("codex:idle")));
        assert!(needs_idle_detection(Some("codex:running")));
        assert!(needs_idle_detection(Some("codex:attention")));

        // Claude — has hooks, does NOT need idle detection
        assert!(!needs_idle_detection(Some("claude:idle")));
        assert!(!needs_idle_detection(Some("claude:running")));

        // None
        assert!(!needs_idle_detection(None));
    }

    #[test]
    fn status_predicates_and_conversions() {
        use super::{is_idle, is_running, to_idle, to_running};

        assert!(is_running(Some("codex:running")));
        assert!(!is_running(Some("codex:idle")));
        assert!(!is_running(None));

        assert!(is_idle(Some("codex:idle")));
        assert!(!is_idle(Some("codex:running")));
        assert!(!is_idle(None));

        assert_eq!(to_running("codex:idle"), "codex:running");
        assert_eq!(to_running("codex:attention"), "codex:running");
        assert_eq!(to_idle("codex:running"), "codex:idle");
        assert_eq!(to_idle("newtool:running"), "newtool:idle");
    }

    #[test]
    fn grove_hook_script_updates_ai_status_option() {
        let script = grove_hook_script();

        assert!(script.contains(TMUX_GROVE_AI_STATUS_OPTION));
        assert!(script.contains("claude:idle"));
        assert!(script.contains("claude:running"));
        assert!(script.contains("claude:attention"));
        assert!(script.contains("StopFailure|Notification"));
        assert!(script.contains("SessionEnd|cleanup"));
    }

    #[test]
    fn claude_wrapper_script_uses_lifecycle_trap_and_hooks() {
        let hook_path = Path::new("/tmp/grove-hook");
        let script = claude_wrapper_script(hook_path);

        assert!(script.contains("GROVE_HOOK=\"/tmp/grove-hook\""));
        assert!(script.contains("grove_ai_cleanup"));
        assert!(script.contains("trap grove_ai_cleanup EXIT INT TERM HUP"));
        assert!(script.contains("claude:idle"));
        assert!(script.contains("claude UserPromptSubmit"));
        assert!(script.contains("claude Notification"));
        assert!(script.contains("--settings \"$HOOKS_JSON\""));
        // Should NOT use exec — run as child process
        assert!(!script.contains("exec \"$REAL_CLAUDE\" --settings"));
    }

    #[test]
    fn codex_wrapper_script_uses_lifecycle_trap() {
        let script = codex_wrapper_script();

        assert!(script.contains("find_real_codex"));
        assert!(script.contains("grove_ai_cleanup"));
        assert!(script.contains("trap grove_ai_cleanup EXIT INT TERM HUP"));
        assert!(script.contains("codex:idle"));
        // Should NOT use exec when in Grove session
        assert!(!script.contains("exec \"$REAL_CODEX\" \"$@\"\n\"#"));
    }

    #[test]
    fn ensure_installed_creates_zdotdir_wrappers_and_grove_zdotdir() {
        if env::var_os(ENSURE_INSTALLED_CHILD_ENV).is_some() {
            ensure_installed();

            let home = dirs::home_dir().unwrap();
            let zsh_dir = home.join(".grove").join("zsh");
            let grove_bin = home.join(".grove").join("bin");

            assert_eq!(
                grove_zdotdir(),
                Some(zsh_dir.to_string_lossy().into_owned())
            );
            for file_name in [".zshenv", ".zprofile", ".zshrc", ".zlogin"] {
                assert!(zsh_dir.join(file_name).is_file(), "missing {file_name}");
            }

            let zshrc = fs::read_to_string(zsh_dir.join(".zshrc")).unwrap();
            assert!(zshrc.contains("source \"${GROVE_REAL_ZDOTDIR:-$HOME}/.zshrc\""));
            assert!(zshrc.contains(&format!("export PATH=\"{}:$PATH\"", grove_bin.display())));
            return;
        }

        let child_home = unique_test_dir("grove-tool-hooks-home");
        fs::create_dir_all(&child_home).unwrap();

        let output = std::process::Command::new(env::current_exe().unwrap())
            .arg("--exact")
            .arg("tool_hooks::tests::ensure_installed_creates_zdotdir_wrappers_and_grove_zdotdir")
            .arg("--nocapture")
            .env(ENSURE_INSTALLED_CHILD_ENV, "1")
            .env("HOME", &child_home)
            .env_remove("ZDOTDIR")
            .output()
            .unwrap();

        let _ = fs::remove_dir_all(&child_home);
        assert_subprocess_success(&output, "tool_hooks ensure_installed assertions");
    }
}
