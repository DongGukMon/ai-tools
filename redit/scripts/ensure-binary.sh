#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="$(dirname "$SCRIPT_DIR")"
BIN_DIR="$PLUGIN_ROOT/bin"
MCP_BINARY="$BIN_DIR/redit-mcp"

# Check if binary exists and is executable
if [ -x "$MCP_BINARY" ]; then
    exit 0
fi

# Check if Go is installed
if ! command -v go &> /dev/null; then
    echo "Warning: Go is not installed. Please install Go and run: cd $PLUGIN_ROOT && go build -o bin/redit-mcp ./cmd/redit-mcp" >&2
    exit 0
fi

# Build the binary
echo "Building redit-mcp binary..." >&2
mkdir -p "$BIN_DIR"
cd "$PLUGIN_ROOT"
go build -o "$MCP_BINARY" ./cmd/redit-mcp

echo "redit-mcp binary built successfully" >&2
