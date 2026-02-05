# ai-tools

A collection of tools for Claude Code to operate more efficiently.

## Installation

```bash
# Add the marketplace
/plugin marketplace add bang9/ai-tools

# Install redit plugin
/plugin install redit
```

## Tools

### redit

A local cache layer for editing remote documents.

- **Problem**: APIs that don't support partial updates (Confluence, Notion, etc.)
- **Solution**: Edit locally with partial modifications, then update with a single API call

#### Features

- **MCP Server**: Automatically available as `mcp__redit__*` tools
- **Skill**: Use `/remote-edit` for guided workflow
- **CLI**: Direct command-line access

#### Quick Start

After installing the plugin, Claude can use redit tools automatically:

```
User: "Update the Installation section in Confluence page 12345"

Claude will:
1. Fetch content via Atlassian MCP
2. mcp__redit__init(key="confluence:12345", content=...)
3. Edit the local file (partial modification)
4. mcp__redit__read("confluence:12345") → get final content
5. Update via Atlassian MCP
6. mcp__redit__drop("confluence:12345")
```

#### Available Tools

| Tool | Description |
|------|-------------|
| `init` | Store content locally, returns working file path |
| `get` | Get working file path |
| `read` | Read working file content |
| `status` | Check dirty/clean state |
| `diff` | Show changes |
| `reset` | Restore to original |
| `drop` | Remove cache |
| `list` | List all cached documents |

## Requirements

- Claude Code
- Go 1.21+ (for building MCP server)

## Design Principles

1. **Fast execution**: Written in Go, minimal cold start
2. **Simplicity**: Each tool does one thing well
3. **AI-friendly**: Interface that Claude Code can easily use
4. **Composable**: Naturally combines with existing MCPs and tools

## Project Structure

```
ai-tools/
├── .claude-plugin/
│   └── marketplace.json    # Marketplace definition
├── README.md
└── redit/
    ├── .claude-plugin/
    │   └── plugin.json     # Plugin definition
    ├── .mcp.json           # MCP server config
    ├── skills/
    │   └── remote-edit/    # Skill for guided workflow
    ├── cmd/
    │   ├── redit/          # CLI
    │   └── redit-mcp/      # MCP Server
    └── internal/redit/     # Shared logic
```

## License

MIT
