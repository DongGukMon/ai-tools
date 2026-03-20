use serde_json::{json, Map, Value};
use std::io::ErrorKind;
use std::path::Path;
use std::sync::OnceLock;

pub const TMUX_GROVE_CLAUDE_STATUS_OPTION: &str = "@grove_claude_status";
const CLAUDE_HOOKS: [(&str, u64); 6] = [
    ("SessionStart", 5),
    ("Stop", 5),
    ("StopFailure", 5),
    ("Notification", 5),
    ("UserPromptSubmit", 5),
    ("SessionEnd", 1),
];
const CLAUDE_HOOK_MATCHER: &str = ".*";

pub fn ensure_installed() {
    static INIT: OnceLock<()> = OnceLock::new();
    INIT.get_or_init(|| {
        if let Err(error) = install() {
            eprintln!("Warning: failed to install Grove Claude hooks: {error}");
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
    remove_file_if_exists(&claude_wrapper)?;
    install_claude_hooks(&home, &grove_hook)?;

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

fn remove_file_if_exists(path: &Path) -> Result<(), String> {
    match std::fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == ErrorKind::NotFound => Ok(()),
        Err(error) => Err(format!("failed to remove {}: {error}", path.display())),
    }
}

fn install_claude_hooks(home: &Path, grove_hook_path: &Path) -> Result<(), String> {
    let claude_dir = home.join(".claude");
    std::fs::create_dir_all(&claude_dir)
        .map_err(|error| format!("failed to create {}: {error}", claude_dir.display()))?;

    let settings_path = claude_dir.join("settings.json");
    let mut settings = load_settings_json(&settings_path)?;
    if merge_grove_hooks(&mut settings, grove_hook_path)? {
        write_json_file(&settings_path, &settings)?;
    }

    Ok(())
}

fn load_settings_json(path: &Path) -> Result<Value, String> {
    match std::fs::read_to_string(path) {
        Ok(content) if content.trim().is_empty() => Ok(Value::Object(Map::new())),
        Ok(content) => serde_json::from_str(&content)
            .map_err(|error| format!("failed to parse {}: {error}", path.display())),
        Err(error) if error.kind() == ErrorKind::NotFound => Ok(Value::Object(Map::new())),
        Err(error) => Err(format!("failed to read {}: {error}", path.display())),
    }
}

fn write_json_file(path: &Path, value: &Value) -> Result<(), String> {
    let content = serde_json::to_string_pretty(value)
        .map_err(|error| format!("failed to serialize {}: {error}", path.display()))?;
    std::fs::write(path, content)
        .map_err(|error| format!("failed to write {}: {error}", path.display()))
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

fn merge_grove_hooks(settings: &mut Value, grove_hook_path: &Path) -> Result<bool, String> {
    let settings_obj = settings
        .as_object_mut()
        .ok_or_else(|| "Claude settings must be a JSON object".to_string())?;
    let hooks_value = settings_obj
        .entry("hooks".to_string())
        .or_insert_with(|| Value::Object(Map::new()));
    let hooks_obj = hooks_value
        .as_object_mut()
        .ok_or_else(|| "Claude settings \"hooks\" must be a JSON object".to_string())?;

    let mut changed = false;
    for (event, timeout) in CLAUDE_HOOKS {
        let command = grove_hook_command(grove_hook_path, event);
        changed |= upsert_grove_hook(hooks_obj, event, &command, timeout)?;
    }

    Ok(changed)
}

fn upsert_grove_hook(
    hooks_obj: &mut Map<String, Value>,
    event: &str,
    command: &str,
    timeout: u64,
) -> Result<bool, String> {
    let event_hooks = hooks_obj
        .entry(event.to_string())
        .or_insert_with(|| Value::Array(Vec::new()));
    let event_hooks = event_hooks
        .as_array_mut()
        .ok_or_else(|| format!("Claude settings hooks.{event} must be an array"))?;
    let desired_hook = json!({
        "type": "command",
        "command": command,
        "timeout": timeout,
    });

    for hook_group in event_hooks.iter_mut() {
        let Some(hook_group) = hook_group.as_object_mut() else {
            continue;
        };
        let Some(hooks) = hook_group.get_mut("hooks").and_then(Value::as_array_mut) else {
            continue;
        };

        for existing_hook in hooks.iter_mut() {
            if managed_hook_matches(existing_hook, command) {
                if *existing_hook != desired_hook {
                    *existing_hook = desired_hook;
                    return Ok(true);
                }
                return Ok(false);
            }
        }
    }

    event_hooks.push(json!({
        "matcher": CLAUDE_HOOK_MATCHER,
        "hooks": [desired_hook],
    }));
    Ok(true)
}

fn managed_hook_matches(hook: &Value, command: &str) -> bool {
    hook.as_object()
        .and_then(|hook| hook.get("command"))
        .and_then(Value::as_str)
        == Some(command)
}

fn grove_hook_command(grove_hook_path: &Path, event: &str) -> String {
    let grove_hook_path = grove_hook_path.to_string_lossy();
    format!("{} claude {event}", shell_quote(grove_hook_path.as_ref()))
}

fn shell_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\"'\"'"))
}

#[cfg(test)]
mod tests {
    use super::{grove_hook_script, merge_grove_hooks, TMUX_GROVE_CLAUDE_STATUS_OPTION};
    use serde_json::json;
    use std::path::Path;

    #[test]
    fn grove_hook_script_updates_claude_status_option() {
        let script = grove_hook_script();

        assert!(script.contains(TMUX_GROVE_CLAUDE_STATUS_OPTION));
        assert!(script.contains("StopFailure|Notification"));
        assert!(script.contains("SessionEnd|cleanup"));
    }

    #[test]
    fn merge_grove_hooks_populates_expected_claude_events() {
        let mut settings = json!({});
        let hook_path = Path::new("/tmp/grove-hook");
        let changed = merge_grove_hooks(&mut settings, hook_path).unwrap();

        assert!(changed);
        assert_eq!(
            settings["hooks"]["SessionStart"][0]["hooks"][0]["command"].as_str(),
            Some("'/tmp/grove-hook' claude SessionStart")
        );
        assert_eq!(
            settings["hooks"]["SessionEnd"][0]["hooks"][0]["timeout"].as_u64(),
            Some(1)
        );
    }

    #[test]
    fn merge_grove_hooks_preserves_existing_hooks_and_is_idempotent() {
        let mut settings = json!({
            "model": "sonnet",
            "hooks": {
                "SessionStart": [
                    {
                        "matcher": "^git",
                        "hooks": [
                            {
                                "type": "command",
                                "command": "echo user-hook"
                            }
                        ]
                    }
                ]
            }
        });
        let hook_path = Path::new("/tmp/grove-hook");

        assert!(merge_grove_hooks(&mut settings, hook_path).unwrap());
        assert!(!merge_grove_hooks(&mut settings, hook_path).unwrap());
        assert_eq!(settings["model"].as_str(), Some("sonnet"));
        assert_eq!(
            settings["hooks"]["SessionStart"].as_array().unwrap().len(),
            2
        );
        assert_eq!(
            settings["hooks"]["SessionStart"][0]["hooks"][0]["command"].as_str(),
            Some("echo user-hook")
        );
        assert_eq!(
            settings["hooks"]["SessionStart"][1]["hooks"][0]["command"].as_str(),
            Some("'/tmp/grove-hook' claude SessionStart")
        );
    }

    #[test]
    fn merge_grove_hooks_updates_existing_managed_hook_in_place() {
        let mut settings = json!({
            "hooks": {
                "SessionStart": [
                    {
                        "matcher": ".*",
                        "hooks": [
                            {
                                "type": "command",
                                "command": "'/tmp/grove-hook' claude SessionStart",
                                "timeout": 99
                            }
                        ]
                    }
                ]
            }
        });

        assert!(merge_grove_hooks(&mut settings, Path::new("/tmp/grove-hook")).unwrap());
        assert_eq!(
            settings["hooks"]["SessionStart"].as_array().unwrap().len(),
            1
        );
        assert_eq!(
            settings["hooks"]["SessionStart"][0]["hooks"][0]["timeout"].as_u64(),
            Some(5)
        );
    }
}
