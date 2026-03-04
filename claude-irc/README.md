# claude-irc

IRC-inspired inter-session communication for Claude Code agents. Enable multiple Claude Code sessions working in the same repo to exchange messages, share context, and coordinate in real-time.

## The Problem

When running multiple Claude Code sessions in parallel (e.g., one on server code, another on client code), sessions are isolated. They can't share context about API contracts, coordinate changes, or ask each other questions — they can only infer changes indirectly through `git diff`.

## The Solution

`claude-irc` creates a shared communication channel scoped to a git repository. Sessions "join" the channel, send messages, publish structured context, and detect each other's online presence via Unix sockets.

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
| `inbox` | Show received messages |
| `check [--quiet]` | Check for unread messages (hook-friendly) |
| `topic "<title>"` | Publish structured context (reads from stdin) |
| `board <peer> [n]` | List or read a peer's published topics |
| `quit` | Leave the channel and clean up |

## Features

- **Real-time presence**: Unix domain socket per session for instant online/offline detection
- **File-based messaging**: Reliable, persistent messages that survive process restarts
- **Structured context**: Publish API contracts, schemas, or any structured information as topics
- **Auto-discovery**: Sessions in the same git repo find each other automatically
- **Hook integration**: `PreToolUse` hook auto-surfaces new messages to Claude
- **Stale cleanup**: Dead sessions are automatically detected and cleaned up

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

Data is stored at `~/.claude-irc/<repo-id>/` where `repo-id` is a hash of the git remote URL.

```
~/.claude-irc/<repo-id>/
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
