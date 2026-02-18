# memex - Claude Usage Guide

## Overview

`memex` is a local knowledge graph that persists AI-extracted knowledge across conversations.
Knowledge is **automatically collected** via a hook that runs based on `hook_mode` config — you do not need to manually call any mutation tools during normal conversations.

Your primary role is to **query** the knowledge graph when relevant context might exist.

## Auto-Collection (Hook-Based)

A hook fires based on `hook_mode` (`realtime` = each turn, `session_end` = on /exit):
1. **Launcher** reads stdin, checks mode/lock, spawns detached worker
2. **Collector** reads the transcript JSONL and extracts new conversation turns
3. **Analyzer** (Agent SDK) evaluates turns for high-value knowledge only:
   - Architectural decisions, recurring patterns, gotchas, risks
   - NOT todos, tasks, open questions, debugging logs, or session-specific details
4. **Embedding Router** computes embeddings for each candidate and routes via cosine similarity (superseded notes are excluded from comparison to prevent duplicate chains):
   - `sim ≥ 0.8` → **supersede** existing note (mark old as superseded, add new with relation)
   - `sim ≥ 0.55` → **update** existing note (replace content, merge tags/sources)
   - `sim ≥ 0.2` → **add** with `relates_to` relation to similar note
   - `sim < 0.2` → **add** as independent note
5. **Store** receives the routed changes with tags, sources, relations, and embeddings

This happens automatically in the background — no manual intervention needed.

## MCP Tools Reference

### `mcp__memex__search`
Search notes by filters. When a query is provided, results are ranked by semantic (cosine) similarity and include a `similarity` score (0-1).
- `tag` (string, optional) — filter by tag
- `source` (string, optional) — filter by source key ("project:path")
- `query` (string, optional) — semantic similarity search query
- `status` (string, optional) — filter by status
- `min_score` (string, optional) — minimum similarity score threshold (0-1). Only applies when `query` is provided.
- `limit` (string, optional) — maximum number of results to return.

### `mcp__memex__context`
BFS graph traversal from notes matching a source path.
- `source` (string, required) — source path prefix to start traversal
- `hops` (string, optional) — max traversal depth (default: 3)

### `mcp__memex__list`
List all notes as summaries.

### `mcp__memex__get`
Retrieve a note by ID.
- `id` (string, required) — note ID

## Workflow

### Before Working on Files

```
1. Check existing knowledge for the file/area:
   mcp__memex__search(source="project:path/to/file.ts")

2. Check related tags:
   mcp__memex__search(tag="authentication")

3. Review risks and gotchas:
   mcp__memex__search(tag="gotcha")
   mcp__memex__search(tag="risk")
```

## Source Format

Sources use `"project:path"` format:
- `project` — git remote name or directory name
- `path` — relative to project root

Examples:
- `ai-tools:memex/src/store.ts`
- `myapp:src/auth/handler.ts`

## Status Lifecycle

- `open` — active, relevant knowledge (default)
- `resolved` — risk mitigated, pattern no longer applicable
- `superseded` — replaced by newer knowledge (set automatically by embedding router)

## Installation

Build locally:
```bash
cd memex && pnpm install && pnpm run build
```
