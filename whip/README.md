# whip

Task orchestrator for Claude Code. Spawn and manage multiple Claude Code sessions via Terminal.app, with inter-session communication via claude-irc.

## The Problem

Complex tasks often need to be split into parallel workstreams. Manually opening terminals, starting Claude Code sessions, and coordinating between them is tedious and error-prone.

## The Solution

`whip` automates the entire lifecycle: create tasks, spawn dedicated Claude Code sessions in new Terminal tabs, track progress, manage dependencies, and auto-assign follow-up tasks when prerequisites complete.

## Quick Start

```bash
# Install (also installs claude-irc and webform)
curl -fsSL https://raw.githubusercontent.com/bang9/ai-tools/main/whip/install.sh | bash

# Create tasks
whip create "Auth module" --desc "Implement JWT authentication"
whip create "API endpoints" --desc "Build REST API for users"

# Assign (spawns new Terminal tab with Claude Code)
whip assign <auth-id> --master-irc whip-master
whip assign <api-id>

# Monitor
whip dashboard
```

## Commands

| Command | Description |
|---------|-------------|
| `create <title> [--desc/--file/stdin]` | Create a new task |
| `list` | List all tasks with status |
| `show <id>` | Show task details |
| `assign <id> [--master-irc <name>]` | Spawn session in new terminal |
| `unassign <id>` | Kill session, reset to created |
| `status <id> [new-status] [--note]` | Get/set status with notes |
| `broadcast "message"` | Message all active sessions |
| `heartbeat [id]` | Register PID (called by task session) |
| `retry <id>` | Retry failed task (resumes previous session context) |
| `resume <id>` | Resume task session interactively |
| `kill <id>` | Force kill a task session |
| `clean` | Remove completed/failed tasks |
| `dashboard` | Live TUI dashboard |
| `dep <id> --after <id>` | Set task dependencies |
| `upgrade` | Update to latest version |
| `version` | Show current version |

## Task Lifecycle

```
created --> assigned --> in_progress --> completed
                                    --> failed
```

- **create**: Task stored in `~/.whip/tasks/<id>/task.json`
- **assign**: osascript spawns Terminal tab with Claude Code + prompt file
- **heartbeat**: Task session registers its PID, status becomes `in_progress`
- **completed**: Dependent tasks are auto-assigned if all prerequisites met
- **kill/unassign**: Session terminated, task reset or marked failed

## Dependencies

```bash
whip create "Deploy" --desc "Deploy to production"
whip dep <deploy-id> --after <auth-id> --after <api-id>
```

Tasks with unmet dependencies cannot be assigned. When a dependency completes, `whip` automatically assigns any unblocked dependent tasks.

## Dashboard

`whip dashboard` opens a live TUI with:
- Task list with colored status indicators
- PID liveness checks (alive/dead)
- Dependency visualization
- Progress notes
- Auto-refresh every 2 seconds

## Session Runner

`whip assign` spawns a Claude Code session using the best available runner:

| Runner | Requirement | Behavior |
|--------|------------|----------|
| **tmux** (preferred) | `tmux` installed | Detached session — headless, capturable via dashboard |
| **Terminal.app** (fallback) | macOS only | Opens a new Terminal tab via osascript |

Install tmux for the best experience: `brew install tmux`

With tmux, `whip dashboard` can preview live session output and attach directly. Without tmux, sessions open in separate Terminal tabs.

## How It Works

1. **Master session** creates tasks and assigns them
2. Each assigned task spawns a tmux session (or Terminal tab) running `claude --dangerously-skip-permissions`
3. The spawned session reads a prompt file with task details, IRC setup, and completion instructions
4. Sessions communicate via `claude-irc` with periodic `/loop 1m claude-irc inbox` checks
5. On completion, dependent tasks are auto-assigned and the master is notified

For a detailed workflow guide, see [Workflow Guide (EN)](docs/workflow-en.md) | [워크플로우 가이드 (KO)](docs/workflow-ko.md)

## Storage

```
~/.whip/
├── config.json          # master_irc_name, settings
└── tasks/
    └── <task-id>/
        ├── task.json    # Metadata + status
        └── prompt.txt   # Initial prompt for Claude
```

## Plugin Installation

Via Claude Code Plugin:

```bash
/plugin marketplace add bang9/ai-tools
/plugin install whip
```

## Build from Source

```bash
cd whip
make build    # Build CLI binary
make test     # Run tests
make cross    # Cross-compile for all platforms
```

## License

MIT
