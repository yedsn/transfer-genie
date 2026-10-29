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
check_only=false
launch_after_install=false
confirm_before_update=false
temp_root=""

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
  --check-only           Run all safety checks but do not install or launch
  --launch               Open Transfer Genie after the update
  --confirm              Show effective iOS settings and ask before connecting
  -h, --help             Show this help

Environment equivalents:
  TRANSFER_GENIE_IOS_DEVICE, APPLE_DEVELOPMENT_TEAM,
  TRANSFER_GENIE_IOS_CARGO_HOME, TRANSFER_GENIE_IOS_CONFIG

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

cleanup() {
  if [[ -n "$temp_root" && -d "$temp_root" ]]; then
    rm -rf -- "$temp_root"
  fi
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
    fail "Unable to copy $source_path from $device_name"
  fi
  return 1
}

inspect_drafts() {
  local label="$1"
  local snapshot_dir="$temp_root/$label"
  local remote_dir="Library/Application Support/com.transfergenie"
  local database_path="$snapshot_dir/messages.sqlite"
  local table_count
  local draft_count

  mkdir -p "$snapshot_dir"
  copy_container_file "$remote_dir/messages.sqlite" "$database_path" true
  copy_container_file "$remote_dir/messages.sqlite-wal" "$snapshot_dir/messages.sqlite-wal" false || true
  copy_container_file "$remote_dir/messages.sqlite-shm" "$snapshot_dir/messages.sqlite-shm" false || true

  [[ "$(sqlite3 -readonly "$database_path" 'PRAGMA integrity_check;')" == "ok" ]] \
    || fail "The copied messages database failed its integrity check"

  table_count="$(sqlite3 -readonly "$database_path" \
    "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='mobile_composer_drafts';")"
  [[ "$table_count" == "1" ]] \
    || fail "The installed app does not expose a verifiable mobile draft table"

  draft_count="$(sqlite3 -readonly "$database_path" \
    'SELECT COUNT(*) FROM mobile_composer_drafts;')"
  [[ "$draft_count" == "0" ]] \
    || fail "$device_name has $draft_count saved mobile draft(s). Finish or clear them before updating"

  log "$label draft guard passed: SQLite ok, saved drafts=0"
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
    -h|--help)
      usage
      exit 0
      ;;
    *)
      fail "Unknown option: $1"
      ;;
  esac
done

if [[ "$confirm_before_update" == "true" ]]; then
  confirm_update
fi

[[ -n "$device_name" ]] \
  || fail "Missing TRANSFER_GENIE_IOS_DEVICE. Configure it in $config_file (see .env.example)"
[[ -n "$development_team" ]] \
  || fail "Missing APPLE_DEVELOPMENT_TEAM. Configure it in $config_file (see .env.example)"
[[ "$device_name" != YOUR_* ]] \
  || fail "Replace the placeholder TRANSFER_GENIE_IOS_DEVICE in $config_file"
[[ "$development_team" != YOUR_* ]] \
  || fail "Replace the placeholder APPLE_DEVELOPMENT_TEAM in $config_file"

for command_name in jq sqlite3 security plutil codesign npm xcrun; do
  require_command "$command_name"
done

temp_root="$(mktemp -d /tmp/transfer-genie-ios-wifi.XXXXXX)"
trap cleanup EXIT INT TERM

cd "$project_root"

details_json="$temp_root/device-details.json"
xcrun devicectl device info details \
  --device "$device_name" \
  --timeout 60 \
  --json-output "$details_json" >/dev/null

device_udid="$(jq -r '.result.hardwareProperties.udid // empty' "$details_json")"
pairing_state="$(jq -r '.result.connectionProperties.pairingState // empty' "$details_json")"
transport_type="$(jq -r '.result.connectionProperties.transportType // empty' "$details_json")"
tunnel_state="$(jq -r '.result.connectionProperties.tunnelState // empty' "$details_json")"
developer_mode="$(jq -r '.result.deviceProperties.developerModeStatus // empty' "$details_json")"
ddi_available="$(jq -r '.result.deviceProperties.ddiServicesAvailable // false' "$details_json")"

[[ -n "$device_udid" ]] || fail "Could not read the UDID for $device_name"
[[ "$pairing_state" == "paired" ]] || fail "$device_name is not paired with this Mac"
[[ "$transport_type" == "localNetwork" ]] \
  || fail "$device_name is using '$transport_type', not the local-network transport"
[[ "$tunnel_state" == "connected" ]] || fail "The Wi-Fi developer tunnel is not connected"
[[ "$developer_mode" == "enabled" ]] || fail "Developer Mode is not enabled on $device_name"
[[ "$ddi_available" == "true" ]] || fail "Developer disk image services are unavailable"
log "Connected to $device_name over Wi-Fi ($device_udid)"

apps_before_json="$temp_root/apps-before.json"
xcrun devicectl device info apps \
  --device "$device_name" \
  --bundle-id "$bundle_id" \
  --timeout 60 \
  --json-output "$apps_before_json" >/dev/null
installed_before="$(jq -r '[.result.apps[]? | select(.bundleIdentifier == "com.transfergenie")] | length' "$apps_before_json")"

if [[ "$installed_before" == "1" ]]; then
  # Do not foreground Settings or another app. The composer saves 350 ms after
  # each mutation, so wait for the debounce and verify twice before replacing
  # the installed bundle. Any saved draft blocks the update.
  sleep 2
  inspect_drafts "preinstall-1"
  sleep 1
  inspect_drafts "preinstall-2"
else
  log "$bundle_id is not installed yet; the draft guard is not applicable"
fi

archive_path="$project_root/gen/apple/build/transfer-genie_iOS.xcarchive"
if [[ "$skip_build" != "true" ]]; then
  build_args=(ios build --target aarch64 --archive-only --ci --export-method debugging)
  if [[ "$build_mode" == "debug" ]]; then
    build_args+=(--debug)
  fi

  log "Building a signed $build_mode iPhone archive"
  APPLE_DEVELOPMENT_TEAM="$development_team" \
  CARGO_HOME="$ios_cargo_home" \
    npx tauri "${build_args[@]}"
else
  log "Reusing the existing archive (--skip-build)"
fi

[[ -d "$archive_path" ]] || fail "Archive not found: $archive_path"
application_path="$(/usr/libexec/PlistBuddy -c 'Print :ApplicationProperties:ApplicationPath' "$archive_path/Info.plist")"
app_path="$archive_path/Products/$application_path"
[[ -d "$app_path" ]] || fail "App bundle not found in the archive: $app_path"

platform_name="$(/usr/libexec/PlistBuddy -c 'Print :DTPlatformName' "$app_path/Info.plist")"
candidate_bundle_id="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$app_path/Info.plist")"
candidate_version="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$app_path/Info.plist")"
candidate_build="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleVersion' "$app_path/Info.plist")"
[[ "$platform_name" == "iphoneos" ]] || fail "Archive targets '$platform_name', not iphoneos"
[[ "$candidate_bundle_id" == "$bundle_id" ]] || fail "Unexpected bundle ID: $candidate_bundle_id"
codesign --verify --deep --strict --verbose=2 "$app_path"

profile_path="$app_path/embedded.mobileprovision"
profile_plist="$temp_root/profile.plist"
[[ -f "$profile_path" ]] || fail "The app does not contain an embedded provisioning profile"
security cms -D -i "$profile_path" >"$profile_plist"
profile_team="$(/usr/libexec/PlistBuddy -c 'Print :TeamIdentifier:0' "$profile_plist" 2>/dev/null || true)"
profile_expiration="$(plutil -extract ExpirationDate raw -o - "$profile_plist")"
if /usr/libexec/PlistBuddy -c 'Print :ProvisionedDevices' "$profile_plist" 2>/dev/null \
  | grep -Fqx "    $device_udid"; then
  profile_has_device=true
else
  profile_has_device=false
fi
[[ "$profile_team" == "$development_team" ]] || fail "Profile team '$profile_team' does not match '$development_team'"
[[ "$profile_has_device" == "true" ]] || fail "The provisioning profile does not include $device_udid"

expiration_epoch="$(date -j -f '%Y-%m-%dT%H:%M:%SZ' "$profile_expiration" '+%s' 2>/dev/null || true)"
[[ -n "$expiration_epoch" ]] || fail "Could not parse profile expiration: $profile_expiration"
now_epoch="$(date '+%s')"
(( expiration_epoch > now_epoch )) || fail "The provisioning profile expired at $profile_expiration"
remaining_hours=$(( (expiration_epoch - now_epoch) / 3600 ))
if (( remaining_hours < 48 )); then
  log "Warning: the development profile expires in about $remaining_hours hour(s)"
fi

executable_name="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleExecutable' "$app_path/Info.plist")"
candidate_uuid="$(dwarfdump --uuid "$app_path/$executable_name" | awk '{print $2}')"
log "Candidate $candidate_version ($candidate_build), UUID $candidate_uuid"
log "Development profile expires at $profile_expiration"

if [[ "$check_only" == "true" ]]; then
  log "Check-only completed; no app was installed"
  exit 0
fi

install_json="$temp_root/install.json"
log "Installing $bundle_id in place over Wi-Fi"
xcrun devicectl device install app \
  --device "$device_name" \
  "$app_path" \
  --timeout 120 \
  --json-output "$install_json"
[[ "$(jq -r '.info.outcome // empty' "$install_json")" == "success" ]] \
  || fail "CoreDevice did not report a successful install"

if [[ "$installed_before" == "1" ]]; then
  inspect_drafts "postinstall"
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
  [[ -n "$process_id" ]] || fail "The updated app did not return a process ID"
  sleep 5
  process_list="$(xcrun lldb -b \
    -o "device select $device_name" \
    -o 'device process list' \
    -o 'quit' 2>/dev/null)"
  printf '%s\n' "$process_list" | awk -v pid="$process_id" '$1 == pid { found=1 } END { exit found ? 0 : 1 }' \
    || fail "The updated app process $process_id was not running after 5 seconds"
  log "Update complete: $device_name is running PID $process_id"
else
  log "Silent update complete; no app was opened on $device_name"
fi
log "Installed bundle: $installed_path"
log "Preserved data container UUID: $database_uuid"
