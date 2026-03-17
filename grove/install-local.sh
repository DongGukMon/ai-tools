#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

TARGET="${1:-tauri}"
APP_NAME="grove"

echo "==> Installing dependencies..."
pnpm install --frozen-lockfile

case "$TARGET" in
  tauri)
    BUNDLE_PATH="src-tauri/target/release/bundle/macos/${APP_NAME}.app"
    INSTALL_PATH="/Applications/${APP_NAME}.app"

    echo "==> Building Tauri app..."
    pnpm tauri build --bundles app

    echo "==> Installing to /Applications..."
    if [ -d "$INSTALL_PATH" ]; then
      rm -rf "$INSTALL_PATH"
    fi
    cp -r "$BUNDLE_PATH" "$INSTALL_PATH"

    echo "==> Done! Open grove from /Applications or Spotlight."
    ;;
  electron)
    BUNDLE_PATH="dist-electron/mac-arm64/Grove.app"
    INSTALL_PATH="/Applications/${APP_NAME}-electron.app"

    echo "==> Building Electron app..."
    pnpm build:electron

    echo "==> Installing to /Applications..."
    if [ -d "$INSTALL_PATH" ]; then
      rm -rf "$INSTALL_PATH"
    fi
    cp -r "$BUNDLE_PATH" "$INSTALL_PATH"

    echo "==> Done! Open grove-electron from /Applications or Spotlight."
    ;;
  *)
    echo "Usage: $0 [tauri|electron]"
    exit 1
    ;;
esac
