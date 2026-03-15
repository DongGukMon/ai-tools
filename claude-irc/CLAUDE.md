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

# 3. Confirm your current identity when you need to reuse it elsewhere
claude-irc whoami

# 4. Send concrete updates or requests
claude-irc msg frontend "Added avatarUrl to UserResponse. Update client types."

# 5. Check messages
claude-irc inbox
```

## Help

Run `claude-irc --help` for the full command list.

## Scope

`claude-irc` is the local messaging layer only.

- Use `whip remote` for remote dashboard access, device auth, tunnels, and master tmux control.
- `claude-irc serve` no longer exists.

## Code Conventions

- Prefer responsibility-based file splits with consistent prefixes such as `cmd_*`, `daemon_*`, and `store_*`.
- Keep the main package entrypoint thin. Command wiring can stay in `main.go`, but command behavior should move into focused `cmd_*` files.
- Split tests by subsystem as behavior grows. Avoid rebuilding large mixed files once topics have been separated.

## Notes

- Prefer short role-like names such as `backend`, `frontend`, `infra`, `auth`.
