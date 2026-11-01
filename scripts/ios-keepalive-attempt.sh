#!/usr/bin/env bash
# Hourly, unattended repair pass for the free 7-day iOS development profile.
#
# One run: (re)build today's signed cache when it is missing or close to
# expiry, then install it over Wi-Fi. Every outcome - unreachable phone, locked
# screen, expired profile - ends with exit code 0 so the TaskTick job stays
# green; only genuinely actionable states raise a single macOS notification.

set -uo pipefail

project_root="${TRANSFER_GENIE_PROJECT_ROOT:-$PWD}"
if [[ ! -f "$project_root/package.json" ]]; then
  printf '[keepalive] Transfer Genie project not found at: %s\n' "$project_root" >&2
  exit 1
fi

config_file="${TRANSFER_GENIE_IOS_CONFIG:-$project_root/.env}"
latest_build_dir="${TRANSFER_GENIE_IOS_LATEST_BUILD_DIR:-$project_root/gen/apple/build/ios-wireless-latest}"
[[ "$latest_build_dir" == /* ]] || latest_build_dir="$project_root/$latest_build_dir"

state_dir="$project_root/gen/apple/build/ios-keepalive"
state_file="$state_dir/state.json"
notified_dir="$state_dir/notified"
log_file="$state_dir/attempts.log"
lock_dir="$project_root/gen/apple/build/.ios-keepalive.lock"
installer="$project_root/scripts/ios-wireless-update.sh"

# Regenerating the cache costs a build; reinstalling the same cache does not
# move the provisioning expiry. Rebuild a little before the profile dies so a
# failed build still has room to retry on later runs.
rebuild_below_hours="${TRANSFER_GENIE_IOS_KEEPALIVE_REBUILD_HOURS:-72}"
alert_below_hours="${TRANSFER_GENIE_IOS_KEEPALIVE_ALERT_HOURS:-48}"
build_cooldown_hours="${TRANSFER_GENIE_IOS_KEEPALIVE_BUILD_COOLDOWN_HOURS:-3}"

mkdir -p "$state_dir" "$notified_dir"

log() {
  local stamp
  stamp="$(date '+%Y-%m-%d %H:%M:%S')"
  printf '%s %s\n' "$stamp" "$*" >>"$log_file"
  printf '[keepalive] %s\n' "$*"
}

rotate_log() {
  local size
  [[ -f "$log_file" ]] || return 0
  size="$(wc -c <"$log_file" 2>/dev/null || printf 0)"
  if (( size > 1048576 )); then
    tail -n 800 "$log_file" >"$log_file.tmp" 2>/dev/null && mv "$log_file.tmp" "$log_file"
  fi
}

read_config_value() {
  local key="$1"
  local value
  [[ -f "$config_file" ]] || return 0
  value="$(sed -n "s/^${key}=//p" "$config_file" | tail -n 1 | tr -d '\r')"
  value="${value%\"}"; value="${value#\"}"
  value="${value%\'}"; value="${value#\'}"
  printf '%s' "$value"
}

device_name="${TRANSFER_GENIE_IOS_DEVICE:-}"
[[ -n "$device_name" ]] || device_name="$(read_config_value TRANSFER_GENIE_IOS_DEVICE)"

today="$(date '+%Y-%m-%d')"

state_value() {
  local field="$1"
  [[ -f "$state_file" ]] || return 0
  jq -r --arg field "$field" '.[$field] // empty' "$state_file" 2>/dev/null
}

write_state() {
  local tmp="$state_file.tmp.$$"
  local base='{}'
  [[ -f "$state_file" ]] && base="$(cat "$state_file" 2>/dev/null || printf '{}')"
  printf '%s' "$base" | jq \
    --arg lastSuccessDate "$1" \
    --arg lastSuccessAt "$2" \
    --arg device "$3" \
    --arg version "$4" \
    --arg build "$5" \
    --arg profileExpiration "$6" \
    '. + {lastSuccessDate: $lastSuccessDate, lastSuccessAt: $lastSuccessAt, device: $device, version: $version, build: $build, profileExpiration: $profileExpiration}' \
    >"$tmp" && mv "$tmp" "$state_file"
}

state_set() {
  local tmp="$state_file.tmp.$$"
  local base='{}'
  [[ -f "$state_file" ]] && base="$(cat "$state_file" 2>/dev/null || printf '{}')"
  printf '%s' "$base" | jq --arg k "$1" --arg v "$2" '.[$k] = $v' >"$tmp" && mv "$tmp" "$state_file"
}

# Xcode can only mint a fresh 7-day profile when an Apple ID is signed in.
# Without one the CLI build reuses the cached profile and then fails once it
# expires, so the alert has to say which situation the Mac is in.
xcode_account_missing() {
  local export_file="$state_dir/xcode-defaults.plist"
  local entries
  defaults export com.apple.dt.Xcode "$export_file" >/dev/null 2>&1 || return 1
  entries="$(/usr/libexec/PlistBuddy \
    -c 'Print :DVTDeveloperAccountManagerAppleIDLists:IDE.Identifiers.Prod' \
    "$export_file" 2>/dev/null \
    | grep -v -e '^Array {' -e '^}' -e '^[[:space:]]*$' || true)"
  [[ -z "$entries" ]]
}

notify_once() {
  local key="$1"
  local message="$2"
  local marker="$notified_dir/$key.date"
  [[ "$(cat "$marker" 2>/dev/null || true)" == "$today" ]] && return 0
  printf '%s\n' "$today" >"$marker" 2>/dev/null || true
  log "通知：$message"
  /usr/bin/osascript -e "display notification \"$message\" with title \"Transfer Genie · iOS\"" \
    >/dev/null 2>&1 || true
}

acquire_lock() {
  local attempt holder
  for attempt in 1 2; do
    if mkdir "$lock_dir" 2>/dev/null; then
      printf '%s\n' $$ >"$lock_dir/pid"
      return 0
    fi
    holder="$(cat "$lock_dir/pid" 2>/dev/null || true)"
    if [[ -n "$holder" ]] && kill -0 "$holder" 2>/dev/null; then
      return 1
    fi
    rm -rf -- "$lock_dir" 2>/dev/null || true
  done
  return 1
}

release_lock() {
  rm -f -- "$lock_dir/pid" 2>/dev/null || true
  rmdir "$lock_dir" 2>/dev/null || true
}

profile_remaining_hours() {
  local expiration="$1"
  local expiration_epoch
  [[ -n "$expiration" ]] || return 1
  expiration_epoch="$(date -j -f '%Y-%m-%dT%H:%M:%SZ' "$expiration" '+%s' 2>/dev/null || true)"
  [[ -n "$expiration_epoch" ]] || return 1
  printf '%s' $(( (expiration_epoch - $(date '+%s')) / 3600 ))
}

manifest_built_today() {
  local built_at built_local
  built_at="$(jq -r '.builtAt // empty' "$latest_build_dir/manifest.json" 2>/dev/null || true)"
  [[ -n "$built_at" ]] || return 1
  built_local="$(date -j -f '%Y-%m-%dT%H:%M:%SZ' "$built_at" '+%Y-%m-%d' 2>/dev/null || true)"
  [[ "$built_local" == "$today" ]]
}

run_build() {
  local output="$state_dir/build.log"
  log "缓存需要刷新，开始构建（npm run ios:build-latest）"
  if TRANSFER_GENIE_PROJECT_ROOT="$project_root" \
    npm run --prefix "$project_root" ios:build-latest >>"$output" 2>&1; then
    log "构建完成"
    return 0
  fi
  if grep -q 'Another iOS build/deployment is active' "$output" 2>/dev/null; then
    log "另一个构建正在进行，本轮跳过"
    return 1
  fi
  log "构建失败，详见 $output"
  state_set lastBuildFailureAt "$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
  notify_once "build-failed" "今天的 iOS 构建失败，App 无法续期，请检查"
  return 1
}

run_install_attempt() {
  local output="$state_dir/install-attempt.log"
  if TRANSFER_GENIE_PROJECT_ROOT="$project_root" \
    bash "$installer" --install-latest --attempt >>"$output" 2>&1; then
    grep -o 'attempt-result: .*' "$output" | tail -n 1
  else
    printf 'attempt-result: skipped installer-error\n'
  fi
}

record_success() {
  local manifest="$1"
  local version build profile_expiration
  version="$(jq -r '.version // empty' "$manifest" 2>/dev/null)"
  build="$(jq -r '.build // empty' "$manifest" 2>/dev/null)"
  profile_expiration="$(jq -r '.profileExpiration // empty' "$manifest" 2>/dev/null)"
  write_state "$today" "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$device_name" "$version" "$build" "$profile_expiration"
  log "安装成功：$version ($build)，profile 到期 ${profile_expiration}；今天不再尝试"
}

main() {
  rotate_log

  if [[ -z "$device_name" ]]; then
    log "未配置 TRANSFER_GENIE_IOS_DEVICE，跳过"
    return 0
  fi

  if [[ "$(state_value lastSuccessDate)" == "$today" ]]; then
    log "今天已成功安装过，跳过本轮"
    return 0
  fi

  if ! acquire_lock; then
    log "另一个保活任务正在运行，跳过本轮"
    return 0
  fi
  trap release_lock EXIT INT TERM

  local manifest="$latest_build_dir/manifest.json"
  local need_build=false
  local remaining
  if [[ ! -f "$manifest" ]]; then
    need_build=true
  elif ! manifest_built_today; then
    need_build=true
  else
    remaining="$(profile_remaining_hours "$(jq -r '.profileExpiration // empty' "$manifest" 2>/dev/null)")" || remaining=""
    if [[ -n "$remaining" ]] && (( remaining < rebuild_below_hours )); then
      need_build=true
    fi
  fi

  if [[ "$need_build" == "true" ]]; then
    local last_failure last_failure_epoch now_epoch
    last_failure="$(state_value lastBuildFailureAt)"
    if [[ -n "$last_failure" ]]; then
      last_failure_epoch="$(date -j -f '%Y-%m-%dT%H:%M:%SZ' "$last_failure" '+%s' 2>/dev/null || true)"
      now_epoch="$(date '+%s')"
      if [[ -n "$last_failure_epoch" ]] \
        && (( now_epoch - last_failure_epoch < build_cooldown_hours * 3600 )); then
        log "上次构建失败不足 ${build_cooldown_hours} 小时，本轮跳过构建重试"
        return 0
      fi
    fi
    if ! run_build; then
      return 0
    fi
  fi

  local result
  result="$(run_install_attempt)"
  case "$result" in
    *"attempt-result: installed "*)
      record_success "$manifest"
      ;;
    *"skipped saved-drafts"*)
      log "设备上有未发送草稿，保留草稿优先，跳过安装"
      notify_once "saved-drafts" "手机上有未发送草稿，自动更新已暂停"
      ;;
    *"skipped profile-expired"* | *"skipped cache-missing"* | *"skipped cache-invalid"*)
      log "缓存不可用（${result}），重建后重试一次"
      if run_build; then
        result="$(run_install_attempt)"
        case "$result" in
          *"attempt-result: installed "*)
            record_success "$manifest"
            ;;
          *)
            log "重建后仍未安装成功：$result"
            ;;
        esac
      fi
      ;;
    *)
      log "本轮未安装：$result"
      ;;
  esac

  local remaining_hours
  remaining_hours="$(profile_remaining_hours "$(jq -r '.profileExpiration // empty' "$manifest" 2>/dev/null)")" || remaining_hours=""
  if [[ "$(state_value lastSuccessDate)" != "$today" && -n "$remaining_hours" ]] \
    && (( remaining_hours < alert_below_hours )); then
    if xcode_account_missing; then
      notify_once "expiring" "手机 App 约 ${remaining_hours} 小时后失效，且 Xcode 未登录 Apple ID，无法自动续签"
    else
      notify_once "expiring" "手机 App 约 ${remaining_hours} 小时后失效，请做一次真机构建以续签"
    fi
  fi
  return 0
}

main
exit 0
