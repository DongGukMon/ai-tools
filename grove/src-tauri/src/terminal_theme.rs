use serde::{Deserialize, Serialize};
use std::process::Command;

const DEFAULT_TERMINAL_FONT_FAMILY: &str =
    "\"SF Mono\", \"Monaco\", \"Menlo\", \"Consolas\", \"Liberation Mono\", \"DejaVu Sans Mono\", \"Noto Sans Mono CJK KR\", \"Noto Sans Mono CJK SC\", \"Noto Sans Mono CJK TC\", \"Noto Sans Mono CJK JP\", monospace";

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
            font_family: DEFAULT_TERMINAL_FONT_FAMILY.to_string(),
            font_size: 12.0,
        }
    }
}

/// Detected Terminal.app colors (bg, fg, cursor as hex strings).
struct TerminalColors {
    bg: String,
    fg: String,
    cursor: String,
    bg_opacity: f64,
}

/// Use AppleScript to query Terminal.app's scripting interface for the current
/// profile's colors. Terminal.app exposes colors as {r, g, b} lists with
/// 16-bit values (0-65535). We divide by 257 to get 8-bit (0-255) values.
fn detect_terminal_colors() -> Option<TerminalColors> {
    let profile = get_default_profile_name()?;

    let script = format!(
        r#"
        tell application "Terminal"
            set prof to settings set "{profile}"
            set bgColor to background color of prof
            set fgColor to normal text color of prof
            set crColor to cursor color of prof
            set bgR to (item 1 of bgColor) / 257
            set bgG to (item 2 of bgColor) / 257
            set bgB to (item 3 of bgColor) / 257
            set fgR to (item 1 of fgColor) / 257
            set fgG to (item 2 of fgColor) / 257
            set fgB to (item 3 of fgColor) / 257
            set crR to (item 1 of crColor) / 257
            set crG to (item 2 of crColor) / 257
            set crB to (item 3 of crColor) / 257
            set bgOpacity to background color opacity of prof
            return (bgR as integer) & "," & (bgG as integer) & "," & (bgB as integer) & "|" & (fgR as integer) & "," & (fgG as integer) & "," & (fgB as integer) & "|" & (crR as integer) & "," & (crG as integer) & "," & (crB as integer) & "|" & bgOpacity
        end tell
        "#
    );

    let output = Command::new("osascript")
        .args(["-e", &script])
        .output()
        .ok()?;

    if !output.status.success() {
        return None;
    }

    let result = String::from_utf8_lossy(&output.stdout).trim().to_string();
    // Parse "r,g,b|r,g,b|r,g,b|opacity"
    let parts: Vec<&str> = result.split('|').collect();
    if parts.len() < 3 {
        return None;
    }

    let bg = parse_rgb(parts[0])?;
    let fg = parse_rgb(parts[1])?;
    let cursor = parse_rgb(parts[2])?;
    let bg_opacity = parts
        .get(3)
        .and_then(|s| s.trim().parse::<f64>().ok())
        .unwrap_or(1.0);

    Some(TerminalColors { bg, fg, cursor, bg_opacity })
}

/// Try to read the 16-color ANSI palette from Terminal.app via AppleScript.
/// Returns a Vec of 16 hex color strings in standard ANSI order, or None.
fn detect_ansi_colors() -> Option<Vec<String>> {
    let profile = get_default_profile_name()?;

    // Terminal.app scripting dictionary exposes ANSI colors as individual
    // properties on the settings set. We query all 16 in one script call.
    let script = format!(
        r#"
        tell application "Terminal"
            set prof to settings set "{profile}"
            set colorNames to {{ANSI black color, ANSI red color, ANSI green color, ANSI yellow color, ANSI blue color, ANSI magenta color, ANSI cyan color, ANSI white color, ANSI bright black color, ANSI bright red color, ANSI bright green color, ANSI bright yellow color, ANSI bright blue color, ANSI bright magenta color, ANSI bright cyan color, ANSI bright white color}}
            set out to ""
            repeat with c in colorNames
                set cv to c of prof
                set r to (item 1 of cv) / 257
                set g to (item 2 of cv) / 257
                set b to (item 3 of cv) / 257
                if out is not "" then set out to out & "|"
                set out to out & (r as integer) & "," & (g as integer) & "," & (b as integer)
            end repeat
            return out
        end tell
        "#
    );

    let output = Command::new("osascript")
        .args(["-e", &script])
        .output()
        .ok()?;

    if !output.status.success() {
        return None;
    }

    let result = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let parts: Vec<&str> = result.split('|').collect();
    if parts.len() < 16 {
        return None;
    }

    let colors: Option<Vec<String>> = parts.iter().take(16).map(|p| parse_rgb(p)).collect();
    colors
}

/// Parse a comma-separated "r,g,b" string (0-255 values) into a "#rrggbb" hex string.
fn parse_rgb(s: &str) -> Option<String> {
    let nums: Vec<u8> = s
        .split(',')
        .filter_map(|n| n.trim().parse::<u8>().ok())
        .collect();
    if nums.len() == 3 {
        Some(format!("#{:02x}{:02x}{:02x}", nums[0], nums[1], nums[2]))
    } else {
        None
    }
}

/// Blend a "#rrggbb" color toward white based on inverse opacity (0.0-1.0).
/// Simulates what reduced terminal opacity looks like (lighter background).
fn blend_with_opacity(hex: &str, opacity: f64) -> String {
    let hex = hex.trim_start_matches('#');
    if hex.len() < 6 {
        return format!("#{}", hex);
    }
    let r = u8::from_str_radix(&hex[0..2], 16).unwrap_or(0) as f64;
    let g = u8::from_str_radix(&hex[2..4], 16).unwrap_or(0) as f64;
    let b = u8::from_str_radix(&hex[4..6], 16).unwrap_or(0) as f64;
    let a = opacity.clamp(0.0, 1.0);
    // Alpha composite: fg * alpha + white * (1 - alpha)
    let br = (r * a + 255.0 * (1.0 - a)) as u8;
    let bg = (g * a + 255.0 * (1.0 - a)) as u8;
    let bb = (b * a + 255.0 * (1.0 - a)) as u8;
    format!("#{:02x}{:02x}{:02x}", br, bg, bb)
}

/// Compute perceived luminance (0-255) from a "#rrggbb" hex color.
/// Uses the standard BT.601 luma formula.
fn hex_luminance(hex: &str) -> u8 {
    let hex = hex.trim_start_matches('#');
    if hex.len() < 6 {
        return 128; // neutral fallback
    }
    let r = u8::from_str_radix(&hex[0..2], 16).unwrap_or(128) as f64;
    let g = u8::from_str_radix(&hex[2..4], 16).unwrap_or(128) as f64;
    let b = u8::from_str_radix(&hex[4..6], 16).unwrap_or(128) as f64;
    (0.299 * r + 0.587 * g + 0.114 * b) as u8
}

/// Light-theme ANSI color palette. Used when the detected background is light.
fn light_ansi_palette() -> [&'static str; 16] {
    [
        "#000000", // black
        "#c91b00", // red
        "#00a600", // green
        "#c7c400", // yellow
        "#0225c7", // blue
        "#c930c7", // magenta
        "#00a6b2", // cyan
        "#c7c7c7", // white
        "#686868", // bright black
        "#ff6e67", // bright red
        "#5ffa68", // bright green
        "#fffc67", // bright yellow
        "#6871ff", // bright blue
        "#ff77ff", // bright magenta
        "#60fdff", // bright cyan
        "#ffffff", // bright white
    ]
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
                if s.is_empty() {
                    None
                } else {
                    Some(s)
                }
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
                String::from_utf8_lossy(&o.stdout)
                    .trim()
                    .parse::<f64>()
                    .ok()
            } else {
                None
            }
        });

    (font_name, font_size)
}

/// Detect the Terminal.app theme. Returns defaults if detection fails.
pub fn detect_terminal_theme() -> TerminalTheme {
    let mut theme = TerminalTheme::default();

    // 1. Try AppleScript color detection for bg/fg/cursor
    crate::logger::grove_info!("theme", "detecting terminal colors...");
    if let Some(colors) = detect_terminal_colors() {
        crate::logger::grove_info!("theme", &format!("colors detected: bg={} fg={} cursor={} opacity={}", colors.bg, colors.fg, colors.cursor, colors.bg_opacity));
        // Blend background with black if opacity < 1.0
        if colors.bg_opacity < 1.0 {
            theme.background = blend_with_opacity(&colors.bg, colors.bg_opacity);
        } else {
            theme.background = colors.bg.clone();
        }
        theme.foreground = colors.fg;
        theme.cursor = colors.cursor;

        // 2. Try reading the full ANSI palette via AppleScript
        if let Some(ansi) = detect_ansi_colors() {
            // ansi is ordered: black, red, green, yellow, blue, magenta, cyan, white,
            //                  bright_black .. bright_white
            if ansi.len() >= 16 {
                theme.black = ansi[0].clone();
                theme.red = ansi[1].clone();
                theme.green = ansi[2].clone();
                theme.yellow = ansi[3].clone();
                theme.blue = ansi[4].clone();
                theme.magenta = ansi[5].clone();
                theme.cyan = ansi[6].clone();
                theme.white = ansi[7].clone();
                theme.bright_black = ansi[8].clone();
                theme.bright_red = ansi[9].clone();
                theme.bright_green = ansi[10].clone();
                theme.bright_yellow = ansi[11].clone();
                theme.bright_blue = ansi[12].clone();
                theme.bright_magenta = ansi[13].clone();
                theme.bright_cyan = ansi[14].clone();
                theme.bright_white = ansi[15].clone();
            }
        } else {
            // 3. ANSI detection failed — pick a palette based on background luminance
            let lum = hex_luminance(&theme.background);
            if lum >= 128 {
                // Light background: use light-theme ANSI palette
                let p = light_ansi_palette();
                theme.black = p[0].to_string();
                theme.red = p[1].to_string();
                theme.green = p[2].to_string();
                theme.yellow = p[3].to_string();
                theme.blue = p[4].to_string();
                theme.magenta = p[5].to_string();
                theme.cyan = p[6].to_string();
                theme.white = p[7].to_string();
                theme.bright_black = p[8].to_string();
                theme.bright_red = p[9].to_string();
                theme.bright_green = p[10].to_string();
                theme.bright_yellow = p[11].to_string();
                theme.bright_blue = p[12].to_string();
                theme.bright_magenta = p[13].to_string();
                theme.bright_cyan = p[14].to_string();
                theme.bright_white = p[15].to_string();
            }
            // Dark background: keep the grove-dark defaults from Default impl
        }
    } else {
        crate::logger::grove_warn!("theme", "color detection FAILED — using defaults");
    }

    // 4. Always try to detect font settings
    let (font_name, font_size) = read_font_settings();
    if let Some(name) = font_name {
        theme.font_family = name;
    }
    if let Some(size) = font_size {
        theme.font_size = size;
    }

    theme
}
