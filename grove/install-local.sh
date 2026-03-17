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
    echo "==> Building Electron app..."
    pnpm build:electron

    BUNDLE_PATH=$(find dist-electron -name "*.dmg" -o -name "*.app" 2>/dev/null | head -1)
    if [ -n "$BUNDLE_PATH" ] && [[ "$BUNDLE_PATH" == *.app ]]; then
      INSTALL_PATH="/Applications/${APP_NAME}-electron.app"
      echo "==> Installing to ${INSTALL_PATH}..."
      if [ -d "$INSTALL_PATH" ]; then
        rm -rf "$INSTALL_PATH"
      fi
      cp -r "$BUNDLE_PATH" "$INSTALL_PATH"
      echo "==> Done! Open grove-electron from /Applications or Spotlight."
    elif [ -n "$BUNDLE_PATH" ]; then
      echo "==> Built: ${BUNDLE_PATH}"
      echo "==> Open the DMG to install."
    else
      echo "==> Build complete. Check dist-electron/ for output."
    fi
    ;;
  *)
    echo "Usage: $0 [tauri|electron]"
    exit 1
    ;;
esac
