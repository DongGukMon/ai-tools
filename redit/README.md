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
- Review `redit diff` and ask whether more changes are needed before pushing back
- If more edits are requested soon, keep using the same key
- Check `redit status` before pushing back — skip update if `clean`
- Only `redit drop` after final confirmation and the remote update

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
redit diff "confluence:12345"                     # Review and confirm
redit read "confluence:12345"                     # Get final content after final approval
redit drop "confluence:12345"                     # Clean up after remote update
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
| `redit upgrade` | Upgrade to the latest version |
| `redit version` | Show the current version |

## Plugin

Installs the `redit` CLI automatically in Claude Code sessions:

```bash
/plugin marketplace add bang9/ai-tools
/plugin install redit
```

## Claude Code Workflow

```
1. content = <fetch command for page 12345>
2. path = $(echo "$content" | redit init "confluence:12345")
3. Edit <path> with partial modifications
4. redit diff "confluence:12345" and ask whether more changes are needed
5. If follow-up edits arrive soon, keep using the same key
6. After final confirmation, final = $(redit read "confluence:12345")
7. <update command>(id="12345", content=final)
8. redit drop "confluence:12345"
```
