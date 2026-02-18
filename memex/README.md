# memex

A local knowledge graph for AI — automatically stores, connects, and retrieves knowledge across conversations.

## What It Does

memex gives AI assistants persistent memory. It **automatically collects** knowledge from conversations via a hook-based pipeline — architectural decisions, code patterns, risks, open questions — into a local knowledge graph. Future sessions can query this graph to build on past context instead of starting from scratch.

## Architecture

```
Claude Code Session
  │
  ├─ [Hook event, async] fires based on hook_mode config
  │   stdin: { session_id, transcript_path, cwd }
  │
  └─ hook.js (launcher → detached worker)
      ├─ Launcher: reads stdin, checks mode/lock, saves temp file, spawns worker, exits
      └─ Worker (detached, survives parent exit):
          ├─ Collector: reads transcript JSONL, extracts new turns (cursor-based)
          ├─ Analyzer: Agent SDK extracts knowledge → NoteCandidate[]
          ├─ Embedding Router: for each candidate:
          │   ├─ computeEmbedding(keywords + content)
          │   ├─ cosine similarity against all existing note embeddings
          │   └─ threshold-based routing:
          │       ├─ sim ≥ 0.8 → supersede (mark old superseded, add new)
          │       ├─ sim ≥ 0.55 → update (replace content, merge tags/sources)
          │       ├─ sim ≥ 0.2 → add with relates_to relation
          │       └─ sim < 0.2 → add as independent
          └─ Store: persists notes, indexes, embeddings, and relations
              ├─ notes/         (individual note files)
              ├─ index/         (tags, sources, graph indexes)
              └─ embeddings/    (semantic vectors via MiniLM-L6-v2 / BoW fallback)
```

### Data Flow

1. **Hook** — fires based on `hook_mode`: `realtime` (after each turn) or `session_end` (on /exit)
2. **Launcher** — reads stdin, checks lock, spawns detached worker process
3. **Collect** — reads transcript JSONL from cursor position, extracts user/assistant text
4. **Analyze** — Agent SDK with structured outputs extracts knowledge candidates
5. **Route** — each candidate is embedded and routed by cosine similarity to existing notes
6. **Store** — applies routed changes (add/update/supersede) with embeddings
7. **Query** — MCP tools search, context, list, and get for retrieval in future sessions

### MCP Server (Query-Only)

The MCP server provides tools for **querying** the knowledge graph:
- `search` — filter by tag, source, type, status; semantic similarity ranking with scores; `min_score` and `limit` filters
- `context` — BFS graph traversal from a source path
- `list` — list all notes as summaries
- `get` — retrieve a single note

## Installation

```bash
/plugin marketplace add bang9/ai-tools
/plugin install memex
```

### Build from Source

```bash
cd memex
pnpm install
pnpm run build    # builds MCP server + hook to dist/
```

## Configuration

Settings are stored in `~/.memex/config.json`.

| Setting | Description | Default |
|---------|-------------|---------|
| `auth_token` | OAuth token from `claude setup-token` (for Agent SDK) | (none) |
| `api_key` | Anthropic API key from [console.anthropic.com](https://console.anthropic.com) | (none) |
| `embedding_enabled` | Enable embedding-based routing and semantic search | `true` |
| `model` | Model for analysis | `claude-haiku-4-5-20251001` |
| `hook_mode` | `realtime` (Stop hook, each turn) or `session_end` (SessionEnd hook, on /exit) | `session_end` |
| `debug` | Enable debug logging to `~/.memex/hook.log` | `false` |

### Authentication

Auto-collection uses the Claude Agent SDK. Auth is resolved in priority order:

1. **Environment variables** — `CLAUDE_CODE_OAUTH_TOKEN` or `ANTHROPIC_API_KEY`
2. **`auth_token`** — set via config (get one with `claude setup-token`)
3. **`api_key`** — set via config

If none are set, auto-collection is disabled but search and graph features work normally.

### Status Values

- `open` — active, relevant (default)
- `resolved` — answered, completed, or mitigated
- `superseded` — replaced by newer knowledge

## Data Storage

All data is stored locally in `~/.memex/`:

```
~/.memex/
├── config.json          # User configuration
├── notes/               # Individual note files (JSON)
│   ├── <id>.json
│   └── ...
├── index/
│   ├── tags.json        # Tag → note IDs
│   ├── sources.json     # Source key → note IDs
│   └── graph.json       # Note ID → outgoing edges
├── embeddings/
│   └── vectors.json     # Note ID → embedding vector (384-dim)
└── sessions/
    └── <session_id>.cursor  # Last processed line per session
```

## License

MIT
