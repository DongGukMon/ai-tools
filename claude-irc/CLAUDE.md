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

# Legacy token mode
claude-irc serve --port 8585 --auth-mode token
```

Default auth mode is `device`. In device mode:

- the connect URL uses `#mode=device`
- the browser creates a pairing request
- `claude-irc serve` prints a one-time OTP that expires in 2 minutes
- successful pairing issues a session credential for later revisits

Use `--auth-mode token` only when you explicitly need the older long-lived bearer token flow.

When `--master-tmux` is set, three additional endpoints are available:

- `GET /api/master/capture` — returns tmux pane content
- `POST /api/master/keys` — sends keystrokes to the tmux session (`{"keys": "text\n"}`)
- `GET /api/master/status` — checks if the tmux session is alive

Authenticated endpoints accept either:

- `Authorization: Bearer <token>` in token mode
- `Authorization: WhipSession <session_id>.<session_secret>` in device mode

## Code Conventions

- Prefer responsibility-based file splits with consistent prefixes such as `server_*` and `store_*` when a file starts mixing routes, auth, process logic, or path helpers.
- Keep the main package entrypoint thin. Command wiring can stay in `main.go`, but command behavior should move into focused `cmd_*` files.
- Split tests by endpoint or subsystem as behavior grows. Avoid rebuilding large mixed files once topics have been separated.

## Notes

- Prefer short role-like names such as `backend`, `frontend`, `infra`, `auth`.
