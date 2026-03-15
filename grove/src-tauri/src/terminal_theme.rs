use base64::Engine;
use serde::{Deserialize, Serialize};
use std::process::Command;

const DEFAULT_TERMINAL_FONT_FAMILY: &str =
    "\"SF Mono\", \"Monaco\", \"Menlo\", \"Consolas\", \"Liberation Mono\", \"DejaVu Sans Mono\", \"Noto Sans Mono CJK KR\", \"Noto Sans Mono CJK SC\", \"Noto Sans Mono CJK TC\", \"Noto Sans Mono CJK JP\", monospace";

const FALLBACK_PROFILE: &str = "Basic";

/// ANSI color key names in the plist, in standard ANSI order.
const ANSI_KEYS: [&str; 16] = [
    "ANSIBlackColor",
    "ANSIRedColor",
    "ANSIGreenColor",
    "ANSIYellowColor",
    "ANSIBlueColor",
    "ANSIMagentaColor",
    "ANSICyanColor",
    "ANSIWhiteColor",
    "ANSIBrightBlackColor",
    "ANSIBrightRedColor",
    "ANSIBrightGreenColor",
    "ANSIBrightYellowColor",
    "ANSIBrightBlueColor",
    "ANSIBrightMagentaColor",
    "ANSIBrightCyanColor",
    "ANSIBrightWhiteColor",
];

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

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DetectedThemeResult {
    pub theme: TerminalTheme,
    pub detected: bool,
}

// ── Plist helpers ──

/// Export Terminal.app preferences as XML string.
fn export_terminal_plist() -> Option<String> {
    let output = Command::new("defaults")
        .args(["export", "com.apple.Terminal", "-"])
        .output()
        .ok()?;

    if !output.status.success() {
        return None;
    }

    Some(String::from_utf8_lossy(&output.stdout).to_string())
}

/// Get the default profile name.
fn get_default_profile_name() -> Option<String> {
    let output = Command::new("defaults")
        .args(["read", "com.apple.Terminal", "Default Window Settings"])
        .output()
        .ok()?;

    if !output.status.success() {
        return None;
    }

    let name = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if name.is_empty() { None } else { Some(name) }
}

/// Extract NSRGB float components from a plist NSColor <data> block.
/// Returns (R, G, B) as 0.0-1.0 floats, and optional A (alpha).
fn extract_nscolor(xml: &str, profile: &str, key: &str) -> Option<(f64, f64, f64, Option<f64>)> {
    let profile_key = format!("<key>{}</key>", profile);
    let profile_pos = xml.find(&profile_key)?;
    let after_profile = &xml[profile_pos..];

    let color_key = format!("<key>{}</key>", key);
    let key_pos = after_profile.find(&color_key)?;
    let after_key = &after_profile[key_pos..];

    let data_start = after_key.find("<data>")? + 6;
    let data_end = after_key.find("</data>")?;
    let b64: String = after_key[data_start..data_end]
        .chars()
        .filter(|c| !c.is_whitespace())
        .collect();

    let bytes = base64::engine::general_purpose::STANDARD.decode(&b64).ok()?;

    // Find NSRGB marker, then scan for the float string
    let marker = b"NSRGB";
    let marker_pos = bytes.windows(marker.len()).position(|w| w == marker)?;
    let after_marker = &bytes[marker_pos + marker.len()..];

    let float_str = after_marker.iter().enumerate().find_map(|(i, &b)| {
        if b.is_ascii_digit() {
            let rest = &after_marker[i..];
            let end = rest
                .iter()
                .position(|&c| c == 0 || c < 0x20)
                .unwrap_or(rest.len());
            let s = std::str::from_utf8(&rest[..end]).ok()?;
            let parts: Vec<&str> = s.split_whitespace().collect();
            if parts.len() >= 3 && parts.iter().all(|p| p.parse::<f64>().is_ok()) {
                Some(s.to_string())
            } else {
                None
            }
        } else {
            None
        }
    })?;

    let parts: Vec<f64> = float_str
        .split_whitespace()
        .filter_map(|p| p.parse::<f64>().ok())
        .collect();

    if parts.len() >= 3 {
        let alpha = if parts.len() >= 4 { Some(parts[3]) } else { None };
        Some((parts[0], parts[1], parts[2], alpha))
    } else {
        None
    }
}

/// Convert 0.0-1.0 RGB floats to "#rrggbb" hex.
fn floats_to_hex(r: f64, g: f64, b: f64) -> String {
    let ri = (r.clamp(0.0, 1.0) * 255.0).round() as u8;
    let gi = (g.clamp(0.0, 1.0) * 255.0).round() as u8;
    let bi = (b.clamp(0.0, 1.0) * 255.0).round() as u8;
    format!("#{:02x}{:02x}{:02x}", ri, gi, bi)
}

/// Read a color from the profile, falling back to the Basic profile.
fn read_color(xml: &str, profile: &str, key: &str) -> Option<(f64, f64, f64, Option<f64>)> {
    extract_nscolor(xml, profile, key)
        .or_else(|| extract_nscolor(xml, FALLBACK_PROFILE, key))
}

/// Read a color as hex, falling back to Basic profile.
fn read_color_hex(xml: &str, profile: &str, key: &str) -> Option<String> {
    read_color(xml, profile, key).map(|(r, g, b, _)| floats_to_hex(r, g, b))
}

// ── Blend ──

/// Blend a "#rrggbb" color toward white using a softened alpha curve.
fn blend_with_opacity(hex: &str, opacity: f64) -> String {
    let hex = hex.trim_start_matches('#');
    if hex.len() < 6 {
        return format!("#{}", hex);
    }
    let r = u8::from_str_radix(&hex[0..2], 16).unwrap_or(0) as f64;
    let g = u8::from_str_radix(&hex[2..4], 16).unwrap_or(0) as f64;
    let b = u8::from_str_radix(&hex[4..6], 16).unwrap_or(0) as f64;
    let a = opacity.clamp(0.0, 1.0).powf(0.3);
    let br = (r * a + 255.0 * (1.0 - a)) as u8;
    let bg = (g * a + 255.0 * (1.0 - a)) as u8;
    let bb = (b * a + 255.0 * (1.0 - a)) as u8;
    format!("#{:02x}{:02x}{:02x}", br, bg, bb)
}

// ── Font detection ──

/// Read font settings from Terminal.app preferences.
fn read_font_settings() -> (Option<String>, Option<f64>) {
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

// ── Main detection ──

pub fn detect_terminal_theme() -> DetectedThemeResult {
    let mut theme = TerminalTheme::default();

    let profile = match get_default_profile_name() {
        Some(p) => {
            crate::logger::grove_info!("theme", &format!("profile: {}", p));
            p
        }
        None => {
            crate::logger::grove_warn!("theme", "failed to read default profile name");
            return DetectedThemeResult { theme, detected: false };
        }
    };

    let xml = match export_terminal_plist() {
        Some(x) => x,
        None => {
            crate::logger::grove_warn!("theme", "failed to export Terminal.app plist");
            return DetectedThemeResult { theme, detected: false };
        }
    };

    // Background (with alpha blending)
    let bg_detected = if let Some((r, g, b, alpha)) = read_color(&xml, &profile, "BackgroundColor") {
        let hex = floats_to_hex(r, g, b);
        let a = alpha.unwrap_or(1.0);
        crate::logger::grove_info!("theme", &format!("bg: {} alpha: {:.4}", hex, a));
        if a < 1.0 {
            theme.background = blend_with_opacity(&hex, a);
        } else {
            theme.background = hex;
        }
        true
    } else {
        crate::logger::grove_warn!("theme", "BackgroundColor not found in plist");
        false
    };

    // Foreground
    if let Some(hex) = read_color_hex(&xml, &profile, "TextColor") {
        crate::logger::grove_info!("theme", &format!("fg: {}", hex));
        theme.foreground = hex;
    }

    // Cursor (use TextColor as fallback since CursorColor often doesn't exist)
    if let Some(hex) = read_color_hex(&xml, &profile, "CursorColor") {
        theme.cursor = hex;
    }

    // ANSI 16 colors: try profile first, fallback to Basic
    let ansi_fields: [&mut String; 16] = {
        let t = &mut theme;
        // This unsafe-free pattern requires individual borrows
        // Use a helper to collect mutable refs
        unsafe {
            let ptr = t as *mut TerminalTheme;
            [
                &mut (*ptr).black,
                &mut (*ptr).red,
                &mut (*ptr).green,
                &mut (*ptr).yellow,
                &mut (*ptr).blue,
                &mut (*ptr).magenta,
                &mut (*ptr).cyan,
                &mut (*ptr).white,
                &mut (*ptr).bright_black,
                &mut (*ptr).bright_red,
                &mut (*ptr).bright_green,
                &mut (*ptr).bright_yellow,
                &mut (*ptr).bright_blue,
                &mut (*ptr).bright_magenta,
                &mut (*ptr).bright_cyan,
                &mut (*ptr).bright_white,
            ]
        }
    };

    let mut ansi_count = 0;
    for (i, key) in ANSI_KEYS.iter().enumerate() {
        if let Some(hex) = read_color_hex(&xml, &profile, key) {
            *ansi_fields[i] = hex;
            ansi_count += 1;
        }
    }
    crate::logger::grove_info!("theme", &format!("ANSI colors: {}/16 from plist", ansi_count));

    // Font settings
    let (font_name, font_size) = read_font_settings();
    if let Some(name) = font_name {
        theme.font_family = name;
    }
    if let Some(size) = font_size {
        theme.font_size = size;
    }

    DetectedThemeResult {
        theme,
        detected: bg_detected,
    }
}
