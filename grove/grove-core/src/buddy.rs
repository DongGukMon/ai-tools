use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
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
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BuddyStatus {
    pub binary_path: String,
    pub current_salt: Option<String>,
    pub current_companion: Option<BuddyCompanion>,
    pub saved_config: Option<BuddyConfig>,
    pub user_id: String,
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
// Config I/O
// ---------------------------------------------------------------------------

pub fn buddy_config_path() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".grove")
        .join("buddy.json")
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
    let path = buddy_config_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create dir: {e}"))?;
    }
    let content = serde_json::to_string_pretty(config)
        .map_err(|e| format!("Failed to serialize buddy config: {e}"))?;
    fs::write(&path, content).map_err(|e| format!("Failed to write buddy config: {e}"))
}

// ---------------------------------------------------------------------------
// Binary operations
// ---------------------------------------------------------------------------

pub fn find_claude_binary() -> Result<String, String> {
    let output = Command::new("which")
        .arg("-a")
        .arg("claude")
        .output()
        .map_err(|e| format!("Failed to run `which -a claude`: {e}"))?;

    if !output.status.success() {
        return Err("Claude binary not found in PATH".into());
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    for line in stdout.lines() {
        let path = line.trim();
        if path.is_empty() || path.contains(".grove") {
            continue;
        }

        // Resolve symlinks via realpath
        let resolved = Command::new("realpath")
            .arg(path)
            .output()
            .map_err(|e| format!("Failed to resolve path {path}: {e}"))?;

        if resolved.status.success() {
            let real = String::from_utf8_lossy(&resolved.stdout).trim().to_string();
            if !real.is_empty() {
                return Ok(real);
            }
        }

        // Fallback to the original path if realpath fails
        return Ok(path.to_string());
    }

    Err("No suitable Claude binary found (all paths contain .grove)".into())
}

/// Reads the binary at `binary_path`, locates the rarity-weights anchor string,
/// then scans backwards up to 200 bytes for a pattern `="<15 printable ASCII>"`.
/// Returns the salt if it appears >= 3 times in the binary.
pub fn detect_salt(binary_path: &str) -> Result<Option<String>, String> {
    let data =
        fs::read(binary_path).map_err(|e| format!("Failed to read binary {binary_path}: {e}"))?;

    let anchor = b"{common:5,uncommon:15,rare:25,epic:35,legendary:50}";

    let Some(anchor_pos) = data
        .windows(anchor.len())
        .position(|w| w == anchor)
    else {
        return Ok(None);
    };

    // Scan backwards up to 200 bytes from the anchor looking for ="<15 chars>"
    let scan_start = anchor_pos.saturating_sub(200);
    let region = &data[scan_start..anchor_pos];

    // Look for pattern: =" followed by 15 printable ASCII chars followed by "
    let eq_quote = b"=\"";
    let mut salt: Option<String> = None;

    for i in 0..region.len() {
        if i + 2 + 15 + 1 > region.len() {
            break;
        }
        if &region[i..i + 2] == eq_quote {
            let candidate = &region[i + 2..i + 2 + 15];
            if candidate.iter().all(|&b| b >= 0x20 && b <= 0x7E && b != b'"') {
                if i + 2 + 15 < region.len() && region[i + 2 + 15] == b'"' {
                    let s = String::from_utf8_lossy(candidate).to_string();
                    salt = Some(s);
                }
            }
        }
    }

    let Some(found_salt) = salt else {
        return Ok(None);
    };

    // Verify: salt must appear >= 3 times in binary
    let salt_bytes = found_salt.as_bytes();
    let count = data
        .windows(salt_bytes.len())
        .filter(|w| *w == salt_bytes)
        .count();

    if count >= 3 {
        Ok(Some(found_salt))
    } else {
        Ok(None)
    }
}

/// Patches all occurrences of `old_salt` with `new_salt` in the binary.
/// Backs up to `.buddy-pick.bak` if no backup exists yet.
/// Uses atomic write (temp file + rename) and macOS codesign.
pub fn patch_binary(binary_path: &str, old_salt: &str, new_salt: &str) -> Result<u32, String> {
    if old_salt.len() != new_salt.len() {
        return Err("Salt lengths must match".into());
    }

    let bin_path = PathBuf::from(binary_path);

    // Backup only if no backup exists
    let backup_path = bin_path.with_extension("buddy-pick.bak");
    if !backup_path.exists() {
        fs::copy(&bin_path, &backup_path)
            .map_err(|e| format!("Failed to create backup: {e}"))?;
    }

    let mut data =
        fs::read(binary_path).map_err(|e| format!("Failed to read binary: {e}"))?;

    let old_bytes = old_salt.as_bytes();
    let new_bytes = new_salt.as_bytes();
    let mut replacements: u32 = 0;

    // Find and replace all occurrences
    let mut i = 0;
    while i + old_bytes.len() <= data.len() {
        if &data[i..i + old_bytes.len()] == old_bytes {
            data[i..i + old_bytes.len()].copy_from_slice(new_bytes);
            replacements += 1;
            i += old_bytes.len();
        } else {
            i += 1;
        }
    }

    if replacements == 0 {
        return Err("Old salt not found in binary".into());
    }

    // Atomic write via temp file + rename
    let temp_path = bin_path.with_extension("buddy-pick.tmp");
    fs::write(&temp_path, &data).map_err(|e| format!("Failed to write temp file: {e}"))?;

    // Preserve permissions
    let metadata = fs::metadata(&bin_path)
        .map_err(|e| format!("Failed to read binary metadata: {e}"))?;
    fs::set_permissions(&temp_path, metadata.permissions())
        .map_err(|e| format!("Failed to set permissions: {e}"))?;

    fs::rename(&temp_path, &bin_path).map_err(|e| format!("Failed to rename temp file: {e}"))?;

    // macOS codesign
    let _ = Command::new("codesign")
        .args(["-f", "-s", "-", binary_path])
        .output();

    Ok(replacements)
}

/// Ensures the buddy config is still applied. If the saved salt no longer
/// appears in the binary (e.g. after a Claude update), re-patches.
/// Returns `None` if already good, `Some(message)` if re-patched.
pub fn ensure_buddy() -> Result<Option<String>, String> {
    let config = match load_buddy_config() {
        Some(c) => c,
        None => return Ok(None),
    };

    let binary_path = find_claude_binary()?;
    let data = fs::read(&binary_path)
        .map_err(|e| format!("Failed to read binary: {e}"))?;

    let saved_salt_bytes = config.salt.as_bytes();
    let has_saved_salt = data
        .windows(saved_salt_bytes.len())
        .any(|w| w == saved_salt_bytes);

    if has_saved_salt {
        return Ok(None);
    }

    // Salt missing — binary was likely updated. Re-detect and re-patch.
    let current_salt = detect_salt(&binary_path)?
        .ok_or("Cannot re-patch: no salt detected in updated binary")?;

    let count = patch_binary(&binary_path, &current_salt, &config.salt)?;
    Ok(Some(format!(
        "Re-patched binary with {} replacements (salt: {} → {})",
        count, current_salt, config.salt
    )))
}

// ---------------------------------------------------------------------------
// Bun subprocess for hash computation
// ---------------------------------------------------------------------------

pub fn find_bun() -> Result<String, String> {
    let output = Command::new("which")
        .arg("bun")
        .output()
        .map_err(|e| format!("Failed to run `which bun`: {e}"))?;

    if !output.status.success() {
        return Err("Bun not found in PATH. Install bun: https://bun.sh".into());
    }

    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

/// Spawns `bun --eval` with inline JS that computes `Bun.hash(userId+salt)`,
/// seeds mulberry32 PRNG, rolls a companion, and outputs JSON.
pub fn roll_companion_via_bun(user_id: &str, salt: &str) -> Result<BuddyCompanion, String> {
    let bun = find_bun()?;

    let js = format!(
        r#"
const SPECIES = [
  "Bear","Cat","Dog","Fox","Frog","Hamster","Koala","Lion",
  "Monkey","Mouse","Owl","Panda","Penguin","Rabbit","Raccoon",
  "Sloth","Tiger","Wolf"
];
const RARITIES = ["common","uncommon","rare","epic","legendary"];
const RARITY_WEIGHTS = [50, 15, 25, 35, 5];
const EYES = [
  "normal","happy","sad","angry","cool","wink","dizzy","star",
  "heart","sleepy","surprised","crying"
];
const HATS = [
  "none","cap","tophat","beanie","crown","wizard","party",
  "pirate","cowboy","beret","headband","flower"
];

function mulberry32(seed) {{
  let s = seed | 0;
  return function() {{
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }};
}}

function weightedRandom(rng, weights) {{
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rng() * total;
  for (let i = 0; i < weights.length; i++) {{
    r -= weights[i];
    if (r <= 0) return i;
  }}
  return weights.length - 1;
}}

const seed = Number(Bun.hash("{user_id}" + "{salt}"));
const rng = mulberry32(seed);

const rarityIdx = weightedRandom(rng, RARITY_WEIGHTS);
const rarity = RARITIES[rarityIdx];
const species = SPECIES[Math.floor(rng() * SPECIES.length)];
const eye = EYES[Math.floor(rng() * EYES.length)];
const hat = HATS[Math.floor(rng() * HATS.length)];
const shiny = rng() < 0.05;

console.log(JSON.stringify({{ species, rarity, eye, hat, shiny }}));
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
    serde_json::from_str(stdout.trim())
        .map_err(|e| format!("Failed to parse companion JSON: {e}"))
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
const SPECIES = [
  "Bear","Cat","Dog","Fox","Frog","Hamster","Koala","Lion",
  "Monkey","Mouse","Owl","Panda","Penguin","Rabbit","Raccoon",
  "Sloth","Tiger","Wolf"
];
const RARITIES = ["common","uncommon","rare","epic","legendary"];
const RARITY_WEIGHTS = [50, 15, 25, 35, 5];
const EYES = [
  "normal","happy","sad","angry","cool","wink","dizzy","star",
  "heart","sleepy","surprised","crying"
];
const HATS = [
  "none","cap","tophat","beanie","crown","wizard","party",
  "pirate","cowboy","beret","headband","flower"
];

const CHARSET = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_";

function mulberry32(seed) {{
  let s = seed | 0;
  return function() {{
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }};
}}

function weightedRandom(rng, weights) {{
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rng() * total;
  for (let i = 0; i < weights.length; i++) {{
    r -= weights[i];
    if (r <= 0) return i;
  }}
  return weights.length - 1;
}}

function rollCompanion(userId, salt) {{
  const seed = Number(Bun.hash(userId + salt));
  const rng = mulberry32(seed);
  const rarityIdx = weightedRandom(rng, RARITY_WEIGHTS);
  const rarity = RARITIES[rarityIdx];
  const species = SPECIES[Math.floor(rng() * SPECIES.length)];
  const eye = EYES[Math.floor(rng() * EYES.length)];
  const hat = HATS[Math.floor(rng() * HATS.length)];
  const shiny = rng() < 0.05;
  return {{ species, rarity, eye, hat, shiny }};
}}

function randomSalt() {{
  let s = "";
  for (let i = 0; i < 15; i++) {{
    s += CHARSET[Math.floor(Math.random() * CHARSET.length)];
  }}
  return s;
}}

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
    let current_salt = detect_salt(&binary_path)?;
    let user_id = get_user_id();

    let current_companion = match &current_salt {
        Some(salt) => roll_companion_via_bun(&user_id, salt).ok(),
        None => None,
    };

    let saved_config = load_buddy_config();

    Ok(BuddyStatus {
        binary_path,
        current_salt,
        current_companion,
        saved_config,
        user_id,
    })
}

/// Detects the current salt in the binary, patches it with the new salt,
/// and saves the config with an ISO timestamp.
pub fn apply_buddy_impl(salt: &str, companion: &BuddyCompanion) -> Result<u32, String> {
    let binary_path = find_claude_binary()?;
    let current_salt = detect_salt(&binary_path)?
        .ok_or("No salt detected in binary — cannot patch")?;

    let count = patch_binary(&binary_path, &current_salt, salt)?;

    // Get ISO timestamp via `date -u`
    let patched_at = Command::new("date")
        .arg("-u")
        .arg("+%Y-%m-%dT%H:%M:%SZ")
        .output()
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
        .unwrap_or_else(|_| "unknown".into());

    let config = BuddyConfig {
        salt: salt.to_string(),
        companion: companion.clone(),
        patched_at,
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

    fs::copy(&backup_path, &bin_path)
        .map_err(|e| format!("Failed to restore from backup: {e}"))?;

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
