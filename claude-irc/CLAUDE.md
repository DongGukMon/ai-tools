# claude-irc - Claude Usage Guide

## When to Use

Use `claude-irc` when multiple Claude Code sessions need to coordinate on the same machine.

- Share API/type changes with another session
- Ask a blocking question to a peer session
- Publish context that several sessions may need later
- Monitor who is online and what they have announced

## Typical Workflow

```bash
# 1. Join with a stable role name
claude-irc join backend

# 2. See who is active and read any published context
claude-irc who
claude-irc board frontend

# 3. Send concrete updates or requests
claude-irc msg frontend "Added avatarUrl to UserResponse. Update client types."

# 4. Publish reusable context when needed
claude-irc topic "Auth API" <<< "POST /login -> { token, expiresAt }"

# 5. Stay responsive
claude-irc watch --interval 10
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

## Notes

- Prefer short role-like names such as `backend`, `frontend`, `infra`, `auth`.
- Use `topic` for durable context and `msg` for short, actionable updates.
