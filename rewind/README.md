# rewind

Visual timeline viewer for Claude Code and Codex session transcripts. It finds a local session file, parses it into normalized events, then opens an interactive browser UI for inspection.

## Install

### CLI

```bash
curl -fsSL https://raw.githubusercontent.com/bang9/ai-tools/main/rewind/install.sh | bash
```

### Plugin

Installs the `rewind` CLI automatically in Claude Code sessions:

```bash
/plugin marketplace add bang9/ai-tools
/plugin install rewind
```

## Quick Start

```bash
# Claude Code session
rewind claude <session-id>

# Codex session
rewind codex <session-id>

# Bind to a fixed port instead of a random one
rewind codex <session-id> --port 8080
```

`rewind` searches for the matching session file locally, starts a localhost web server, and opens the timeline in your browser. Press `Ctrl+C` in the terminal to stop the server.

Discover commands: `rewind --help`

## Supported Session Sources

- `claude`: looks for `~/.claude/projects/*/<session-id>.jsonl`
- `codex`: looks for `~/.codex/sessions/**/*-<session-id>.jsonl`

## What It Shows

- User and assistant messages
- Tool calls and tool results
- Reasoning / thinking summaries
- Session metadata such as backend, model, cwd, start time, and event count
- Interactive timeline features including sort toggle, minimap, and expandable event content

## Commands

| Command | Description |
|---------|-------------|
| `rewind <backend> <session-id> [--port <port>]` | Parse a session and open the browser timeline |
| `rewind version` | Print the current version |
| `rewind upgrade` | Upgrade to the latest release |

## Local Server

The viewer is served from `127.0.0.1` only. Each session launch uses a one-time token in the URL, and session data is served from an in-memory payload rather than writing parsed output to disk.

## Build from Source

```bash
cd rewind
make build
make test
make cross
```

## License

MIT
