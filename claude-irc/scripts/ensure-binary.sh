#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="$(dirname "$SCRIPT_DIR")"

REPO="bang9/ai-tools"
BINARY_NAME="claude-irc"
INSTALL_DIR="$HOME/.local/bin"
INSTALLED_BINARY="$INSTALL_DIR/$BINARY_NAME"

# Get expected version from plugin.json
EXPECTED_VERSION=$(grep '"version"' "$PLUGIN_ROOT/.claude-plugin/plugin.json" | head -1 | cut -d'"' -f4)

# Find binary and check version
BINARY_PATH=""
if command -v "$BINARY_NAME" &> /dev/null; then
    BINARY_PATH="$(command -v "$BINARY_NAME")"
elif [ -x "$INSTALLED_BINARY" ]; then
    BINARY_PATH="$INSTALLED_BINARY"
fi

if [ -n "$BINARY_PATH" ]; then
    INSTALLED_VERSION=$("$BINARY_PATH" --version 2>/dev/null | grep -oE 'v[0-9]+\.[0-9]+\.[0-9]+' || echo "")
    if [ "$INSTALLED_VERSION" = "$EXPECTED_VERSION" ]; then
        exit 0  # up to date
    fi
    echo "Upgrading $BINARY_NAME from ${INSTALLED_VERSION:-unknown} to $EXPECTED_VERSION..." >&2
fi

mkdir -p "$INSTALL_DIR"

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

DOWNLOAD_NAME="${BINARY_NAME}-${OS}-${ARCH}"
if [ "$OS" = "windows" ]; then
    DOWNLOAD_NAME="${DOWNLOAD_NAME}.exe"
    INSTALLED_BINARY="${INSTALLED_BINARY}.exe"
fi

VERSION="$EXPECTED_VERSION"
DOWNLOAD_URL="https://github.com/${REPO}/releases/download/${VERSION}/${DOWNLOAD_NAME}"

# Stop running claude-irc daemons before replacing the binary.
# Daemons will be restarted naturally by the next `claude-irc join`.
stop_claude_irc_daemons() {
    local daemon_pids
    daemon_pids=$(pgrep -f 'claude-irc __daemon' 2>/dev/null || true)
    if [ -n "$daemon_pids" ]; then
        echo "Stopping claude-irc daemons before upgrade..." >&2
        echo "$daemon_pids" | xargs kill 2>/dev/null || true
        sleep 1
        # Force kill any that didn't exit gracefully
        for pid in $daemon_pids; do
            kill -0 "$pid" 2>/dev/null && kill -9 "$pid" 2>/dev/null || true
        done
    fi
    # Clean up stale socket/pid files
    rm -f "$HOME/.claude-irc/sockets/"*.sock "$HOME/.claude-irc/sockets/"*.pid 2>/dev/null || true
}

stop_claude_irc_daemons

echo "Downloading claude-irc ${VERSION}..." >&2

# safe_install: download to temp file, rm old binary, mv new one in.
# Avoids corrupting running binaries — rm+mv creates a new inode.
safe_install() {
    local url="$1" dest="$2" tmp="${dest}.tmp.$$"
    if curl -fsSL -o "$tmp" "$url"; then
        chmod +x "$tmp"
        rm -f "$dest"
        mv "$tmp" "$dest"
        return 0
    fi
    rm -f "$tmp"
    return 1
}

# Try to download
if command -v curl &> /dev/null; then
    if safe_install "$DOWNLOAD_URL" "$INSTALLED_BINARY"; then
        echo "claude-irc ${VERSION} installed to $INSTALLED_BINARY" >&2
        exit 0
    fi
elif command -v wget &> /dev/null; then
    TMP_BINARY="${INSTALLED_BINARY}.tmp.$$"
    if wget -q -O "$TMP_BINARY" "$DOWNLOAD_URL"; then
        chmod +x "$TMP_BINARY"
        rm -f "$INSTALLED_BINARY"
        mv "$TMP_BINARY" "$INSTALLED_BINARY"
        echo "claude-irc ${VERSION} installed to $INSTALLED_BINARY" >&2
        exit 0
    fi
    rm -f "$TMP_BINARY"
fi

echo "Failed to download binary. Trying to build from source..." >&2

# Fallback: build from source
if command -v go &> /dev/null; then
    echo "Building claude-irc from source..." >&2
    cd "$PLUGIN_ROOT"
    go build -o "$INSTALLED_BINARY" ./cmd/claude-irc
    echo "claude-irc built successfully" >&2
    exit 0
fi

echo "Error: Could not download binary and Go is not installed." >&2
echo "Please install Go or download manually from:" >&2
echo "  ${DOWNLOAD_URL}" >&2
exit 1
