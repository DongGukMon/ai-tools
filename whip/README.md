# whip

Task orchestrator for Claude Code — run single-task work in `global`, run stacked work in a named `workspace`, and monitor everything from a TUI or web dashboard.

## Install

```bash
curl -fsSL https://raw.githubusercontent.com/bang9/ai-tools/main/whip/install.sh | bash
```

Or via Claude Code Plugin:

```bash
/plugin marketplace add bang9/ai-tools
/plugin install whip
```

## Quick Start

```bash
# Single-task work in global
whip create "Auth module" --desc "Implement JWT authentication"
whip assign <auth-id>

# Stacked work in a named workspace
whip create "API endpoints" --workspace issue-sweep --desc "Build REST API for users"
whip dashboard
```

## Commands

| Command | Description |
|---------|-------------|
| `create <title> [--desc/--file/stdin] [--workspace <name>]` | Create a new task in `global` or a named workspace |
| `list` | List all tasks with status |
| `show <id>` | Show task details |
| `assign <id> [--master-irc <name>]` | Spawn agent session |
| `unassign <id>` | Kill session, reset to created |
| `status <id> [new-status] [--note]` | Get/set status with notes |
| `dep <id> --after <id>` | Set task dependencies |
| `broadcast "message"` | Message all active sessions |
| `retry <id>` | Retry failed task |
| `resume <id>` | Resume task session interactively |
| `kill <id>` | Force kill a task session |
| `clean` | Remove completed/failed tasks |
| `dashboard` | Live TUI dashboard |
| `remote` | Start remote mode with web dashboard |
| `hello` | Print hello world |

## Task Lifecycle

```
created → assigned → in_progress → completed
                                 → failed
```

- `global` tasks stay on the legacy path: `~/.whip/tasks/<id>/task.json`
- Named workspace tasks are stored under `~/.whip/workspaces/<name>/tasks/<id>/task.json`
- `assign` spawns a tmux session (or Terminal.app tab) with Claude Code
- Dependent tasks auto-assign when prerequisites complete
- Sessions communicate via shared `claude-irc`, while master identity is scoped by workspace

## Dashboard

`whip dashboard` — live TUI with task list, status indicators, dependency graph, and auto-refresh.

## Remote Mode

`whip remote` starts a master agent session + HTTP API server for remote access.

```bash
# Requires tmux and cloudflared
whip remote
whip remote --workspace issue-sweep
whip remote --workspace issue-sweep --tunnel your-tunnel.example.com
whip remote --workspace issue-sweep --backend codex --difficulty medium --port 8585
```

| Flag | Description |
|------|-------------|
| `--backend` | `claude` (default) or `codex` |
| `--difficulty` | `easy`, `medium`, `hard` (default) |
| `--workspace` | named workspace for stacked work (default: `global`) |
| `--port` | Serve port (default 8585) |
| `--tunnel` | Cloudflare tunnel hostname |

Settings are saved to `~/.whip/config.json` for reuse. With a tunnel, a **short URL** and **QR code** are generated for quick mobile access.

### Web Dashboard

- **Tasks** — real-time task list with status and detail view
- **Chat** — IRC messaging with agent peers and topic boards
- **Terminal** — live master session output with keyboard input, fullscreen mode, mobile touch scroll

## Skills

| Skill | Description |
|-------|-------------|
| `/whip-plan` | Decompose work into a `global` task or a stacked workspace plan |
| `/whip-start` | Dispatch agents in `global` or a named workspace |
| `/whip-lesson-learn` | Write a real-world whip case-study under `.whip/lesson-learn/` |

## How It Works

1. Master session creates tasks in `global` or a named workspace
2. Each task spawns a tmux session running Claude Code with a prompt file
3. Sessions coordinate via shared `claude-irc`, using workspace-scoped master identities
4. On completion, dependent tasks auto-assign and the workspace master is notified

See [Workflow Guide (EN)](docs/workflow-en.md) | [워크플로우 가이드 (KO)](docs/workflow-ko.md)

## Build from Source

```bash
cd whip && make build
```

## License

MIT
