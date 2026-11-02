#!/usr/bin/env bash

set -euo pipefail

project_root="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
config_file="${TRANSFER_GENIE_IOS_CONFIG:-$project_root/.env}"
device_name="${TRANSFER_GENIE_IOS_DEVICE:-}"
development_team="${APPLE_DEVELOPMENT_TEAM:-}"
ios_cargo_home="${TRANSFER_GENIE_IOS_CARGO_HOME:-}"
bundle_id="com.transfergenie"
build_mode="release"
skip_build=false
build_latest=false
install_latest=false
check_only=false
launch_after_install=false
confirm_before_update=false
attempt_mode=false
temp_root=""
cache_staging=""
owns_build_lock=false
build_lock="$project_root/gen/apple/build/.virtual-deploy.lock"
build_lock_wait_seconds="900"
latest_build_dir="${TRANSFER_GENIE_IOS_LATEST_BUILD_DIR:-}"

# Keep redirected logs and terminals without color support clean.
color_reset="" color_bold="" color_muted="" color_cyan=""
color_yellow="" color_green="" color_red=""
if [[ -t 1 && "${TERM:-dumb}" != "dumb" && -z "${NO_COLOR+x}" ]]; then
  color_reset=$'\033[0m'
  color_bold=$'\033[1m'
  color_muted=$'\033[2m'
  color_cyan=$'\033[1;36m'
  color_yellow=$'\033[33m'
  color_green=$'\033[32m'
  color_red=$'\033[31m'
fi

usage() {
  cat <<'EOF'
Usage: scripts/ios-wireless-update.sh [options]

Build, verify, and update Transfer Genie on a paired iPhone over the local
network. The update is in-place and keeps the app data container.

Options:
  --device <name-or-id>  Override TRANSFER_GENIE_IOS_DEVICE from .env
  --team <team-id>       Override APPLE_DEVELOPMENT_TEAM from .env
  --debug                Build a Debug archive instead of Release
  --skip-build           Reuse gen/apple/build/transfer-genie_iOS.xcarchive
  --build-latest         Build and cache a signed device app; do not connect
                        to, install on, or launch an iPhone
  --install-latest       Install the latest cached device app without building
  --check-only           Run all safety checks but do not install or launch
  --launch               Open Transfer Genie after the update
  --confirm              Show effective iOS settings and ask before connecting
  --attempt              Unattended install attempt for --install-latest:
                         never exits non-zero, never launches the app, and
                         prints one `[ios-wifi] attempt-result:` line with
                         `installed` or `skipped <reason>`
  -h, --help             Show this help

Environment equivalents:
  TRANSFER_GENIE_IOS_DEVICE, APPLE_DEVELOPMENT_TEAM,
  TRANSFER_GENIE_IOS_CARGO_HOME, TRANSFER_GENIE_IOS_CONFIG,
  TRANSFER_GENIE_IOS_LATEST_BUILD_DIR

Setup:
  Copy .env.example to .env and configure the iOS device and Apple team.
  Existing process environment variables override values from .env.
EOF
}

log() {
  printf '%s[ios-wifi]%s %s\n' "$color_cyan" "$color_reset" "$*"
}

fail() {
  printf '%s[ios-wifi] Error:%s %s\n' "$color_red" "$color_reset" "$*" >&2
  exit 1
}

# In --attempt mode every precondition becomes a skipped attempt: the hourly
# scheduled job must stay quiet in TaskTick when the phone is asleep, online
# elsewhere, or temporarily unreachable.
skip_or_fail() {
  local reason="$1"
  shift
  if [[ "$attempt_mode" == "true" ]]; then
    printf '%s[ios-wifi] Attempt skipped (%s):%s %s\n' "$color_yellow" "$reason" "$color_reset" "$*"
    printf '[ios-wifi] attempt-result: skipped %s\n' "$reason"
    exit 0
  fi
  fail "$*"
}

cleanup() {
  if [[ -n "$temp_root" && -d "$temp_root" ]]; then
    rm -rf -- "$temp_root"
  fi
  if [[ -n "$cache_staging" && -d "$cache_staging" ]]; then
    rm -rf -- "$cache_staging"
  fi
  if [[ "$owns_build_lock" == "true" ]]; then
    rm -f -- "$build_lock/pid"
    rmdir "$build_lock" 2>/dev/null || true
  fi
}

acquire_build_lock() {
  mkdir -p "$(dirname "$build_lock")"
  local wait_deadline=$(( $(date '+%s') + build_lock_wait_seconds ))
  local announced_wait=false
  while [[ -d "$build_lock" ]]; do
    local owner_pid=""
    local owner_command=""
    if [[ -f "$build_lock/pid" ]]; then
      owner_pid="$(tr -cd '0-9' <"$build_lock/pid")"
    fi
    if [[ -n "$owner_pid" ]]; then
      owner_command="$(ps -p "$owner_pid" -o command= 2>/dev/null || true)"
    fi
    if [[ -n "$owner_pid" ]] && kill -0 "$owner_pid" >/dev/null 2>&1; then
      if (( $(date '+%s') >= wait_deadline )); then
        fail "Timed out waiting for the active iOS build/deployment (pid $owner_pid: $owner_command)"
      fi
      if [[ "$announced_wait" == "false" ]]; then
        log "Waiting for the active iOS build/deployment (pid $owner_pid) before starting this build"
        announced_wait=true
      fi
      sleep 5
      continue
    fi
    break
  done
  if ! mkdir "$build_lock" 2>/dev/null; then
    local owner_pid=""
    local owner_command=""
    local lock_mtime="0"
    local now_epoch="0"
    if [[ -f "$build_lock/pid" ]]; then
      owner_pid="$(tr -cd '0-9' <"$build_lock/pid")"
    fi
    if [[ -n "$owner_pid" ]]; then
      owner_command="$(ps -p "$owner_pid" -o command= 2>/dev/null || true)"
    fi
    if [[ -n "$owner_pid" ]] && kill -0 "$owner_pid" >/dev/null 2>&1; then
      fail "Another iOS build/deployment is active (pid $owner_pid: $owner_command). Wait for it to finish before retrying"
    fi
    lock_mtime="$(stat -f '%m' "$build_lock" 2>/dev/null || printf '0')"
    now_epoch="$(date '+%s')"
    if [[ ! "$lock_mtime" =~ ^[0-9]+$ ]] || (( lock_mtime == 0 || now_epoch - lock_mtime < 10 )); then
      fail "An iOS build lock was created moments ago but its owner is not observable; refusing to remove $build_lock"
    fi
    log "Recovering stale iOS build lock: $build_lock (previous pid $owner_pid exited)"
    rm -f -- "$build_lock/pid"
    rmdir "$build_lock" 2>/dev/null \
      || fail "Unable to recover stale iOS build lock safely: $build_lock"
    mkdir "$build_lock" \
      || fail "Another iOS build/deployment acquired the lock while stale-lock recovery was in progress"
  fi
  printf '%s\n' "$$" >"$build_lock/pid"
  owns_build_lock=true
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "Missing required command: $1"
}

read_config_value() {
  local key="$1"
  local line
  local value

  [[ -f "$config_file" ]] || return 0
  line="$(sed -n "s/^${key}=//p" "$config_file" | tail -n 1)"
  value="${line%$'\r'}"

  case "$value" in
    \"*\")
      value="${value#\"}"
      value="${value%\"}"
      ;;
    \'*\')
      value="${value#\'}"
      value="${value%\'}"
      ;;
  esac

  printf '%s' "$value"
}

confirmation_field() {
  printf '  %s%s%s\n    %s%s%s\n' "$color_muted" "$1" "$color_reset" "$color_bold" "$2" "$color_reset"
}

confirm_update() {
  local answer
  local action="原位更新，不主动打开 App"
  local archive_action="从当前源码重新构建"
  if [[ "$launch_after_install" == "true" ]]; then
    action="原位更新后打开 App"
  fi
  if [[ "$check_only" == "true" ]]; then
    action="仅执行检查，不安装或打开 App"
  fi
  if [[ "$skip_build" == "true" ]]; then
    archive_action="复用已有 archive（不重新构建）"
  fi
  if [[ "$install_latest" == "true" ]]; then
    archive_action="安装每日预构建缓存（不重新构建）"
  fi

  printf '\n%s  Transfer Genie · iOS 无线更新%s\n' "$color_cyan" "$color_reset"
  printf '%s  ────────────────────────────────────────%s\n\n' "$color_muted" "$color_reset"
  printf '%s  网络提醒%s\n' "$color_yellow" "$color_reset"
  printf '  请确保 Mac 和 iPhone 连接%s同一个 Wi-Fi%s。\n' "$color_yellow" "$color_reset"
  printf '  手机需已配对、解锁，并开启开发者模式。\n\n'
  printf '%s  生效配置%s\n' "$color_cyan" "$color_reset"
  confirmation_field "配置文件" "$config_file"
  confirmation_field "TRANSFER_GENIE_IOS_DEVICE" "${device_name:-<未配置>}"
  confirmation_field "APPLE_DEVELOPMENT_TEAM" "${development_team:-<未配置>}"
  confirmation_field "TRANSFER_GENIE_IOS_CARGO_HOME" "$ios_cargo_home"
  if [[ "$install_latest" == "true" ]]; then
    confirmation_field "预构建产物" "$latest_build_dir"
  fi
  printf '\n%s  本次操作%s\n' "$color_cyan" "$color_reset"
  confirmation_field "构建模式" "$build_mode · $archive_action"
  confirmation_field "执行方式" "$action"
  printf '\n%s  命令行 / 进程环境变量优先于 .env，以上为最终生效值。\n' "$color_muted"
  printf '  仅展示相关配置，不打印 Token、密码或其他 .env 内容。%s\n\n' "$color_reset"
  printf '  %s确认网络和配置无误，继续？%s %s[y/N]%s ' "$color_bold" "$color_reset" "$color_yellow" "$color_reset"
  if ! IFS= read -r answer; then
    answer=""
  fi
  case "$answer" in
    y|Y|yes|YES|Yes) printf '\n%s  已确认，开始连接检查。%s\n\n' "$color_green" "$color_reset" ;;
    *) printf '\n%s  已取消；未连接手机、构建或安装。%s\n\n' "$color_yellow" "$color_reset"; exit 0 ;;
  esac
}

copy_container_file() {
  local source_path="$1"
  local destination_path="$2"
  local required="${3:-false}"

  if xcrun devicectl device copy from \
    --device "$device_name" \
    --domain-type appDataContainer \
    --domain-identifier "$bundle_id" \
    --source "$source_path" \
    --destination "$destination_path" \
    --timeout 60 >/dev/null 2>&1; then
    return 0
  fi

  if [[ "$required" == "true" ]]; then
    if [[ "$attempt_mode" == "true" ]]; then
      return 1
    fi
    fail "Unable to copy $source_path from $device_name"
  fi
  return 1
}

inspect_drafts() {
  local label="$1"
  local strict="${2:-true}"
  local snapshot_dir="$temp_root/$label"
  local remote_dir="Library/Application Support/com.transfergenie"
  local database_path="$snapshot_dir/messages.sqlite"
  local table_count
  local draft_count

  mkdir -p "$snapshot_dir"
  if ! copy_container_file "$remote_dir/messages.sqlite" "$database_path" true; then
    log "$label draft guard unavailable: $device_name did not expose the app data container (phone likely locked or off-network)"
    return 10
  fi
  copy_container_file "$remote_dir/messages.sqlite-wal" "$snapshot_dir/messages.sqlite-wal" false || true
  copy_container_file "$remote_dir/messages.sqlite-shm" "$snapshot_dir/messages.sqlite-shm" false || true

  [[ "$(sqlite3 -readonly "$database_path" 'PRAGMA integrity_check;')" == "ok" ]] \
    || skip_or_fail "draft-guard-failed" "The copied messages database failed its integrity check"

  table_count="$(sqlite3 -readonly "$database_path" \
    "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='mobile_composer_drafts';")"
  [[ "$table_count" == "1" ]] \
    || skip_or_fail "draft-guard-failed" "The installed app does not expose a verifiable mobile draft table"

  draft_count="$(sqlite3 -readonly "$database_path" \
    'SELECT COUNT(*) FROM mobile_composer_drafts;')"
  if [[ "$draft_count" != "0" ]]; then
    if [[ "$strict" == "false" ]]; then
      log "Warning: $device_name has $draft_count saved mobile draft(s); finish or clear them before the next update"
      return 0
    fi
    skip_or_fail "saved-drafts" "$device_name has $draft_count saved mobile draft(s). Finish or clear them before updating"
  fi

  log "$label draft guard passed: SQLite ok, saved drafts=0"
  return 0
}

if [[ -z "$device_name" ]]; then
  device_name="$(read_config_value TRANSFER_GENIE_IOS_DEVICE)"
fi
if [[ -z "$development_team" ]]; then
  development_team="$(read_config_value APPLE_DEVELOPMENT_TEAM)"
fi
if [[ -z "$ios_cargo_home" ]]; then
  ios_cargo_home="$(read_config_value TRANSFER_GENIE_IOS_CARGO_HOME)"
fi
if [[ -z "$ios_cargo_home" ]]; then
  ios_cargo_home="$project_root/.cargo-ios"
elif [[ "$ios_cargo_home" != /* ]]; then
  ios_cargo_home="$project_root/$ios_cargo_home"
fi
if [[ -z "$latest_build_dir" ]]; then
  latest_build_dir="$(read_config_value TRANSFER_GENIE_IOS_LATEST_BUILD_DIR)"
fi
if [[ -z "$latest_build_dir" ]]; then
  latest_build_dir="$project_root/gen/apple/build/ios-wireless-latest"
elif [[ "$latest_build_dir" != /* ]]; then
  latest_build_dir="$project_root/$latest_build_dir"
fi

while [[ $# -gt 0 ]]; do
  case "$1" in
    --device)
      [[ $# -ge 2 ]] || fail "--device requires a value"
      device_name="$2"
      shift 2
      ;;
    --team)
      [[ $# -ge 2 ]] || fail "--team requires a value"
      development_team="$2"
      shift 2
      ;;
    --debug)
      build_mode="debug"
      shift
      ;;
    --skip-build)
      skip_build=true
      shift
      ;;
    --build-latest)
      build_latest=true
      shift
      ;;
    --install-latest)
      install_latest=true
      shift
      ;;
    --check-only)
      check_only=true
      shift
      ;;
    --launch)
      launch_after_install=true
      shift
      ;;
    --confirm)
      confirm_before_update=true
      shift
      ;;
    --attempt)
      attempt_mode=true
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      fail "Unknown option: $1"
      ;;
  esac
done

if [[ "$build_latest" == "true" && ( "$install_latest" == "true" || "$skip_build" == "true" || "$check_only" == "true" || "$launch_after_install" == "true" || "$confirm_before_update" == "true" ) ]]; then
  fail "--build-latest cannot be combined with install, check, launch, confirmation, or archive-reuse options"
fi
if [[ "$install_latest" == "true" && "$skip_build" == "true" ]]; then
  fail "--install-latest and --skip-build select different archive sources"
fi
if [[ "$attempt_mode" == "true" ]]; then
  [[ "$install_latest" == "true" ]] \
    || fail "--attempt requires --install-latest"
  [[ "$launch_after_install" != "true" ]] \
    || fail "--attempt never launches the app; drop --launch"
  [[ "$confirm_before_update" != "true" ]] \
    || fail "--attempt is unattended; drop --confirm"
fi

if [[ "$confirm_before_update" == "true" && "$build_latest" != "true" ]]; then
  confirm_update
fi

[[ -n "$development_team" ]] \
  || fail "Missing APPLE_DEVELOPMENT_TEAM. Configure it in $config_file (see .env.example)"
[[ "$development_team" != YOUR_* ]] \
  || fail "Replace the placeholder APPLE_DEVELOPMENT_TEAM in $config_file"
if [[ "$build_latest" != "true" ]]; then
  [[ -n "$device_name" ]] \
    || fail "Missing TRANSFER_GENIE_IOS_DEVICE. Configure it in $config_file (see .env.example)"
  [[ "$device_name" != YOUR_* ]] \
    || fail "Replace the placeholder TRANSFER_GENIE_IOS_DEVICE in $config_file"
fi

for command_name in jq security plutil codesign npm; do
  require_command "$command_name"
done
if [[ "$build_latest" != "true" ]]; then
  for command_name in sqlite3 xcrun; do
    require_command "$command_name"
  done
fi

temp_root="$(mktemp -d /tmp/transfer-genie-ios-wifi.XXXXXX)"
trap cleanup EXIT INT TERM

cd "$project_root"

if [[ "$install_latest" == "true" ]]; then
  # Keep the cached app stable while it is verified and installed. This also
  # prevents Simulator/VPhone builds from replacing the shared Tauri archive
  # during the same deployment window.
  acquire_build_lock
fi

device_udid=""
installed_before=0
if [[ "$build_latest" != "true" ]]; then
  details_json="$temp_root/device-details.json"
  if ! xcrun devicectl device info details \
    --device "$device_name" \
    --timeout 60 \
    --json-output "$details_json" >/dev/null 2>"$temp_root/device-details.err"; then
    tail -n 2 "$temp_root/device-details.err" >&2 || true
    skip_or_fail "device-unreachable" "Could not read device details for $device_name (phone asleep, off this network, or not paired)"
  fi

  device_udid="$(jq -r '.result.hardwareProperties.udid // empty' "$details_json" 2>/dev/null || true)"
  pairing_state="$(jq -r '.result.connectionProperties.pairingState // empty' "$details_json" 2>/dev/null || true)"
  transport_type="$(jq -r '.result.connectionProperties.transportType // empty' "$details_json" 2>/dev/null || true)"
  tunnel_state="$(jq -r '.result.connectionProperties.tunnelState // empty' "$details_json" 2>/dev/null || true)"
  developer_mode="$(jq -r '.result.deviceProperties.developerModeStatus // empty' "$details_json" 2>/dev/null || true)"
  ddi_available="$(jq -r '.result.deviceProperties.ddiServicesAvailable // false' "$details_json" 2>/dev/null || printf false)"

  [[ -n "$device_udid" ]] || skip_or_fail "device-unreachable" "Could not read the UDID for $device_name"
  [[ "$pairing_state" == "paired" ]] || skip_or_fail "device-unpaired" "$device_name is not paired with this Mac"
  [[ "$transport_type" == "localNetwork" ]] \
    || skip_or_fail "transport-not-local-network" "$device_name is using '$transport_type', not the local-network transport"
  [[ "$tunnel_state" == "connected" ]] \
    || skip_or_fail "tunnel-not-connected" "The Wi-Fi developer tunnel is not connected"
  [[ "$developer_mode" == "enabled" ]] \
    || skip_or_fail "developer-mode-disabled" "Developer Mode is not enabled on $device_name"
  [[ "$ddi_available" == "true" ]] \
    || skip_or_fail "ddi-unavailable" "Developer disk image services are unavailable"
  log "Connected to $device_name over Wi-Fi ($device_udid)"

  apps_before_json="$temp_root/apps-before.json"
  if ! xcrun devicectl device info apps \
    --device "$device_name" \
    --bundle-id "$bundle_id" \
    --timeout 60 \
    --json-output "$apps_before_json" >/dev/null 2>&1; then
    skip_or_fail "device-unreachable" "Could not list installed apps on $device_name"
  fi
  installed_before="$(jq -r '[.result.apps[]? | select(.bundleIdentifier == "com.transfergenie")] | length' "$apps_before_json" 2>/dev/null || printf 0)"

  if [[ "$installed_before" == "1" ]]; then
    # Do not foreground Settings or another app. The composer saves 350 ms after
    # each mutation, so wait for the debounce and verify twice before replacing
    # the installed bundle. Any saved draft blocks the update.
    sleep 2
    guard_status=0
    inspect_drafts "preinstall-1" || guard_status=$?
    if [[ "$guard_status" == "0" ]]; then
      sleep 1
      inspect_drafts "preinstall-2" || guard_status=$?
    fi
    if [[ "$guard_status" == "10" ]]; then
      # A locked phone cannot be composing a draft, and an in-place install
      # keeps the data container. Continue and record that the guard was blind.
      log "Attempt: draft state unreadable (device locked); continuing with the in-place install"
    fi
  else
    log "$bundle_id is not installed yet; the draft guard is not applicable"
  fi
fi

archive_path="$project_root/gen/apple/build/transfer-genie_iOS.xcarchive"
if [[ "$install_latest" == "true" ]]; then
  manifest_path="$latest_build_dir/manifest.json"
  app_path="$latest_build_dir/Transfer Genie.app"
  [[ -f "$manifest_path" ]] \
    || skip_or_fail "cache-missing" "Latest build manifest not found: $manifest_path. Run npm run ios:build-latest first"
  [[ -d "$app_path" ]] \
    || skip_or_fail "cache-missing" "Latest cached app not found: $app_path. Run npm run ios:build-latest first"
  log "Using cached build from $(jq -r '.builtAt // "unknown time"' "$manifest_path")"
elif [[ "$skip_build" != "true" ]]; then
  build_args=(ios build --target aarch64 --archive-only --ci --export-method debugging)
  if [[ "$build_mode" == "debug" ]]; then
    build_args+=(--debug)
  fi

  log "Building a signed $build_mode iPhone archive"
  acquire_build_lock
  APPLE_DEVELOPMENT_TEAM="$development_team" \
  CARGO_HOME="$ios_cargo_home" \
    npx tauri "${build_args[@]}"
else
  log "Reusing the existing archive (--skip-build)"
fi

if [[ "$install_latest" != "true" ]]; then
  [[ -d "$archive_path" ]] || fail "Archive not found: $archive_path"
  application_path="$(/usr/libexec/PlistBuddy -c 'Print :ApplicationProperties:ApplicationPath' "$archive_path/Info.plist")"
  app_path="$archive_path/Products/$application_path"
fi
[[ -d "$app_path" ]] || skip_or_fail "cache-missing" "App bundle not found in the archive: $app_path"

platform_name="$(/usr/libexec/PlistBuddy -c 'Print :DTPlatformName' "$app_path/Info.plist" 2>/dev/null || true)"
candidate_bundle_id="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$app_path/Info.plist" 2>/dev/null || true)"
candidate_version="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$app_path/Info.plist" 2>/dev/null || true)"
candidate_build="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleVersion' "$app_path/Info.plist" 2>/dev/null || true)"
[[ "$platform_name" == "iphoneos" ]] || skip_or_fail "cache-invalid" "Archive targets '$platform_name', not iphoneos"
[[ "$candidate_bundle_id" == "$bundle_id" ]] || skip_or_fail "cache-invalid" "Unexpected bundle ID: $candidate_bundle_id"
codesign --verify --deep --strict "$app_path" >/dev/null 2>&1 \
  || skip_or_fail "cache-invalid" "The cached app failed strict code signature verification"

profile_path="$app_path/embedded.mobileprovision"
profile_plist="$temp_root/profile.plist"
[[ -f "$profile_path" ]] || skip_or_fail "cache-invalid" "The app does not contain an embedded provisioning profile"
security cms -D -i "$profile_path" >"$profile_plist" \
  || skip_or_fail "cache-invalid" "The embedded provisioning profile could not be decoded"
profile_team="$(/usr/libexec/PlistBuddy -c 'Print :TeamIdentifier:0' "$profile_plist" 2>/dev/null || true)"
profile_expiration="$(plutil -extract ExpirationDate raw -o - "$profile_plist" 2>/dev/null || true)"
profile_uuid="$(/usr/libexec/PlistBuddy -c 'Print :UUID' "$profile_plist" 2>/dev/null || true)"
profile_created_at="$(plutil -extract CreationDate raw -o - "$profile_plist" 2>/dev/null || true)"
profile_devices_json="$(plutil -extract ProvisionedDevices json -o - "$profile_plist" 2>/dev/null || printf '[]')"
[[ "$profile_team" == "$development_team" ]] \
  || skip_or_fail "profile-team-mismatch" "Profile team '$profile_team' does not match '$development_team'"
if [[ "$build_latest" != "true" ]]; then
  if /usr/libexec/PlistBuddy -c 'Print :ProvisionedDevices' "$profile_plist" 2>/dev/null \
    | grep -Fqx "    $device_udid"; then
    profile_has_device=true
  else
    profile_has_device=false
  fi
  [[ "$profile_has_device" == "true" ]] \
    || skip_or_fail "profile-device-missing" "The provisioning profile does not include $device_udid"
fi

expiration_epoch="$(TZ=UTC date -j -f '%Y-%m-%dT%H:%M:%SZ' "$profile_expiration" '+%s' 2>/dev/null || true)"
[[ -n "$expiration_epoch" ]] \
  || skip_or_fail "cache-invalid" "Could not parse profile expiration: $profile_expiration"
now_epoch="$(date '+%s')"
(( expiration_epoch > now_epoch )) \
  || skip_or_fail "profile-expired" "The provisioning profile expired at $profile_expiration"
remaining_hours=$(( (expiration_epoch - now_epoch) / 3600 ))
if (( remaining_hours < 48 )); then
  log "Warning: the development profile expires in about $remaining_hours hour(s)"
fi

executable_name="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleExecutable' "$app_path/Info.plist" 2>/dev/null || true)"
candidate_uuid="$(dwarfdump --uuid "$app_path/$executable_name" 2>/dev/null | awk '{print $2}' || true)"
log "Candidate $candidate_version ($candidate_build), UUID $candidate_uuid"
log "Development profile expires at $profile_expiration"

if [[ "$build_latest" == "true" ]]; then
  latest_parent="$(dirname "$latest_build_dir")"
  mkdir -p "$latest_parent"
  cache_staging="$(mktemp -d "$latest_parent/.ios-wireless-latest.XXXXXX")"
  ditto "$app_path" "$cache_staging/Transfer Genie.app"
  codesign --verify --deep --strict --verbose=2 "$cache_staging/Transfer Genie.app"
  source_revision="$(git rev-parse --short=12 HEAD 2>/dev/null || printf unknown)"
  if [[ -n "$(git status --porcelain --untracked-files=no 2>/dev/null)" ]]; then
    source_dirty=true
  else
    source_dirty=false
  fi
  jq -n \
    --arg builtAt "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" \
    --arg version "$candidate_version" \
    --arg build "$candidate_build" \
    --arg bundleId "$candidate_bundle_id" \
    --arg platform "$platform_name" \
    --arg team "$profile_team" \
    --arg profileUuid "$profile_uuid" \
    --arg profileCreatedAt "$profile_created_at" \
    --arg profileExpiration "$profile_expiration" \
    --arg executableUuid "$candidate_uuid" \
    --arg artifactId "$profile_uuid:$candidate_uuid" \
    --arg sourceRevision "$source_revision" \
    --argjson deviceUdids "$profile_devices_json" \
    --argjson sourceDirty "$source_dirty" \
    '{builtAt: $builtAt, version: $version, build: $build, bundleId: $bundleId, platform: $platform, team: $team, profileUuid: $profileUuid, profileCreatedAt: $profileCreatedAt, profileExpiration: $profileExpiration, deviceUdids: $deviceUdids, executableUuid: $executableUuid, artifactId: $artifactId, sourceRevision: $sourceRevision, sourceDirty: $sourceDirty, app: "Transfer Genie.app"}' \
    >"$cache_staging/manifest.json"
  previous_build="$latest_build_dir.previous.$$"
  if [[ -e "$latest_build_dir" ]]; then
    mv "$latest_build_dir" "$previous_build"
  fi
  if mv "$cache_staging" "$latest_build_dir"; then
    cache_staging=""
    if [[ -e "$previous_build" ]]; then
      rm -rf -- "$previous_build"
    fi
  else
    if [[ -e "$previous_build" && ! -e "$latest_build_dir" ]]; then
      mv "$previous_build" "$latest_build_dir"
    fi
    fail "Unable to publish the latest iOS build cache"
  fi
  log "Latest signed device build cached at $latest_build_dir"
  log "Build-only completed; no iPhone was connected, installed, or launched"
  exit 0
fi

if [[ "$check_only" == "true" ]]; then
  log "Check-only completed; no app was installed"
  exit 0
fi

install_json="$temp_root/install.json"
log "Installing $bundle_id in place over Wi-Fi"
if ! xcrun devicectl device install app \
  --device "$device_name" \
  "$app_path" \
  --timeout 120 \
  --json-output "$install_json" >"$temp_root/install.log" 2>&1; then
  tail -n 5 "$temp_root/install.log" >&2 || true
  skip_or_fail "install-failed" "devicectl could not install over Wi-Fi (device locked, off-network, or bundle rejected)"
fi
[[ "$(jq -r '.info.outcome // empty' "$install_json" 2>/dev/null)" == "success" ]] \
  || skip_or_fail "install-failed" "CoreDevice did not report a successful install"

if [[ "$installed_before" == "1" ]]; then
  if [[ "$attempt_mode" == "true" ]]; then
    inspect_drafts "postinstall" false || log "Post-install draft guard skipped on $device_name"
  else
    inspect_drafts "postinstall"
  fi
fi

# Trust the device's own record of the installed build instead of only the
# devicectl exit status; a stale install would otherwise look successful.
apps_after_json="$temp_root/apps-after.json"
installed_build=""
if xcrun devicectl device info apps \
  --device "$device_name" \
  --bundle-id "$bundle_id" \
  --timeout 60 \
  --json-output "$apps_after_json" >/dev/null 2>&1; then
  installed_build="$(jq -r '[.result.apps[]? | select(.bundleIdentifier == "com.transfergenie")][0] | .bundleVersion // empty' "$apps_after_json" 2>/dev/null || true)"
fi
if [[ "$installed_build" == "$candidate_build" || "$installed_build" == "$candidate_version" ]]; then
  log "Verified installed version on device: $installed_build"
elif [[ "$attempt_mode" == "true" ]]; then
  skip_or_fail "version-mismatch" "The device reports '${installed_build:-unknown}' after installing $candidate_build"
else
  log "Warning: could not confirm the installed version on the device (reported '${installed_build:-unknown}')"
fi

installed_path="$(jq -r '.result.installedApplications[0].installationURL // empty' "$install_json")"
database_uuid="$(jq -r '.result.installedApplications[0].databaseUUID // empty' "$install_json")"
if [[ "$launch_after_install" == "true" ]]; then
  launch_json="$temp_root/launch.json"
  xcrun devicectl device process launch \
    --device "$device_name" \
    --activate \
    --terminate-existing \
    "$bundle_id" \
    --timeout 60 \
    --json-output "$launch_json" >/dev/null
  process_id="$(jq -r '.result.process.processIdentifier // empty' "$launch_json")"
  [[ -n "$process_id" ]] \
    || skip_or_fail "launch-failed" "The updated app did not return a process ID"
  sleep 5
  process_list="$(xcrun lldb -b \
    -o "device select $device_name" \
    -o 'device process list' \
    -o 'quit' 2>/dev/null)"
  printf '%s\n' "$process_list" | awk -v pid="$process_id" '$1 == pid { found=1 } END { exit found ? 0 : 1 }' \
    || skip_or_fail "launch-failed" "The updated app process $process_id was not running after 5 seconds"
  log "Update complete: $device_name is running PID $process_id"
else
  log "Silent update complete; no app was opened on $device_name"
fi
log "Installed bundle: $installed_path"
log "Preserved data container UUID: $database_uuid"
if [[ "$attempt_mode" == "true" ]]; then
  printf '[ios-wifi] attempt-result: installed %s %s\n' "$candidate_version" "$candidate_build"
fi
