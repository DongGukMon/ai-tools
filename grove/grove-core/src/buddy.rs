use crate::process_env::enriched_path;
use serde::{Deserialize, Serialize};
use std::ffi::OsStr;
use std::fs;
use std::fs::OpenOptions;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{Duration, Instant, UNIX_EPOCH};

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
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub original_robot_sprites: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_ensured_binary: Option<BuddyBinaryIdentity>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_ensured_revision: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct BuddyBinaryIdentity {
    pub path: String,
    pub size: u64,
    pub modified_unix_secs: u64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub version_hint: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BuddyStatus {
    pub binary_path: String,
    pub supported: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub support_reason: Option<String>,
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

const BUDDY_ENSURE_REVISION: u32 = 2;

// ---------------------------------------------------------------------------
// Config I/O (reuses grove-core config utilities)
// ---------------------------------------------------------------------------

fn buddy_config_path() -> PathBuf {
    crate::config::grove_data_path("buddy.json")
        .unwrap_or_else(|_| PathBuf::from(".grove/buddy.json"))
}

fn buddy_ensure_lock_path() -> PathBuf {
    crate::config::grove_data_path("buddy-ensure.lock")
        .unwrap_or_else(|_| PathBuf::from(".grove/buddy-ensure.lock"))
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

struct BuddyEnsureLock {
    path: PathBuf,
}

impl Drop for BuddyEnsureLock {
    fn drop(&mut self) {
        let _ = fs::remove_file(&self.path);
    }
}

fn acquire_buddy_ensure_lock() -> Result<BuddyEnsureLock, String> {
    let path = buddy_ensure_lock_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("failed to create {}: {error}", parent.display()))?;
    }

    let deadline = Instant::now() + Duration::from_secs(5);
    loop {
        match OpenOptions::new().write(true).create_new(true).open(&path) {
            Ok(mut file) => {
                let _ = writeln!(file, "pid={}", std::process::id());
                return Ok(BuddyEnsureLock { path });
            }
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {
                if Instant::now() >= deadline {
                    return Err(format!(
                        "Timed out waiting for buddy ensure lock {}",
                        path.display()
                    ));
                }
                std::thread::sleep(Duration::from_millis(50));
            }
            Err(error) => {
                return Err(format!(
                    "Failed to acquire buddy ensure lock {}: {error}",
                    path.display()
                ));
            }
        }
    }
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

fn canonicalize_binary_path(binary_path: &str) -> Result<PathBuf, String> {
    fs::canonicalize(binary_path)
        .or_else(|_| Ok(PathBuf::from(binary_path)))
        .map_err(|error: std::io::Error| {
            format!("Failed to resolve binary path {binary_path}: {error}")
        })
}

fn binary_version_hint(path: &Path) -> Option<String> {
    let candidate = path.file_name()?.to_str()?;
    if candidate
        .chars()
        .next()
        .is_some_and(|ch| ch.is_ascii_digit())
    {
        Some(candidate.to_string())
    } else {
        None
    }
}

fn binary_identity(binary_path: &str) -> Result<BuddyBinaryIdentity, String> {
    let path = canonicalize_binary_path(binary_path)?;
    let metadata = fs::metadata(&path)
        .map_err(|error| format!("Failed to stat {}: {error}", path.display()))?;
    let modified_unix_secs = metadata
        .modified()
        .ok()
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_secs())
        .unwrap_or(0);

    Ok(BuddyBinaryIdentity {
        path: path.to_string_lossy().into_owned(),
        size: metadata.len(),
        modified_unix_secs,
        version_hint: binary_version_hint(&path),
    })
}

fn update_last_ensured_binary(config: &mut BuddyConfig, binary_path: &str) -> Result<(), String> {
    config.last_ensured_binary = Some(binary_identity(binary_path)?);
    config.last_ensured_revision = Some(BUDDY_ENSURE_REVISION);
    Ok(())
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

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum BuddyBinaryFormat {
    MachO,
    Unsupported,
}

fn detect_buddy_binary_format(data: &[u8]) -> BuddyBinaryFormat {
    let Some(magic) = data.get(..4) else {
        return BuddyBinaryFormat::Unsupported;
    };

    let is_macho = matches!(
        magic,
        [0xFE, 0xED, 0xFA, 0xCE]
            | [0xCE, 0xFA, 0xED, 0xFE]
            | [0xFE, 0xED, 0xFA, 0xCF]
            | [0xCF, 0xFA, 0xED, 0xFE]
            | [0xCA, 0xFE, 0xBA, 0xBE]
            | [0xBE, 0xBA, 0xFE, 0xCA]
            | [0xCA, 0xFE, 0xBA, 0xBF]
            | [0xBF, 0xBA, 0xFE, 0xCA]
    );

    if is_macho {
        BuddyBinaryFormat::MachO
    } else {
        BuddyBinaryFormat::Unsupported
    }
}

fn buddy_support_for_binary(binary_path: &str) -> Result<(bool, Option<String>), String> {
    let data = read_binary(binary_path)?;
    let format = detect_buddy_binary_format(&data);
    let supported = matches!(format, BuddyBinaryFormat::MachO);
    let reason = if supported {
        None
    } else {
        Some("Buddy is only available for Claude binaries installed as Mach-O executables.".into())
    };

    Ok((supported, reason))
}

fn require_buddy_support(binary_path: &str) -> Result<(), String> {
    let (supported, reason) = buddy_support_for_binary(binary_path)?;
    if supported {
        Ok(())
    } else {
        Err(reason.unwrap_or_else(|| "Buddy is not supported for this Claude binary.".into()))
    }
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
    let binary_path = find_claude_binary()?;
    ensure_buddy_for_binary(&binary_path)
}

pub fn ensure_buddy_for_binary(binary_path: &str) -> Result<Option<String>, String> {
    let mut config = match load_buddy_config() {
        Some(c) => c,
        None => return Ok(None),
    };

    let _lock = acquire_buddy_ensure_lock()?;
    let canonical_binary_path = canonicalize_binary_path(binary_path)?;
    let binary_path = canonical_binary_path.to_string_lossy().into_owned();
    let current_identity = binary_identity(&binary_path)?;
    if config.last_ensured_binary.as_ref() == Some(&current_identity)
        && config.last_ensured_revision == Some(BUDDY_ENSURE_REVISION)
    {
        return Ok(None);
    }

    let (supported, _) = buddy_support_for_binary(&binary_path)?;
    if !supported {
        return Ok(None);
    }

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
        let Some(robot_sections) = find_robot_sections(&data) else {
            return Err("Robot sprite section not found in binary".into());
        };
        let slots = robot_sections.slots;

        if !robot_slots_match(&data) {
            let originals = resolve_robot_original_sections(&config, &slots)?;
            let replacements = replace_robot_sections(&mut data, &slots)?;
            if replacements > 0 {
                store_robot_original_sections(&mut config, &originals);
                msgs.push(format!("sprite: {replacements} replacements"));
            }
        }
    }

    update_last_ensured_binary(&mut config, &binary_path)?;

    if msgs.is_empty() {
        save_buddy_config(&config)?;
        return Ok(None);
    }
    atomic_write_and_sign(&binary_path, &data)?;
    update_last_ensured_binary(&mut config, &binary_path)?;
    save_buddy_config(&config)?;
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
    let (supported, support_reason) = buddy_support_for_binary(&binary_path)?;
    let user_id = get_user_id();

    let current_salt = detect_salt_from_buf(&data);
    let current_companion = match &current_salt {
        Some(salt) => roll_companion_via_bun(&user_id, salt).ok(),
        None => None,
    };
    let robot_upgraded = supported && robot_slots_match(&data);

    Ok(BuddyStatus {
        binary_path,
        supported,
        support_reason,
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
    require_buddy_support(&binary_path)?;
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
        original_robot_sprite: prev.as_ref().and_then(|p| p.original_robot_sprite.clone()),
        original_robot_sprites: prev.map_or_else(Vec::new, |p| p.original_robot_sprites),
        last_ensured_binary: None,
        last_ensured_revision: None,
    };
    let mut config = config;
    update_last_ensured_binary(&mut config, &binary_path)?;

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
    "[[\" *  \",\" ▐▛███▜▌ \",",
    "\"▝▜█████▛▘\",",
    "\"▘▘ ▝▝\",\"\"],",
    "[\" ~  \",\" ▐▛███▜▌ \",",
    "\"▝▜█████▛▘\",",
    "\"▘▘ ▝▝\",\"\"],",
    "[\" !  \",\" ▐▛███▜▌ \",",
    "\"▝▜█████▛▘\",",
    "\"▘▘ ▝▝\",\"\"]]",
);

const JS_ROBOT_SECTION: &str = concat!(
    "[[\"            \",\"   .[||].   \",\"  [ {E}  {E} ]  \",\"  [ ==== ]  \",\"  `------\\xB4  \"],",
    "[\"            \",\"   .[||].   \",\"  [ {E}  {E} ]  \",\"  [ -==- ]  \",\"  `------\\xB4  \"],",
    "[\"     *      \",\"   .[||].   \",\"  [ {E}  {E} ]  \",\"  [ ==== ]  \",\"  `------\\xB4  \"]]",
);

const JS_BAD_CLAUDE_SECTION: &str = concat!(
    "[[\"\\x20           \",\"\\x20  .--.     \",\"  [ CL ]    \",\"   [__]     \",\"\\x20           \"],",
    "[\"\\x20           \",\"\\x20  .--.     \",\"  [ C= ]    \",\"   [__]     \",\"\\x20           \"],",
    "[\"     *      \",\"   .--.     \",\"  [ CL ]    \",\"   [__]     \",\"\\x20           \"]]",
);

const JS_COMPACT_CLAUDE_SECTION: &str = concat!(
    "[[\"\\x20           \",\"\\x20  /^^^^\\\\   \",\" |CLAUDE|  \",\"   \\\\____/   \",\"\\x20           \"],",
    "[\"\\x20           \",\"\\x20  /^^^^\\\\   \",\" |CLAUDE|  \",\"   \\\\_--_/   \",\"\\x20           \"],",
    "[\"     *      \",\"   /^^^^\\\\   \",\" |CLAUDE|  \",\"   \\\\____/   \",\"            \"]]",
);

const JS_CLAUDE_SECTION: &str = concat!(
    "[[\" *  \",\" ▐▛███▜▌ \",",
    "\"▝▜█████▛▘\",",
    "\"▘▘ ▝▝\",\"\"],",
    "[\" ~  \",\" ▐▛███▜▌ \",",
    "\"▝▜█████▛▘\",",
    "\"▘▘ ▝▝\",\"\"],",
    "[\" !  \",\" ▐▛███▜▌ \",",
    "\"▝▜█████▛▘\",",
    "\"▘▘ ▝▝\",\"\"]]",
);

const MACHO_ROBOT_BLANK: &str = "            ";
const MACHO_ROBOT_SPARKLE: &str = "     *      ";
const MACHO_ROBOT_HEAD: &str = "   .[||].   ";
const MACHO_ROBOT_EYES: &str = "  [ {E}  {E} ]  ";
const MACHO_ROBOT_MOUTH_OPEN: &str = "  [ ==== ]  ";
const MACHO_ROBOT_MOUTH_ALT: &str = "  [ -==- ]  ";
const MACHO_ROBOT_TAIL: &[u8] = b"  `------\xB4  ";

const MACHO_CLAUDE_HEAD: &str = "   /^^^^\\   ";
const MACHO_CLAUDE_EYES: &str = "  | CLAUDE |    ";
const MACHO_CLAUDE_MOUTH_OPEN: &str = "  \\______/  ";
const MACHO_CLAUDE_MOUTH_ALT: &str = "  \\__--__/  ";
const MACHO_CLAUDE_TAIL: &str = "   `----'   ";

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum RobotSpriteLayout {
    JsSpriteSection,
    MachORowTable,
    LegacyMarker,
}

#[derive(Clone, Debug, PartialEq, Eq)]
struct RobotSlot {
    offset: usize,
    current_section: Vec<u8>,
    patched_section: Vec<u8>,
    patched_aliases: Vec<Vec<u8>>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
struct RobotSections {
    layout: RobotSpriteLayout,
    slots: Vec<RobotSlot>,
}

fn align_up(value: usize, alignment: usize) -> usize {
    let remainder = value % alignment;
    if remainder == 0 {
        value
    } else {
        value + (alignment - remainder)
    }
}

fn macho_string_entry(payload: &[u8]) -> Vec<u8> {
    let total_len = 16 + align_up(payload.len(), 16);
    let mut entry = vec![0u8; total_len];
    entry[..8].copy_from_slice(&16u64.to_le_bytes());
    entry[8..12].copy_from_slice(&9u32.to_le_bytes());
    entry[12..16].copy_from_slice(&(payload.len() as u32).to_le_bytes());
    entry[16..16 + payload.len()].copy_from_slice(payload);
    entry
}

/// Check if the binary currently has the Claude sprite in the robot slot.
pub fn is_robot_upgraded(binary_path: &str) -> Result<bool, String> {
    let data = fs::read(binary_path).map_err(|e| format!("Failed to read binary: {e}"))?;
    Ok(robot_slots_match(&data))
}

fn find_exact_offsets(data: &[u8], candidate: &[u8]) -> Vec<usize> {
    let mut pos = 0;
    let mut offsets = Vec::new();

    while let Some(offset) = data[pos..]
        .windows(candidate.len())
        .position(|w| w == candidate)
    {
        let abs = pos + offset;
        offsets.push(abs);
        pos = abs + candidate.len();
    }

    offsets
}

fn slot_matches_any_patched(slot: &RobotSlot) -> bool {
    slot.current_section == slot.patched_section
        || slot
            .patched_aliases
            .iter()
            .any(|candidate| slot.current_section == *candidate)
}

fn find_js_robot_sections(data: &[u8]) -> Vec<RobotSlot> {
    let robot = JS_ROBOT_SECTION.as_bytes();
    let bad_claude = JS_BAD_CLAUDE_SECTION.as_bytes();
    let compact_claude = JS_COMPACT_CLAUDE_SECTION.as_bytes();
    let claude = JS_CLAUDE_SECTION.as_bytes();

    let mut slots = Vec::new();

    for candidate in [robot, bad_claude, compact_claude, claude] {
        for offset in find_exact_offsets(data, candidate) {
            slots.push(RobotSlot {
                offset,
                current_section: candidate.to_vec(),
                patched_section: claude.to_vec(),
                patched_aliases: vec![bad_claude.to_vec(), compact_claude.to_vec()],
            });
        }
    }

    slots.sort_by_key(|slot| slot.offset);
    slots.dedup_by(|left, right| left.offset == right.offset);
    slots
}

fn find_macho_robot_sections(data: &[u8]) -> Vec<RobotSlot> {
    let blank = macho_string_entry(MACHO_ROBOT_BLANK.as_bytes());
    let sparkle = macho_string_entry(MACHO_ROBOT_SPARKLE.as_bytes());
    let robot_head = macho_string_entry(MACHO_ROBOT_HEAD.as_bytes());
    let robot_eyes = macho_string_entry(MACHO_ROBOT_EYES.as_bytes());
    let robot_mouth_open = macho_string_entry(MACHO_ROBOT_MOUTH_OPEN.as_bytes());
    let robot_mouth_alt = macho_string_entry(MACHO_ROBOT_MOUTH_ALT.as_bytes());
    let robot_tail = macho_string_entry(MACHO_ROBOT_TAIL);

    let claude_head = macho_string_entry(MACHO_CLAUDE_HEAD.as_bytes());
    let claude_eyes = macho_string_entry(MACHO_CLAUDE_EYES.as_bytes());
    let claude_mouth_open = macho_string_entry(MACHO_CLAUDE_MOUTH_OPEN.as_bytes());
    let claude_mouth_alt = macho_string_entry(MACHO_CLAUDE_MOUTH_ALT.as_bytes());
    let claude_tail = macho_string_entry(MACHO_CLAUDE_TAIL.as_bytes());

    let mut head_offsets = find_exact_offsets(data, &robot_head);
    head_offsets.extend(find_exact_offsets(data, &claude_head));
    head_offsets.sort_unstable();
    head_offsets.dedup();

    let mut slots = Vec::new();

    for head_offset in head_offsets {
        let Some(prev_offset) = head_offset.checked_sub(blank.len()) else {
            continue;
        };
        let Some(prev) = data.get(prev_offset..prev_offset + blank.len()) else {
            continue;
        };
        if prev != blank.as_slice() && prev != sparkle.as_slice() {
            continue;
        }

        let Some(head) = data.get(head_offset..head_offset + robot_head.len()) else {
            continue;
        };
        if head != robot_head.as_slice() && head != claude_head.as_slice() {
            continue;
        }

        let eyes_offset = head_offset + robot_head.len();
        let Some(eyes) = data.get(eyes_offset..eyes_offset + robot_eyes.len()) else {
            continue;
        };
        if eyes != robot_eyes.as_slice() && eyes != claude_eyes.as_slice() {
            continue;
        }

        let mouth_offset = eyes_offset + robot_eyes.len();
        let Some(mouth) = data.get(mouth_offset..mouth_offset + robot_mouth_open.len()) else {
            continue;
        };
        let mouth_patched =
            if mouth == robot_mouth_open.as_slice() || mouth == claude_mouth_open.as_slice() {
                claude_mouth_open.clone()
            } else if mouth == robot_mouth_alt.as_slice() || mouth == claude_mouth_alt.as_slice() {
                claude_mouth_alt.clone()
            } else {
                continue;
            };

        let tail_offset = mouth_offset + robot_mouth_open.len();
        let Some(tail) = data.get(tail_offset..tail_offset + robot_tail.len()) else {
            continue;
        };
        if tail != robot_tail.as_slice() && tail != claude_tail.as_slice() {
            continue;
        }

        slots.push(RobotSlot {
            offset: head_offset,
            current_section: head.to_vec(),
            patched_section: claude_head.clone(),
            patched_aliases: Vec::new(),
        });
        slots.push(RobotSlot {
            offset: eyes_offset,
            current_section: eyes.to_vec(),
            patched_section: claude_eyes.clone(),
            patched_aliases: Vec::new(),
        });
        slots.push(RobotSlot {
            offset: mouth_offset,
            current_section: mouth.to_vec(),
            patched_section: mouth_patched,
            patched_aliases: Vec::new(),
        });
        slots.push(RobotSlot {
            offset: tail_offset,
            current_section: tail.to_vec(),
            patched_section: claude_tail.clone(),
            patched_aliases: Vec::new(),
        });
    }

    slots.sort_by_key(|slot| slot.offset);
    slots.dedup_by(|left, right| left.offset == right.offset);
    slots
}

/// Find all robot sprite sections in the legacy binary layout.
fn find_legacy_robot_sections(data: &[u8]) -> Vec<RobotSlot> {
    // Search for ik_]:[[  marker followed by robot sprite data
    let marker = b"ik_]:[[";
    let mut pos = 0;
    let mut slots = Vec::new();
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
            slots.push(RobotSlot {
                offset: section_start,
                current_section: section.to_vec(),
                patched_section: CLAUDE_SPRITE.as_bytes().to_vec(),
                patched_aliases: Vec::new(),
            });
        }
        pos = abs + marker.len();
    }
    slots
}

/// Find all robot sprite sections in the binary and report the detected layout.
fn find_robot_sections(data: &[u8]) -> Option<RobotSections> {
    // Legacy binaries carry an explicit marker, so prefer that path before
    // matching the shared Claude sprite bytes used by newer patched layouts.
    let legacy_slots = find_legacy_robot_sections(data);
    if !legacy_slots.is_empty() {
        return Some(RobotSections {
            layout: RobotSpriteLayout::LegacyMarker,
            slots: legacy_slots,
        });
    }

    let js_slots = find_js_robot_sections(data);
    if !js_slots.is_empty() {
        return Some(RobotSections {
            layout: RobotSpriteLayout::JsSpriteSection,
            slots: js_slots,
        });
    }

    let macho_slots = find_macho_robot_sections(data);
    if !macho_slots.is_empty() {
        return Some(RobotSections {
            layout: RobotSpriteLayout::MachORowTable,
            slots: macho_slots,
        });
    }

    None
}

fn legacy_robot_slot_index(slot_count: usize) -> Option<usize> {
    if slot_count == 0 {
        None
    } else {
        Some(usize::min(1, slot_count - 1))
    }
}

fn stored_robot_original_sections(config: &BuddyConfig, slot_count: usize) -> Vec<Option<Vec<u8>>> {
    let mut sections = vec![None; slot_count];

    for (index, sprite) in config
        .original_robot_sprites
        .iter()
        .take(slot_count)
        .enumerate()
    {
        sections[index] = Some(sprite.as_bytes().to_vec());
    }

    if let Some(sprite) = config.original_robot_sprite.as_ref() {
        if let Some(index) = legacy_robot_slot_index(slot_count) {
            if sections[index].is_none() {
                sections[index] = Some(sprite.as_bytes().to_vec());
            }
        }
    }

    sections
}

fn resolve_robot_original_sections(
    config: &BuddyConfig,
    slots: &[RobotSlot],
) -> Result<Vec<Vec<u8>>, String> {
    let saved_sections = stored_robot_original_sections(config, slots.len());

    slots
        .iter()
        .enumerate()
        .map(|(index, slot)| {
            if slot_matches_any_patched(slot) {
                saved_sections[index].clone().ok_or_else(|| {
                    format!(
                        "Robot sprite slot {} is already patched but its original sprite is unavailable",
                        index + 1
                    )
                })
            } else {
                Ok(slot.current_section.clone())
            }
        })
        .collect()
}

fn store_robot_original_sections(config: &mut BuddyConfig, originals: &[Vec<u8>]) {
    config.original_robot_sprites = originals
        .iter()
        .map(|sprite| String::from_utf8_lossy(sprite).to_string())
        .collect();
    config.original_robot_sprite = legacy_robot_slot_index(originals.len())
        .and_then(|index| originals.get(index))
        .map(|sprite| String::from_utf8_lossy(sprite).to_string());
}

fn robot_slots_match(data: &[u8]) -> bool {
    let Some(robot_sections) = find_robot_sections(data) else {
        return false;
    };

    robot_sections
        .slots
        .iter()
        .all(|slot| slot.current_section == slot.patched_section)
}

fn replace_robot_section_at_offset(
    data: &mut [u8],
    offset: usize,
    current_section_len: usize,
    new_section: &[u8],
) -> Result<(), String> {
    if current_section_len != new_section.len() {
        return Err("Robot sprite section lengths must match".into());
    }
    let end = offset
        .checked_add(current_section_len)
        .ok_or("Robot sprite section offset overflow")?;
    if end > data.len() {
        return Err("Robot sprite section extends past binary bounds".into());
    }

    data[offset..end].copy_from_slice(new_section);
    Ok(())
}

fn replace_robot_sections(data: &mut [u8], slots: &[RobotSlot]) -> Result<usize, String> {
    let mut replacements = 0;
    for slot in slots {
        if slot.current_section == slot.patched_section {
            continue;
        }

        replace_robot_section_at_offset(
            data,
            slot.offset,
            slot.current_section.len(),
            &slot.patched_section,
        )?;
        replacements += 1;
    }

    Ok(replacements)
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
    require_buddy_support(&binary_path)?;
    let mut data = fs::read(&binary_path).map_err(|e| format!("Failed to read binary: {e}"))?;

    let mut config = load_buddy_config().ok_or("No buddy config found")?;
    let robot_sections = find_robot_sections(&data);
    let Some(robot_sections) = robot_sections else {
        return Err("Robot sprite section not found in binary".into());
    };
    let slots = robot_sections.slots;

    if enabled {
        let originals = resolve_robot_original_sections(&config, &slots)?;
        let replacements = replace_robot_sections(&mut data, &slots)?;
        if replacements > 0 {
            write_and_sign(&binary_path, &data)?;
        }

        store_robot_original_sections(&mut config, &originals);
        config.upgrade_robot = true;
        update_last_ensured_binary(&mut config, &binary_path)?;
        save_buddy_config(&config)?;
        Ok(true)
    } else {
        let originals = resolve_robot_original_sections(&config, &slots)?;
        let mut replacements = 0;
        for (slot, original_section) in slots.iter().zip(originals.iter()) {
            if !slot_matches_any_patched(slot) {
                continue;
            }

            replace_robot_section_at_offset(
                &mut data,
                slot.offset,
                slot.current_section.len(),
                original_section,
            )?;
            replacements += 1;
        }

        if replacements > 0 {
            write_and_sign(&binary_path, &data)?;
        }

        config.upgrade_robot = false;
        update_last_ensured_binary(&mut config, &binary_path)?;
        save_buddy_config(&config)?;
        Ok(true)
    }
}

/// Ensure robot upgrade is applied after binary update.
pub fn ensure_robot_upgrade(binary_path: &str) -> Result<Option<String>, String> {
    let mut config = match load_buddy_config() {
        Some(c) => c,
        None => return Ok(None),
    };
    if !config.upgrade_robot {
        return Ok(None);
    }
    require_buddy_support(binary_path)?;

    let mut data = fs::read(binary_path).map_err(|e| format!("Failed to read binary: {e}"))?;
    let robot_sections = find_robot_sections(&data);
    let Some(robot_sections) = robot_sections else {
        return Err("Robot section not found for re-upgrade".into());
    };
    let slots = robot_sections.slots;
    if robot_slots_match(&data) {
        return Ok(None);
    }

    let originals = resolve_robot_original_sections(&config, &slots)?;
    let replacements = replace_robot_sections(&mut data, &slots)?;
    write_and_sign(binary_path, &data)?;
    store_robot_original_sections(&mut config, &originals);
    update_last_ensured_binary(&mut config, binary_path)?;
    save_buddy_config(&config)?;
    Ok(Some(format!(
        "Re-upgraded robot sprite ({replacements} replacements)"
    )))
}

#[cfg(test)]
mod tests {
    use super::{
        binary_identity, ensure_buddy_for_binary, find_binary_in_path, find_robot_sections,
        macho_string_entry, replace_robot_section_at_offset, replace_robot_sections,
        resolve_robot_original_sections, robot_slots_match, save_buddy_config,
        store_robot_original_sections, BuddyCompanion, BuddyConfig, RobotSpriteLayout,
        BUDDY_ENSURE_REVISION, CLAUDE_SPRITE, JS_BAD_CLAUDE_SECTION, JS_CLAUDE_SECTION,
        JS_COMPACT_CLAUDE_SECTION, JS_ROBOT_SECTION, MACHO_CLAUDE_EYES, MACHO_CLAUDE_HEAD,
        MACHO_CLAUDE_MOUTH_ALT, MACHO_CLAUDE_MOUTH_OPEN, MACHO_CLAUDE_TAIL, MACHO_ROBOT_BLANK,
        MACHO_ROBOT_EYES, MACHO_ROBOT_HEAD, MACHO_ROBOT_MOUTH_ALT, MACHO_ROBOT_MOUTH_OPEN,
        MACHO_ROBOT_SPARKLE, MACHO_ROBOT_TAIL,
    };
    use std::env;
    use std::fs;
    use std::path::{Path, PathBuf};
    use uuid::Uuid;

    const ENSURE_SKIP_CHILD_ENV: &str = "GROVE_BUDDY_ENSURE_SKIP_CHILD";

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

    fn fake_binary_with_robot_slots(
        first_section: &[u8],
        second_section: &[u8],
    ) -> (Vec<u8>, usize, usize) {
        let prefix = b"prefix-ik_]:";
        let middle = b"-middle-ik_]:";
        let suffix = b"-suffix";
        let first_offset = prefix.len();
        let second_offset = first_offset + first_section.len() + middle.len();

        let mut data = Vec::new();
        data.extend_from_slice(prefix);
        data.extend_from_slice(first_section);
        data.extend_from_slice(middle);
        data.extend_from_slice(second_section);
        data.extend_from_slice(suffix);

        (data, first_offset, second_offset)
    }

    fn sprite_variant(first_frame_marker: u8) -> Vec<u8> {
        let mut sprite = CLAUDE_SPRITE.as_bytes().to_vec();
        let marker_offset = sprite.iter().position(|byte| *byte == b'*').unwrap();
        sprite[marker_offset] = first_frame_marker;
        sprite
    }

    fn fake_binary_with_embedded_sections(
        first_section: &[u8],
        second_section: &[u8],
    ) -> (Vec<u8>, usize, usize) {
        let prefix = b"prefix-";
        let middle = b"-middle-";
        let suffix = b"-suffix";
        let first_offset = prefix.len();
        let second_offset = first_offset + first_section.len() + middle.len();

        let mut data = Vec::new();
        data.extend_from_slice(prefix);
        data.extend_from_slice(first_section);
        data.extend_from_slice(middle);
        data.extend_from_slice(second_section);
        data.extend_from_slice(suffix);

        (data, first_offset, second_offset)
    }

    fn push_macho_entry(data: &mut Vec<u8>, text: &str) -> usize {
        let offset = data.len();
        data.extend_from_slice(&macho_string_entry(text.as_bytes()));
        offset
    }

    fn push_macho_entry_bytes(data: &mut Vec<u8>, bytes: &[u8]) -> usize {
        let offset = data.len();
        data.extend_from_slice(&macho_string_entry(bytes));
        offset
    }

    fn push_macho_robot_frame(data: &mut Vec<u8>, lead_row: &str, mouth_row: &str) -> Vec<usize> {
        push_macho_entry(data, lead_row);
        let head = push_macho_entry(data, MACHO_ROBOT_HEAD);
        let eyes = push_macho_entry(data, MACHO_ROBOT_EYES);
        let mouth = push_macho_entry(data, mouth_row);
        let tail = push_macho_entry_bytes(data, MACHO_ROBOT_TAIL);
        vec![head, eyes, mouth, tail]
    }

    fn fake_macho_robot_binary() -> (Vec<u8>, Vec<usize>) {
        let mut data = b"prefix-".to_vec();
        push_macho_entry(&mut data, "   |    |   ");
        push_macho_entry(&mut data, MACHO_ROBOT_HEAD);
        push_macho_entry(&mut data, MACHO_ROBOT_EYES);
        push_macho_entry(&mut data, MACHO_ROBOT_MOUTH_OPEN);
        push_macho_entry_bytes(&mut data, MACHO_ROBOT_TAIL);
        data.extend_from_slice(b"-middle-");

        let mut slot_offsets = Vec::new();
        slot_offsets.extend(push_macho_robot_frame(
            &mut data,
            MACHO_ROBOT_BLANK,
            MACHO_ROBOT_MOUTH_OPEN,
        ));
        data.extend_from_slice(b"-");
        slot_offsets.extend(push_macho_robot_frame(
            &mut data,
            MACHO_ROBOT_BLANK,
            MACHO_ROBOT_MOUTH_ALT,
        ));
        data.extend_from_slice(b"-");
        slot_offsets.extend(push_macho_robot_frame(
            &mut data,
            MACHO_ROBOT_SPARKLE,
            MACHO_ROBOT_MOUTH_OPEN,
        ));
        data.extend_from_slice(b"-suffix");

        (data, slot_offsets)
    }

    #[test]
    fn find_robot_sections_returns_all_detected_slots() {
        let first = sprite_variant(b'X');
        let second = CLAUDE_SPRITE.as_bytes().to_vec();
        let (data, first_offset, second_offset) = fake_binary_with_robot_slots(&first, &second);

        let detected = find_robot_sections(&data).unwrap();
        assert_eq!(detected.layout, RobotSpriteLayout::LegacyMarker);
        assert_eq!(detected.slots.len(), 2);
        assert_eq!(detected.slots[0].offset, first_offset);
        assert_eq!(detected.slots[0].current_section, first);
        assert_eq!(detected.slots[1].offset, second_offset);
        assert_eq!(detected.slots[1].current_section, second);
    }

    #[test]
    fn find_robot_sections_detects_macho_row_table_slots() {
        let (data, slot_offsets) = fake_macho_robot_binary();

        let detected = find_robot_sections(&data).unwrap();
        assert_eq!(detected.layout, RobotSpriteLayout::MachORowTable);
        assert_eq!(detected.slots.len(), slot_offsets.len());
        assert_eq!(
            detected
                .slots
                .iter()
                .map(|slot| slot.offset)
                .collect::<Vec<_>>(),
            slot_offsets
        );
    }

    #[test]
    fn find_robot_sections_detects_js_robot_sections() {
        let first = JS_ROBOT_SECTION.as_bytes().to_vec();
        let second = JS_BAD_CLAUDE_SECTION.as_bytes().to_vec();
        let (data, first_offset, second_offset) =
            fake_binary_with_embedded_sections(&first, &second);

        let detected = find_robot_sections(&data).unwrap();
        assert_eq!(detected.layout, RobotSpriteLayout::JsSpriteSection);
        assert_eq!(detected.slots.len(), 2);
        assert_eq!(detected.slots[0].offset, first_offset);
        assert_eq!(detected.slots[0].current_section, first);
        assert_eq!(detected.slots[1].offset, second_offset);
        assert_eq!(detected.slots[1].current_section, second);
    }

    #[test]
    fn macho_robot_rows_keep_entry_lengths() {
        assert_eq!(
            macho_string_entry(MACHO_ROBOT_HEAD.as_bytes()).len(),
            macho_string_entry(MACHO_CLAUDE_HEAD.as_bytes()).len()
        );
        assert_eq!(
            macho_string_entry(MACHO_ROBOT_EYES.as_bytes()).len(),
            macho_string_entry(MACHO_CLAUDE_EYES.as_bytes()).len()
        );
        assert_eq!(
            macho_string_entry(MACHO_ROBOT_MOUTH_OPEN.as_bytes()).len(),
            macho_string_entry(MACHO_CLAUDE_MOUTH_OPEN.as_bytes()).len()
        );
        assert_eq!(
            macho_string_entry(MACHO_ROBOT_MOUTH_ALT.as_bytes()).len(),
            macho_string_entry(MACHO_CLAUDE_MOUTH_ALT.as_bytes()).len()
        );
        assert_eq!(
            macho_string_entry(MACHO_ROBOT_TAIL).len(),
            macho_string_entry(MACHO_CLAUDE_TAIL.as_bytes()).len()
        );
        assert_eq!(JS_CLAUDE_SECTION.len(), JS_ROBOT_SECTION.len());
        assert_eq!(JS_BAD_CLAUDE_SECTION.len(), JS_ROBOT_SECTION.len());
    }

    #[test]
    fn replace_robot_sections_updates_all_detected_slots() {
        let first = sprite_variant(b'X');
        let second = sprite_variant(b'Y');
        let (mut data, first_offset, second_offset) = fake_binary_with_robot_slots(&first, &second);

        let sections = find_robot_sections(&data).unwrap();
        let replacements = replace_robot_sections(&mut data, &sections.slots).unwrap();

        assert_eq!(replacements, 2);
        assert_eq!(
            &data[first_offset..first_offset + first.len()],
            CLAUDE_SPRITE.as_bytes()
        );
        assert_eq!(
            &data[second_offset..second_offset + second.len()],
            CLAUDE_SPRITE.as_bytes()
        );
    }

    #[test]
    fn replace_robot_sections_updates_macho_slots() {
        let (mut data, slot_offsets) = fake_macho_robot_binary();
        let sections = find_robot_sections(&data).unwrap();
        let replacements = replace_robot_sections(&mut data, &sections.slots).unwrap();

        assert_eq!(replacements, slot_offsets.len());
        for slot in sections.slots {
            assert_eq!(
                &data[slot.offset..slot.offset + slot.patched_section.len()],
                slot.patched_section.as_slice()
            );
        }
    }

    #[test]
    fn replace_robot_sections_updates_js_slots() {
        let first = JS_ROBOT_SECTION.as_bytes().to_vec();
        let second = JS_COMPACT_CLAUDE_SECTION.as_bytes().to_vec();
        let (mut data, first_offset, second_offset) =
            fake_binary_with_embedded_sections(&first, &second);

        let sections = find_robot_sections(&data).unwrap();
        let replacements = replace_robot_sections(&mut data, &sections.slots).unwrap();

        assert_eq!(replacements, 2);
        assert_eq!(
            &data[first_offset..first_offset + JS_CLAUDE_SECTION.len()],
            JS_CLAUDE_SECTION.as_bytes()
        );
        assert_eq!(
            &data[second_offset..second_offset + JS_CLAUDE_SECTION.len()],
            JS_CLAUDE_SECTION.as_bytes()
        );
    }

    #[test]
    fn robot_slots_match_requires_all_detected_legacy_slots_to_match() {
        let first = CLAUDE_SPRITE.as_bytes().to_vec();
        let second = sprite_variant(b'Z');
        let (data, _, _) = fake_binary_with_robot_slots(&first, &second);

        assert!(!robot_slots_match(&data));

        let (data, _, _) = fake_binary_with_robot_slots(&first, &first);
        assert!(robot_slots_match(&data));
    }

    #[test]
    fn robot_slots_match_requires_all_detected_macho_slots_to_match() {
        let (mut data, _) = fake_macho_robot_binary();
        assert!(!robot_slots_match(&data));

        let sections = find_robot_sections(&data).unwrap();
        replace_robot_sections(&mut data, &sections.slots).unwrap();
        assert!(robot_slots_match(&data));
    }

    #[test]
    fn robot_slots_match_treats_old_js_placeholder_as_not_patched() {
        let (data, _, _) = fake_binary_with_embedded_sections(
            JS_BAD_CLAUDE_SECTION.as_bytes(),
            JS_CLAUDE_SECTION.as_bytes(),
        );
        assert!(!robot_slots_match(&data));
    }

    #[test]
    fn robot_slots_match_treats_compact_js_sprite_as_not_patched() {
        let (data, _, _) = fake_binary_with_embedded_sections(
            JS_COMPACT_CLAUDE_SECTION.as_bytes(),
            JS_CLAUDE_SECTION.as_bytes(),
        );
        assert!(!robot_slots_match(&data));
    }

    #[test]
    fn resolve_robot_original_sections_uses_saved_backup_for_patched_slot() {
        let first = sprite_variant(b'X');
        let second_original = sprite_variant(b'R');
        let second = CLAUDE_SPRITE.as_bytes().to_vec();
        let (data, _, _) = fake_binary_with_robot_slots(&first, &second);
        let sections = find_robot_sections(&data).unwrap();

        let mut config = BuddyConfig {
            salt: "salt".into(),
            companion: BuddyCompanion {
                species: "robot".into(),
                rarity: "legendary".into(),
                eye: "·".into(),
                hat: "crown".into(),
                shiny: false,
            },
            patched_at: "now".into(),
            upgrade_robot: true,
            original_robot_sprite: None,
            original_robot_sprites: Vec::new(),
            last_ensured_binary: None,
            last_ensured_revision: None,
        };
        store_robot_original_sections(&mut config, &[first.clone(), second_original.clone()]);

        let originals = resolve_robot_original_sections(&config, &sections.slots).unwrap();

        assert_eq!(originals, vec![first, second_original]);
    }

    #[test]
    fn resolve_robot_original_sections_uses_saved_backup_for_old_js_placeholder() {
        let first_original = JS_ROBOT_SECTION.as_bytes().to_vec();
        let second_original = JS_ROBOT_SECTION.as_bytes().to_vec();
        let first = JS_BAD_CLAUDE_SECTION.as_bytes().to_vec();
        let second = JS_CLAUDE_SECTION.as_bytes().to_vec();
        let (data, _, _) = fake_binary_with_embedded_sections(&first, &second);
        let sections = find_robot_sections(&data).unwrap();

        let mut config = BuddyConfig {
            salt: "salt".into(),
            companion: BuddyCompanion {
                species: "robot".into(),
                rarity: "legendary".into(),
                eye: "·".into(),
                hat: "crown".into(),
                shiny: false,
            },
            patched_at: "now".into(),
            upgrade_robot: true,
            original_robot_sprite: None,
            original_robot_sprites: Vec::new(),
            last_ensured_binary: None,
            last_ensured_revision: None,
        };
        store_robot_original_sections(
            &mut config,
            &[first_original.clone(), second_original.clone()],
        );

        let originals = resolve_robot_original_sections(&config, &sections.slots).unwrap();

        assert_eq!(originals, vec![first_original, second_original]);
    }

    #[test]
    fn replace_robot_section_at_offset_updates_exact_region_only() {
        let original = sprite_variant(b'X');
        let duplicate = sprite_variant(b'Y');
        let (mut data, slot_offset, duplicate_offset) =
            fake_binary_with_robot_slots(&original, &duplicate);
        let replacement = sprite_variant(b'Q');

        replace_robot_section_at_offset(&mut data, slot_offset, original.len(), &replacement)
            .unwrap();

        assert_eq!(
            &data[slot_offset..slot_offset + replacement.len()],
            replacement.as_slice()
        );
        assert_eq!(
            &data[duplicate_offset..duplicate_offset + duplicate.len()],
            duplicate.as_slice()
        );
    }

    #[test]
    fn ensure_buddy_for_binary_skips_when_identity_matches_config() {
        if env::var_os(ENSURE_SKIP_CHILD_ENV).is_some() {
            let home = dirs::home_dir().unwrap();
            let binary_path = home.join("versions").join("2.1.96");
            write_executable(&binary_path);

            let config = BuddyConfig {
                salt: "salt".into(),
                companion: BuddyCompanion {
                    species: "robot".into(),
                    rarity: "legendary".into(),
                    eye: "·".into(),
                    hat: "crown".into(),
                    shiny: false,
                },
                patched_at: "now".into(),
                upgrade_robot: true,
                original_robot_sprite: None,
                original_robot_sprites: Vec::new(),
                last_ensured_binary: Some(binary_identity(binary_path.to_str().unwrap()).unwrap()),
                last_ensured_revision: Some(BUDDY_ENSURE_REVISION),
            };
            save_buddy_config(&config).unwrap();

            let result = ensure_buddy_for_binary(binary_path.to_str().unwrap()).unwrap();
            assert_eq!(result, None);
            return;
        }

        let child_home = temp_test_dir("grove-buddy-ensure-skip");
        fs::create_dir_all(&child_home).unwrap();

        let output = std::process::Command::new(env::current_exe().unwrap())
            .arg("--exact")
            .arg("buddy::tests::ensure_buddy_for_binary_skips_when_identity_matches_config")
            .arg("--nocapture")
            .env(ENSURE_SKIP_CHILD_ENV, "1")
            .env("HOME", &child_home)
            .output()
            .unwrap();

        let _ = fs::remove_dir_all(&child_home);
        assert!(
            output.status.success(),
            "stdout={}\nstderr={}",
            String::from_utf8_lossy(&output.stdout),
            String::from_utf8_lossy(&output.stderr)
        );
    }
}
