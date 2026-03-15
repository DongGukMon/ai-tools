#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

APP_NAME="grove"
BUNDLE_PATH="src-tauri/target/release/bundle/macos/${APP_NAME}.app"
INSTALL_PATH="/Applications/${APP_NAME}.app"

echo "==> Installing dependencies..."
pnpm install --frozen-lockfile

echo "==> Building production app..."
pnpm tauri build --bundles app

echo "==> Installing to /Applications..."
if [ -d "$INSTALL_PATH" ]; then
  rm -rf "$INSTALL_PATH"
fi
cp -r "$BUNDLE_PATH" "$INSTALL_PATH"

echo "==> Done! Open grove from /Applications or Spotlight."
