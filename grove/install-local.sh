#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

TARGET="${1:-tauri}"
APP_NAME="grove"
CLEANUP_FILES=()

cleanup() {
  local file
  for file in "${CLEANUP_FILES[@]-}"; do
    [ -n "$file" ] && rm -f "$file"
  done
}

trap cleanup EXIT

resolve_latest_tag() {
  local tag
  tag="$(git tag --sort=-creatordate | head -n 1 || true)"
  if [ -z "$tag" ]; then
    tag="$(git describe --tags --abbrev=0 2>/dev/null || true)"
  fi
  if [ -z "$tag" ]; then
    tag="$(node -p "require('./package.json').version" 2>/dev/null || printf '0.1.0')"
  fi
  printf '%s' "$tag"
}

normalize_app_version() {
  local raw="$1"
  raw="${raw#v}"
  printf '%s' "$raw"
}

compute_build_version() {
  date '+%y%m%d%H%M'
}

create_tauri_config_override() {
  local path="$1"
  printf '%s\n' '{' \
    "  \"version\": \"$APP_VERSION\"," \
    '  "bundle": {' \
    '    "macOS": {' \
    "      \"bundleVersion\": \"$BUILD_VERSION\"" \
    '    }' \
    '  }' \
    '}' > "$path"
}

LATEST_TAG="$(resolve_latest_tag)"
APP_VERSION="$(normalize_app_version "$LATEST_TAG")"
BUILD_VERSION="$(compute_build_version)"
ABOUT_LABEL="v${APP_VERSION}-${BUILD_VERSION}"

echo "==> Installing dependencies..."
pnpm install --frozen-lockfile
echo "==> About version: ${APP_VERSION} (${BUILD_VERSION})"
echo "==> About label: ${ABOUT_LABEL}"

case "$TARGET" in
  tauri)
    BUNDLE_PATH="target/release/bundle/macos/${APP_NAME}.app"
    INSTALL_PATH="/Applications/${APP_NAME}.app"
    TAURI_CONFIG_OVERRIDE="$(mktemp -t grove-tauri-config)"
    CLEANUP_FILES+=("$TAURI_CONFIG_OVERRIDE")
    create_tauri_config_override "$TAURI_CONFIG_OVERRIDE"

    echo "==> Building Tauri app..."
    pnpm tauri build --bundles app --config "$TAURI_CONFIG_OVERRIDE"

    echo "==> Installing to /Applications..."
    if [ -d "$INSTALL_PATH" ]; then
      rm -rf "$INSTALL_PATH"
    fi
    cp -r "$BUNDLE_PATH" "$INSTALL_PATH"

    echo "==> Done! Open grove from /Applications or Spotlight."
    echo "==> Installed About version: ${APP_VERSION} (${BUILD_VERSION})"
    ;;
  electron)
    BUNDLE_PATH="dist-electron/mac-arm64/Grove.app"
    INSTALL_PATH="/Applications/${APP_NAME}-electron.app"

    echo "==> Building Electron app..."
    GROVE_APP_VERSION="$APP_VERSION" \
    GROVE_BUILD_VERSION="$BUILD_VERSION" \
    GROVE_ELECTRON_DIR_ONLY=1 \
    pnpm build:electron

    echo "==> Installing to /Applications..."
    if [ -d "$INSTALL_PATH" ]; then
      rm -rf "$INSTALL_PATH"
    fi
    cp -r "$BUNDLE_PATH" "$INSTALL_PATH"

    echo "==> Done! Open grove-electron from /Applications or Spotlight."
    echo "==> Installed About version: ${APP_VERSION} (${BUILD_VERSION})"
    ;;
  *)
    echo "Usage: $0 [tauri|electron]"
    exit 1
    ;;
esac
