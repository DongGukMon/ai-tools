use std::path::Path;
use std::sync::OnceLock;

pub const TMUX_GROVE_CLAUDE_STATUS_OPTION: &str = "@grove_claude_status";

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

    Ok(())
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
# Sets tmux user options that Grove polls for status badges.
TOOL="$1"; EVENT="$2"
[ -z "$GROVE_TMUX_SESSION" ] && exit 0
case "$TOOL" in
  claude)
    case "$EVENT" in
      SessionStart)
        tmux set-option -q -t "$GROVE_TMUX_SESSION" @grove_claude_status idle 2>/dev/null ;;
      UserPromptSubmit)
        tmux set-option -q -t "$GROVE_TMUX_SESSION" @grove_claude_status running 2>/dev/null ;;
      Stop)
        tmux set-option -q -t "$GROVE_TMUX_SESSION" @grove_claude_status idle 2>/dev/null ;;
      StopFailure|Notification)
        tmux set-option -q -t "$GROVE_TMUX_SESSION" @grove_claude_status attention 2>/dev/null ;;
      SessionEnd|cleanup)
        tmux set-option -qu -t "$GROVE_TMUX_SESSION" @grove_claude_status 2>/dev/null ;;
    esac ;;
esac
"#
}

fn claude_wrapper_script(grove_hook_path: &Path) -> String {
    let grove_hook_path = grove_hook_path.to_string_lossy();
    format!(
        r#"#!/usr/bin/env bash
# Grove-managed Claude Code wrapper — injects hooks for status tracking.
find_real_claude() {{
  local self_dir; self_dir="$(cd "$(dirname "$0")" && pwd)"
  local IFS=:; for d in $PATH; do
    [[ "$d" == "$self_dir" ]] && continue
    [[ -x "$d/claude" ]] && printf '%s' "$d/claude" && return 0
  done; return 1
}}
REAL_CLAUDE="$(find_real_claude)" || {{ echo "claude: not found" >&2; exit 127; }}
[ -z "$GROVE_TMUX_SESSION" ] && exec "$REAL_CLAUDE" "$@"
GROVE_HOOK="{grove_hook_path}"
trap '$GROVE_HOOK claude cleanup' EXIT
HOOKS_JSON='{{"hooks":{{"SessionStart":[{{"type":"command","command":"'"'"'{grove_hook_path}'"'"' claude SessionStart","timeout":5}}],"Stop":[{{"type":"command","command":"'"'"'{grove_hook_path}'"'"' claude Stop","timeout":5}}],"StopFailure":[{{"type":"command","command":"'"'"'{grove_hook_path}'"'"' claude StopFailure","timeout":5}}],"Notification":[{{"type":"command","command":"'"'"'{grove_hook_path}'"'"' claude Notification","timeout":5}}],"UserPromptSubmit":[{{"type":"command","command":"'"'"'{grove_hook_path}'"'"' claude UserPromptSubmit","timeout":5}}],"SessionEnd":[{{"type":"command","command":"'"'"'{grove_hook_path}'"'"' claude SessionEnd","timeout":1}}]}}}}'
exec "$REAL_CLAUDE" --settings "$HOOKS_JSON" "$@"
"#
    )
}

#[cfg(test)]
mod tests {
    use super::{claude_wrapper_script, grove_hook_script, TMUX_GROVE_CLAUDE_STATUS_OPTION};
    use std::path::Path;

    #[test]
    fn grove_hook_script_updates_claude_status_option() {
        let script = grove_hook_script();

        assert!(script.contains(TMUX_GROVE_CLAUDE_STATUS_OPTION));
        assert!(script.contains("StopFailure|Notification"));
        assert!(script.contains("SessionEnd|cleanup"));
    }

    #[test]
    fn claude_wrapper_script_embeds_hook_path_and_cleanup_trap() {
        let hook_path = Path::new("/tmp/grove-hook");
        let script = claude_wrapper_script(hook_path);

        assert!(script.contains("GROVE_HOOK=\"/tmp/grove-hook\""));
        assert!(script.contains("trap '$GROVE_HOOK claude cleanup' EXIT"));
        assert!(script.contains("claude Notification"));
        assert!(script.contains("--settings \"$HOOKS_JSON\""));
    }
}
