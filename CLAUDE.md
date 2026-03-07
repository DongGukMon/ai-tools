# ai-tools Development Guidelines

## Project Overview

This repository contains tools for Claude Code to operate more efficiently. Each tool is a separate module under its own directory.

## Release Policy

### Binary Distribution

All tools with compiled binaries MUST provide pre-built binaries for users without build tools installed.

**Supported Platforms:**
- `darwin-arm64` (macOS Apple Silicon)
- `darwin-amd64` (macOS Intel)
- `linux-amd64` (Linux x86_64)
- `windows-amd64` (Windows x86_64)

### Version Management

- Tag format: `v<MAJOR>.<MINOR>.<PATCH>` (e.g., `v1.2.0`)
- All tools share the same version and are released together
- `ensure-binary.sh` and `install.sh` fetch the latest version from GitHub API
- Plugin `version` fields are auto-updated by CI on release

### Release Process

1. Commit changes
2. Create and push tag: `git tag v1.x.x && git push --tags`
3. `release.yml` orchestrates:
   - N product workflows build binaries and attach to GitHub Release
   - `cc-marketplace-release.yml` updates `plugin.json` versions + regenerates `marketplace.json` + auto-commits to main

## CI/CD

### Workflow Structure

```
.github/workflows/
├── release.yml                  # Orchestrator (tag v* trigger)
├── <tool>-release.yml           # Product build (reusable, called by release.yml)
├── cc-marketplace-release.yml   # Version + marketplace sync (reusable, called by release.yml)
├── <tool>-test.yml              # Test workflow (push to main + PRs, path-filtered)
└── .github/scripts/
    └── sync-marketplace.sh      # Generates marketplace.json from plugin.json files
```

**Orchestrator** (`release.yml`):
- Triggers on tag push matching `v*`
- Calls all `<tool>-release.yml` workflows in parallel
- Then calls `cc-marketplace-release.yml` to sync versions

**Product release** (`<tool>-release.yml`):
- Triggered via `workflow_call` with `version` input
- Builds cross-platform binaries and attaches to GitHub Release

**Marketplace sync** (`cc-marketplace-release.yml`):
- Triggered via `workflow_call` with `version` input
- Updates `version` in each `plugin.json`, regenerates `marketplace.json`, commits to main

**Test workflow** (`<tool>-test.yml`):
- Triggers on push to `main` and PRs with `paths: ['<tool>/**']`
- Runs `go test ./...`

### Adding New Workflows

When adding a new tool:
1. Create `<tool>-test.yml` with path filter for `<tool>/**`
2. Create `<tool>-release.yml` as reusable workflow (`on: workflow_call`)
3. Add the tool to `release.yml` orchestrator

## Plugin Structure

Each tool should follow this structure:

```
<tool-name>/
├── .claude-plugin/
│   └── plugin.json       # Plugin manifest
├── .mcp.json             # MCP server configuration
├── install.sh            # One-liner install script (curl | bash)
├── Makefile              # Build workflow (build, cross, test, clean)
├── skills/               # Skills for guided workflows
├── scripts/
│   └── ensure-binary.sh  # Auto-download script
├── cmd/
│   ├── <tool>/           # CLI entry point
│   └── <tool>-mcp/       # MCP server entry point
├── internal/             # Shared logic
└── dist/                 # Built binaries (gitignored)
```

### Adding New Tools

1. Create tool directory with the standard plugin structure above
2. Create `.github/workflows/<tool>-test.yml` and `<tool>-release.yml` (reusable)
3. Add the tool to `.github/workflows/release.yml` orchestrator
4. Include `category` field in `.claude-plugin/plugin.json`
5. Update root `README.md` with the new tool

## Code Style

- **Language**: Go for performance-critical tools
- **Error Handling**: Always return meaningful error messages
- **Documentation**: Include CLAUDE.md in each tool directory with usage instructions

## MCP Server Guidelines

- Use JSON-RPC 2.0 over stdio
- Implement `initialize`, `tools/list`, `tools/call` methods
- Return structured `ToolCallResult` with `content` array
- Set `isError: true` for error responses
