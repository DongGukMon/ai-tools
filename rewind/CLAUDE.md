# rewind - Claude Usage Guide

View agent session transcripts as a visual timeline in the browser.

```bash
rewind claude <session-id>
rewind codex <session-id>
rewind codex --path ~/.codex/sessions/2026/03/11/run-abc12345.jsonl --no-open
rewind cleanup
```

`rewind` exports a static self-contained local viewer instead of starting a localhost server. Auto-discovery is pattern-based (`~/.claude/projects/*/<id>.jsonl`, `~/.codex/sessions/YYYY/MM/DD/*-<id>.jsonl`). Prefer `--path` in security-sensitive environments to skip discovery entirely. Exported viewers live in `~/.rewind/viewers` and stale ones older than 30 minutes are deleted on the next run or via `rewind cleanup`.

Discover commands: `rewind --help`
