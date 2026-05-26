# Transfer Genie Refactor Summary

## 1. Architecture Changes

### 1.1 Frontend Modularization

The frontend has been split from a single monolithic main.js into a layered architecture:

| Module | Purpose | Lines |
| --- | --- | --- |
| vue-app.js | Vue 2 app shell, store, component shells for all 4 pages | ~800 |
| feed-state.js | Pure boundary-based feed state management | ~334 |
| feed-view-model.js | Message view-model builder for Vue-vs-legacy rendering paths | ~87 |
| settings-form-runtime.js | Settings normalization, Telegram validity, API URL derivation | ~59 |
| settings-runtime-status.js | HTTP API / Telegram Bridge status labels and button rules | ~88 |
| settings-ops-runtime.js | WebDAV backup/restore operation state and progress mapping | ~100 |
| main.js | Remaining imperative orchestration, Tauri calls, legacy DOM fallbacks | ~10,334 |

### 1.2 Backend Module Separation

| Module | Purpose |
| --- | --- |
| workspace.rs | Workspace layout, migration, change log, snapshots, retention |
| integration_runtime.rs | Plugin contracts, built-in modules, status persistence |
| webdav_sync_runtime.rs | WebDAV sync behind sync-plugin contract |
| telegram_bridge_runtime.rs | Telegram Bridge behind bridge-plugin contract |
| main.rs | Tauri commands, AppState, settings, backup/restore, scheduled jobs |

## 2. Data Storage Design

### 2.1 Workspace Layout

`
workspace/
  change-log/events.jsonl
  backups/auto-backup-state.json, <endpoint-id>/*.zip
  endpoints/<id>/{files, history-cache, change-log, mirrors, snapshots}
  plugins/{module-status.json, webdav-sync/status.json, telegram-bridge/}
  mirrors/, runtime/
`

### 2.2 Change Log

Append-only JSONL in workspace/change-log/events.jsonl with fields: id, timestamp_ms, category, operation, target_path, snapshot_path, metadata.

### 2.3 Snapshot and Restore

Pre-write snapshots in workspace/snapshots/<category>/<target>/, pruned to 20 per target. Restore appends audit log entry.

### 2.4 Settings Persistence

Settings remain in settings.json at the app data root. Vue-backed form state mirrors the persisted structure. save_settings now includes the previously-missing settings.backup block.

## 3. Plugin Mechanism

Two traits define the integration runtime: SyncModuleRuntime (for sync adapters like WebDAV) and BridgeModuleRuntime (for bridge adapters like Telegram). Both produce IntegrationModuleStatus with stable fields. Built-in modules: webdav-sync (Sync) and telegram-bridge (Bridge). Status persisted to workspace/plugins/ with audit logging.

## 4. Backup Strategy

Manual backup/restore via backup_webdav/restore_webdav Tauri commands with archive history validation (history.json or history/index.json). Scheduled auto-backup creates local archives, records metadata, and prunes to configured retain count (minimum 1). list_local_backup_archives provides time-sorted archive history for UI display and restore.

## 5. Bug Fixes

| # | Bug | Impact |
| --- | --- | --- |
| 1 | applySettings read telegram.* before const telegram was initialized | Settings page crash or undefined fields on startup |
| 2 | settings.backup block missing from save_settings payload | Auto-backup config could not be persisted |
| 3 | Sender-name reads inconsistent between Vue state and DOM | Upload sender decoration could show stale name |
| 4 | Telegram Bridge form state read DOM values instead of Vue state | Bridge gating could use stale values after edits |
| 5 | Local HTTP API config URL derived from DOM instead of Vue state | API address display could drift from saved settings |
| 6 | Home feed used offset-based incremental loading (unstable) | Feed frequently fails to load issue resolved |
| 7 | Duplicate inline WebDAV adapter block in main.rs | Reduced double-maintenance risk |
| 8 | Duplicate inline Telegram Bridge launch logic in main.rs | Reduced double-maintenance risk |

## 6. Verification Evidence

Rust: cargo test --offline --quiet - 121 tests passed (webdav sync, telegram bridge, workspace, backup, restore, plugin runtime, settings normalization).

Frontend: 6 test scripts all passed - test_feed_state.js, test_feed_view_model.js, test_vue_app.js, test_settings_form_runtime.js, test_settings_runtime_status.js, test_settings_ops_runtime.js.

### 6.1 Known Limitations

- No live Tauri desktop UI smoke pass has been recorded for the full interactive workflow
- The frontend retains compatibility-first imperative fallback paths
- main.rs still contains commented transition residue for old inline code

## 7. Recommendations

### 7.1 Short-term

- Run a manual Tauri UI smoke pass on the feat_20260525_refactor branch
- Remove commented-out legacy code blocks in main.rs after smoke pass confirms no regressions

### 7.2 Medium-term

- Complete Vue 2 migration for remaining imperative DOM paths (tasks 4.2-4.4 in OpenSpec)
- Add E2E test automation using a Tauri-compatible test runner
- Extract save_settings validation rules into a shared pure helper

### 7.3 Long-term

- Evaluate replacing jQuery/editor.md dependencies with Vue-native equivalents
- Add support for additional sync plugins (e.g., S3, OneDrive) via the SyncModuleRuntime contract
- Add a visual change-log browser in settings for audit trail inspection
