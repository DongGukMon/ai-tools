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

**Build Commands:**
```bash
GOOS=darwin GOARCH=arm64 go build -o dist/<tool>-darwin-arm64 ./cmd/<tool>
GOOS=darwin GOARCH=amd64 go build -o dist/<tool>-darwin-amd64 ./cmd/<tool>
GOOS=linux GOARCH=amd64 go build -o dist/<tool>-linux-amd64 ./cmd/<tool>
GOOS=windows GOARCH=amd64 go build -o dist/<tool>-windows-amd64.exe ./cmd/<tool>
```

**Release Process (Automated via GitHub Actions):**
1. Update version in `ensure-binary.sh`
2. Commit changes
3. Create and push tag: `git tag v1.x.x && git push --tags`
4. GitHub Actions automatically builds all platforms and creates Release

### Auto-Download Script

Each plugin MUST include an `ensure-binary.sh` script that:
1. Checks if binary already exists
2. Detects OS and architecture
3. Downloads pre-built binary from GitHub Releases
4. Falls back to source build if Go is installed
5. Provides clear error message if neither works

### Version Management

- Use semantic versioning: `vMAJOR.MINOR.PATCH`
- Tag format: `v1.0.0`, `v1.0.1`, etc.
- `ensure-binary.sh` automatically fetches latest version from GitHub API (no manual update needed)

### Adding New Tools

When adding a new tool to this repository:
1. Create tool directory with the standard plugin structure
2. Add build commands to `.github/workflows/release.yml`
3. Add binary files to the release files list in the workflow
4. Update root `README.md` with the new tool

## Plugin Structure

Each tool should follow this structure:

```
<tool-name>/
├── .claude-plugin/
│   └── plugin.json       # Plugin manifest
├── .mcp.json             # MCP server configuration
├── skills/               # Skills for guided workflows
├── scripts/
│   └── ensure-binary.sh  # Auto-download script
├── cmd/
│   └── <tool>-mcp/       # MCP server entry point
├── internal/             # Shared logic
└── dist/                 # Built binaries (gitignored)
```

## Code Style

- **Language**: Go for performance-critical tools
- **Error Handling**: Always return meaningful error messages
- **Documentation**: Include CLAUDE.md in each tool directory with usage instructions

## MCP Server Guidelines

- Use JSON-RPC 2.0 over stdio
- Implement `initialize`, `tools/list`, `tools/call` methods
- Return structured `ToolCallResult` with `content` array
- Set `isError: true` for error responses
