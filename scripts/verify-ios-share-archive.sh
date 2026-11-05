#!/usr/bin/env bash

set -euo pipefail

usage() {
  cat <<'EOF'
Usage: scripts/verify-ios-share-archive.sh <app-bundle> [--require-profile] [--team <team-id>]

Verifies that an iOS app bundle contains exactly one signed Transfer Genie
share extension, that the extension declares the share-services point, and
that both bundles carry the group.com.transfergenie App Group entitlement.
EOF
}

fail() {
  printf '[ios-share] Error: %s\n' "$*" >&2
  exit 1
}

plist_value() {
  /usr/libexec/PlistBuddy -c "Print :$2" "$1" 2>/dev/null || true
}

require_app_group() {
  local bundle_path="$1"
  local label="$2"
  local groups
  local entitlements
  entitlements="$(mktemp)"
  codesign -d --entitlements :- "$bundle_path" >"$entitlements" 2>/dev/null \
    || fail "$label signature entitlements could not be read"
  groups="$(/usr/libexec/PlistBuddy -c 'Print :com.apple.security.application-groups' "$entitlements" 2>/dev/null || true)"
  rm -f "$entitlements"
  if ! printf '%s\n' "$groups" | grep -Fq 'group.com.transfergenie'; then
    fail "$label is missing the group.com.transfergenie App Group entitlement"
  fi
}

require_profile() {
  local bundle_path="$1"
  local expected_bundle_id="$2"
  local label="$3"
  local team="$4"
  local profile_path="$bundle_path/embedded.mobileprovision"
  local profile_plist
  local profile_team
  local application_identifier
  local groups

  [[ -f "$profile_path" ]] || fail "$label does not contain embedded.mobileprovision"
  profile_plist="$(mktemp)"
  if ! security cms -D -i "$profile_path" >"$profile_plist" 2>/dev/null; then
    rm -f "$profile_plist"
    fail "$label provisioning profile could not be decoded"
  fi
  profile_team="$(plist_value "$profile_plist" 'TeamIdentifier:0')"
  application_identifier="$(plist_value "$profile_plist" 'Entitlements:application-identifier')"
  groups="$(/usr/libexec/PlistBuddy -c 'Print :Entitlements:com.apple.security.application-groups' "$profile_plist" 2>/dev/null || true)"
  rm -f "$profile_plist"

  if [[ -n "$team" && "$profile_team" != "$team" ]]; then
    fail "$label profile team '$profile_team' does not match '$team'"
  fi
  [[ "$application_identifier" == *".$expected_bundle_id" ]] \
    || fail "$label profile application identifier '$application_identifier' does not match $expected_bundle_id"
  if ! printf '%s\n' "$groups" | grep -Fq 'group.com.transfergenie'; then
    fail "$label provisioning profile is missing group.com.transfergenie"
  fi
}

if [[ $# -lt 1 ]]; then
  usage >&2
  exit 2
fi

app_path="$1"
shift
require_profile_check=false
team=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --require-profile)
      require_profile_check=true
      shift
      ;;
    --team)
      [[ $# -ge 2 ]] || fail "--team requires a value"
      team="$2"
      shift 2
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

for command_name in codesign plutil security; do
  command -v "$command_name" >/dev/null 2>&1 || fail "Missing required command: $command_name"
done

[[ -d "$app_path" ]] || fail "App bundle not found: $app_path"
[[ "$(plist_value "$app_path/Info.plist" CFBundleIdentifier)" == "com.transfergenie" ]] \
  || fail "Host bundle identifier must be com.transfergenie"

shopt -s nullglob
app_extensions=("$app_path/PlugIns"/*.appex)
if [[ ${#app_extensions[@]} -ne 1 ]]; then
  fail "Expected exactly one embedded .appex, found ${#app_extensions[@]}"
fi
appex_path="${app_extensions[0]}"
[[ "$(plist_value "$appex_path/Info.plist" CFBundleIdentifier)" == "com.transfergenie.ShareExtension" ]] \
  || fail "Embedded extension bundle identifier must be com.transfergenie.ShareExtension"
[[ "$(plist_value "$appex_path/Info.plist" NSExtension:NSExtensionPointIdentifier)" == "com.apple.share-services" ]] \
  || fail "Embedded extension is not registered for com.apple.share-services"

codesign --verify --strict "$appex_path" >/dev/null 2>&1 \
  || fail "Embedded share extension signature is invalid"
codesign --verify --deep --strict "$app_path" >/dev/null 2>&1 \
  || fail "Host app signature is invalid or does not seal the embedded extension"

require_app_group "$app_path" "Host app"
require_app_group "$appex_path" "Share extension"

if [[ "$require_profile_check" == "true" ]]; then
  require_profile "$app_path" com.transfergenie "Host app" "$team"
  require_profile "$appex_path" com.transfergenie.ShareExtension "Share extension" "$team"
fi

printf '[ios-share] Verified embedded share extension, activation point and App Group on both bundles\n'
