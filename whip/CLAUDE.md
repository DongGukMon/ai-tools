# whip - Claude Usage Guide

## Overview

`whip` is a task orchestrator for Claude Code. It spawns and manages multiple Claude Code sessions via Terminal.app, with inter-session communication via `claude-irc`.

## Commands

```bash
whip create <title> [--desc "..." | --file desc.md | stdin]  # Create task
whip list                                    # List all tasks
whip show <id>                               # Task details
whip assign <id> [--master-irc <name>]       # Spawn session in new terminal
whip unassign <id>                           # Kill session, reset to created
whip status <id> [new-status] [--note "..."] # Get/set status with notes
whip broadcast "message"                     # Message all active sessions
whip heartbeat [id]                          # Register PID (called by task session)
whip kill <id>                               # Force kill session
whip retry <id>                              # Retry failed task (resumes previous session)
whip resume <id>                             # Resume task session interactively
whip clean                                   # Remove completed/failed tasks
whip dashboard                               # Live TUI dashboard
whip dep <id> --after <id>                   # Set dependencies
whip upgrade                                 # Update to latest version
whip --version                               # Show version
```

## Workflow

### As Master (orchestrating)

```bash
# 1. Join IRC as master
claude-irc join whip-master

# 2. Create tasks
whip create "Auth module" --desc "Implement JWT auth..."
whip create "API endpoints" --desc "Build REST API..."
whip create "Deploy" --desc "Deploy to production"

# 3. Set dependencies
whip dep <deploy-id> --after <auth-id> --after <api-id>

# 4. Assign (spawns terminal + Claude)
whip assign <auth-id> --master-irc whip-master
whip assign <api-id>

# 5. Monitor
whip dashboard  # in a separate terminal tab
/loop 1m claude-irc inbox

# 6. When deploy's deps are met, it auto-assigns
# 7. Clean up
whip clean && claude-irc quit
```

### As Task Owner (inside spawned session)

The spawned session automatically receives a prompt file with instructions. It will:
1. Run `whip heartbeat` to register its PID
2. Join IRC as `whip-<task-id>`
3. Enable `/loop 1m claude-irc inbox`
4. Work on the task autonomously
5. Report completion via `whip status <id> completed`

## Task Lifecycle

```
created → assigned → in_progress → completed
                                 → failed
```

- `assign` spawns terminal with `--session-id`, sets status to `assigned`
- `heartbeat` registers PID, sets to `in_progress`
- On `completed`, dependent tasks auto-assign
- `kill` force-terminates, sets to `failed`
- `retry` resets failed task and re-spawns with `--resume` (preserves conversation context)
- `resume` opens task's Claude session interactively in current terminal

## Session Tracking

Each task tracks its Claude Code session ID. On `assign`, whip generates a UUID and passes `--session-id` to Claude. This enables:
- **`whip retry <id>`**: Re-spawns with `claude --resume <old-session-id>`, preserving conversation context
- **`whip resume <id>`**: Opens the session interactively in the current terminal via `claude --resume`
- **`whip show <id>`**: Displays the Session ID

Tasks assigned before session tracking was added will have no session ID; retry/resume falls back to a fresh session.

## Storage

Tasks are stored in `~/.whip/tasks/<id>/task.json`. The master IRC name is persisted in `~/.whip/config.json`.

## ID Resolution

All commands accept full or prefix task IDs. If `a1b2c` is the only task starting with `a1`, then `whip show a1` works.

## Dependencies

Tasks with `depends_on` cannot be assigned until all dependencies are `completed`. When a task completes, whip automatically assigns any dependent tasks whose prerequisites are now fully met.

## Installation

```bash
curl -fsSL https://raw.githubusercontent.com/bang9/ai-tools/main/whip/install.sh | bash
```

Or build locally:
```bash
cd whip && make build
```
