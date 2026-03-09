# whip - Claude Usage Guide

## When to Use

Use `whip` when one Claude session should act as a lead and dispatch work to other Claude sessions.

- Split a larger task into parallel sub-tasks
- Track ownership, status, and dependencies between tasks
- Resume or retry agent sessions with preserved context
- Coordinate a team through `claude-irc`

For ad hoc execution, use the CLI directly. For guided planning and dispatch, prefer `/whip-plan` and `/whip-start`. To capture a completed run as a reusable case study, use `/whip-lesson-learn`.

## Typical Workflow

```bash
# 1. Join IRC as the lead
claude-irc join whip-master

# 2. Create tasks
whip create "Auth module" --difficulty medium --desc "Implement JWT auth"
whip create "Deploy" --difficulty easy --desc "Deploy after auth"

# 3. Wire dependencies
whip dep <deploy-id> --after <auth-id>

# 4. Assign root tasks
whip assign <auth-id> --master-irc whip-master

# 5. Monitor progress
whip list
whip dashboard
claude-irc inbox
```

## Remote Mode

`whip remote` spawns a master Claude Code session in tmux and starts `claude-irc serve` for HTTP API access. This enables the web dashboard to display the master session's terminal output in real-time with direct keyboard input.

```bash
# Basic usage (requires tmux)
whip remote

# With options
whip remote --backend codex --difficulty medium --port 8585 --tunnel irc.bang9.dev
```

**Flags:**
- `--backend` — AI backend: `claude` (default) or `codex`
- `--difficulty` — Model effort level: `easy`, `medium`, `hard` (default)
- `--port` — Serve port (default 8585)
- `--tunnel` — Cloudflare tunnel hostname for remote access

Tunnel and port settings are saved to `~/.whip/config.json` for reuse. Ctrl+C stops the serve process; the master tmux session persists for reattach.

### TUI Dashboard

Press `R` in the task list view to configure and start/stop remote mode. The dashboard footer shows serve status, URL, and master session health when active.

### Web Dashboard

The web dashboard at the configured URL includes a **Terminal** tab that renders the master session's tmux output with full ANSI color support (via xterm.js) and allows sending keyboard input directly.

## Whip Home

`whip remote` seeds and reuses `~/.whip/home/` as persistent context for the master session.

- `prompt.md` is the master system prompt used by remote mode. It is only seeded when missing, so local edits persist across sessions.
- `memory.md` stores durable user preferences, operational patterns, and judgment criteria that the master can update as it learns.
- `projects.md` stores a lightweight project registry with paths, stacks, status, and short notes that the master can keep current.

Sub-agents may reference `~/.whip/home/memory.md` and `~/.whip/home/projects.md` as read-only context.

## Code Conventions

- Prefer splitting large files by responsibility using stable prefixes such as `backend_*`, `prompt_*`, `dashboard_*`, `store_*`, `task_*`, and `spawn_*`.
- Keep package boundaries small and avoid premature subpackage splits; prefer same-package file splits first, then extract a package only when the shared API is clear.
- Split tests by topic as the production code grows. Avoid returning to single catch-all files like `backend_test.go` or `server_test.go`.

## Help

Run `whip --help` for the full command list. For guided usage, see `/whip-plan`, `/whip-start`, and `/whip-lesson-learn`.

## Notes

- `assign` only works for tasks in `created` status whose dependencies are already complete.
- Dependent tasks auto-assign when prerequisites become `completed`.
- `tmux` is the preferred runner because it allows dashboard capture and attach.
- `whip remote` requires `tmux` to be installed (`brew install tmux` on macOS).
