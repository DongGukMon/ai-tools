use crate::config::{self, ProjectEntry};
use crate::process_env::{enriched_path, preferred_ssh_auth_sock};
use crate::{Project, Worktree};
use git2::Repository;
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{Duration, SystemTime};
use uuid::Uuid;

const SOURCE_WORKTREE_NAME: &str = "source";
const SOURCE_REMOTE_REFRESH_INTERVAL: Duration = Duration::from_secs(60);

fn base_dir() -> PathBuf {
    PathBuf::from(config::load_app_config().base_dir)
}

pub(crate) fn git_command() -> Command {
    let mut command = Command::new("git");
    command.env("PATH", enriched_path());
    if let Some(ssh_auth_sock) = preferred_ssh_auth_sock() {
        command.env("SSH_AUTH_SOCK", ssh_auth_sock);
    }
    command
}

/// Parse a git URL into (host, org, repo).
/// Supports HTTPS (https://host/org/repo[.git]) and SSH (git@host:org/repo[.git]).
fn parse_git_url(url: &str) -> Result<(String, String, String), String> {
    // SSH: git@github.com:org/repo.git
    if let Some(rest) = url.strip_prefix("git@") {
        let parts: Vec<&str> = rest.splitn(2, ':').collect();
        if parts.len() != 2 {
            return Err(format!("Invalid SSH URL: {url}"));
        }
        let host = parts[0].to_string();
        let path = parts[1].trim_end_matches(".git");
        let segments: Vec<&str> = path.split('/').collect();
        if segments.len() < 2 {
            return Err(format!("Invalid URL path: {path}"));
        }
        return Ok((host, segments[0].to_string(), segments[1].to_string()));
    }

    // HTTPS: https://github.com/org/repo.git
    let url_str = url.trim_end_matches(".git");
    let without_protocol = url_str
        .strip_prefix("https://")
        .or_else(|| url_str.strip_prefix("http://"))
        .ok_or_else(|| format!("Unsupported URL format: {url}"))?;

    let segments: Vec<&str> = without_protocol.split('/').collect();
    if segments.len() < 3 {
        return Err(format!("Invalid URL — expected host/org/repo: {url}"));
    }

    Ok((
        segments[0].to_string(),
        segments[1].to_string(),
        segments[2].to_string(),
    ))
}

fn project_dir(host: &str, org: &str, repo: &str) -> PathBuf {
    base_dir().join(host).join(org).join(repo)
}

fn find_project_entry(project_id: &str) -> Result<ProjectEntry, String> {
    let config = load_reconciled_config()?;
    config
        .projects
        .into_iter()
        .find(|p| p.id == project_id)
        .ok_or_else(|| format!("Project not found: {project_id}"))
}

fn normalize_source_path(path: &str) -> String {
    path.trim_end_matches('/').to_string()
}

fn normalize_project_url(url: &str) -> String {
    url.trim_end_matches('/')
        .trim_end_matches(".git")
        .to_string()
}

fn same_project_entry(left: &ProjectEntry, right: &ProjectEntry) -> bool {
    left.id == right.id
        && left.name == right.name
        && left.url == right.url
        && left.org == right.org
        && left.repo == right.repo
        && left.source_path == right.source_path
}

fn same_project_entries(left: &[ProjectEntry], right: &[ProjectEntry]) -> bool {
    left.len() == right.len()
        && left
            .iter()
            .zip(right.iter())
            .all(|(left, right)| same_project_entry(left, right))
}

fn find_matching_project(
    entries: &[ProjectEntry],
    source_path: &str,
    url: Option<&str>,
) -> Option<ProjectEntry> {
    let source_key = normalize_source_path(source_path);
    let url_key = url.map(normalize_project_url);

    entries
        .iter()
        .find(|entry| {
            normalize_source_path(&entry.source_path) == source_key
                || url_key
                    .as_ref()
                    .map(|key| normalize_project_url(&entry.url) == *key)
                    .unwrap_or(false)
        })
        .cloned()
}

fn make_project_entry(
    name: String,
    url: String,
    org: String,
    repo: String,
    source_path: String,
) -> ProjectEntry {
    ProjectEntry {
        id: Uuid::new_v4().to_string(),
        name,
        url,
        org,
        repo,
        source_path,
        worktree_order: Vec::new(),
    }
}

fn project_entry_from_url(
    url: &str,
    source_dir: &Path,
    preferred_name: Option<&str>,
) -> Result<ProjectEntry, String> {
    let (_host, org, repo) = parse_git_url(url)?;
    Ok(make_project_entry(
        preferred_name.unwrap_or(&repo).to_string(),
        url.to_string(),
        org,
        repo,
        source_dir.to_string_lossy().to_string(),
    ))
}

fn remote_url_for_repo(source_dir: &Path) -> Result<String, String> {
    let repo = Repository::open(source_dir).map_err(|e| {
        format!(
            "Failed to open git repository at {}: {e}",
            source_dir.display()
        )
    })?;

    if let Ok(remote) = repo.find_remote("origin") {
        if let Some(url) = remote.url() {
            return Ok(url.to_string());
        }
    }

    let remotes = repo.remotes().map_err(|e| {
        format!(
            "Failed to inspect remotes for {}: {e}",
            source_dir.display()
        )
    })?;

    for remote_name in remotes.iter().flatten() {
        if let Ok(remote) = repo.find_remote(remote_name) {
            if let Some(url) = remote.url() {
                return Ok(url.to_string());
            }
        }
    }

    Err(format!(
        "No git remote URL found for {}",
        source_dir.display()
    ))
}

fn project_entry_from_source(source_dir: &Path) -> Result<ProjectEntry, String> {
    let remote_url = remote_url_for_repo(source_dir)?;
    project_entry_from_url(&remote_url, source_dir, None)
}

fn child_directories(path: &Path) -> Vec<PathBuf> {
    fs::read_dir(path)
        .ok()
        .into_iter()
        .flat_map(|entries| entries.filter_map(Result::ok))
        .map(|entry| entry.path())
        .filter(|path| path.is_dir())
        .collect()
}

fn scan_source_directories(base_dir: &Path) -> Vec<PathBuf> {
    let mut source_dirs = Vec::new();

    for host_dir in child_directories(base_dir) {
        for org_dir in child_directories(&host_dir) {
            for repo_dir in child_directories(&org_dir) {
                let source_dir = repo_dir.join("source");
                if source_dir.is_dir() {
                    source_dirs.push(source_dir);
                }
            }
        }
    }

    source_dirs.sort();
    source_dirs
}

fn reconcile_project_entries(entries: Vec<ProjectEntry>, base_dir: &Path) -> Vec<ProjectEntry> {
    let mut reconciled = Vec::new();
    let mut seen_paths = HashSet::new();
    let mut seen_urls = HashSet::new();

    for entry in entries {
        if !Path::new(&entry.source_path).is_dir() {
            continue;
        }

        let source_key = normalize_source_path(&entry.source_path);
        let url_key = normalize_project_url(&entry.url);
        if !seen_paths.insert(source_key) || !seen_urls.insert(url_key) {
            continue;
        }

        reconciled.push(entry);
    }

    for source_dir in scan_source_directories(base_dir) {
        let source_path = source_dir.to_string_lossy().to_string();
        let source_key = normalize_source_path(&source_path);
        if seen_paths.contains(&source_key) {
            continue;
        }

        let Ok(entry) = project_entry_from_source(&source_dir) else {
            continue;
        };

        let url_key = normalize_project_url(&entry.url);
        if seen_urls.contains(&url_key) {
            continue;
        }

        seen_paths.insert(source_key);
        seen_urls.insert(url_key);
        reconciled.push(entry);
    }

    reconciled
}

fn load_reconciled_config() -> Result<config::GroveConfig, String> {
    let mut config = config::load_config();
    let reconciled_projects = reconcile_project_entries(config.projects.clone(), &base_dir());

    if !same_project_entries(&config.projects, &reconciled_projects) {
        config.projects = reconciled_projects;
        config::save_config(&config)?;
    } else {
        config.projects = reconciled_projects;
    }

    Ok(config)
}

fn register_project_entry(entry: ProjectEntry) -> Result<ProjectEntry, String> {
    let mut config = load_reconciled_config()?;

    if let Some(existing) =
        find_matching_project(&config.projects, &entry.source_path, Some(&entry.url))
    {
        return Ok(existing);
    }

    config.projects.push(entry.clone());
    config::save_config(&config)?;
    Ok(entry)
}

fn recover_existing_project(
    source_dir: &Path,
    fallback_url: &str,
    fallback_name: Option<&str>,
) -> Result<Project, String> {
    let source_path = source_dir.to_string_lossy().to_string();
    let config = load_reconciled_config()?;

    if let Some(existing) =
        find_matching_project(&config.projects, &source_path, Some(fallback_url))
    {
        return Ok(project_from_entry(existing));
    }

    Repository::open(source_dir).map_err(|e| {
        format!(
            "Project already exists at {} but could not be recovered: {e}",
            source_dir.display()
        )
    })?;

    let entry = project_entry_from_source(source_dir)
        .or_else(|_| project_entry_from_url(fallback_url, source_dir, fallback_name))?;
    let entry = register_project_entry(entry)?;
    Ok(project_from_entry(entry))
}

fn project_from_entry(entry: ProjectEntry) -> Project {
    let worktrees = visible_worktrees(
        get_worktrees_for_project(&entry.source_path),
        &entry.source_path,
    );
    let worktrees = apply_worktree_order(worktrees, &entry.worktree_order);

    let path = std::path::Path::new(&entry.source_path);
    let source_has_changes = path.exists() && has_local_source_changes(path);
    let source_behind_remote = check_source_behind_remote(&entry.source_path);

    Project {
        id: entry.id,
        name: entry.name,
        url: entry.url,
        org: entry.org,
        repo: entry.repo,
        source_path: entry.source_path,
        worktrees,
        source_has_changes,
        source_behind_remote,
    }
}

fn check_source_behind_remote(source_path: &str) -> bool {
    let path = std::path::Path::new(source_path);
    if !path.exists() {
        return false;
    }

    let _ = maybe_fetch_source_remote(path);
    source_head_differs_from_default_remote(path)
}

fn has_local_source_changes(source: &Path) -> bool {
    let repo = match git2::Repository::open(source) {
        Ok(r) => r,
        Err(_) => return false,
    };
    let statuses = match repo.statuses(Some(
        git2::StatusOptions::new()
            .include_untracked(true)
            .recurse_untracked_dirs(true),
    )) {
        Ok(s) => s,
        Err(_) => return false,
    };
    !statuses.is_empty()
}

fn maybe_fetch_source_remote(source: &Path) -> Result<(), String> {
    if !source_remote_refresh_due(source) {
        return Ok(());
    }

    run_git(source, &["fetch", "origin", "--prune", "--quiet"])
}

fn source_remote_refresh_due(source: &Path) -> bool {
    let repo = match Repository::open(source) {
        Ok(repo) => repo,
        Err(_) => return false,
    };
    let fetch_head = repo.path().join("FETCH_HEAD");

    let last_fetch = fs::metadata(fetch_head)
        .and_then(|metadata| metadata.modified())
        .ok();

    match last_fetch {
        Some(last_fetch) => match SystemTime::now().duration_since(last_fetch) {
            Ok(elapsed) => elapsed >= SOURCE_REMOTE_REFRESH_INTERVAL,
            Err(_) => true,
        },
        None => true,
    }
}

fn source_head_differs_from_default_remote(source: &Path) -> bool {
    let repo = match Repository::open(source) {
        Ok(repo) => repo,
        Err(_) => return false,
    };

    let default_branch = match remote_default_branch(source) {
        Ok(branch) => branch,
        Err(_) => return false,
    };
    let remote_ref = format!("refs/remotes/origin/{default_branch}");

    let head = match repo.head().and_then(|head| head.peel_to_commit()) {
        Ok(commit) => commit,
        Err(_) => return false,
    };
    let remote_head = match repo
        .find_reference(&remote_ref)
        .and_then(|reference| reference.peel_to_commit())
    {
        Ok(commit) => commit,
        Err(_) => return false,
    };

    head.id() != remote_head.id()
}

fn normalized_path(path: &Path) -> PathBuf {
    std::fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf())
}

fn visible_worktrees(worktrees: Vec<Worktree>, source_path: &str) -> Vec<Worktree> {
    let source_path = normalized_path(Path::new(source_path));
    worktrees
        .into_iter()
        .filter(|worktree| normalized_path(Path::new(&worktree.path)) != source_path)
        .collect()
}

fn parse_worktree_list(output: &str, project_base: &Path) -> Vec<Worktree> {
    let mut worktrees = Vec::new();
    let mut current_path = String::new();
    let mut current_branch = String::new();
    let mut is_bare = false;
    let normalized_project_base = normalized_path(project_base);

    for line in output.lines() {
        if let Some(path) = line.strip_prefix("worktree ") {
            // Flush previous entry
            if !current_path.is_empty()
                && !is_bare
                && normalized_path(Path::new(&current_path)).starts_with(&normalized_project_base)
            {
                worktrees.push(make_worktree(&current_path, &current_branch, project_base));
            }
            current_path = path.to_string();
            current_branch.clear();
            is_bare = false;
        } else if let Some(branch) = line.strip_prefix("branch ") {
            current_branch = branch
                .strip_prefix("refs/heads/")
                .unwrap_or(branch)
                .to_string();
        } else if line == "bare" {
            is_bare = true;
        }
    }

    // Flush last entry
    if !current_path.is_empty()
        && !is_bare
        && normalized_path(Path::new(&current_path)).starts_with(&normalized_project_base)
    {
        worktrees.push(make_worktree(&current_path, &current_branch, project_base));
    }

    worktrees
}

fn make_worktree(path_str: &str, branch: &str, project_base: &Path) -> Worktree {
    let path = Path::new(path_str);
    let normalized_project_base = normalized_path(project_base);
    let normalized_path_buf = normalized_path(path);
    let name = if normalized_path_buf == normalized_project_base.join(SOURCE_WORKTREE_NAME) {
        SOURCE_WORKTREE_NAME.to_string()
    } else {
        // Derive name from relative path under worktrees/ to preserve slashes
        // e.g. <project>/worktrees/feat/new-feature → feat/new-feature
        let worktrees_dir = normalized_project_base.join("worktrees");
        normalized_path_buf
            .strip_prefix(&worktrees_dir)
            .ok()
            .map(|rel| rel.to_string_lossy().to_string())
            .unwrap_or_else(|| {
                path.file_name()
                    .map(|n| n.to_string_lossy().to_string())
                    .unwrap_or_else(|| path_str.to_string())
            })
    };

    let display_path = normalized_path_buf
        .strip_prefix(&normalized_project_base)
        .ok()
        .map(|rel| project_base.join(rel).to_string_lossy().to_string())
        .unwrap_or_else(|| path_str.to_string());

    Worktree {
        name,
        path: display_path,
        branch: branch.to_string(),
    }
}

fn sort_worktrees_by_creation_time(worktrees: &mut Vec<Worktree>) {
    worktrees.sort_by_key(|wt| {
        std::fs::metadata(&wt.path)
            .and_then(|m| m.created())
            .unwrap_or(std::time::SystemTime::UNIX_EPOCH)
    });
}

fn apply_worktree_order(worktrees: Vec<Worktree>, order: &[String]) -> Vec<Worktree> {
    if order.is_empty() {
        return worktrees;
    }
    let mut ordered = Vec::with_capacity(worktrees.len());
    let mut remaining: Vec<Worktree> = worktrees;
    for name in order {
        if let Some(pos) = remaining.iter().position(|wt| &wt.name == name) {
            ordered.push(remaining.remove(pos));
        }
    }
    ordered.extend(remaining);
    ordered
}

fn get_worktrees_for_project(source_path: &str) -> Vec<Worktree> {
    let source = Path::new(source_path);
    let project_base = source.parent().unwrap_or(source);

    let output = match git_command()
        .args(["worktree", "list", "--porcelain"])
        .current_dir(source)
        .output()
    {
        Ok(o) if o.status.success() => String::from_utf8_lossy(&o.stdout).to_string(),
        _ => return vec![],
    };

    let mut worktrees = parse_worktree_list(&output, project_base);
    sort_worktrees_by_creation_time(&mut worktrees);
    worktrees
}

fn managed_source_dir(entry: &ProjectEntry) -> Result<PathBuf, String> {
    let (host, org, repo) = parse_git_url(&entry.url)?;
    let expected = project_dir(&host, &org, &repo).join(SOURCE_WORKTREE_NAME);
    let actual = PathBuf::from(&entry.source_path);

    if normalized_path(&actual) != normalized_path(&expected) {
        return Err(format!(
            "Refusing to operate on unmanaged source path: {}",
            entry.source_path
        ));
    }

    Ok(actual)
}

pub fn list_projects_impl() -> Result<Vec<Project>, String> {
    let config = load_reconciled_config()?;
    Ok(config
        .projects
        .into_iter()
        .map(project_from_entry)
        .collect())
}

pub fn add_project_impl(url: &str) -> Result<Project, String> {
    let (host, org, repo) = parse_git_url(url)?;
    let proj_dir = project_dir(&host, &org, &repo);
    let source_dir = proj_dir.join("source");
    let source_path = source_dir.to_string_lossy().to_string();

    let config = load_reconciled_config()?;
    if let Some(existing) = find_matching_project(&config.projects, &source_path, Some(url)) {
        return Ok(project_from_entry(existing));
    }

    if source_dir.is_dir() {
        return recover_existing_project(&source_dir, url, None);
    }

    std::fs::create_dir_all(&proj_dir)
        .map_err(|e| format!("Failed to create project directory: {e}"))?;
    std::fs::create_dir_all(proj_dir.join("worktrees"))
        .map_err(|e| format!("Failed to create worktrees directory: {e}"))?;

    let output = git_command()
        .args(["clone", url, &source_dir.to_string_lossy()])
        .output()
        .map_err(|e| format!("Failed to run git clone: {e}"))?;

    if !output.status.success() {
        // Cleanup on failure
        let _ = std::fs::remove_dir_all(&proj_dir);
        return Err(format!(
            "git clone failed: {}",
            String::from_utf8_lossy(&output.stderr).trim()
        ));
    }

    let entry = register_project_entry(project_entry_from_url(url, &source_dir, None)?)?;

    Ok(project_from_entry(entry))
}

pub fn create_project_impl(name: &str, remote_url: &str) -> Result<Project, String> {
    let (host, org, repo) = parse_git_url(remote_url)?;
    let proj_dir = project_dir(&host, &org, &repo);
    let source_dir = proj_dir.join("source");
    let source_path = source_dir.to_string_lossy().to_string();

    let config = load_reconciled_config()?;
    if let Some(existing) = find_matching_project(&config.projects, &source_path, Some(remote_url))
    {
        return Ok(project_from_entry(existing));
    }

    if source_dir.is_dir() {
        return recover_existing_project(&source_dir, remote_url, Some(name));
    }

    std::fs::create_dir_all(&source_dir)
        .map_err(|e| format!("Failed to create source directory: {e}"))?;
    std::fs::create_dir_all(proj_dir.join("worktrees"))
        .map_err(|e| format!("Failed to create worktrees directory: {e}"))?;

    // git init
    run_git(&source_dir, &["init"])?;
    // git remote add origin
    run_git(&source_dir, &["remote", "add", "origin", remote_url])?;
    // Create initial commit
    let readme = source_dir.join("README.md");
    std::fs::write(&readme, format!("# {name}\n"))
        .map_err(|e| format!("Failed to write README: {e}"))?;
    run_git(&source_dir, &["add", "README.md"])?;
    run_git(&source_dir, &["commit", "-m", "Initial commit"])?;
    // Ensure we're on main branch
    run_git(&source_dir, &["branch", "-M", "main"])?;
    // Push (may fail if remote doesn't exist yet — non-fatal)
    let _ = run_git(&source_dir, &["push", "-u", "origin", "main"]);

    let entry =
        register_project_entry(project_entry_from_url(remote_url, &source_dir, Some(name))?)?;

    Ok(project_from_entry(entry))
}

pub fn remove_project_impl(project_id: &str) -> Result<(), String> {
    let mut config = config::load_config();
    let idx = config
        .projects
        .iter()
        .position(|p| p.id == project_id)
        .ok_or_else(|| format!("Project not found: {project_id}"))?;

    let entry = config.projects[idx].clone();
    let source = managed_source_dir(&entry)?;
    let project_dir = source
        .parent()
        .ok_or_else(|| format!("Invalid managed source path: {}", entry.source_path))?
        .to_path_buf();

    config.projects.remove(idx);
    config::save_config(&config)?;

    // Cleanup directory (source parent = project dir)
    let _ = std::fs::remove_dir_all(project_dir);

    Ok(())
}

pub fn add_worktree_impl(project_id: &str, name: &str) -> Result<Worktree, String> {
    validate_branch_name(name)?;

    let entry = find_project_entry(project_id)?;
    let source_dir = managed_source_dir(&entry)?;
    let source = source_dir.as_path();

    if !source.exists() {
        return Err(format!("Source directory not found: {}", entry.source_path));
    }

    // Fetch latest from origin
    let _ = run_git(source, &["fetch", "origin"]);

    let default_branch = remote_default_branch(source)?;

    let worktree_path = source
        .parent()
        .unwrap_or(source)
        .join("worktrees")
        .join(name);

    let worktree_path_str = worktree_path.to_string_lossy().to_string();

    let local_exists = run_git_output(
        source,
        &["rev-parse", "--verify", &format!("refs/heads/{name}")],
    )
    .is_ok();

    if local_exists {
        // Branch already exists locally — just check it out in a new worktree
        run_git(source, &["worktree", "add", &worktree_path_str, name])?;
    } else {
        let remote_branch = format!("origin/{name}");
        let remote_exists =
            run_git_output(source, &["rev-parse", "--verify", &remote_branch]).is_ok();

        if remote_exists {
            // Track existing remote branch
            run_git(
                source,
                &[
                    "worktree",
                    "add",
                    &worktree_path_str,
                    "-b",
                    name,
                    &remote_branch,
                ],
            )?;
        } else {
            // Create new branch from default branch
            let base_ref = format!("origin/{default_branch}");
            run_git(
                source,
                &["worktree", "add", &worktree_path_str, "-b", name, &base_ref],
            )?;
        }
    }

    Ok(Worktree {
        name: name.to_string(),
        path: worktree_path_str,
        branch: name.to_string(),
    })
}

pub fn remove_worktree_impl(project_id: &str, worktree_name: &str) -> Result<(), String> {
    let entry = find_project_entry(project_id)?;
    let source_dir = managed_source_dir(&entry)?;
    let source = source_dir.as_path();

    if !source.exists() {
        return Err(format!("Source directory not found: {}", entry.source_path));
    }

    let worktree_path = source
        .parent()
        .unwrap_or(source)
        .join("worktrees")
        .join(worktree_name);

    let worktree_path_str = worktree_path.to_string_lossy();

    crate::worktree_lifecycle::default_worktree_lifecycle().cleanup(&worktree_path_str);

    run_git(
        source,
        &["worktree", "remove", &worktree_path_str, "--force"],
    )?;

    if let Err(error) = run_git(source, &["branch", "-D", worktree_name]) {
        eprintln!(
            "Warning: removed worktree {worktree_name}, but failed to delete local branch: {error}"
        );
    }

    Ok(())
}

pub fn list_worktrees_impl(project_id: &str) -> Result<Vec<Worktree>, String> {
    let entry = find_project_entry(project_id)?;
    Ok(visible_worktrees(
        get_worktrees_for_project(&entry.source_path),
        &entry.source_path,
    ))
}

pub fn set_worktree_order_impl(project_id: &str, order: Vec<String>) -> Result<(), String> {
    let mut config = config::load_config();
    let entry = config
        .projects
        .iter_mut()
        .find(|p| p.id == project_id)
        .ok_or_else(|| format!("Project not found: {project_id}"))?;
    entry.worktree_order = order;
    config::save_config(&config)
}

pub fn is_source_dirty_impl(project_id: &str) -> Result<bool, String> {
    let entry = find_project_entry(project_id)?;
    let source_dir = managed_source_dir(&entry)?;

    if !source_dir.exists() {
        return Ok(false);
    }

    Ok(has_local_source_changes(&source_dir))
}

pub fn refresh_project_impl(project_id: &str) -> Result<Project, String> {
    let entry = find_project_entry(project_id)?;
    let source_dir = managed_source_dir(&entry)?;
    let source = source_dir.as_path();

    if !source.exists() {
        return Err(format!("Source directory not found: {}", entry.source_path));
    }

    refresh_source_repo(source)?;
    Ok(project_from_entry(entry))
}

fn validate_branch_name(name: &str) -> Result<(), String> {
    if name.is_empty() {
        return Err("Branch name cannot be empty".to_string());
    }
    if name.starts_with('/') || name.ends_with('/') || name.contains("//") {
        return Err(format!("Invalid branch name: {name}"));
    }
    if name.starts_with('-') || name.starts_with('.') {
        return Err(format!("Invalid branch name: {name}"));
    }
    if name.contains("..")
        || name.contains(" ")
        || name.contains("~")
        || name.contains("^")
        || name.contains(":")
        || name.contains("\\")
        || name.contains("*")
        || name.contains("?")
        || name.contains("[")
        || name.ends_with('.')
        || name.ends_with(".lock")
    {
        return Err(format!("Invalid branch name: {name}"));
    }
    Ok(())
}

fn run_git(cwd: &Path, args: &[&str]) -> Result<(), String> {
    run_git_output(cwd, args).map(|_| ())
}

fn run_git_output(cwd: &Path, args: &[&str]) -> Result<String, String> {
    let output = git_command()
        .args(args)
        .current_dir(cwd)
        .output()
        .map_err(|e| format!("Failed to run git {}: {e}", args.first().unwrap_or(&"")))?;

    if !output.status.success() {
        return Err(format!(
            "git {} failed: {}",
            args.first().unwrap_or(&""),
            String::from_utf8_lossy(&output.stderr).trim()
        ));
    }
    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

pub(crate) fn remote_default_branch(source: &Path) -> Result<String, String> {
    if let Ok(branch) = resolve_origin_head(source) {
        return Ok(branch);
    }

    let _ = run_git(source, &["remote", "set-head", "origin", "-a"]);

    if let Ok(branch) = resolve_origin_head(source) {
        return Ok(branch);
    }

    if let Ok(branches) = local_branch_names(source) {
        if branches.len() == 1 {
            return Ok(branches[0].clone());
        }
    }

    if let Ok(branches) = remote_branch_names(source) {
        if branches.len() == 1 {
            return Ok(branches[0].clone());
        }
    }

    for candidate in ["main", "master"] {
        let remote_ref = format!("refs/remotes/origin/{candidate}");
        let args = ["show-ref", "--verify", remote_ref.as_str()];
        if run_git(source, &args).is_ok() {
            return Ok(candidate.to_string());
        }
    }

    let branch = run_git_output(source, &["branch", "--show-current"])?;
    if !branch.is_empty() {
        return Ok(branch);
    }

    Err(format!(
        "Failed to resolve origin default branch for {}",
        source.display()
    ))
}

fn local_branch_names(source: &Path) -> Result<Vec<String>, String> {
    let output = run_git_output(
        source,
        &["for-each-ref", "--format=%(refname:short)", "refs/heads"],
    )?;
    Ok(output
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(|line| line.to_string())
        .collect())
}

fn remote_branch_names(source: &Path) -> Result<Vec<String>, String> {
    let output = run_git_output(
        source,
        &[
            "for-each-ref",
            "--format=%(refname:short)",
            "refs/remotes/origin",
        ],
    )?;
    Ok(output
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .filter_map(|line| line.strip_prefix("origin/"))
        .filter(|line| *line != "HEAD")
        .map(|line| line.to_string())
        .collect())
}

fn resolve_origin_head(source: &Path) -> Result<String, String> {
    let symbolic_ref = run_git_output(
        source,
        &["symbolic-ref", "--short", "refs/remotes/origin/HEAD"],
    )?;
    symbolic_ref
        .strip_prefix("origin/")
        .map(|branch| branch.to_string())
        .ok_or_else(|| format!("Unexpected origin HEAD ref: {symbolic_ref}"))
}

fn create_source_sync_stash(source: &Path) -> Result<Option<String>, String> {
    if !has_local_source_changes(source) {
        return Ok(None);
    }

    let stash_label = format!("grove-source-sync-{}", Uuid::new_v4());
    run_git(
        source,
        &[
            "stash",
            "push",
            "--include-untracked",
            "-m",
            stash_label.as_str(),
        ],
    )?;

    let stash_ref = run_git_output(source, &["rev-parse", "-q", "--verify", "refs/stash"])?;
    Ok(Some(stash_ref))
}

fn resolve_stash_selector(source: &Path, stash_ref: &str) -> Result<String, String> {
    let stash_list = run_git_output(source, &["stash", "list", "--format=%H %gd"])?;

    stash_list
        .lines()
        .find_map(|line| {
            let mut parts = line.split_whitespace();
            let hash = parts.next()?;
            let selector = parts.next()?;
            (hash == stash_ref).then(|| selector.to_string())
        })
        .ok_or_else(|| format!("Temporary stash {stash_ref} is no longer present"))
}

fn restore_source_sync_stash(source: &Path, stash_ref: &str, context: &str) -> Result<(), String> {
    if let Err(e) = run_git(source, &["stash", "apply", stash_ref]) {
        return Err(format!(
            "{context}. Restoring local changes from temporary stash {stash_ref} failed: {e}. Your changes are still available in that stash entry. Recover them with `git stash apply {stash_ref}` or inspect them with `git stash show -p {stash_ref}`."
        ));
    }

    let stash_selector = resolve_stash_selector(source, stash_ref)?;
    if let Err(e) = run_git(source, &["stash", "drop", stash_selector.as_str()]) {
        return Err(format!(
            "{context}. Local changes were restored from temporary stash {stash_ref}, but dropping that stash failed: {e}. You can remove it manually with `git stash drop {stash_selector}`."
        ));
    }

    Ok(())
}

fn refresh_source_repo(source: &Path) -> Result<(), String> {
    let default_branch = remote_default_branch(source)?;
    let sync_stash_ref = create_source_sync_stash(source)?;

    let restore_after_error = |base: String| -> Result<(), String> {
        if let Some(stash_ref) = sync_stash_ref.as_deref() {
            if let Err(restore_err) = restore_source_sync_stash(source, stash_ref, &base) {
                return Err(format!("{base}\n{restore_err}"));
            }
        }

        Err(base)
    };

    if let Err(e) = run_git(source, &["checkout", &default_branch]) {
        return restore_after_error(format!(
            "Failed to switch source repo to default branch '{default_branch}' during sync: {e}"
        ));
    }

    if let Err(e) = run_git(source, &["fetch", "--prune", "origin"]) {
        return restore_after_error(format!("Failed to fetch origin during source sync: {e}"));
    }

    if let Err(e) = run_git(source, &["pull", "--rebase", "origin", &default_branch]) {
        let _ = run_git(source, &["rebase", "--abort"]);
        return restore_after_error(format!(
            "Rebase failed during source sync (local commits may conflict with upstream): {e}"
        ));
    }

    if let Some(stash_ref) = sync_stash_ref.as_deref() {
        restore_source_sync_stash(
            source,
            stash_ref,
            "Source sync completed, but reapplying local changes failed",
        )?;
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Mutex, OnceLock};

    fn env_lock() -> std::sync::MutexGuard<'static, ()> {
        static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
        LOCK.get_or_init(|| Mutex::new(()))
            .lock()
            .unwrap_or_else(|error| error.into_inner())
    }

    struct TestHome {
        root: PathBuf,
        original_home: Option<String>,
    }

    impl TestHome {
        fn new() -> Self {
            let root =
                std::env::temp_dir().join(format!("grove-git-project-tests-{}", Uuid::new_v4()));
            fs::create_dir_all(&root).unwrap();

            let original_home = std::env::var("HOME").ok();
            unsafe {
                std::env::set_var("HOME", &root);
            }

            Self {
                root,
                original_home,
            }
        }
    }

    impl Drop for TestHome {
        fn drop(&mut self) {
            match &self.original_home {
                Some(original_home) => unsafe {
                    std::env::set_var("HOME", original_home);
                },
                None => unsafe {
                    std::env::remove_var("HOME");
                },
            }

            let _ = fs::remove_dir_all(&self.root);
        }
    }

    fn save_test_config(base_dir: &Path, projects: Vec<ProjectEntry>) {
        config::save_config(&config::GroveConfig {
            projects,
            base_dir: Some(base_dir.to_string_lossy().to_string()),
            terminal_theme: None,
        })
        .unwrap();
    }

    fn project_entry(id: &str, url: &str, source_dir: &Path) -> ProjectEntry {
        let (_host, org, repo) = parse_git_url(url).unwrap();
        ProjectEntry {
            id: id.to_string(),
            name: repo.clone(),
            url: url.to_string(),
            org,
            repo,
            source_path: source_dir.to_string_lossy().to_string(),
            worktree_order: Vec::new(),
        }
    }

    fn run_git_ok(cwd: &Path, args: &[&str]) {
        let output = git_command().args(args).current_dir(cwd).output().unwrap();
        assert!(
            output.status.success(),
            "git {:?} failed: {}",
            args,
            String::from_utf8_lossy(&output.stderr)
        );
    }

    fn configure_git_identity(repo_dir: &Path) {
        run_git_ok(repo_dir, &["config", "user.name", "Grove Test"]);
        run_git_ok(repo_dir, &["config", "user.email", "grove@example.com"]);
    }

    fn init_repo_with_remote(source_dir: &Path, remote_url: &str) {
        fs::create_dir_all(source_dir).unwrap();
        run_git_ok(source_dir, &["init"]);
        run_git_ok(source_dir, &["remote", "add", "origin", remote_url]);
    }

    fn create_bare_remote(root: &Path, name: &str, default_branch: &str) -> (PathBuf, PathBuf) {
        let remote_dir = root.join(format!("{name}.git"));
        let seed_dir = root.join(format!("{name}-seed"));
        fs::create_dir_all(root).unwrap();

        let remote_dir_str = remote_dir.to_string_lossy().to_string();
        run_git_ok(
            root,
            &[
                "init",
                "--bare",
                "--initial-branch",
                default_branch,
                &remote_dir_str,
            ],
        );

        fs::create_dir_all(&seed_dir).unwrap();
        run_git_ok(&seed_dir, &["init", "--initial-branch", default_branch]);
        configure_git_identity(&seed_dir);

        (remote_dir, seed_dir)
    }

    fn commit_and_push(
        repo_dir: &Path,
        remote_dir: &Path,
        branch: &str,
        relative_path: &str,
        content: &str,
        message: &str,
    ) {
        let file_path = repo_dir.join(relative_path);
        if let Some(parent) = file_path.parent() {
            fs::create_dir_all(parent).unwrap();
        }
        fs::write(&file_path, content).unwrap();
        run_git_ok(repo_dir, &["add", relative_path]);
        run_git_ok(repo_dir, &["commit", "-m", message]);

        let has_origin = run_git_output(repo_dir, &["remote", "get-url", "origin"]).is_ok();
        if !has_origin {
            let remote_dir_str = remote_dir.to_string_lossy().to_string();
            run_git_ok(repo_dir, &["remote", "add", "origin", &remote_dir_str]);
        }

        run_git_ok(repo_dir, &["push", "-u", "origin", branch]);
    }

    fn remove_fetch_head(source_dir: &Path) {
        let fetch_head = Repository::open(source_dir)
            .unwrap()
            .path()
            .join("FETCH_HEAD");
        let _ = fs::remove_file(fetch_head);
    }

    #[test]
    fn visible_worktrees_hides_only_actual_source_path() {
        let source_path = "/tmp/grove/source";
        let source_worktree = Worktree {
            name: SOURCE_WORKTREE_NAME.to_string(),
            path: source_path.to_string(),
            branch: String::new(),
        };
        let user_worktree_named_source = Worktree {
            name: SOURCE_WORKTREE_NAME.to_string(),
            path: "/tmp/grove/worktrees/source".to_string(),
            branch: SOURCE_WORKTREE_NAME.to_string(),
        };

        let visible = visible_worktrees(
            vec![source_worktree, user_worktree_named_source.clone()],
            source_path,
        );

        assert_eq!(visible.len(), 1);
        assert_eq!(visible[0].name, user_worktree_named_source.name);
        assert_eq!(visible[0].path, user_worktree_named_source.path);
        assert_eq!(visible[0].branch, user_worktree_named_source.branch);
    }

    #[test]
    fn refresh_project_rejects_unmanaged_source_path() {
        let _lock = env_lock();
        let home = TestHome::new();
        let base_dir = home.root.join("grove-data");
        let rogue_repo = home.root.join("rogue-repo");

        init_repo_with_remote(&rogue_repo, "https://github.com/bang9/grove.git");
        save_test_config(
            &base_dir,
            vec![project_entry(
                "project-1",
                "https://github.com/bang9/grove.git",
                &rogue_repo,
            )],
        );

        let error = refresh_project_impl("project-1").unwrap_err();
        assert!(error.contains("Refusing to operate on unmanaged source path"));
    }

    #[test]
    fn remote_default_branch_falls_back_to_single_local_branch_when_detached() {
        let _lock = env_lock();
        let home = TestHome::new();
        let remotes_dir = home.root.join("remotes");
        let (remote_dir, seed_dir) = create_bare_remote(&remotes_dir, "grove-trunk", "trunk");
        let source_parent = home.root.join("clones");
        let source_dir = source_parent.join("source");

        commit_and_push(
            &seed_dir,
            &remote_dir,
            "trunk",
            "README.md",
            "# Grove trunk\n",
            "Initial trunk commit",
        );

        fs::create_dir_all(&source_parent).unwrap();
        let remote_dir_str = remote_dir.to_string_lossy().to_string();
        let source_dir_str = source_dir.to_string_lossy().to_string();
        run_git_ok(&source_parent, &["clone", &remote_dir_str, &source_dir_str]);

        run_git_ok(&source_dir, &["remote", "set-head", "origin", "--delete"]);
        run_git_ok(&source_dir, &["checkout", "--detach", "origin/trunk"]);

        let missing_remote = home.root.join("missing-remote.git");
        let missing_remote_str = missing_remote.to_string_lossy().to_string();
        run_git_ok(
            &source_dir,
            &["remote", "set-url", "origin", &missing_remote_str],
        );

        assert_eq!(remote_default_branch(&source_dir).unwrap(), "trunk");
    }

    #[test]
    fn list_projects_reconciles_stale_entries_and_recovers_orphans() {
        let _lock = env_lock();
        let home = TestHome::new();
        let base_dir = home.root.join("grove-data");
        let base_dir_str = base_dir.to_string_lossy().to_string();
        let orphan_source = base_dir
            .join("github.com")
            .join("bang9")
            .join("grove")
            .join("source");
        let orphan_source_str = orphan_source.to_string_lossy().to_string();
        let stale_source = base_dir
            .join("github.com")
            .join("bang9")
            .join("missing")
            .join("source");

        init_repo_with_remote(&orphan_source, "https://github.com/bang9/grove.git");
        save_test_config(
            &base_dir,
            vec![project_entry(
                "stale-project",
                "https://github.com/bang9/missing.git",
                &stale_source,
            )],
        );

        let projects = list_projects_impl().unwrap();

        assert_eq!(projects.len(), 1);
        assert_eq!(projects[0].url, "https://github.com/bang9/grove.git");
        assert_eq!(projects[0].org, "bang9");
        assert_eq!(projects[0].repo, "grove");
        assert_eq!(projects[0].source_path, orphan_source_str);

        let saved = config::load_config();
        assert_eq!(saved.base_dir.as_deref(), Some(base_dir_str.as_str()));
        assert_eq!(saved.projects.len(), 1);
        assert_eq!(saved.projects[0].url, "https://github.com/bang9/grove.git");
        assert_eq!(
            saved.projects[0].source_path,
            orphan_source.to_string_lossy()
        );
    }

    #[test]
    fn list_projects_removes_config_only_entries_when_source_directory_is_missing() {
        let _lock = env_lock();
        let home = TestHome::new();
        let base_dir = home.root.join("grove-data");
        let base_dir_str = base_dir.to_string_lossy().to_string();
        let stale_source = base_dir
            .join("github.com")
            .join("bang9")
            .join("missing")
            .join("source");

        save_test_config(
            &base_dir,
            vec![project_entry(
                "stale-project",
                "https://github.com/bang9/missing.git",
                &stale_source,
            )],
        );

        let projects = list_projects_impl().unwrap();

        assert!(projects.is_empty());

        let saved = config::load_config();
        assert_eq!(saved.base_dir.as_deref(), Some(base_dir_str.as_str()));
        assert!(saved.projects.is_empty());
    }

    #[test]
    fn list_projects_recovers_orphan_source_directory_into_config() {
        let _lock = env_lock();
        let home = TestHome::new();
        let base_dir = home.root.join("grove-data");
        let base_dir_str = base_dir.to_string_lossy().to_string();
        let orphan_source = base_dir
            .join("github.com")
            .join("bang9")
            .join("grove")
            .join("source");
        let orphan_source_str = orphan_source.to_string_lossy().to_string();

        init_repo_with_remote(&orphan_source, "https://github.com/bang9/grove.git");
        save_test_config(&base_dir, vec![]);

        let projects = list_projects_impl().unwrap();

        assert_eq!(projects.len(), 1);
        assert_eq!(projects[0].url, "https://github.com/bang9/grove.git");
        assert_eq!(projects[0].org, "bang9");
        assert_eq!(projects[0].repo, "grove");
        assert_eq!(projects[0].source_path, orphan_source_str);

        let saved = config::load_config();
        assert_eq!(saved.base_dir.as_deref(), Some(base_dir_str.as_str()));
        assert_eq!(saved.projects.len(), 1);
        assert_eq!(saved.projects[0].url, "https://github.com/bang9/grove.git");
        assert_eq!(
            saved.projects[0].source_path,
            orphan_source.to_string_lossy()
        );
    }

    #[test]
    fn list_projects_deduplicates_duplicate_config_entries() {
        let _lock = env_lock();
        let home = TestHome::new();
        let base_dir = home.root.join("grove-data");
        let source_dir = base_dir
            .join("github.com")
            .join("bang9")
            .join("grove")
            .join("source");

        init_repo_with_remote(&source_dir, "https://github.com/bang9/grove.git");
        save_test_config(
            &base_dir,
            vec![
                project_entry(
                    "project-1",
                    "https://github.com/bang9/grove.git",
                    &source_dir,
                ),
                project_entry(
                    "project-2",
                    "https://github.com/bang9/grove.git",
                    &source_dir,
                ),
            ],
        );

        let projects = list_projects_impl().unwrap();

        assert_eq!(projects.len(), 1);
        assert_eq!(projects[0].id, "project-1");

        let saved = config::load_config();
        assert_eq!(saved.projects.len(), 1);
        assert_eq!(saved.projects[0].id, "project-1");
    }

    #[test]
    fn add_project_returns_existing_registered_project() {
        let _lock = env_lock();
        let home = TestHome::new();
        let base_dir = home.root.join("grove-data");
        let source_dir = base_dir
            .join("github.com")
            .join("bang9")
            .join("grove")
            .join("source");
        let existing = project_entry(
            "project-1",
            "https://github.com/bang9/grove.git",
            &source_dir,
        );

        init_repo_with_remote(&source_dir, "https://github.com/bang9/grove.git");
        save_test_config(&base_dir, vec![existing.clone()]);

        let project = add_project_impl("https://github.com/bang9/grove.git").unwrap();

        assert_eq!(project.id, existing.id);
        assert_eq!(project.url, existing.url);
        assert_eq!(project.source_path, existing.source_path);
        assert!(project.worktrees.is_empty());

        let saved = config::load_config();
        assert_eq!(saved.projects.len(), 1);
        assert_eq!(saved.projects[0].id, existing.id);
    }

    #[test]
    fn add_project_recovers_existing_source_directory_into_config() {
        let _lock = env_lock();
        let home = TestHome::new();
        let base_dir = home.root.join("grove-data");
        let source_dir = base_dir
            .join("github.com")
            .join("bang9")
            .join("grove")
            .join("source");
        let source_dir_str = source_dir.to_string_lossy().to_string();

        init_repo_with_remote(&source_dir, "https://github.com/bang9/grove.git");
        save_test_config(&base_dir, vec![]);

        let project = add_project_impl("https://github.com/bang9/grove.git").unwrap();

        assert_eq!(project.url, "https://github.com/bang9/grove.git");
        assert_eq!(project.source_path, source_dir_str);
        assert!(project.worktrees.is_empty());

        let saved = config::load_config();
        assert_eq!(saved.projects.len(), 1);
        assert_eq!(saved.projects[0].id, project.id);
        assert_eq!(saved.projects[0].source_path, project.source_path);
    }

    #[test]
    fn create_project_recovers_existing_source_directory_into_config() {
        let _lock = env_lock();
        let home = TestHome::new();
        let base_dir = home.root.join("grove-data");
        let source_dir = base_dir
            .join("github.com")
            .join("bang9")
            .join("grove")
            .join("source");
        let source_dir_str = source_dir.to_string_lossy().to_string();

        init_repo_with_remote(&source_dir, "https://github.com/bang9/grove.git");
        save_test_config(&base_dir, vec![]);

        let project =
            create_project_impl("Recovered Name", "https://github.com/bang9/grove.git").unwrap();

        assert_eq!(project.url, "https://github.com/bang9/grove.git");
        assert_eq!(project.repo, "grove");
        assert_eq!(project.source_path, source_dir_str);
        assert!(project.worktrees.is_empty());

        let saved = config::load_config();
        assert_eq!(saved.projects.len(), 1);
        assert_eq!(saved.projects[0].id, project.id);
        assert_eq!(saved.projects[0].source_path, project.source_path);
    }

    #[test]
    fn add_worktree_uses_remote_default_branch() {
        let _lock = env_lock();
        let home = TestHome::new();
        let base_dir = home.root.join("grove-data");
        let source_dir = base_dir
            .join("github.com")
            .join("bang9")
            .join("grove")
            .join("source");
        let remotes_dir = home.root.join("remotes");
        let (remote_dir, seed_dir) = create_bare_remote(&remotes_dir, "grove", "trunk");

        commit_and_push(
            &seed_dir,
            &remote_dir,
            "trunk",
            "README.md",
            "# Grove\n",
            "Initial commit",
        );

        fs::create_dir_all(source_dir.parent().unwrap()).unwrap();
        let remote_dir_str = remote_dir.to_string_lossy().to_string();
        let source_dir_str = source_dir.to_string_lossy().to_string();
        run_git_ok(
            source_dir.parent().unwrap(),
            &["clone", &remote_dir_str, &source_dir_str],
        );

        save_test_config(
            &base_dir,
            vec![project_entry(
                "project-1",
                "https://github.com/bang9/grove.git",
                &source_dir,
            )],
        );

        let worktree = add_worktree_impl("project-1", "feature-1").unwrap();
        let worktree_path = PathBuf::from(&worktree.path);

        assert_eq!(worktree.branch, "feature-1");
        assert!(worktree_path.is_dir());
        assert_eq!(
            run_git_output(&worktree_path, &["branch", "--show-current"]).unwrap(),
            "feature-1"
        );
        assert_eq!(
            run_git_output(&worktree_path, &["rev-parse", "HEAD"]).unwrap(),
            run_git_output(&source_dir, &["rev-parse", "origin/trunk"]).unwrap()
        );
        assert_eq!(list_worktrees_impl("project-1").unwrap().len(), 1);
    }

    #[test]
    fn remove_worktree_deletes_local_branch_and_recreates_from_default_branch() {
        let _lock = env_lock();
        let home = TestHome::new();
        let base_dir = home.root.join("grove-data");
        let source_dir = base_dir
            .join("github.com")
            .join("bang9")
            .join("grove")
            .join("source");
        let remotes_dir = home.root.join("remotes");
        let (remote_dir, seed_dir) =
            create_bare_remote(&remotes_dir, "grove-remove-worktree", "trunk");

        commit_and_push(
            &seed_dir,
            &remote_dir,
            "trunk",
            "README.md",
            "# Grove\n",
            "Initial commit",
        );

        fs::create_dir_all(source_dir.parent().unwrap()).unwrap();
        let remote_dir_str = remote_dir.to_string_lossy().to_string();
        let source_dir_str = source_dir.to_string_lossy().to_string();
        run_git_ok(
            source_dir.parent().unwrap(),
            &["clone", &remote_dir_str, &source_dir_str],
        );
        configure_git_identity(&source_dir);

        save_test_config(
            &base_dir,
            vec![project_entry(
                "project-1",
                "https://github.com/bang9/grove.git",
                &source_dir,
            )],
        );

        let default_head = run_git_output(&source_dir, &["rev-parse", "origin/trunk"]).unwrap();

        let worktree = add_worktree_impl("project-1", "feature-1").unwrap();
        let worktree_path = PathBuf::from(&worktree.path);

        fs::write(worktree_path.join("README.md"), "# Feature branch\n").unwrap();
        run_git_ok(&worktree_path, &["add", "README.md"]);
        run_git_ok(&worktree_path, &["commit", "-m", "Feature branch commit"]);

        let stale_feature_head = run_git_output(&worktree_path, &["rev-parse", "HEAD"]).unwrap();
        assert_ne!(stale_feature_head, default_head);

        remove_worktree_impl("project-1", "feature-1").unwrap();

        assert!(!worktree_path.exists());
        assert!(list_worktrees_impl("project-1").unwrap().is_empty());
        assert!(run_git_output(
            &source_dir,
            &["rev-parse", "--verify", "refs/heads/feature-1"],
        )
        .is_err());

        let recreated = add_worktree_impl("project-1", "feature-1").unwrap();
        let recreated_path = PathBuf::from(&recreated.path);
        let recreated_head = run_git_output(&recreated_path, &["rev-parse", "HEAD"]).unwrap();

        assert_eq!(recreated_head, default_head);
        assert_ne!(recreated_head, stale_feature_head);
        assert_eq!(
            fs::read_to_string(recreated_path.join("README.md")).unwrap(),
            "# Grove\n"
        );
    }

    #[test]
    fn remove_worktree_ignores_missing_local_branch_after_removal() {
        let _lock = env_lock();
        let home = TestHome::new();
        let base_dir = home.root.join("grove-data");
        let source_dir = base_dir
            .join("github.com")
            .join("bang9")
            .join("grove")
            .join("source");
        let remotes_dir = home.root.join("remotes");
        let (remote_dir, seed_dir) = create_bare_remote(
            &remotes_dir,
            "grove-remove-worktree-missing-branch",
            "trunk",
        );

        commit_and_push(
            &seed_dir,
            &remote_dir,
            "trunk",
            "README.md",
            "# Grove\n",
            "Initial commit",
        );

        fs::create_dir_all(source_dir.parent().unwrap()).unwrap();
        let remote_dir_str = remote_dir.to_string_lossy().to_string();
        let source_dir_str = source_dir.to_string_lossy().to_string();
        run_git_ok(
            source_dir.parent().unwrap(),
            &["clone", &remote_dir_str, &source_dir_str],
        );

        save_test_config(
            &base_dir,
            vec![project_entry(
                "project-1",
                "https://github.com/bang9/grove.git",
                &source_dir,
            )],
        );

        let worktree = add_worktree_impl("project-1", "feature-1").unwrap();
        let worktree_path = PathBuf::from(&worktree.path);

        run_git_ok(&worktree_path, &["checkout", "--detach", "HEAD"]);
        run_git_ok(&source_dir, &["branch", "-D", "feature-1"]);
        assert!(run_git_output(
            &source_dir,
            &["rev-parse", "--verify", "refs/heads/feature-1"],
        )
        .is_err());

        remove_worktree_impl("project-1", "feature-1").unwrap();

        assert!(!worktree_path.exists());
        assert!(list_worktrees_impl("project-1").unwrap().is_empty());
    }

    #[test]
    fn list_projects_marks_source_behind_remote_when_default_branch_advances() {
        let _lock = env_lock();
        let home = TestHome::new();
        let base_dir = home.root.join("grove-data");
        let source_dir = base_dir
            .join("github.com")
            .join("bang9")
            .join("grove")
            .join("source");
        let remotes_dir = home.root.join("remotes");
        let (remote_dir, seed_dir) =
            create_bare_remote(&remotes_dir, "grove-remote-ahead", "trunk");

        commit_and_push(
            &seed_dir,
            &remote_dir,
            "trunk",
            "README.md",
            "# Grove v1\n",
            "Initial commit",
        );

        fs::create_dir_all(source_dir.parent().unwrap()).unwrap();
        let remote_dir_str = remote_dir.to_string_lossy().to_string();
        let source_dir_str = source_dir.to_string_lossy().to_string();
        run_git_ok(
            source_dir.parent().unwrap(),
            &["clone", &remote_dir_str, &source_dir_str],
        );

        save_test_config(
            &base_dir,
            vec![project_entry(
                "project-1",
                "https://github.com/bang9/grove.git",
                &source_dir,
            )],
        );

        let initial_project = list_projects_impl().unwrap().pop().unwrap();
        assert!(!initial_project.source_has_changes);
        assert!(!initial_project.source_behind_remote);

        commit_and_push(
            &seed_dir,
            &remote_dir,
            "trunk",
            "README.md",
            "# Grove v2\n",
            "Remote ahead",
        );
        remove_fetch_head(&source_dir);

        let project = list_projects_impl().unwrap().pop().unwrap();

        assert!(!project.source_has_changes);
        assert!(project.source_behind_remote);
        assert_ne!(
            run_git_output(&source_dir, &["rev-parse", "HEAD"]).unwrap(),
            run_git_output(&source_dir, &["rev-parse", "origin/trunk"]).unwrap()
        );
    }

    #[test]
    fn refresh_project_resets_source_to_remote_default_branch() {
        let _lock = env_lock();
        let home = TestHome::new();
        let base_dir = home.root.join("grove-data");
        let source_dir = base_dir
            .join("github.com")
            .join("bang9")
            .join("grove")
            .join("source");
        let remotes_dir = home.root.join("remotes");
        let (remote_dir, seed_dir) = create_bare_remote(&remotes_dir, "grove-refresh", "trunk");

        commit_and_push(
            &seed_dir,
            &remote_dir,
            "trunk",
            "README.md",
            "# Grove v1\n",
            "Initial commit",
        );

        fs::create_dir_all(source_dir.parent().unwrap()).unwrap();
        let remote_dir_str = remote_dir.to_string_lossy().to_string();
        let source_dir_str = source_dir.to_string_lossy().to_string();
        run_git_ok(
            source_dir.parent().unwrap(),
            &["clone", &remote_dir_str, &source_dir_str],
        );

        save_test_config(
            &base_dir,
            vec![project_entry(
                "project-1",
                "https://github.com/bang9/grove.git",
                &source_dir,
            )],
        );

        // Add a local dirty file that does NOT conflict with remote changes
        fs::write(source_dir.join("local.txt"), "local work").unwrap();

        commit_and_push(
            &seed_dir,
            &remote_dir,
            "trunk",
            "README.md",
            "# Grove v2\n",
            "Refresh source",
        );

        let project = refresh_project_impl("project-1").unwrap();

        assert!(project.worktrees.is_empty());
        // source_has_changes is true because local.txt remains an untracked local change
        assert!(project.source_has_changes);
        // Remote change is pulled
        assert_eq!(
            fs::read_to_string(source_dir.join("README.md")).unwrap(),
            "# Grove v2\n"
        );
        // Local dirty file is preserved via stash
        assert_eq!(
            fs::read_to_string(source_dir.join("local.txt")).unwrap(),
            "local work"
        );
        assert_eq!(
            run_git_output(&source_dir, &["rev-parse", "HEAD"]).unwrap(),
            run_git_output(&source_dir, &["rev-parse", "origin/trunk"]).unwrap()
        );
        assert_eq!(
            run_git_output(&source_dir, &["branch", "--show-current"]).unwrap(),
            "trunk"
        );
    }

    #[test]
    fn refresh_project_restores_tracked_dirty_changes_after_sync() {
        let _lock = env_lock();
        let home = TestHome::new();
        let base_dir = home.root.join("grove-data");
        let source_dir = base_dir
            .join("github.com")
            .join("bang9")
            .join("grove")
            .join("source");
        let remotes_dir = home.root.join("remotes");
        let (remote_dir, seed_dir) =
            create_bare_remote(&remotes_dir, "grove-refresh-tracked", "trunk");

        commit_and_push(
            &seed_dir,
            &remote_dir,
            "trunk",
            "README.md",
            "# Grove v1\n",
            "Initial commit",
        );

        fs::create_dir_all(source_dir.parent().unwrap()).unwrap();
        let remote_dir_str = remote_dir.to_string_lossy().to_string();
        let source_dir_str = source_dir.to_string_lossy().to_string();
        run_git_ok(
            source_dir.parent().unwrap(),
            &["clone", &remote_dir_str, &source_dir_str],
        );

        save_test_config(
            &base_dir,
            vec![project_entry(
                "project-1",
                "https://github.com/bang9/grove.git",
                &source_dir,
            )],
        );

        fs::write(source_dir.join("README.md"), "# Grove v1\nLocal note\n").unwrap();

        commit_and_push(
            &seed_dir,
            &remote_dir,
            "trunk",
            "SYNC.md",
            "remote update\n",
            "Refresh source",
        );

        let project = refresh_project_impl("project-1").unwrap();

        // Tracked file modification is preserved via stash/pop
        assert!(project.source_has_changes);
        assert_eq!(
            fs::read_to_string(source_dir.join("README.md")).unwrap(),
            "# Grove v1\nLocal note\n"
        );
        assert_eq!(
            fs::read_to_string(source_dir.join("SYNC.md")).unwrap(),
            "remote update\n"
        );
        assert_eq!(
            run_git_output(&source_dir, &["rev-parse", "HEAD"]).unwrap(),
            run_git_output(&source_dir, &["rev-parse", "origin/trunk"]).unwrap()
        );
    }

    #[test]
    fn refresh_project_keeps_recoverable_stash_when_reapply_conflicts() {
        let _lock = env_lock();
        let home = TestHome::new();
        let base_dir = home.root.join("grove-data");
        let source_dir = base_dir
            .join("github.com")
            .join("bang9")
            .join("grove")
            .join("source");
        let remotes_dir = home.root.join("remotes");
        let (remote_dir, seed_dir) =
            create_bare_remote(&remotes_dir, "grove-refresh-conflict", "trunk");

        commit_and_push(
            &seed_dir,
            &remote_dir,
            "trunk",
            "README.md",
            "# Grove v1\n",
            "Initial commit",
        );

        fs::create_dir_all(source_dir.parent().unwrap()).unwrap();
        let remote_dir_str = remote_dir.to_string_lossy().to_string();
        let source_dir_str = source_dir.to_string_lossy().to_string();
        run_git_ok(
            source_dir.parent().unwrap(),
            &["clone", &remote_dir_str, &source_dir_str],
        );

        save_test_config(
            &base_dir,
            vec![project_entry(
                "project-1",
                "https://github.com/bang9/grove.git",
                &source_dir,
            )],
        );

        fs::write(source_dir.join("README.md"), "# Grove local\n").unwrap();

        commit_and_push(
            &seed_dir,
            &remote_dir,
            "trunk",
            "README.md",
            "# Grove remote\n",
            "Conflicting refresh source",
        );

        let error = refresh_project_impl("project-1").unwrap_err();
        let stash_list = run_git_output(&source_dir, &["stash", "list"]).unwrap();

        assert!(error.contains("temporary stash"));
        assert!(error.contains("git stash apply"));
        assert!(stash_list.contains("grove-source-sync-"));
        assert_eq!(
            run_git_output(&source_dir, &["rev-parse", "HEAD"]).unwrap(),
            run_git_output(&source_dir, &["rev-parse", "origin/trunk"]).unwrap()
        );
    }
}
