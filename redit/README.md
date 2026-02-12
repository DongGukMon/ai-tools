# redit

A local cache layer for editing remote documents.

- **Problem**: APIs that don't support partial updates (Confluence, Notion, etc.)
- **Solution**: Edit locally with partial modifications, then update with a single API call

<details>
<summary>Storage Structure</summary>

```
~/.redit/<key-hash>/
├── meta.json   # {"key": "...", "created_at": "..."}
├── origin      # Original (immutable)
└── working     # Working copy (Edit target)
```

</details>

<details>
<summary>Tips</summary>

- Use `service:id` key format (e.g., `confluence:12345`, `notion:page-abc`)
- Use `service:id:version` when version distinction is needed
- Check `redit status` before pushing back — skip update if `clean`
- Always `redit drop` when done

</details>

## CLI

### Installation

```bash
curl -fsSL https://raw.githubusercontent.com/bang9/ai-tools/main/redit/install.sh | bash
```

### Quick Start

```bash
echo "$content" | redit init "confluence:12345"  # Store locally
# Edit the working file...
redit diff "confluence:12345"                     # Review changes
redit read "confluence:12345"                     # Get final content
redit drop "confluence:12345"                     # Clean up
```

### Command Reference

| Command | Description |
|---------|-------------|
| `redit init <key>` | Read stdin, create local cache, return working file path |
| `redit get <key>` | Return working file path |
| `redit read <key>` | Output working file content to stdout |
| `redit status <key>` | Check if modified (`dirty` / `clean`) |
| `redit diff <key>` | Show unified diff between origin and working |
| `redit reset <key>` | Restore working file to original |
| `redit drop <key>` | Remove all cached files for key |
| `redit list` | List all managed keys with status |

## MCP Server

### Installation

Automatically available as `mcp__redit__*` tools when the plugin is installed:

```bash
/plugin marketplace add bang9/ai-tools
/plugin install redit
```

### Quick Start

```
1. content = mcp__atlassian__get_page(id="12345")
2. path = mcp__redit__init(key="confluence:12345", content=content)
3. Edit <path> with partial modifications
4. final = mcp__redit__read("confluence:12345")
5. mcp__atlassian__update_page(id="12345", content=final)
6. mcp__redit__drop("confluence:12345")
```

### Tool Reference

| Tool | Description |
|------|-------------|
| `mcp__redit__init` | Store content locally, returns working file path |
| `mcp__redit__get` | Get working file path |
| `mcp__redit__read` | Read working file content |
| `mcp__redit__status` | Check dirty/clean state |
| `mcp__redit__diff` | Show unified diff |
| `mcp__redit__reset` | Restore to original |
| `mcp__redit__drop` | Remove cache |
| `mcp__redit__list` | List all cached documents |

## Skill

### Installation

Available automatically when the plugin is installed.

### Quick Start

```
/remote-edit confluence:12345 Update the Installation section
```

### Workflow

The `/remote-edit` skill guides Claude through the full edit cycle:

1. **Fetch and Initialize** — Fetch content via MCP, store locally with `redit init`
2. **Edit** — Use the Edit tool for partial modifications on the working file
3. **Review** — Check changes with `redit diff`, reset if needed with `redit reset`
4. **Commit** — Read final content with `redit read`, push back via MCP
5. **Cleanup** — Remove local cache with `redit drop`
