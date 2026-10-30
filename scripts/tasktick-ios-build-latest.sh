#!/bin/zsh

set -euo pipefail

export PATH="$HOME/.cargo/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:${PATH:-}"

project_root="${TRANSFER_GENIE_PROJECT_ROOT:-$PWD}"
[[ -f "$project_root/package.json" ]] || {
  print -u2 "[tasktick-ios-build] Transfer Genie project not found at: $project_root"
  print -u2 "[tasktick-ios-build] Configure the TaskTick working directory or TRANSFER_GENIE_PROJECT_ROOT"
  exit 1
}

cd "$project_root"
exec npm run ios:build-latest
