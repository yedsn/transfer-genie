#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CURRENT_BRANCH="$(git -C "$ROOT_DIR" branch --show-current 2>/dev/null || true)"
DEFAULT_BRANCH="${CURRENT_BRANCH:-master}"

usage() {
  cat <<EOF
Usage:
  scripts/release/release [version] [--branch <name>] [--push]

Examples:
  scripts/release/release 0.1.2
  scripts/release/release
  scripts/release/release 0.1.2 --push
  scripts/release/release 0.1.2 --branch main --push

Behavior:
  - Update Cargo.toml and tauri.conf.json to the target version
  - Create commit: release: v<version>
  - Create git tag: v<version>
  - Optionally push branch and tag to ALL configured remotes
EOF
}

fail() {
  echo "[release] Error: $*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "Missing required command: $1"
}

read_current_version() {
  local version_line
  version_line="$(grep -m1 '^version = ' "$ROOT_DIR/Cargo.toml" || true)"
  [[ -n "$version_line" ]] || return 1
  echo "$version_line" | sed -E 's/^version = "([^"]+)".*/\1/'
}

suggest_next_version() {
  local current="$1"
  if [[ "$current" =~ ^([0-9]+)\.([0-9]+)\.([0-9]+)$ ]]; then
    echo "${BASH_REMATCH[1]}.${BASH_REMATCH[2]}.$((BASH_REMATCH[3] + 1))"
  fi
}

suggest_minor_version() {
  local current="$1"
  if [[ "$current" =~ ^([0-9]+)\.([0-9]+)\.([0-9]+)$ ]]; then
    echo "${BASH_REMATCH[1]}.$((BASH_REMATCH[2] + 1)).0"
  fi
}

suggest_major_version() {
  local current="$1"
  if [[ "$current" =~ ^([0-9]+)\.([0-9]+)\.([0-9]+)$ ]]; then
    echo "$((BASH_REMATCH[1] + 1)).0.0"
  fi
}

# Get all configured git remotes
get_remotes() {
  git -C "$ROOT_DIR" remote 2>/dev/null || true
}

VERSION=""
BRANCH="$DEFAULT_BRANCH"
PUSH="false"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --branch)
      [[ $# -ge 2 ]] || fail "--branch requires a value"
      BRANCH="$2"
      shift 2
      ;;
    --push)
      PUSH="true"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    -*)
      fail "Unknown option: $1"
      ;;
    *)
      if [[ -n "$VERSION" ]]; then
        fail "Only one version argument is supported"
      fi
      VERSION="$1"
      shift
      ;;
  esac
done

require_command git
require_command python3

if [[ -z "$VERSION" ]]; then
  CURRENT_VERSION="$(read_current_version || true)"
  SUGGESTED_PATCH_VERSION="$(suggest_next_version "$CURRENT_VERSION" || true)"
  SUGGESTED_MINOR_VERSION="$(suggest_minor_version "$CURRENT_VERSION" || true)"
  SUGGESTED_MAJOR_VERSION="$(suggest_major_version "$CURRENT_VERSION" || true)"

  if [[ -t 0 ]]; then
    if [[ -n "$SUGGESTED_PATCH_VERSION" && -n "$SUGGESTED_MINOR_VERSION" && -n "$SUGGESTED_MAJOR_VERSION" ]]; then
      echo "[release] 当前版本: $CURRENT_VERSION"
      echo "[release] 请选择版本类型:"
      echo "  1) patch -> $SUGGESTED_PATCH_VERSION"
      echo "  2) minor -> $SUGGESTED_MINOR_VERSION"
      echo "  3) major -> $SUGGESTED_MAJOR_VERSION"
      echo "  4) custom"

      choice=""
      while true; do
        read -r -p "请输入选项 [默认: 1]: " choice
        choice="${choice:-1}"
        case "$choice" in
          1)
            VERSION="$SUGGESTED_PATCH_VERSION"
            break
            ;;
          2)
            VERSION="$SUGGESTED_MINOR_VERSION"
            break
            ;;
          3)
            VERSION="$SUGGESTED_MAJOR_VERSION"
            break
            ;;
          4)
            read -r -p "请输入自定义版本号: " VERSION
            break
            ;;
          *)
            echo "[release] 无效选项，请输入 1、2、3 或 4"
            ;;
        esac
      done
    else
      read -r -p "请输入版本号: " VERSION
    fi
  else
    if [[ -n "$SUGGESTED_PATCH_VERSION" ]]; then
      fail "Missing version argument. Suggested versions: patch=$SUGGESTED_PATCH_VERSION minor=$SUGGESTED_MINOR_VERSION major=$SUGGESTED_MAJOR_VERSION"
    fi
    fail "Missing version argument"
  fi
fi

[[ -n "$VERSION" ]] || fail "Version cannot be empty"
[[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+([.-][0-9A-Za-z.-]+)?$ ]] || fail "Version must look like 0.1.2 or 0.1.2-beta.1"

git -C "$ROOT_DIR" rev-parse --is-inside-work-tree >/dev/null 2>&1 || fail "Not inside a git repository"

# Get all remotes
REMOTES="$(get_remotes)"
[[ -n "$REMOTES" ]] || fail "No git remotes configured"

if ! git -C "$ROOT_DIR" diff --quiet || ! git -C "$ROOT_DIR" diff --cached --quiet; then
  fail "Working tree is not clean. Commit or stash changes before running the release script."
fi

if git -C "$ROOT_DIR" rev-parse "v$VERSION" >/dev/null 2>&1; then
  fail "Git tag v$VERSION already exists locally"
fi

# Check if tag exists on any remote
while IFS= read -r remote; do
  [[ -n "$remote" ]] || continue
  if git -C "$ROOT_DIR" ls-remote --tags "$remote" "refs/tags/v$VERSION" 2>/dev/null | grep -q .; then
    fail "Git tag v$VERSION already exists on remote '$remote'"
  fi
done <<< "$REMOTES"

echo "[release] Preparing version $VERSION"
echo "[release] Branch: $BRANCH"
echo "[release] Remotes: $(echo "$REMOTES" | tr '\n' ' ')"

(
  cd "$ROOT_DIR"
  TARGET_VERSION="$VERSION" python3 <<'PY'
from pathlib import Path
import json
import os
import re

version = os.environ["TARGET_VERSION"]

cargo_path = Path("Cargo.toml")
cargo_text = cargo_path.read_text(encoding="utf-8")
cargo_text, cargo_count = re.subn(
    r'(?m)^version\s*=\s*"[^"]+"$',
    f'version = "{version}"',
    cargo_text,
    count=1,
)
if cargo_count != 1:
    raise SystemExit("Failed to update Cargo.toml version")
cargo_path.write_text(cargo_text, encoding="utf-8")

tauri_path = Path("tauri.conf.json")
tauri_data = json.loads(tauri_path.read_text(encoding="utf-8"))
tauri_data["version"] = version
tauri_path.write_text(json.dumps(tauri_data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
PY
)

python3 -m json.tool "$ROOT_DIR/tauri.conf.json" >/dev/null

echo "[release] Updated versions:"
grep -n '^version = ' "$ROOT_DIR/Cargo.toml"
grep -n '"version":' "$ROOT_DIR/tauri.conf.json" | head -n 1

git -C "$ROOT_DIR" add Cargo.toml tauri.conf.json
git -C "$ROOT_DIR" commit -m "release: v$VERSION"
git -C "$ROOT_DIR" tag -a "v$VERSION" -m "Release v$VERSION"

echo "[release] Created commit and tag v$VERSION"

if [[ "$PUSH" == "true" ]]; then
  # Push branch and tag to all remotes
  while IFS= read -r remote; do
    [[ -n "$remote" ]] || continue
    echo "[release] Pushing to remote: $remote"
    git -C "$ROOT_DIR" push "$remote" "$BRANCH" || echo "[release] Warning: Failed to push branch to $remote"
    git -C "$ROOT_DIR" push "$remote" "v$VERSION" || echo "[release] Warning: Failed to push tag to $remote"
  done <<< "$REMOTES"

  echo "[release] Pushed $BRANCH and tag v$VERSION to all remotes"
  echo "[release] Next: open https://github.com/yedsn/transfer-genie/actions and verify the Release workflow"
else
  echo "[release] Push skipped"
  echo "[release] Next:"
  while IFS= read -r remote; do
    [[ -n "$remote" ]] || continue
    echo "  git push $remote $BRANCH"
    echo "  git push $remote v$VERSION"
  done <<< "$REMOTES"
fi
