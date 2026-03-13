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
whip task assign <task-id> --master-irc <resolved-master-irc>
```

```bash
# stacked work in a named workspace
whip task create "API endpoints" --workspace issue-sweep --desc "Build REST API for users"
whip workspace view issue-sweep
whip dashboard
```

```bash
# lead-managed workspace — the lead autonomously spawns and coordinates workers
whip task create "Refactor auth system" --workspace auth-refactor --role lead --desc "Refactor auth to middleware pattern, update tests, write docs"
whip task assign <task-id> --master-irc <resolved-master-irc>
# The lead session handles worker creation, IRC coordination, and review internally
```

Before assigning tasks, resolve `master-irc` explicitly:

```bash
# Reuse the current IRC identity when this session is already joined
claude-irc whoami 2>/dev/null

# Inspect active peers for awareness; this is not your identity check
claude-irc who
```

Use this rule:
- If `claude-irc whoami` succeeds, reuse that exact identity as `master-irc`.
- If it fails, mint a new coordinating identity such as `wp-master-<task-name-short>`.
- Try `claude-irc join <candidate>` and, on name collision, retry with a short suffix such as `wp-master-<task-name-short>-<rand4>`.
- Reuse that same resolved name for every task assigned from the current coordinating session.
- For newly created identities, prefer the `wp-master-` prefix so dashboards and humans can recognize them easily.
- Pass `--master-irc <resolved-master-irc>` explicitly on every `whip task assign`.

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
| `task assign <id> [--master-irc <name>]` | `created|failed -> assigned`; spawn agent session. Prefer passing `--master-irc` explicitly. |
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
| `task create <title> [--desc/--file/stdin] [--workspace <name>] [--role lead]` | Create a task in `global` or a named workspace; `--role lead` creates a Workspace Lead |
| `task list [--archive]` | List active tasks, or archived tasks with `--archive` |
| `task view <id>` | View task details; falls back to archived tasks when needed |
| `task lifecycle [id] [--format json]` | Show the full state machine or valid next actions for one task |
| `task note <id> "<message>"` | Add progress info without changing status |
| `task dep <id> --after <id>` | Wire stack prerequisites |
| `task archive <id>` | Archive one active terminal task when no non-terminal dependent still references it |
| `task clean` | Archive every archiveable terminal task (`completed`, `canceled`) |
| `task delete <id>` | Permanently delete an archived task |

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

## Workspace Lead

Whip supports a **3-tier orchestration model**: master → lead → worker.

In the default 2-tier model, the master session creates tasks and directly manages each worker agent. In the 3-tier model, the master creates a single **Workspace Lead** task that autonomously handles worker creation, IRC coordination, reviews, and progress reporting.

```
2-tier:  Master → Worker A, Worker B, Worker C
3-tier:  Master → Lead → Worker A, Worker B, Worker C
```

Use the lead model when:
- The workspace has many tasks and coordinating them manually is overhead
- You want autonomous orchestration — the lead decides how to decompose and schedule work
- You prefer a single point of contact instead of managing multiple agents directly

Create a lead task with `--role lead`:

```bash
whip task create "Refactor auth system" --workspace auth-refactor --role lead --desc "..."
whip task assign <lead-id> --master-irc <resolved-master-irc>
```

The lead session receives a specialized prompt that enables it to:
- Decompose the objective into worker tasks
- Spawn and assign workers within the workspace
- Coordinate workers via IRC, relay context, and manage reviews
- Report aggregated progress back to the master
- Only the master completes the lead task — the lead does not self-complete

## Dashboard

`whip dashboard` opens the live TUI for:

- active/archived task lists with `tab` mode switching
- task detail view with archive/delete action gating
- blocked-by tracking
- `a` to archive an active terminal task, `d` to delete an archived task, `t` to attach tmux from detail
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
| `/whip-plan` | Decompose work into a `global` task, a stacked workspace plan, or a lead-managed workspace |
| `/whip-start` | Dispatch agents in `global` or a named workspace; supports `--role lead` for lead-managed workspaces |
| `/whip-lesson-learn` | Write a real-world whip case-study under `.whip/lesson-learn/` |

## More Docs

See [Workflow Guide (EN)](docs/workflow-en.md) | [워크플로우 가이드 (KO)](docs/workflow-ko.md)

## Build from Source

```bash
cd whip && make build
```

## License

MIT
