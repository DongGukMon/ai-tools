use crate::process_env::enriched_path;
use serde::{Deserialize, Serialize};
use std::ffi::OsStr;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BuddyCompanion {
    pub species: String,
    pub rarity: String,
    pub eye: String,
    pub hat: String,
    pub shiny: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BuddyConfig {
    pub salt: String,
    pub companion: BuddyCompanion,
    pub patched_at: String,
    #[serde(default)]
    pub upgrade_robot: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub original_robot_sprite: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BuddyStatus {
    pub binary_path: String,
    pub current_salt: Option<String>,
    pub current_companion: Option<BuddyCompanion>,
    pub saved_config: Option<BuddyConfig>,
    pub user_id: String,
    pub robot_upgraded: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BuddySearchFilter {
    pub species: Option<String>,
    pub rarity: Option<String>,
    pub eye: Option<String>,
    pub hat: Option<String>,
    pub shiny: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BuddySearchResult {
    pub salt: String,
    pub companion: BuddyCompanion,
}

// ---------------------------------------------------------------------------
// Config I/O (reuses grove-core config utilities)
// ---------------------------------------------------------------------------

fn buddy_config_path() -> PathBuf {
    crate::config::grove_data_path("buddy.json")
        .unwrap_or_else(|_| PathBuf::from(".grove/buddy.json"))
}

pub fn load_buddy_config() -> Option<BuddyConfig> {
    let path = buddy_config_path();
    if !path.exists() {
        return None;
    }
    let content = fs::read_to_string(&path).ok()?;
    serde_json::from_str(&content).ok()
}

pub fn save_buddy_config(config: &BuddyConfig) -> Result<(), String> {
    crate::config::save_json_file(&buddy_config_path(), config)
}

// ---------------------------------------------------------------------------
// Binary operations
// ---------------------------------------------------------------------------

fn is_executable_file(path: &Path) -> bool {
    let Ok(metadata) = fs::metadata(path) else {
        return false;
    };
    if !metadata.is_file() {
        return false;
    }

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        metadata.permissions().mode() & 0o111 != 0
    }

    #[cfg(not(unix))]
    {
        true
    }
}

fn path_contains_grove(path: &Path) -> bool {
    path.to_string_lossy().contains(".grove")
}

fn should_skip_binary_path(path: &Path, skip_grove_paths: bool) -> bool {
    skip_grove_paths && path_contains_grove(path)
}

fn find_binary_in_path(
    binary_name: &str,
    path_value: &str,
    skip_grove_paths: bool,
) -> Option<String> {
    for dir in std::env::split_paths(OsStr::new(path_value)) {
        let candidate = dir.join(binary_name);
        if !is_executable_file(&candidate) || should_skip_binary_path(&candidate, skip_grove_paths)
        {
            continue;
        }

        let resolved = fs::canonicalize(&candidate).unwrap_or(candidate);
        if should_skip_binary_path(&resolved, skip_grove_paths) {
            continue;
        }

        let resolved = resolved.to_string_lossy().trim().to_string();
        if !resolved.is_empty() {
            return Some(resolved);
        }
    }

    None
}

pub fn find_claude_binary() -> Result<String, String> {
    find_binary_in_path("claude", enriched_path(), true)
        .ok_or_else(|| "Claude binary not found in PATH".to_string())
}

/// Detect salt from an already-loaded binary buffer.
fn detect_salt_from_buf(data: &[u8]) -> Option<String> {
    let anchor = b"{common:5,uncommon:15,rare:25,epic:35,legendary:50}";
    let anchor_pos = data.windows(anchor.len()).position(|w| w == anchor)?;

    let scan_start = anchor_pos.saturating_sub(200);
    let region = &data[scan_start..anchor_pos];
    let eq_quote = b"=\"";
    let mut salt: Option<String> = None;

    for i in 0..region.len() {
        if i + 2 + 15 + 1 > region.len() {
            break;
        }
        if &region[i..i + 2] == eq_quote {
            let candidate = &region[i + 2..i + 2 + 15];
            if candidate
                .iter()
                .all(|&b| b >= 0x20 && b <= 0x7E && b != b'"')
                && i + 2 + 15 < region.len()
                && region[i + 2 + 15] == b'"'
            {
                salt = Some(String::from_utf8_lossy(candidate).to_string());
            }
        }
    }

    let found = salt?;
    let count = data
        .windows(found.len())
        .filter(|w| *w == found.as_bytes())
        .count();
    if count >= 3 {
        Some(found)
    } else {
        None
    }
}

/// Public wrapper: reads binary and detects salt.
pub fn detect_salt(binary_path: &str) -> Result<Option<String>, String> {
    let data = read_binary(binary_path)?;
    Ok(detect_salt_from_buf(&data))
}

fn read_binary(binary_path: &str) -> Result<Vec<u8>, String> {
    fs::read(binary_path).map_err(|e| format!("Failed to read binary {binary_path}: {e}"))
}

/// Atomically write data to path (temp + rename + codesign).
fn atomic_write_and_sign(binary_path: &str, data: &[u8]) -> Result<(), String> {
    let bin_path = PathBuf::from(binary_path);
    let temp_path = bin_path.with_extension("buddy.tmp");
    fs::write(&temp_path, data).map_err(|e| format!("Failed to write temp: {e}"))?;
    let meta = fs::metadata(&bin_path).map_err(|e| format!("Failed to read metadata: {e}"))?;
    fs::set_permissions(&temp_path, meta.permissions())
        .map_err(|e| format!("Failed to set permissions: {e}"))?;
    fs::rename(&temp_path, &bin_path).map_err(|e| format!("Failed to rename: {e}"))?;
    let _ = Command::new("codesign")
        .args(["-f", "-s", "-", binary_path])
        .output();
    Ok(())
}

/// Replace all occurrences of `old` with `new` in buffer. Returns replacement count.
fn replace_in_buf(data: &mut [u8], old: &[u8], new: &[u8]) -> u32 {
    let mut count = 0u32;
    let mut i = 0;
    while i + old.len() <= data.len() {
        if &data[i..i + old.len()] == old {
            data[i..i + new.len()].copy_from_slice(new);
            count += 1;
            i += new.len();
        } else {
            i += 1;
        }
    }
    count
}

/// Patches all occurrences of `old_salt` with `new_salt` in the binary.
pub fn patch_binary(binary_path: &str, old_salt: &str, new_salt: &str) -> Result<u32, String> {
    if old_salt.len() != new_salt.len() {
        return Err("Salt lengths must match".into());
    }
    let bin_path = PathBuf::from(binary_path);
    let backup_path = bin_path.with_extension("buddy-pick.bak");
    if !backup_path.exists() {
        fs::copy(&bin_path, &backup_path).map_err(|e| format!("Failed to create backup: {e}"))?;
    }

    let mut data = read_binary(binary_path)?;
    let count = replace_in_buf(&mut data, old_salt.as_bytes(), new_salt.as_bytes());
    if count == 0 {
        return Err("Old salt not found in binary".into());
    }
    atomic_write_and_sign(binary_path, &data)?;
    Ok(count)
}

/// Ensures the buddy config is still applied. If the saved salt no longer
/// appears in the binary (e.g. after a Claude update), re-patches.
/// Returns `None` if already good, `Some(message)` if re-patched.
/// Single-read ensure: checks salt + sprite, patches if needed.
pub fn ensure_buddy() -> Result<Option<String>, String> {
    let config = match load_buddy_config() {
        Some(c) => c,
        None => return Ok(None),
    };

    let binary_path = find_claude_binary()?;
    let mut data = read_binary(&binary_path)?;
    let mut msgs: Vec<String> = Vec::new();

    // Check salt
    let has_salt = data
        .windows(config.salt.len())
        .any(|w| w == config.salt.as_bytes());
    if !has_salt {
        let current_salt = detect_salt_from_buf(&data)
            .ok_or("Cannot re-patch: no salt detected in updated binary")?;
        let count = replace_in_buf(&mut data, current_salt.as_bytes(), config.salt.as_bytes());
        msgs.push(format!("salt: {count} replacements"));
    }

    // Check sprite upgrade
    if config.upgrade_robot {
        let claude_bytes = CLAUDE_SPRITE.as_bytes();
        let has_claude = data.windows(claude_bytes.len()).any(|w| w == claude_bytes);
        if !has_claude {
            if let Some((_, original)) = find_robot_section(&data) {
                let count = replace_in_buf(&mut data, &original, claude_bytes);
                msgs.push(format!("sprite: {count} replacements"));
            }
        }
    }

    if msgs.is_empty() {
        return Ok(None);
    }
    atomic_write_and_sign(&binary_path, &data)?;
    Ok(Some(msgs.join("; ")))
}

// ---------------------------------------------------------------------------
// Bun subprocess for hash computation
// ---------------------------------------------------------------------------

pub fn find_bun() -> Result<String, String> {
    find_binary_in_path("bun", enriched_path(), false)
        .ok_or_else(|| "Bun not found in PATH. Install bun: https://bun.sh".to_string())
}

/// Spawns `bun --eval` with inline JS that computes `Bun.hash(userId+salt)`,
/// seeds mulberry32 PRNG, rolls a companion, and outputs JSON.
pub fn roll_companion_via_bun(user_id: &str, salt: &str) -> Result<BuddyCompanion, String> {
    let bun = find_bun()?;

    let js = format!(
        r#"
const SPECIES=["duck","goose","blob","cat","dragon","octopus","owl","penguin","turtle","snail","ghost","axolotl","capybara","cactus","robot","rabbit","mushroom","chonk"];
const RARITIES=["common","uncommon","rare","epic","legendary"];
const RW={{common:60,uncommon:25,rare:10,epic:4,legendary:1}};
const EYES=["\xB7","\u2726","\xD7","\u25C9","@","\xB0"];
const HATS=["none","crown","tophat","propeller","halo","wizard","beanie","tinyduck"];
function mb32(s){{let a=s>>>0;return()=>{{a=(a+0x6d2b79f5)|0;let t=Math.imul(a^(a>>>15),1|a);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296}};}}
function pick(r,a){{return a[Math.floor(r()*a.length)]}}
const h=Number(BigInt(Bun.hash("{user_id}{salt}"))&0xffffffffn);
const r=mb32(h);let roll=r()*100;let rarity="common";
for(const x of RARITIES){{roll-=RW[x];if(roll<0){{rarity=x;break}}}}
const species=pick(r,SPECIES);const eye=pick(r,EYES);
const hat=rarity==="common"?"none":pick(r,HATS);const shiny=r()<0.01;
console.log(JSON.stringify({{species,rarity,eye,hat,shiny}}));
"#
    );

    let output = Command::new(&bun)
        .args(["--eval", &js])
        .output()
        .map_err(|e| format!("Failed to run bun: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Bun companion roll failed: {stderr}"));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    serde_json::from_str(stdout.trim()).map_err(|e| format!("Failed to parse companion JSON: {e}"))
}

/// Spawns `bun --eval` with brute-force JS that generates random 15-char salts
/// until the rolled companion matches the given filter.
pub fn search_buddy_impl(filter: &BuddySearchFilter) -> Result<BuddySearchResult, String> {
    let bun = find_bun()?;
    let user_id = get_user_id();

    let species_filter = filter
        .species
        .as_deref()
        .map(|s| format!("\"{}\"", s))
        .unwrap_or_else(|| "null".into());
    let rarity_filter = filter
        .rarity
        .as_deref()
        .map(|s| format!("\"{}\"", s))
        .unwrap_or_else(|| "null".into());
    let eye_filter = filter
        .eye
        .as_deref()
        .map(|s| format!("\"{}\"", s))
        .unwrap_or_else(|| "null".into());
    let hat_filter = filter
        .hat
        .as_deref()
        .map(|s| format!("\"{}\"", s))
        .unwrap_or_else(|| "null".into());
    let shiny_filter = filter
        .shiny
        .map(|b| if b { "true" } else { "false" })
        .unwrap_or("null");

    let js = format!(
        r#"
const SPECIES=["duck","goose","blob","cat","dragon","octopus","owl","penguin","turtle","snail","ghost","axolotl","capybara","cactus","robot","rabbit","mushroom","chonk"];
const RARITIES=["common","uncommon","rare","epic","legendary"];
const RW={{common:60,uncommon:25,rare:10,epic:4,legendary:1}};
const EYES=["\xB7","\u2726","\xD7","\u25C9","@","\xB0"];
const HATS=["none","crown","tophat","propeller","halo","wizard","beanie","tinyduck"];
const CHARSET="abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_";
function mb32(s){{let a=s>>>0;return()=>{{a=(a+0x6d2b79f5)|0;let t=Math.imul(a^(a>>>15),1|a);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296}};}}
function pick(r,a){{return a[Math.floor(r()*a.length)]}}
function rollCompanion(userId,salt){{
  const h=Number(BigInt(Bun.hash(userId+salt))&0xffffffffn);
  const r=mb32(h);let roll=r()*100;let rarity="common";
  for(const x of RARITIES){{roll-=RW[x];if(roll<0){{rarity=x;break}}}}
  const species=pick(r,SPECIES);const eye=pick(r,EYES);
  const hat=rarity==="common"?"none":pick(r,HATS);const shiny=r()<0.01;
  return{{species,rarity,eye,hat,shiny}};
}}
function randomSalt(){{let s="";for(let i=0;i<15;i++)s+=CHARSET[Math.floor(Math.random()*CHARSET.length)];return s;}}

const filterSpecies = {species_filter};
const filterRarity = {rarity_filter};
const filterEye = {eye_filter};
const filterHat = {hat_filter};
const filterShiny = {shiny_filter};
const userId = "{user_id}";

for (let attempt = 0; attempt < 10000000; attempt++) {{
  const salt = randomSalt();
  const c = rollCompanion(userId, salt);
  if (filterSpecies !== null && c.species !== filterSpecies) continue;
  if (filterRarity !== null && c.rarity !== filterRarity) continue;
  if (filterEye !== null && c.eye !== filterEye) continue;
  if (filterHat !== null && c.hat !== filterHat) continue;
  if (filterShiny !== null && c.shiny !== filterShiny) continue;
  console.log(JSON.stringify({{ salt, companion: c }}));
  process.exit(0);
}}

console.error("No match found after 10M attempts");
process.exit(1);
"#
    );

    let output = Command::new(&bun)
        .args(["--eval", &js])
        .output()
        .map_err(|e| format!("Failed to run bun search: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Buddy search failed: {stderr}"));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    serde_json::from_str(stdout.trim())
        .map_err(|e| format!("Failed to parse search result JSON: {e}"))
}

// ---------------------------------------------------------------------------
// Public API functions
// ---------------------------------------------------------------------------

/// Returns full buddy status: binary path, current salt, current companion,
/// saved config, and user ID.
pub fn get_buddy_status_impl() -> Result<BuddyStatus, String> {
    let binary_path = find_claude_binary()?;
    let data = read_binary(&binary_path)?;
    let user_id = get_user_id();

    let current_salt = detect_salt_from_buf(&data);
    let current_companion = match &current_salt {
        Some(salt) => roll_companion_via_bun(&user_id, salt).ok(),
        None => None,
    };
    let claude_bytes = CLAUDE_SPRITE.as_bytes();
    let robot_upgraded = data.windows(claude_bytes.len()).any(|w| w == claude_bytes);

    Ok(BuddyStatus {
        binary_path,
        current_salt,
        current_companion,
        saved_config: load_buddy_config(),
        user_id,
        robot_upgraded,
    })
}

/// Detects the current salt in the binary, patches it with the new salt,
/// and saves the config with an ISO timestamp.
pub fn apply_buddy_impl(salt: &str, companion: &BuddyCompanion) -> Result<u32, String> {
    let binary_path = find_claude_binary()?;
    let current_salt =
        detect_salt(&binary_path)?.ok_or("No salt detected in binary — cannot patch")?;

    let count = patch_binary(&binary_path, &current_salt, salt)?;

    // Get ISO timestamp via `date -u`
    let patched_at = Command::new("date")
        .arg("-u")
        .arg("+%Y-%m-%dT%H:%M:%SZ")
        .output()
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
        .unwrap_or_else(|_| "unknown".into());

    // Preserve existing upgrade_robot and original_robot_sprite from current config
    let prev = load_buddy_config();
    let config = BuddyConfig {
        salt: salt.to_string(),
        companion: companion.clone(),
        patched_at,
        upgrade_robot: prev.as_ref().map_or(false, |p| p.upgrade_robot),
        original_robot_sprite: prev.and_then(|p| p.original_robot_sprite),
    };

    save_buddy_config(&config)?;

    Ok(count)
}

/// Restores the Claude binary from the `.buddy-pick.bak` backup.
/// Re-signs the binary and removes the buddy config file.
/// Returns `true` if restoration was performed, `false` if no backup exists.
pub fn restore_buddy_impl() -> Result<bool, String> {
    let binary_path = find_claude_binary()?;
    let bin_path = PathBuf::from(&binary_path);
    let backup_path = bin_path.with_extension("buddy-pick.bak");

    if !backup_path.exists() {
        return Ok(false);
    }

    fs::copy(&backup_path, &bin_path).map_err(|e| format!("Failed to restore from backup: {e}"))?;

    // Re-sign
    let _ = Command::new("codesign")
        .args(["-f", "-s", "-", &binary_path])
        .output();

    // Remove buddy config
    let config_path = buddy_config_path();
    if config_path.exists() {
        let _ = fs::remove_file(&config_path);
    }

    Ok(true)
}

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

/// Reads `~/.claude.json` and extracts the user ID from
/// `oauthAccount.accountUuid` or `userID`. Defaults to "anon".
pub fn get_user_id() -> String {
    let path = dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".claude.json");

    let content = match fs::read_to_string(&path) {
        Ok(c) => c,
        Err(_) => return "anon".into(),
    };

    let json: serde_json::Value = match serde_json::from_str(&content) {
        Ok(v) => v,
        Err(_) => return "anon".into(),
    };

    // Try oauthAccount.accountUuid first
    if let Some(uuid) = json
        .get("oauthAccount")
        .and_then(|o| o.get("accountUuid"))
        .and_then(|v| v.as_str())
    {
        if !uuid.is_empty() {
            return uuid.to_string();
        }
    }

    // Fallback to userID
    if let Some(uid) = json.get("userID").and_then(|v| v.as_str()) {
        if !uid.is_empty() {
            return uid.to_string();
        }
    }

    "anon".into()
}

// ---------------------------------------------------------------------------
// Robot sprite upgrade
// ---------------------------------------------------------------------------

/// The Claude art sprite section (253 bytes, matches robot section size).
/// F1: * center, F2: ~ center, F3: ! center. All L0 same width = no jump.
const CLAUDE_SPRITE: &str = concat!(
    "[[\" *  \",\" \\u2590\\u259B\\u2588\\u2588\\u2588\\u259C\\u258C \",",
    "\"\\u259D\\u259C\\u2588\\u2588\\u2588\\u2588\\u2588\\u259B\\u2598\",",
    "\"\\u2598\\u2598 \\u259D\\u259D\",\"\"],",
    "[\" ~  \",\" \\u2590\\u259B\\u2588\\u2588\\u2588\\u259C\\u258C \",",
    "\"\\u259D\\u259C\\u2588\\u2588\\u2588\\u2588\\u2588\\u259B\\u2598\",",
    "\"\\u2598\\u2598 \\u259D\\u259D\",\"\"],",
    "[\" !  \",\" \\u2590\\u259B\\u2588\\u2588\\u2588\\u259C\\u258C \",",
    "\"\\u259D\\u259C\\u2588\\u2588\\u2588\\u2588\\u2588\\u259B\\u2598\",",
    "\"\\u2598\\u2598 \\u259D\\u259D\",\"\"]]",
);

/// Check if the binary currently has the Claude sprite in the robot slot.
pub fn is_robot_upgraded(binary_path: &str) -> Result<bool, String> {
    let data = fs::read(binary_path).map_err(|e| format!("Failed to read binary: {e}"))?;
    let claude_bytes = CLAUDE_SPRITE.as_bytes();
    Ok(data.windows(claude_bytes.len()).any(|w| w == claude_bytes))
}

/// Find the robot sprite section in the binary. Returns (offset, section_bytes).
fn find_robot_section(data: &[u8]) -> Option<(usize, Vec<u8>)> {
    // Search for ik_]:[[  marker followed by robot sprite data
    let marker = b"ik_]:[[";
    let mut pos = 0;
    while let Some(offset) = data[pos..].windows(marker.len()).position(|w| w == marker) {
        let abs = pos + offset;
        let section_start = abs + marker.len() - 2; // start at [[
                                                    // Find matching ]]
        let mut depth: i32 = 0;
        let mut section_end = section_start;
        for i in section_start..data.len().min(section_start + 500) {
            if data[i] == b'[' {
                depth += 1;
            }
            if data[i] == b']' {
                depth -= 1;
                if depth == 0 {
                    section_end = i + 1;
                    break;
                }
            }
        }
        let section = &data[section_start..section_end];
        if section.len() == 253 {
            return Some((section_start, section.to_vec()));
        }
        pos = abs + marker.len();
    }
    None
}

/// Replace the robot sprite with the Claude art in the binary buffer.
/// Returns the original robot section for backup.
fn replace_sprite_in_buffer(data: &mut [u8], old_section: &[u8], new_section: &[u8]) -> u32 {
    let mut count = 0u32;
    let mut pos = 0;
    while pos + old_section.len() <= data.len() {
        if &data[pos..pos + old_section.len()] == old_section {
            data[pos..pos + new_section.len()].copy_from_slice(new_section);
            count += 1;
            pos += new_section.len();
        } else {
            pos += 1;
        }
    }
    count
}

/// Atomically write data to binary path and re-sign.
fn write_and_sign(binary_path: &str, data: &[u8]) -> Result<(), String> {
    let bin_path = PathBuf::from(binary_path);
    let temp_path = bin_path.with_extension("buddy-sprite.tmp");
    fs::write(&temp_path, data).map_err(|e| format!("Failed to write temp: {e}"))?;
    let metadata = fs::metadata(&bin_path).map_err(|e| format!("Failed to read metadata: {e}"))?;
    fs::set_permissions(&temp_path, metadata.permissions())
        .map_err(|e| format!("Failed to set permissions: {e}"))?;
    fs::rename(&temp_path, &bin_path).map_err(|e| format!("Failed to rename: {e}"))?;
    let _ = Command::new("codesign")
        .args(["-f", "-s", "-", binary_path])
        .output();
    Ok(())
}

/// Toggle robot sprite upgrade. When enabled, patches robot → Claude art.
/// When disabled, restores from saved original.
pub fn set_upgrade_robot_impl(enabled: bool) -> Result<bool, String> {
    let binary_path = find_claude_binary()?;
    let mut data = fs::read(&binary_path).map_err(|e| format!("Failed to read binary: {e}"))?;

    let mut config = load_buddy_config().ok_or("No buddy config found")?;
    let claude_bytes = CLAUDE_SPRITE.as_bytes();

    if enabled {
        // Find original robot section
        let already_upgraded = data.windows(claude_bytes.len()).any(|w| w == claude_bytes);
        if already_upgraded {
            config.upgrade_robot = true;
            save_buddy_config(&config)?;
            return Ok(true);
        }

        // Find robot section and save original
        let (_, original) =
            find_robot_section(&data).ok_or("Robot sprite section not found in binary")?;

        config.original_robot_sprite = Some(String::from_utf8_lossy(&original).to_string());
        config.upgrade_robot = true;
        save_buddy_config(&config)?;

        let count = replace_sprite_in_buffer(&mut data, &original, claude_bytes);
        if count == 0 {
            return Err("Failed to replace robot sprite".into());
        }
        write_and_sign(&binary_path, &data)?;
        Ok(true)
    } else {
        // Restore original
        let original = config
            .original_robot_sprite
            .as_ref()
            .ok_or("No saved original robot sprite to restore")?;
        let original_bytes = original.as_bytes();

        let has_claude = data.windows(claude_bytes.len()).any(|w| w == claude_bytes);
        if !has_claude {
            config.upgrade_robot = false;
            save_buddy_config(&config)?;
            return Ok(true);
        }

        let count = replace_sprite_in_buffer(&mut data, claude_bytes, original_bytes);
        if count == 0 {
            return Err("Failed to restore robot sprite".into());
        }
        write_and_sign(&binary_path, &data)?;

        config.upgrade_robot = false;
        save_buddy_config(&config)?;
        Ok(true)
    }
}

/// Ensure robot upgrade is applied after binary update.
pub fn ensure_robot_upgrade(binary_path: &str) -> Result<Option<String>, String> {
    let config = match load_buddy_config() {
        Some(c) => c,
        None => return Ok(None),
    };
    if !config.upgrade_robot {
        return Ok(None);
    }

    let mut data = fs::read(binary_path).map_err(|e| format!("Failed to read binary: {e}"))?;
    let claude_bytes = CLAUDE_SPRITE.as_bytes();

    let already = data.windows(claude_bytes.len()).any(|w| w == claude_bytes);
    if already {
        return Ok(None);
    }

    // Find the (reset) original robot section and patch it
    let (_, original) =
        find_robot_section(&data).ok_or("Robot section not found for re-upgrade")?;

    let count = replace_sprite_in_buffer(&mut data, &original, claude_bytes);
    if count == 0 {
        return Ok(None);
    }
    write_and_sign(binary_path, &data)?;
    Ok(Some(format!(
        "Re-upgraded robot sprite ({count} replacements)"
    )))
}

#[cfg(test)]
mod tests {
    use super::find_binary_in_path;
    use std::fs;
    use std::path::{Path, PathBuf};
    use uuid::Uuid;

    fn temp_test_dir(prefix: &str) -> PathBuf {
        std::env::temp_dir().join(format!("{prefix}-{}", Uuid::new_v4()))
    }

    fn write_executable(path: &Path) {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).unwrap();
        }
        fs::write(path, "#!/bin/sh\nexit 0\n").unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mut perms = fs::metadata(path).unwrap().permissions();
            perms.set_mode(0o755);
            fs::set_permissions(path, perms).unwrap();
        }
    }

    #[test]
    fn find_binary_in_path_skips_grove_wrapper_and_prefers_real_binary() {
        let root = temp_test_dir("grove-buddy-path");
        let grove_bin = root.join(".grove").join("bin");
        let user_bin = root.join("user").join("bin");
        let grove_claude = grove_bin.join("claude");
        let user_claude = user_bin.join("claude");

        write_executable(&grove_claude);
        write_executable(&user_claude);

        let path = std::env::join_paths([grove_bin.as_path(), user_bin.as_path()])
            .unwrap()
            .to_string_lossy()
            .to_string();

        let resolved = find_binary_in_path("claude", &path, true).unwrap();
        assert_eq!(
            resolved,
            fs::canonicalize(&user_claude).unwrap().to_string_lossy()
        );

        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn find_binary_in_path_returns_none_when_only_grove_wrapper_exists() {
        let root = temp_test_dir("grove-buddy-wrapper");
        let grove_bin = root.join(".grove").join("bin");
        let grove_claude = grove_bin.join("claude");

        write_executable(&grove_claude);

        let path = std::env::join_paths([grove_bin.as_path()])
            .unwrap()
            .to_string_lossy()
            .to_string();

        assert_eq!(find_binary_in_path("claude", &path, true), None);

        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn find_binary_in_path_allows_grove_binary_when_skip_is_disabled() {
        let root = temp_test_dir("grove-buddy-bun");
        let grove_bin = root.join(".grove").join("bin");
        let grove_bun = grove_bin.join("bun");

        write_executable(&grove_bun);

        let path = std::env::join_paths([grove_bin.as_path()])
            .unwrap()
            .to_string_lossy()
            .to_string();

        let resolved = find_binary_in_path("bun", &path, false).unwrap();
        assert_eq!(
            resolved,
            fs::canonicalize(&grove_bun).unwrap().to_string_lossy()
        );

        fs::remove_dir_all(root).unwrap();
    }
}
