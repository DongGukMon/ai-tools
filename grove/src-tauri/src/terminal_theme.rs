use serde::{Deserialize, Serialize};
use std::process::Command;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalTheme {
    pub background: String,
    pub foreground: String,
    pub cursor: String,
    pub black: String,
    pub red: String,
    pub green: String,
    pub yellow: String,
    pub blue: String,
    pub magenta: String,
    pub cyan: String,
    pub white: String,
    pub bright_black: String,
    pub bright_red: String,
    pub bright_green: String,
    pub bright_yellow: String,
    pub bright_blue: String,
    pub bright_magenta: String,
    pub bright_cyan: String,
    pub bright_white: String,
    pub font_family: String,
    pub font_size: f64,
}

impl Default for TerminalTheme {
    fn default() -> Self {
        Self {
            background: "#1a2024".to_string(),
            foreground: "#d4dbd8".to_string(),
            cursor: "#a8d8b8".to_string(),
            black: "#1a2024".to_string(),
            red: "#e06c75".to_string(),
            green: "#98c379".to_string(),
            yellow: "#e5c07b".to_string(),
            blue: "#61afef".to_string(),
            magenta: "#c678dd".to_string(),
            cyan: "#56b6c2".to_string(),
            white: "#d4dbd8".to_string(),
            bright_black: "#5c6370".to_string(),
            bright_red: "#e88388".to_string(),
            bright_green: "#a8d8b8".to_string(),
            bright_yellow: "#f0d89d".to_string(),
            bright_blue: "#7ec8f0".to_string(),
            bright_magenta: "#d49ee6".to_string(),
            bright_cyan: "#6fcfdb".to_string(),
            bright_white: "#ecf0ed".to_string(),
            font_family: "Menlo, monospace".to_string(),
            font_size: 12.0,
        }
    }
}

/// Read a color key from Terminal.app's default profile via `defaults read`.
/// Returns hex color string or None.
fn read_terminal_color(profile_name: &str, key: &str) -> Option<String> {
    let output = Command::new("defaults")
        .args(["read", "com.apple.Terminal", profile_name])
        .output()
        .ok()?;

    if !output.status.success() {
        return None;
    }

    let text = String::from_utf8_lossy(&output.stdout);

    // Terminal.app stores colors as NSArchiver data in the plist.
    // The `defaults read` output for the profile is a dict. We look for
    // color keys that contain RGB float values.
    // Since NSArchiver colors are opaque binary, we fall back to reading
    // known profile attributes when available.
    let _ = (text, key);
    None
}

/// Get the default profile name from Terminal.app preferences.
fn get_default_profile_name() -> Option<String> {
    let output = Command::new("defaults")
        .args(["read", "com.apple.Terminal", "Default Window Settings"])
        .output()
        .ok()?;

    if !output.status.success() {
        return None;
    }

    let name = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if name.is_empty() {
        None
    } else {
        Some(name)
    }
}

/// Read font settings from Terminal.app.
fn read_font_settings() -> (Option<String>, Option<f64>) {
    // Try reading font name
    let font_name = Command::new("defaults")
        .args(["read", "com.apple.Terminal", "NSFont"])
        .output()
        .ok()
        .and_then(|o| {
            if o.status.success() {
                let s = String::from_utf8_lossy(&o.stdout).trim().to_string();
                if s.is_empty() { None } else { Some(s) }
            } else {
                None
            }
        });

    // Try reading font size
    let font_size = Command::new("defaults")
        .args(["read", "com.apple.Terminal", "NSFontSize"])
        .output()
        .ok()
        .and_then(|o| {
            if o.status.success() {
                String::from_utf8_lossy(&o.stdout).trim().parse::<f64>().ok()
            } else {
                None
            }
        });

    (font_name, font_size)
}

/// Detect the Terminal.app theme. Returns defaults if detection fails.
pub fn detect_terminal_theme() -> TerminalTheme {
    let mut theme = TerminalTheme::default();

    // Try to get the default profile name for potential future color extraction
    let _profile_name = get_default_profile_name();

    // Try reading font settings
    let (font_name, font_size) = read_font_settings();
    if let Some(name) = font_name {
        theme.font_family = name;
    }
    if let Some(size) = font_size {
        theme.font_size = size;
    }

    // Terminal.app colors are stored as NSArchiver binary data in the plist,
    // which makes them non-trivial to parse via `defaults read`.
    // For now, we use sensible dark theme defaults that match common Terminal.app themes.
    // W1 provides the infrastructure; color extraction can be enhanced later
    // if a specific profile's colors need to be matched exactly.
    let _ = read_terminal_color("", "");

    theme
}
