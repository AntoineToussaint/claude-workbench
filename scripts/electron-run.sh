#!/bin/bash
# Runs Electron with the correct native module build.
# Uses a SEPARATE Electron-specific build dir so the system Node build is NEVER touched.

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_DIR"

SQLITE_PKG="node_modules/better-sqlite3"
NATIVE_MODULE="$SQLITE_PKG/build/Release/better_sqlite3.node"
ELECTRON_CACHE="$PROJECT_DIR/.electron-cache"
ELECTRON_MODULE="$ELECTRON_CACHE/better_sqlite3.node"
NODE_BACKUP="$ELECTRON_CACHE/better_sqlite3.node.node-backup"

# ── Kill zombie Electron instances ────────────────────────────────
ZOMBIES=$(pgrep -f "Electron.*claude-workbench" 2>/dev/null || true)
if [ -n "$ZOMBIES" ]; then
  echo "==> Killing stale Electron processes..."
  kill $ZOMBIES 2>/dev/null || true
  sleep 1
fi

# ── Ensure system native module exists ────────────────────────────
if [ ! -f "$NATIVE_MODULE" ]; then
  echo "==> System native module missing, running npm rebuild..."
  npm rebuild better-sqlite3
fi

ELECTRON_VERSION=$(npx electron --version 2>/dev/null | sed 's/^v//')
ARCH=$(uname -m)
[ "$ARCH" = "x86_64" ] && ARCH="x64"

echo "==> Building frontend..."
npm run build || exit 1

# ── Build Electron-specific native module (separate dir) ──────────
if [ ! -f "$ELECTRON_MODULE" ]; then
  echo "==> Building better-sqlite3 for Electron $ELECTRON_VERSION ($ARCH)..."
  mkdir -p "$ELECTRON_CACHE"

  # Save system Node build outside the build/ dir (node-gyp rebuild wipes it)
  cp "$NATIVE_MODULE" "$NODE_BACKUP"

  # Rebuild for Electron
  (cd "$SQLITE_PKG" && npx node-gyp rebuild \
    --target="$ELECTRON_VERSION" \
    --arch="$ARCH" \
    --dist-url=https://electronjs.org/headers \
    --runtime=electron 2>&1 | grep -E "^(gyp|SOLINK|Error)" || true)

  # Stash the Electron build, restore the Node build
  cp "$NATIVE_MODULE" "$ELECTRON_MODULE"
  mv "$NODE_BACKUP" "$NATIVE_MODULE"

  if [ "$(uname)" = "Darwin" ]; then
    echo "==> Signing Electron native module..."
    codesign --force --sign - "$ELECTRON_MODULE" 2>/dev/null || true
    ELECTRON_APP=$(find node_modules -name "Electron.app" -maxdepth 5 2>/dev/null | head -1)
    [ -n "$ELECTRON_APP" ] && codesign --force --deep --sign - "$ELECTRON_APP" 2>/dev/null || true
  fi
else
  echo "==> Using cached Electron native module"
fi

# ── Swap in Electron build, run, swap back ────────────────────────
cp "$NATIVE_MODULE" "$NODE_BACKUP"

cleanup() {
  echo "==> Restoring system-Node native module..."
  [ -f "$NODE_BACKUP" ] && mv "$NODE_BACKUP" "$NATIVE_MODULE"
}
trap cleanup EXIT INT TERM

cp "$ELECTRON_MODULE" "$NATIVE_MODULE"

# For --build mode, run electron-builder
if [[ " $* " == *" --build "* ]]; then
  npx electron-builder build --mac
  exit 0
fi

echo "==> Launching Electron..."
npx electron . "$@"
