#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="$(dirname "$SCRIPT_DIR")"

REPO="bang9/ai-tools"
BINARY_NAME="whip"
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
    *) echo "Unsupported OS: $OS" >&2; exit 1 ;;
esac

# Validate supported platform
case "${OS}-${ARCH}" in
    darwin-arm64|darwin-amd64|linux-amd64) ;;
    *) echo "Unsupported platform: ${OS}/${ARCH}. Supported: darwin/arm64, darwin/amd64, linux/amd64" >&2; exit 1 ;;
esac

VERSION="$EXPECTED_VERSION"
DOWNLOAD_NAME="${BINARY_NAME}-${OS}-${ARCH}"
DOWNLOAD_URL="https://github.com/${REPO}/releases/download/${VERSION}/${DOWNLOAD_NAME}"

echo "Downloading whip ${VERSION}..." >&2

# Try to download
if command -v curl &> /dev/null; then
    if curl -fsSL -o "$INSTALLED_BINARY" "$DOWNLOAD_URL"; then
        chmod +x "$INSTALLED_BINARY"
        echo "whip ${VERSION} installed to $INSTALLED_BINARY" >&2

        # Also ensure required companion tools are at expected version
        for tool in claude-irc webform; do
            TOOL_PATH=""
            if command -v "$tool" &> /dev/null; then
                TOOL_PATH="$(command -v "$tool")"
            elif [ -x "$INSTALL_DIR/$tool" ]; then
                TOOL_PATH="$INSTALL_DIR/$tool"
            fi

            TOOL_VERSION=""
            if [ -n "$TOOL_PATH" ]; then
                TOOL_VERSION=$("$TOOL_PATH" --version 2>/dev/null | grep -oE 'v[0-9]+\.[0-9]+\.[0-9]+' || echo "")
            fi

            if [ "$TOOL_VERSION" != "$VERSION" ]; then
                # Stop claude-irc daemons before replacing its binary
                if [ "$tool" = "claude-irc" ]; then
                    daemon_pids=$(pgrep -f 'claude-irc __daemon' 2>/dev/null || true)
                    if [ -n "$daemon_pids" ]; then
                        echo "Stopping claude-irc daemons before upgrade..." >&2
                        echo "$daemon_pids" | xargs kill 2>/dev/null || true
                        sleep 1
                        for pid in $daemon_pids; do
                            kill -0 "$pid" 2>/dev/null && kill -9 "$pid" 2>/dev/null || true
                        done
                    fi
                    rm -f "$HOME/.claude-irc/sockets/"*.sock "$HOME/.claude-irc/sockets/"*.pid 2>/dev/null || true
                fi

                TOOL_URL="https://github.com/${REPO}/releases/download/${VERSION}/${tool}-${OS}-${ARCH}"
                if curl -fsSL -o "$INSTALL_DIR/$tool" "$TOOL_URL" 2>/dev/null; then
                    chmod +x "$INSTALL_DIR/$tool"
                    echo "$tool ${VERSION} installed" >&2
                fi
            fi
        done

        exit 0
    fi
elif command -v wget &> /dev/null; then
    if wget -q -O "$INSTALLED_BINARY" "$DOWNLOAD_URL"; then
        chmod +x "$INSTALLED_BINARY"
        echo "whip ${VERSION} installed to $INSTALLED_BINARY" >&2
        exit 0
    fi
fi

echo "Failed to download binary. Trying to build from source..." >&2

# Fallback: build from source
if command -v go &> /dev/null; then
    echo "Building whip from source..." >&2
    cd "$PLUGIN_ROOT"
    go build -o "$INSTALLED_BINARY" ./cmd/whip
    echo "whip built successfully" >&2
    exit 0
fi

echo "Error: Could not download binary and Go is not installed." >&2
echo "Please install Go or download manually from:" >&2
echo "  ${DOWNLOAD_URL}" >&2
exit 1
