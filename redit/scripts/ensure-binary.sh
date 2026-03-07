#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="$(dirname "$SCRIPT_DIR")"
BIN_DIR="$PLUGIN_ROOT/bin"
MCP_BINARY="$BIN_DIR/redit-mcp"
VERSION_FILE="$BIN_DIR/.redit-mcp-version"

REPO="bang9/ai-tools"

# Get expected version from plugin.json
EXPECTED_VERSION=$(grep '"version"' "$PLUGIN_ROOT/.claude-plugin/plugin.json" | head -1 | cut -d'"' -f4)

# Check if binary exists and is at expected version
if [ -x "$MCP_BINARY" ]; then
    INSTALLED_VERSION=""
    if [ -f "$VERSION_FILE" ]; then
        INSTALLED_VERSION=$(cat "$VERSION_FILE")
    fi
    if [ "$INSTALLED_VERSION" = "$EXPECTED_VERSION" ]; then
        exit 0  # up to date
    fi
    echo "Upgrading redit-mcp from ${INSTALLED_VERSION:-unknown} to $EXPECTED_VERSION..." >&2
fi

mkdir -p "$BIN_DIR"

# Detect OS and architecture
OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
ARCH="$(uname -m)"

case "$ARCH" in
    x86_64) ARCH="amd64" ;;
    aarch64|arm64) ARCH="arm64" ;;
    *) echo "Unsupported architecture: $ARCH" >&2; exit 1 ;;
esac

case "$OS" in
    darwin|linux) ;;
    mingw*|msys*|cygwin*) OS="windows" ;;
    *) echo "Unsupported OS: $OS" >&2; exit 1 ;;
esac

VERSION="$EXPECTED_VERSION"
BINARY_NAME="redit-mcp-${OS}-${ARCH}"
if [ "$OS" = "windows" ]; then
    BINARY_NAME="${BINARY_NAME}.exe"
fi

DOWNLOAD_URL="https://github.com/${REPO}/releases/download/${VERSION}/${BINARY_NAME}"

echo "Downloading redit-mcp ${VERSION}..." >&2

# Try to download pre-built binary
if command -v curl &> /dev/null; then
    if curl -fsSL -o "$MCP_BINARY" "$DOWNLOAD_URL"; then
        chmod +x "$MCP_BINARY"
        echo "$VERSION" > "$VERSION_FILE"
        echo "redit-mcp ${VERSION} installed successfully" >&2
        exit 0
    fi
elif command -v wget &> /dev/null; then
    if wget -q -O "$MCP_BINARY" "$DOWNLOAD_URL"; then
        chmod +x "$MCP_BINARY"
        echo "$VERSION" > "$VERSION_FILE"
        echo "redit-mcp ${VERSION} installed successfully" >&2
        exit 0
    fi
fi

echo "Failed to download pre-built binary. Trying to build from source..." >&2

# Fallback: try to build if Go is installed
if command -v go &> /dev/null; then
    echo "Building redit-mcp from source..." >&2
    cd "$PLUGIN_ROOT"
    go build -o "$MCP_BINARY" ./cmd/redit-mcp
    echo "$VERSION" > "$VERSION_FILE"
    echo "redit-mcp built successfully" >&2
    exit 0
fi

echo "Error: Could not download binary and Go is not installed." >&2
echo "Please install Go or download the binary manually from:" >&2
echo "  ${DOWNLOAD_URL}" >&2
exit 1
