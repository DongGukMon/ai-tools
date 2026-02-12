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

### Release Process

1. Commit changes
2. Create and push tag: `git tag v1.x.x && git push --tags`
3. GitHub Actions automatically builds all tools and creates Release

## CI/CD

### Workflow Structure

Each tool has its own dedicated workflow files:

```
.github/workflows/
├── <tool>-test.yml       # Test workflow (push to main + PRs, path-filtered)
└── <tool>-release.yml    # Release workflow (tool-specific tag trigger)
```

**Test workflow** (`<tool>-test.yml`):
- Triggers on push to `main` and PRs with `paths: ['<tool>/**']`
- Runs `go test ./...`

**Release workflow** (`<tool>-release.yml`):
- Triggers on tag push matching `v*`
- Builds cross-platform binaries and attaches to GitHub Release

### Adding New Workflows

When adding a new tool:
1. Create `<tool>-test.yml` with path filter for `<tool>/**`
2. Create `<tool>-release.yml` with tag trigger `v*`

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
2. Create `.github/workflows/<tool>-test.yml` and `<tool>-release.yml`
3. Update root `README.md` with the new tool

## Code Style

- **Language**: Go for performance-critical tools
- **Error Handling**: Always return meaningful error messages
- **Documentation**: Include CLAUDE.md in each tool directory with usage instructions

## MCP Server Guidelines

- Use JSON-RPC 2.0 over stdio
- Implement `initialize`, `tools/list`, `tools/call` methods
- Return structured `ToolCallResult` with `content` array
- Set `isError: true` for error responses
