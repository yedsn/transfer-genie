#!/usr/bin/env bash

set -euo pipefail

project_root="${TRANSFER_GENIE_PROJECT_ROOT:-$PWD}"
[[ -f "$project_root/package.json" ]] || { printf '[ios-renew] Project not found: %s\n' "$project_root" >&2; exit 1; }

config_file="${TRANSFER_GENIE_IOS_CONFIG:-$project_root/.env}"
latest_build_dir="${TRANSFER_GENIE_IOS_LATEST_BUILD_DIR:-$project_root/gen/apple/build/ios-wireless-latest}"
[[ "$latest_build_dir" == /* ]] || latest_build_dir="$project_root/$latest_build_dir"
state_dir="$project_root/gen/apple/build/ios-renewal"
profile_backup_root="$state_dir/profile-backups"
artifact_backup_root="$state_dir/artifact-backups"
profiles_dir="$HOME/Library/Developer/Xcode/UserData/Provisioning Profiles"
lock_dir="$project_root/gen/apple/build/.ios-daily-renew.lock"
bundle_id="com.transfergenie"
active_profile_backup=""
previous_artifact_backup=""
restore_profiles=true
restore_artifact=true

mkdir -p "$state_dir" "$profile_backup_root" "$artifact_backup_root"

log() { printf '[ios-renew] %s\n' "$*"; }
fail() { printf '[ios-renew] Error: %s\n' "$*" >&2; exit 1; }

read_config_value() {
  local key="$1" value
  [[ -f "$config_file" ]] || return 0
  value="$(sed -n "s/^${key}=//p" "$config_file" | tail -n 1 | tr -d '\r')"
  value="${value%\"}"; value="${value#\"}"
  value="${value%\'}"; value="${value#\'}"
  printf '%s' "$value"
}

development_team="${APPLE_DEVELOPMENT_TEAM:-}"
[[ -n "$development_team" ]] || development_team="$(read_config_value APPLE_DEVELOPMENT_TEAM)"
[[ -n "$development_team" && "$development_team" != YOUR_* ]] || fail "Configure APPLE_DEVELOPMENT_TEAM in $config_file"

cleanup() {
  local profile
  if [[ "$restore_profiles" == "true" && -n "$active_profile_backup" ]]; then
    mkdir -p "$profiles_dir"
    for profile in "$active_profile_backup"/*.mobileprovision; do
      [[ -f "$profile" ]] || continue
      mv "$profile" "$profiles_dir/$(basename "$profile")" 2>/dev/null || true
    done
    log "Restored the previous provisioning profile(s)"
  fi
  if [[ "$restore_artifact" == "true" && -n "$previous_artifact_backup" && -d "$previous_artifact_backup" ]]; then
    if [[ -e "$latest_build_dir" ]]; then
      failed_dir="$state_dir/failed-artifact-$(date '+%Y%m%d-%H%M%S')"
      mv "$latest_build_dir" "$failed_dir" 2>/dev/null || true
    fi
    mv "$previous_artifact_backup" "$latest_build_dir" 2>/dev/null || true
    log "Restored the previous signed artifact"
  fi
  rm -f -- "$lock_dir/pid" 2>/dev/null || true
  rmdir "$lock_dir" 2>/dev/null || true
}

if ! mkdir "$lock_dir" 2>/dev/null; then
  holder="$(cat "$lock_dir/pid" 2>/dev/null || true)"
  [[ -n "$holder" ]] && kill -0 "$holder" 2>/dev/null && fail "Another daily renewal is active (PID $holder)"
  fail "Stale renewal lock exists: $lock_dir"
fi
printf '%s\n' $$ >"$lock_dir/pid"
trap cleanup EXIT INT TERM

xcode_accounts="$(defaults read com.apple.dt.Xcode DVTDeveloperAccountManagerAppleIDLists 2>/dev/null || true)"
[[ -n "$xcode_accounts" ]] || fail "Xcode has no signed-in Apple account"

stamp="$(date '+%Y%m%d-%H%M%S')"
active_profile_backup="$profile_backup_root/$stamp-$development_team"
mkdir -p "$active_profile_backup"
old_expiration_epoch=0
old_device_udids='[]'
profile_count=0

for profile in "$profiles_dir"/*.mobileprovision; do
  [[ -f "$profile" ]] || continue
  decoded="$state_dir/profile-inspect.plist"
  security cms -D -i "$profile" >"$decoded" 2>/dev/null || continue
  team="$(/usr/libexec/PlistBuddy -c 'Print :TeamIdentifier:0' "$decoded" 2>/dev/null || true)"
  app_id="$(/usr/libexec/PlistBuddy -c 'Print :Entitlements:application-identifier' "$decoded" 2>/dev/null || true)"
  [[ "$team" == "$development_team" && "$app_id" == "$development_team.$bundle_id" ]] || continue
  expiration="$(plutil -extract ExpirationDate raw -o - "$decoded" 2>/dev/null || true)"
  expiration_epoch="$(TZ=UTC date -j -f '%Y-%m-%dT%H:%M:%SZ' "$expiration" '+%s' 2>/dev/null || true)"
  [[ -n "$expiration_epoch" ]] && (( expiration_epoch > old_expiration_epoch )) && old_expiration_epoch="$expiration_epoch"
  devices="$(plutil -extract ProvisionedDevices json -o - "$decoded" 2>/dev/null || printf '[]')"
  old_device_udids="$(jq -cn --argjson a "$old_device_udids" --argjson b "$devices" '$a + $b | unique')"
  uuid="$(/usr/libexec/PlistBuddy -c 'Print :UUID' "$decoded" 2>/dev/null || basename "$profile" .mobileprovision)"
  mv "$profile" "$active_profile_backup/$uuid.mobileprovision"
  profile_count=$((profile_count + 1))
done
log "Backed up $profile_count matching provisioning profile(s)"

if [[ -d "$latest_build_dir" ]]; then
  previous_artifact_backup="$artifact_backup_root/$stamp"
  mv "$latest_build_dir" "$previous_artifact_backup"
  log "Moved the previous artifact to $previous_artifact_backup"
fi

cd "$project_root"
npm run ios:build-latest

manifest="$latest_build_dir/manifest.json"
app="$latest_build_dir/Transfer Genie.app"
[[ -f "$manifest" && -d "$app" ]] || fail "The renewed artifact was not published"

new_team="$(jq -r '.team // empty' "$manifest")"
new_bundle="$(jq -r '.bundleId // empty' "$manifest")"
new_profile_uuid="$(jq -r '.profileUuid // empty' "$manifest")"
new_expiration="$(jq -r '.profileExpiration // empty' "$manifest")"
new_expiration_epoch="$(TZ=UTC date -j -f '%Y-%m-%dT%H:%M:%SZ' "$new_expiration" '+%s' 2>/dev/null || true)"
new_devices="$(jq -c '.deviceUdids // []' "$manifest")"
artifact_id="$(jq -r '.artifactId // empty' "$manifest")"

[[ "$new_team" == "$development_team" ]] || fail "Renewed artifact has Team $new_team, expected $development_team"
[[ "$new_bundle" == "$bundle_id" ]] || fail "Renewed artifact has bundle ID $new_bundle"
[[ -n "$new_profile_uuid" && -n "$artifact_id" && -n "$new_expiration_epoch" ]] || fail "Renewed manifest is missing profile identity"
(( old_expiration_epoch == 0 || new_expiration_epoch > old_expiration_epoch )) || fail "The new profile expiration did not move forward"
missing_devices="$(jq -cn --argjson old "$old_device_udids" --argjson new "$new_devices" '$old - $new | length')"
[[ "$missing_devices" == "0" ]] || fail "The new profile dropped a previously provisioned device"
codesign --verify --deep --strict "$app" >/dev/null 2>&1 || fail "Strict code signature verification failed"

restore_profiles=false
restore_artifact=false
jq -n --arg at "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" --arg artifactId "$artifact_id" --arg profileUuid "$new_profile_uuid" --arg profileExpiration "$new_expiration" '{lastRenewalAt:$at, artifactId:$artifactId, profileUuid:$profileUuid, profileExpiration:$profileExpiration}' >"$state_dir/last-success.json.tmp"
mv "$state_dir/last-success.json.tmp" "$state_dir/last-success.json"
log "Renewal complete: artifact $artifact_id expires at $new_expiration"
exit 0

