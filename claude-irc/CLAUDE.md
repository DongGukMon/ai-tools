# claude-irc - Claude Usage Guide

## When to Use

Use `claude-irc` when multiple Claude Code sessions need to coordinate on the same machine.

- Share API/type changes with another session
- Ask a blocking question to a peer session
- Monitor who is online

## Typical Workflow

```bash
# 1. Join with a stable role name
claude-irc join backend

# 2. See who is active
claude-irc who

# 3. Send concrete updates or requests
claude-irc msg frontend "Added avatarUrl to UserResponse. Update client types."

# 4. Check messages
claude-irc inbox
```

## Help

Run `claude-irc --help` for the full command list.

## Serve Mode

`claude-irc serve` starts an HTTP API server for remote dashboard access.

```bash
# Basic
claude-irc serve --port 8585

# With master tmux session endpoints
claude-irc serve --port 8585 --master-tmux whip-master
```

When `--master-tmux` is set, three additional endpoints are available:

- `GET /api/master/capture` — returns tmux pane content
- `POST /api/master/keys` — sends keystrokes to the tmux session (`{"keys": "text\n"}`)
- `GET /api/master/status` — checks if the tmux session is alive

All endpoints require Bearer token authentication.

## Code Conventions

- Prefer responsibility-based file splits with consistent prefixes such as `server_*` and `store_*` when a file starts mixing routes, auth, process logic, or path helpers.
- Keep the main package entrypoint thin. Command wiring can stay in `main.go`, but command behavior should move into focused `cmd_*` files.
- Split tests by endpoint or subsystem as behavior grows. Avoid rebuilding large mixed files once topics have been separated.

## Notes

- Prefer short role-like names such as `backend`, `frontend`, `infra`, `auth`.
