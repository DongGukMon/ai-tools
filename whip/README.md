# whip

Task orchestrator for Claude Code. Use `whip task ...` for task lifecycle, `whip workspace ...` for named workspaces, and the dashboard or remote mode for monitoring.

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
# single-task work in global
whip task create "Auth module" --desc "Implement JWT authentication"
whip task assign <task-id>
```

```bash
# stacked work in a named workspace
whip task create "API endpoints" --workspace issue-sweep --desc "Build REST API for users"
whip workspace view issue-sweep
whip dashboard
```

## Task Lifecycle

```text
created -> assigned -> in_progress -> completed
                           review -> approved -> completed
                           review -(request-changes)-> in_progress

assigned|in_progress|review|approved -> failed
created|assigned|in_progress|review|approved|failed -> canceled
failed -> assigned
```

- Statuses: `created`, `assigned`, `in_progress`, `review`, `approved`, `failed`, `completed`, `canceled`
- Terminal statuses: `completed`, `canceled`
- `failed` is non-terminal and can be re-dispatched with `whip task assign`
- Review tasks use `assign -> start -> review -> request-changes -> review -> approve -> complete`
- Non-review tasks can use `assign -> start -> complete`

## Command Overview

For the exact CLI surface, use:

- `whip --help`
- `whip task --help`
- `whip workspace --help`
- `whip task lifecycle`
- `whip task <action> --help`

### Task Lifecycle Commands

| Command | Description |
|---------|-------------|
| `task assign <id> [--master-irc <name>]` | `created|failed -> assigned`; spawn agent session |
| `task start <id>` | `assigned -> in_progress`; register PID for the live run |
| `task review <id>` | `in_progress -> review`; mark work ready for review |
| `task request-changes <id>` | `review -> in_progress`; send review feedback and resume active work |
| `task approve <id>` | `review -> approved`; notify the agent to finalize |
| `task complete <id>` | `in_progress|approved -> completed`; finish successfully |
| `task fail <id>` | `assigned|in_progress|review|approved -> failed`; preserve handoff context |
| `task cancel <id>` | `created|assigned|in_progress|review|approved|failed -> canceled` |

### Task Operations

| Command | Description |
|---------|-------------|
| `task create <title> [--desc/--file/stdin] [--workspace <name>]` | Create a task in `global` or a named workspace |
| `task list` | List all tasks with status |
| `task view <id>` | View task details |
| `task lifecycle [id] [--format json]` | Show the full state machine or valid next actions for one task |
| `task note <id> "<message>"` | Add progress info without changing status |
| `task dep <id> --after <id>` | Wire stack prerequisites |
| `task clean` | Remove terminal tasks (`completed`, `canceled`) |
| `task delete <id>` | Delete a task |

### Workspace Commands

| Command | Description |
|---------|-------------|
| `workspace list` | List named workspaces |
| `workspace view <name>` | View workspace metadata, execution model, and tasks |
| `workspace broadcast <workspace> <message>` | Message all active task sessions in that workspace |
| `workspace drop <name>` | Drop workspace tasks, metadata, and worktree |

## Workspace Model

- `global` is for one self-contained task.
- `workspace` is for a stacked lane of related tasks.
- `whip task create --workspace <name>` is the authoritative ensure step for a named workspace.

Workspace execution model:

- `git-worktree`
  - The first `whip task create --workspace <name>` ran inside git.
  - Whip ensures `WHIP_HOME/workspaces/<name>/worktree` and resolves task `cwd` inside it.
- `direct-cwd`
  - The first `whip task create --workspace <name>` ran outside git.
  - Tasks keep using the provided `cwd` and `worktree_path` may be empty.

When continuing a named workspace, start with `whip workspace view <name>` and prefer its stored `worktree_path` for later repo inspection, tests, and review commands.

## Dashboard

`whip dashboard` opens the live TUI for:

- task list and status badges
- task detail view
- blocked-by tracking
- live refresh
- remote mode control

## Remote Mode

`whip remote` starts a master agent session plus HTTP access for the web dashboard.

```bash
# requires tmux
whip remote
whip remote --workspace issue-sweep
whip remote --workspace issue-sweep --backend codex --difficulty medium --port 8585
```

Highlights:

- `tmux` is required
- device auth is the default flow
- `whip remote` prints the URL and OTP flow at runtime
- the web dashboard provides task views, IRC chat, and master terminal access

## Skills

| Skill | Description |
|-------|-------------|
| `/whip-plan` | Decompose work into a `global` task or a stacked workspace plan |
| `/whip-start` | Dispatch agents in `global` or a named workspace |
| `/whip-lesson-learn` | Write a real-world whip case-study under `.whip/lesson-learn/` |

## More Docs

See [Workflow Guide (EN)](docs/workflow-en.md) | [워크플로우 가이드 (KO)](docs/workflow-ko.md)

## Build from Source

```bash
cd whip && make build
```

## License

MIT
