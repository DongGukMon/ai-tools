use crate::config::{self, ProjectEntry};
use crate::{Project, Worktree};
use std::path::{Path, PathBuf};
use std::process::Command;
use uuid::Uuid;

fn base_dir() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".grove")
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
    let config = config::load_config();
    config
        .projects
        .into_iter()
        .find(|p| p.id == project_id)
        .ok_or_else(|| format!("Project not found: {project_id}"))
}

fn parse_worktree_list(output: &str, project_base: &Path) -> Vec<Worktree> {
    let mut worktrees = Vec::new();
    let mut current_path = String::new();
    let mut current_branch = String::new();
    let mut is_bare = false;

    for line in output.lines() {
        if let Some(path) = line.strip_prefix("worktree ") {
            // Flush previous entry
            if !current_path.is_empty() && !is_bare {
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
    if !current_path.is_empty() && !is_bare {
        worktrees.push(make_worktree(&current_path, &current_branch, project_base));
    }

    worktrees
}

fn make_worktree(path_str: &str, branch: &str, project_base: &Path) -> Worktree {
    let path = Path::new(path_str);
    let name = if path == project_base.join("source") {
        "source".to_string()
    } else {
        path.file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| path_str.to_string())
    };
    Worktree {
        name,
        path: path_str.to_string(),
        branch: branch.to_string(),
    }
}

fn get_worktrees_for_project(source_path: &str) -> Vec<Worktree> {
    let source = Path::new(source_path);
    let project_base = source.parent().unwrap_or(source);

    let output = match Command::new("git")
        .args(["worktree", "list", "--porcelain"])
        .current_dir(source)
        .output()
    {
        Ok(o) if o.status.success() => String::from_utf8_lossy(&o.stdout).to_string(),
        _ => return vec![],
    };

    parse_worktree_list(&output, project_base)
}

pub fn list_projects_impl() -> Result<Vec<Project>, String> {
    let config = config::load_config();
    let projects = config
        .projects
        .into_iter()
        .map(|entry| {
            let worktrees = get_worktrees_for_project(&entry.source_path);
            Project {
                id: entry.id,
                name: entry.name,
                url: entry.url,
                org: entry.org,
                repo: entry.repo,
                source_path: entry.source_path,
                worktrees,
            }
        })
        .collect();
    Ok(projects)
}

pub fn add_project_impl(url: &str) -> Result<Project, String> {
    let (host, org, repo) = parse_git_url(url)?;
    let proj_dir = project_dir(&host, &org, &repo);
    let source_dir = proj_dir.join("source");

    if source_dir.exists() {
        return Err(format!(
            "Project already exists at {}",
            source_dir.display()
        ));
    }

    std::fs::create_dir_all(&proj_dir)
        .map_err(|e| format!("Failed to create project directory: {e}"))?;
    std::fs::create_dir_all(proj_dir.join("worktrees"))
        .map_err(|e| format!("Failed to create worktrees directory: {e}"))?;

    let output = Command::new("git")
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

    let id = Uuid::new_v4().to_string();
    let source_path = source_dir.to_string_lossy().to_string();

    let mut config = config::load_config();
    config.projects.push(ProjectEntry {
        id: id.clone(),
        name: repo.clone(),
        url: url.to_string(),
        org: org.clone(),
        repo: repo.clone(),
        source_path: source_path.clone(),
    });
    config::save_config(&config)?;

    let worktrees = get_worktrees_for_project(&source_path);

    Ok(Project {
        id,
        name: repo.clone(),
        url: url.to_string(),
        org,
        repo,
        source_path,
        worktrees,
    })
}

pub fn create_project_impl(name: &str, remote_url: &str) -> Result<Project, String> {
    let (host, org, repo) = parse_git_url(remote_url)?;
    let proj_dir = project_dir(&host, &org, &repo);
    let source_dir = proj_dir.join("source");

    if source_dir.exists() {
        return Err(format!(
            "Project already exists at {}",
            source_dir.display()
        ));
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

    let id = Uuid::new_v4().to_string();
    let source_path = source_dir.to_string_lossy().to_string();

    let mut config = config::load_config();
    config.projects.push(ProjectEntry {
        id: id.clone(),
        name: name.to_string(),
        url: remote_url.to_string(),
        org: org.clone(),
        repo: repo.clone(),
        source_path: source_path.clone(),
    });
    config::save_config(&config)?;

    let worktrees = get_worktrees_for_project(&source_path);

    Ok(Project {
        id,
        name: name.to_string(),
        url: remote_url.to_string(),
        org,
        repo,
        source_path,
        worktrees,
    })
}

pub fn remove_project_impl(project_id: &str) -> Result<(), String> {
    let mut config = config::load_config();
    let idx = config
        .projects
        .iter()
        .position(|p| p.id == project_id)
        .ok_or_else(|| format!("Project not found: {project_id}"))?;

    let entry = config.projects.remove(idx);
    config::save_config(&config)?;

    // Cleanup directory (source parent = project dir)
    let source = Path::new(&entry.source_path);
    if let Some(proj_dir) = source.parent() {
        let _ = std::fs::remove_dir_all(proj_dir);
    }

    Ok(())
}

pub fn add_worktree_impl(project_id: &str, name: &str) -> Result<Worktree, String> {
    let entry = find_project_entry(project_id)?;
    let source = Path::new(&entry.source_path);

    if !source.exists() {
        return Err(format!("Source directory not found: {}", entry.source_path));
    }

    // Fetch latest from origin
    let _ = run_git(source, &["fetch", "origin"]);

    // git worktree add ../worktrees/<name> -b <name> origin/main
    let worktree_path = source
        .parent()
        .unwrap_or(source)
        .join("worktrees")
        .join(name);

    let worktree_path_str = worktree_path.to_string_lossy().to_string();

    run_git(
        source,
        &[
            "worktree",
            "add",
            &worktree_path_str,
            "-b",
            name,
            "origin/main",
        ],
    )?;

    Ok(Worktree {
        name: name.to_string(),
        path: worktree_path_str,
        branch: name.to_string(),
    })
}

pub fn remove_worktree_impl(project_id: &str, worktree_name: &str) -> Result<(), String> {
    let entry = find_project_entry(project_id)?;
    let source = Path::new(&entry.source_path);

    if !source.exists() {
        return Err(format!("Source directory not found: {}", entry.source_path));
    }

    let worktree_path = source
        .parent()
        .unwrap_or(source)
        .join("worktrees")
        .join(worktree_name);

    run_git(
        source,
        &[
            "worktree",
            "remove",
            &worktree_path.to_string_lossy(),
            "--force",
        ],
    )
}

pub fn list_worktrees_impl(project_id: &str) -> Result<Vec<Worktree>, String> {
    let entry = find_project_entry(project_id)?;
    Ok(get_worktrees_for_project(&entry.source_path))
}

fn run_git(cwd: &Path, args: &[&str]) -> Result<(), String> {
    let output = Command::new("git")
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
    Ok(())
}
