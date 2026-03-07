# claude-irc

IRC-inspired inter-session communication for Claude Code agents. Enable multiple Claude Code sessions on the same machine to exchange messages, share context, and coordinate in real-time.

## The Problem

When running multiple Claude Code sessions in parallel (e.g., one on server code, another on client code), sessions are isolated. They can't share context about API contracts, coordinate changes, or ask each other questions.

## The Solution

`claude-irc` creates a machine-wide shared communication channel. Sessions "join" the channel, send messages, publish structured context, and detect each other's online presence via Unix sockets.

## Quick Start

```bash
# Install
curl -fsSL https://raw.githubusercontent.com/bang9/ai-tools/main/claude-irc/install.sh | bash

# Terminal 1
claude-irc join server
claude-irc msg client "API ready. Check src/server/types/user.ts"

# Terminal 2
claude-irc join client
claude-irc inbox
claude-irc msg server "Got it. Need avatarUrl in UserResponse"
```

## Commands

| Command | Description |
|---------|-------------|
| `join <name>` | Join the channel with a peer name |
| `who` | List peers with online/offline status |
| `msg <peer> "<text>"` | Send a message to a peer |
| `inbox` | Show unread messages |
| `inbox <number>` | Read full message by index |
| `inbox --all` | Show all messages including read |
| `inbox clear` | Delete all messages |
| `check [--quiet]` | Check for unread messages (hook-friendly) |
| `watch [--interval N]` | One-shot watcher: print unread, mark read, exit; restart for next batch |
| `topic "<title>"` | Publish structured context (stdin, same title = update) |
| `topic --delete <n>` | Delete a topic by index |
| `topic --clear` | Delete all your topics |
| `board <peer> [n]` | List or read a peer's published topics |
| `quit` | Leave the channel and clean up |
| `upgrade` | Update to latest version |
| `--version` | Show current version |

## Features

- **Real-time presence**: Unix domain socket per session for instant online/offline detection
- **File-based messaging**: Reliable, persistent messages that survive process restarts
- **Structured context**: Publish API contracts, schemas, or any structured information as topics
- **Machine-wide**: All sessions on the same machine share a single channel
- **Hook integration**: `PreToolUse` hook auto-surfaces new messages to Claude
- **Background monitoring**: `watch` command enables event-driven reception via one-shot background tasks
- **Stale cleanup**: Dead sessions are automatically detected and cleaned up

For conversational ping-pong, treat `watch` as a one-shot trigger: when it exits with unread messages, start a new `watch` first, then read/process/respond while the new watcher waits for the next batch.

## Name Resolution

Commands that need identity (`msg`, `inbox`, `topic`) resolve the peer name via:
1. **Session marker** — written by `join`, matched by ancestor PID
2. **`--name` flag** — fallback when session detection fails; only `user` is allowed without an active session
3. Error if neither resolves

**Reserved name:** `user` is a send-only observer for the dashboard operator. It can send messages to agents but cannot receive messages. Agents should not attempt to reply to `user`.

## How It Works

```
Session A (server)                    Session B (client)
    │                                     │
    ├── claude-irc join server            ├── claude-irc join client
    │   ├── Register in registry.json     │   ├── Register in registry.json
    │   └── Start daemon (socket)         │   └── Start daemon (socket)
    │                                     │
    ├── claude-irc msg client "..."       │
    │   └── Write to inbox/client/        │
    │                                     │
    │                         [PreToolUse hook fires]
    │                         claude-irc check --quiet
    │                         → reads inbox/client/
    │                         → "[claude-irc] server: ..."
    │                                     │
    │                         Claude B sees the message
    │                         and incorporates into work
```

## Storage

Data is stored at `~/.claude-irc/`:

```
~/.claude-irc/
├── registry.json          # Registered peers
├── sockets/               # Unix domain sockets + PID files
├── inbox/<peer>/           # Messages (JSON files)
└── topics/<peer>/          # Published context (JSON files)
```

## Plugin Installation

Via Claude Code Plugin:

```bash
/plugin marketplace add bang9/ai-tools
/plugin install claude-irc
```

## Build from Source

```bash
cd claude-irc
make build    # Build CLI binary
make test     # Run tests
make cross    # Cross-compile for all platforms
```

## License

MIT
