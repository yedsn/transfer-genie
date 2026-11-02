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
# Scheduled builds must follow the repository's ignored local configuration.
# Do not let a stale TaskTick launch environment select another Apple Team.
team_from_env="$(sed -n 's/^APPLE_DEVELOPMENT_TEAM=//p' "$project_root/.env" 2>/dev/null | tail -n 1 | tr -d '\r')"
team_from_env="${team_from_env%\"}"
team_from_env="${team_from_env#\"}"
team_from_env="${team_from_env%\'}"
team_from_env="${team_from_env#\'}"
[[ -n "$team_from_env" && "$team_from_env" != YOUR_* ]] || {
  print -u2 "[tasktick-ios-build] APPLE_DEVELOPMENT_TEAM is missing or still a placeholder in $project_root/.env"
  exit 1
}
export APPLE_DEVELOPMENT_TEAM="$team_from_env"
print "[tasktick-ios-build] Using APPLE_DEVELOPMENT_TEAM=$APPLE_DEVELOPMENT_TEAM from .env"
exec npm run ios:build-latest
