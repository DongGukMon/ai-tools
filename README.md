# ai-tools

A collection of tools for Claude Code to operate more efficiently.

## Tools

### redit

A local cache layer for editing remote documents.

- **Problem**: APIs that don't support partial updates (Confluence, Notion, etc.)
- **Solution**: Edit locally, then update with a single API call

```bash
# Install
cd redit && go build -o redit ./cmd/redit

# Usage
echo "$content" | redit init "confluence:12345"
# Edit with Edit tool...
redit read "confluence:12345" | mcp_update
redit drop "confluence:12345"
```

See details: [redit/CLAUDE.md](redit/CLAUDE.md)

## Design Principles

1. **Fast execution**: Written in Go, minimal cold start
2. **Simplicity**: Each tool does one thing well
3. **AI-friendly**: Interface that Claude Code can easily use
4. **Composable**: Naturally combines with existing MCPs and tools

## Project Structure

```
ai-tools/
├── README.md
├── redit/
│   ├── CLAUDE.md      # Claude usage guide
│   ├── go.mod
│   ├── cmd/redit/     # CLI entry point
│   ├── internal/      # Internal implementation
│   └── docs/          # Detailed documentation
└── (future tools...)
```
