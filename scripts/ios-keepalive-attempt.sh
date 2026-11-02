#!/usr/bin/env bash
# Hourly install consumer for the latest signed iOS artifact.

set -uo pipefail

project_root="${TRANSFER_GENIE_PROJECT_ROOT:-$PWD}"
if [[ ! -f "$project_root/package.json" ]]; then
  printf '[ios-deploy] Project not found: %s\n' "$project_root" >&2
  exit 1
fi

latest_build_dir="${TRANSFER_GENIE_IOS_LATEST_BUILD_DIR:-$project_root/gen/apple/build/ios-wireless-latest}"
[[ "$latest_build_dir" == /* ]] || latest_build_dir="$project_root/$latest_build_dir"
manifest="$latest_build_dir/manifest.json"
state_dir="$project_root/gen/apple/build/ios-keepalive"
state_file="$state_dir/state.json"
notified_dir="$state_dir/notified"
log_file="$state_dir/attempts.log"
install_log="$state_dir/install-attempt.log"
lock_dir="$project_root/gen/apple/build/.ios-install-attempt.lock"
installer="$project_root/scripts/ios-wireless-update.sh"
today="$(date '+%Y-%m-%d')"
config_file="${TRANSFER_GENIE_IOS_CONFIG:-$project_root/.env}"

mkdir -p "$state_dir" "$notified_dir"

log() {
  printf '%s %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" >>"$log_file"
  printf '[ios-deploy] %s\n' "$*"
}

notify_once() {
  local key="$1" message="$2" marker="$notified_dir/$1.date"
  [[ "$(cat "$marker" 2>/dev/null || true)" == "$today" ]] && return 0
  printf '%s\n' "$today" >"$marker" 2>/dev/null || true
  /usr/bin/osascript -e "display notification \"$message\" with title \"Transfer Genie · iOS\"" >/dev/null 2>&1 || true
}

state_value() {
  [[ -f "$state_file" ]] || return 0
  jq -r --arg field "$1" '.[$field] // empty' "$state_file" 2>/dev/null
}

read_config_value() {
  local key="$1" value
  [[ -f "$config_file" ]] || return 0
  value="$(sed -n "s/^${key}=//p" "$config_file" | tail -n 1 | tr -d '\r')"
  value="${value%\"}"; value="${value#\"}"
  value="${value%\'}"; value="${value#\'}"
  printf '%s' "$value"
}

record_success() {
  local artifact_id="$1" tmp="$state_file.tmp.$$"
  local base='{}'
  [[ -f "$state_file" ]] && base="$(cat "$state_file" 2>/dev/null || printf '{}')"
  printf '%s' "$base" | jq \
    --arg artifactId "$artifact_id" \
    --arg installedAt "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" \
    --arg version "$(jq -r '.version // empty' "$manifest")" \
    --arg build "$(jq -r '.build // empty' "$manifest")" \
    --arg profileExpiration "$(jq -r '.profileExpiration // empty' "$manifest")" \
    '. + {lastInstalledArtifactId:$artifactId, installedAt:$installedAt, version:$version, build:$build, profileExpiration:$profileExpiration}' \
    >"$tmp" && mv "$tmp" "$state_file"
}

cleanup() {
  rm -f -- "$lock_dir/pid" 2>/dev/null || true
  rmdir "$lock_dir" 2>/dev/null || true
}

main() {
  if [[ ! -f "$manifest" ]]; then
    log "没有每日续签构建产物，本轮跳过"
    return 0
  fi

  local artifact_id
  artifact_id="$(jq -r '.artifactId // empty' "$manifest" 2>/dev/null || true)"
  if [[ -z "$artifact_id" ]]; then
    log "最新 manifest 没有 artifactId，等待每日构建刷新"
    return 0
  fi

  local expected_team artifact_team
  expected_team="${APPLE_DEVELOPMENT_TEAM:-}"
  [[ -n "$expected_team" ]] || expected_team="$(read_config_value APPLE_DEVELOPMENT_TEAM)"
  artifact_team="$(jq -r '.team // empty' "$manifest" 2>/dev/null || true)"
  if [[ -z "$expected_team" || "$artifact_team" != "$expected_team" ]]; then
    log "签名 Team 不匹配，拒绝连接手机：artifact=$artifact_team expected=$expected_team"
    notify_once team-mismatch "iOS 签名包 Team 不匹配，已阻止自动安装"
    return 0
  fi

  if [[ "$(state_value lastInstalledArtifactId)" == "$artifact_id" ]]; then
    log "当前 artifactId 已安装，跳过：$artifact_id"
    return 0
  fi

  if ! mkdir "$lock_dir" 2>/dev/null; then
    holder="$(cat "$lock_dir/pid" 2>/dev/null || true)"
    if [[ -n "$holder" ]] && kill -0 "$holder" 2>/dev/null; then
      log "另一个无线安装尝试正在运行，本轮跳过"
      return 0
    fi
    rm -rf -- "$lock_dir" 2>/dev/null || true
    mkdir "$lock_dir" 2>/dev/null || { log "无法取得安装锁，本轮跳过"; return 0; }
  fi
  printf '%s\n' $$ >"$lock_dir/pid"
  trap cleanup EXIT INT TERM

  local run_log result
  run_log="$state_dir/install-run-$(date '+%Y%m%d-%H%M%S').log"
  if TRANSFER_GENIE_PROJECT_ROOT="$project_root" bash "$installer" --install-latest --attempt >"$run_log" 2>&1; then
    result="$(grep -o 'attempt-result: .*' "$run_log" | tail -n 1 || true)"
  else
    result="attempt-result: skipped installer-error"
  fi
  cat "$run_log" >>"$install_log" 2>/dev/null || true

  case "$result" in
    *"attempt-result: installed "*)
      record_success "$artifact_id"
      log "安装成功并记录 artifactId：$artifact_id"
      ;;
    *"skipped saved-drafts"*)
      log "设备上有未发送草稿，本轮跳过"
      notify_once saved-drafts "手机上有未发送草稿，自动更新已暂停"
      ;;
    *"skipped profile-expired"* | *"skipped cache-missing"* | *"skipped cache-invalid"*)
      log "构建产物不可用：${result:-unknown}；等待下一次每日续签构建"
      notify_once artifact-invalid "iOS 每日签名包不可用，请检查续签构建任务"
      ;;
    *)
      log "本轮未安装：${result:-attempt-result: skipped unknown}"
      ;;
  esac
  return 0
}

main
exit 0
