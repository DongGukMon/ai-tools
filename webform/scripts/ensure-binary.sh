#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="$(dirname "$SCRIPT_DIR")"

REPO="bang9/ai-tools"
BINARY_NAME="webform"

# Check if binary is already available in PATH
if command -v "$BINARY_NAME" &> /dev/null; then
    exit 0
fi

INSTALL_DIR="$HOME/.local/bin"
INSTALLED_BINARY="$INSTALL_DIR/$BINARY_NAME"

# Check if already installed
if [ -x "$INSTALLED_BINARY" ]; then
    exit 0
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
    BINARY_NAME="${BINARY_NAME}.exe"
fi

# Get latest release version
echo "Fetching latest release version..." >&2
VERSION=$(curl -sfSL "https://api.github.com/repos/${REPO}/releases/latest" | grep '"tag_name"' | head -1 | cut -d'"' -f4)

if [ -z "$VERSION" ]; then
    echo "Failed to fetch latest version, using fallback v1.0.0" >&2
    VERSION="v1.0.0"
fi

DOWNLOAD_URL="https://github.com/${REPO}/releases/download/${VERSION}/${DOWNLOAD_NAME}"

echo "Downloading webform ${VERSION}..." >&2

# Try to download
if command -v curl &> /dev/null; then
    if curl -fsSL -o "$INSTALLED_BINARY" "$DOWNLOAD_URL"; then
        chmod +x "$INSTALLED_BINARY"
        echo "webform ${VERSION} installed to $INSTALLED_BINARY" >&2
        exit 0
    fi
elif command -v wget &> /dev/null; then
    if wget -q -O "$INSTALLED_BINARY" "$DOWNLOAD_URL"; then
        chmod +x "$INSTALLED_BINARY"
        echo "webform ${VERSION} installed to $INSTALLED_BINARY" >&2
        exit 0
    fi
fi

echo "Failed to download binary. Trying to build from source..." >&2

# Fallback: build from source
if command -v go &> /dev/null; then
    echo "Building webform from source..." >&2
    cd "$PLUGIN_ROOT"
    go build -o "$INSTALLED_BINARY" ./cmd/webform
    echo "webform built successfully" >&2
    exit 0
fi

echo "Error: Could not download binary and Go is not installed." >&2
echo "Please install Go or download manually from:" >&2
echo "  ${DOWNLOAD_URL}" >&2
exit 1
