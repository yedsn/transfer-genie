# Refactor Progress 2026-05-25

## Scope

- Continue Vue 2 home feed migration without removing the legacy DOM fallback.
- Strengthen regression coverage around feed rendering and integration runtime snapshots.
- Keep Telegram bridge and backup/restore verification aligned with the in-progress plugin/runtime refactor.

## Changes

### 1. Home feed Vue coverage expanded

- Extended `frontend/feed-view-model.js` so simple non-image file messages can render through the Vue list path.
- Kept markdown messages, image files, uploading files, and actively downloading files on the legacy rendering path to reduce regression risk.
- Updated the Vue home feed template in `frontend/index.html` so simple file cards support:
  - open/download
  - save as
  - delete
- Preserved the legacy list as the fallback path with `v-show="!ui.homeFeed.useVueList"`.

### 2. Frontend regression coverage expanded

- Updated `tests/test_feed_view_model.js` to verify:
  - plain text messages still render in Vue
  - simple file messages now render in Vue
  - image/downloading/uploading file messages still stay on the legacy path

### 3. WebDAV runtime regression coverage expanded

- Added `src/main.rs` tests for `WebDavSyncRuntimeAdapter::status_snapshot(...)` to verify:
  - runtime state reflects active sync status
  - module enablement follows endpoint enablement

### 4. WebDAV sync runtime extracted from `main.rs`

- Added `src/webdav_sync_runtime.rs` and moved the active WebDAV sync adapter entry points there:
  - `status()`
  - `status_snapshot(...)`
  - `cancel()`
  - `refresh()`
- Kept the Tauri command surface unchanged:
  - `refresh`
  - `cancel_refresh`
  - `get_sync_status`
- Left the old in-file adapter block in `src/main.rs` as a `Legacy...` transition stub for now, because that file still has historically brittle regions and broad deletion is higher risk than a staged cutover.

### 5. Telegram Bridge runtime main path delegated

- Expanded `src/telegram_bridge_runtime.rs` so the active process-management path now owns:
  - launch config validation
  - runtime config file preparation
  - start / stop / status flows
- Kept the Tauri command surface unchanged:
  - `get_telegram_bridge_status`
  - `start_telegram_bridge`
  - `stop_telegram_bridge`
- Updated `src/main.rs` so these functions now delegate into the runtime module, while the old in-file implementations remain only as compatibility transition bodies guarded with `#[allow(unreachable_code)]`.
- Moved Telegram Bridge auto-start config validation onto the runtime-side helper as well, so `main.rs` no longer carries the active auto-start decision logic.

### 6. Restore helper duplication reduced

- Removed the duplicate inline `history.json` / `history/index.json` validation block from `restore_webdav(...)`.
- The restore flow now relies on the extracted `validate_restore_archive_history_entries(...)` helper as the single validation gate for that check.

### 7. Settings page Vue status coverage expanded

- Extended `frontend/vue-app.js` with settings-page helper methods for:
  - app version display
  - local HTTP API state/address/error display
  - Telegram Bridge state/error display
- Added a Vue-driven “runtime summary” section to `frontend/index.html` so these statuses render from the Vue store without changing the existing command or polling flow.
- Kept the original DOM ids and imperative status renderers untouched, so the migration remains additive and fallback-friendly.
- Added `tests/test_vue_app.js` to lock these settings-page Vue helper behaviors behind an executable regression test.
- Further moved integration overview card display rules into Vue helpers (`moduleKindLabel`, `moduleStateLabel`, `moduleTimelineText`) so the settings overview is less dependent on inline template branching.
- Cleaned the settings template so the version display and runtime-summary block render as a single readable Vue-driven section instead of duplicated or misplaced copy.

### 8. Integration runtime transition residue reduced

- Simplified the active Telegram Bridge entry points in `src/main.rs` so:
  - `telegram_bridge_status(...)`
  - `start_telegram_bridge_impl(...)`
  - `stop_telegram_bridge_impl(...)`
  now delegate directly to `src/telegram_bridge_runtime.rs`.
- Disabled the no-longer-active legacy WebDAV adapter block in `src/main.rs` so the runtime module path is the only live implementation path.
- Commented out the obsolete inline Telegram Bridge launch/runtime helper block in `src/main.rs` to reduce the risk of double maintenance while keeping the surrounding brittle file changes small and reversible.
- Kept the public Tauri commands and user-facing behavior unchanged.

### 9. Downloads page Vue task-list bridge added

- Extended `frontend/vue-app.js` with a dedicated `transferTasks` store slice and downloads-page shell helpers for:
  - current transfer view/page/summary lookup
  - task row class and progress helpers
  - bridge actions for pagination, selection, and download-history item actions
- Updated `frontend/main.js` so the existing imperative transfer-task logic now also publishes Vue view state for:
  - current download/upload page items
  - summary text
  - selection state
  - current downloads-vs-uploads view
- Migrated the downloads page task panels in `frontend/index.html` to render Vue-driven task rows and pagination while preserving the legacy DOM lists as fallback nodes hidden behind `v-show`.
- Kept the existing toolbar buttons, tab buttons, selection controls, and underlying task mutation logic unchanged to minimize regression risk during the migration.

### 10. Marked page Vue list bridge added

- Extended `frontend/vue-app.js` with a dedicated `markedPage` store slice and marked-page shell helpers for:
  - current page/total-page state
  - card/body class helpers
  - collapse-style helpers
  - bridge actions for pagination, selection, tag editing, pin toggling, and text expansion
- Updated `frontend/main.js` so the existing marked-message rendering flow now also publishes Vue view state for:
  - current page items
  - empty-state text
  - selection mode/count
  - pinned/tag/body metadata per marked message
- Migrated the marked page message list in `frontend/index.html` to render Vue-driven cards and pagination while preserving the legacy `#marked-message-list` node as a fallback path hidden behind `v-show`.
- Kept search inputs, tag-filter controls, batch-action bars, and the existing Tauri command flow unchanged, so the migration remains additive rather than replacing the old orchestration in one step.

### 11. Settings backup/restore state moved into Vue store

- Extended `frontend/vue-app.js` with a `settingsOps` store slice and helper methods for WebDAV backup/restore button labels and running state.
- Updated `frontend/main.js` so existing backup/restore flows now publish Vue-visible state for:
  - backup in progress / finished
  - restore in progress / finished
  - progress-event label updates from `webdav-backup-progress` / `webdav-restore-progress`
- Kept the original `backupWebdav()` / `restoreWebdav()` command flow and DOM button event listeners unchanged, so this remains a state-bridge refactor rather than a behavior rewrite.

### 12. Settings WebDAV endpoint list moved behind a Vue bridge

- Extended `frontend/vue-app.js` with a `settingsWebdav` store slice and settings-shell bridge methods for:
  - endpoint card state
  - field updates
  - enable/disable toggles
  - active-endpoint selection
  - remove and single-endpoint speed-test actions
- Updated `frontend/main.js` so the existing settings endpoint model now publishes a Vue-readable endpoint list while keeping:
  - the existing endpoint payload shape
  - the active endpoint selector
  - the save-settings flow
  - the Tauri `test_webdav_speed` command
  unchanged.
- Migrated the `#webdav-list` settings section in `frontend/index.html` to render Vue-driven endpoint cards while preserving the existing button IDs and surrounding layout.
- Added Vue bridge test coverage in `tests/test_vue_app.js` for the new settings WebDAV store helpers and action dispatch path.

### 13. Local backup archive restore flow exposed in settings

- Added a new `list_local_backup_archives` Tauri command in `src/main.rs` that reads local backup event records from `workspace/backups/`, resolves the referenced archive metadata, and returns a sorted archive history for UI display.
- Reused the existing `restore_webdav` command as the restore implementation so the new local-archive restore path does not introduce a second restore code path or a new user workflow.
- Extended `frontend/vue-app.js` with Vue store slices and actions for:
  - local backup archive list
  - local backup archive loading state
  - refresh action
  - restore-from-record action
- Updated `frontend/main.js` to:
  - load archive history during settings initialization
  - refresh local archive history after manual backup / restore actions
  - restore directly from a listed local archive record with the existing restore progress UI and confirmation flow
- Added a new settings data-management section in `frontend/index.html` that surfaces local backup archive history, file existence state, endpoint id, and direct restore actions.
- Added regression coverage for:
  - Vue archive state / action bridges in `tests/test_vue_app.js`
  - Rust archive-record listing and sort behavior in `src/main.rs`

### 14. Scheduled backup status surfaced in Vue settings

- Added a new `get_auto_backup_status` Tauri command in `src/main.rs` that combines:
  - persisted automatic backup runtime state from `workspace/backups/auto-backup-state.json`
  - current settings backup configuration
  - active-endpoint availability
- Extended `frontend/vue-app.js` with a `settingsAutoBackup` Vue store slice and helper methods for:
  - enabled / disabled state labels
  - last run / last success display
  - last error display
  - last archive path display
- Updated `frontend/main.js` to:
  - load automatic backup status during settings initialization
  - refresh Vue state after settings restore / import / save flows
  - listen to the existing `auto-backup-status` window event and update the Vue store in real time when scheduled backups run
- Added a Vue-driven automatic backup status block to the settings data-management section in `frontend/index.html`, so users can inspect the backup scheduler without changing any current workflow or command surface.
- Added regression coverage for:
  - Vue automatic-backup helper behavior in `tests/test_vue_app.js`
  - Rust status aggregation in `src/main.rs`

### 15. Automatic backup configuration wired into settings save flow

- Identified and fixed a functional gap where the frontend displayed automatic backup state but did not include `settings.backup` in the `save_settings` payload, meaning backup configuration changes could not be persisted.
- Extended `frontend/vue-app.js` with an editable automatic-backup action bridge so Vue-rendered settings controls can update:
  - enabled
  - interval minutes
  - retain count
- Updated `frontend/index.html` to add a Vue-driven automatic backup configuration block with stable input ids for:
  - `backup-enabled`
  - `backup-interval-minutes`
  - `backup-retain-count`
- Updated `frontend/main.js` so `saveSettings(...)` now writes:
  - `backup.enabled`
  - `backup.interval_minutes`
  - `backup.retain_count`
  into the persisted settings payload using the Vue-backed state, while still relying on backend normalization for minimum values.
- Added regression coverage in `tests/test_vue_app.js` for the automatic-backup field update action bridge.

### 16. Basic and system settings moved onto a Vue-backed form state

- Extended `frontend/vue-app.js` with a `settingsForm` store slice and action bridge for the current high-frequency settings fields:
  - sender name
  - refresh interval
  - download directory
  - auto start
  - auto update
  - global hotkey enablement
  - global hotkey value
- Updated `frontend/index.html` so the basic-settings and system-settings inputs now render from Vue-backed state while preserving the existing DOM ids and button entry points.
- Updated `frontend/main.js` so:
  - `applySettings(...)` hydrates the Vue settings form state from persisted settings
  - `chooseDownloadDir()` keeps the Vue form state and DOM input synchronized
  - `saveSettings(...)` now persists the migrated basic/system fields from the Vue-backed state instead of relying only on ad hoc DOM reads
- Kept existing imperative listeners such as sender-name display updates, global-hotkey enable/disable behavior, and the manual check-update button intact to avoid changing user workflows during the migration.
- Added regression coverage in `tests/test_vue_app.js` for the new settings-form state and action bridge.

### 17. API and Telegram settings joined the shared Vue settings form

- Extended the same `settingsForm` Vue state to also cover:
  - local HTTP API enablement / bind address / bind port
  - Telegram auto start
  - Telegram bot token
  - Telegram proxy enablement / proxy URL
  - Telegram chat ID
  - Telegram sender name
  - Telegram poll interval
- Updated `frontend/index.html` so the API and Telegram settings inputs now bind through Vue-backed form state while preserving the existing field ids and action buttons.
- Updated `frontend/main.js` so:
  - `applySettings(...)` hydrates API / Telegram form state from persisted settings
  - `saveSettings(...)` now persists these API / Telegram fields from the shared Vue form state instead of reading them only from ad hoc DOM values
  - Telegram chat auto-fill helpers now keep the Vue form state synchronized when discover/apply flows populate Chat ID or sender name
- Kept existing imperative behavior for:
  - Telegram proxy enable/disable UI locking
  - Telegram start / stop service controls
  - local HTTP API status rendering
  so the migration remains compatibility-first rather than rewriting those flows in one step.
- Expanded `tests/test_vue_app.js` coverage so the shared settings-form tests now cover representative API and Telegram fields as part of the Vue bridge.

### 18. Settings runtime reads tightened around Vue-backed state

- Fixed a real initialization defect in `frontend/main.js` where `applySettings(...)` populated the shared `currentSettingsFormState` from `telegram.*` before the local `telegram` object was initialized.
- Tightened a few remaining behavior-critical reads so they now prefer the Vue-backed settings state instead of ad hoc DOM values:
  - pending upload sender-name decoration
  - Telegram bridge form readiness checks
  - Telegram Chat ID auto-fill flows
  - Telegram sender-name auto-fill flows
- Kept the legacy DOM inputs and ids intact by continuing to mirror values into the existing inputs where older imperative helpers still expect them.
- Preserved existing Telegram start/stop controls, proxy-url lock behavior, and status polling so the user workflow remains unchanged while the state source becomes less fragile.

### 19. Settings runtime helpers extracted into a testable frontend module

- Added `frontend/settings-form-runtime.js` as a pure helper module for the Vue-backed settings runtime logic that was still embedded inside `frontend/main.js`.
- Moved the most stable, behavior-critical helper rules behind that module:
  - Telegram poll interval normalization
  - Telegram bridge configuration readiness checks
  - local HTTP API bind-port normalization
  - local HTTP API configured URL derivation
  - sender-name resolution with legacy-input fallback
- Updated `frontend/index.html` to load the new helper module before `frontend/main.js`.
- Updated `frontend/main.js` to delegate to the extracted module while keeping in-file fallbacks so the transition remains reversible.
- Added `tests/test_settings_form_runtime.js` to lock these compatibility rules behind executable frontend regression coverage.

### 20. Settings runtime status rules extracted and deduplicated

- Added `frontend/settings-runtime-status.js` as a second pure helper module for status-display and control-enablement rules that were duplicated between `frontend/main.js` and `frontend/vue-app.js`.
- Moved shared runtime presentation rules behind that module:
  - local HTTP API state label / address / error / summary derivation
  - Telegram Bridge running-state label and last-error derivation
  - Telegram Bridge start/stop button enablement and visibility rules
- Updated `frontend/vue-app.js` so the Vue settings shell now uses the shared status helper for runtime summary labels instead of carrying a second copy of those condition trees.
- Updated `frontend/main.js` so the imperative status renderer and Telegram start/stop control logic now consume the same helper output, reducing drift between the Vue-rendered summary and the legacy DOM status cards.
- Added `tests/test_settings_runtime_status.js` to cover the extracted status-label and button-state rules.

### 21. Requirement-shaped verification snapshot added

- Added `docs/develop/refactor-verification-2026-05-26.md` to organize the current automated evidence by the core `6.3` chains instead of by implementation order.
- Collected and reran verification evidence for:
  - home feed stability
  - WebDAV sync runtime
  - Telegram Bridge runtime and auto-start gating
  - local change-log / snapshot restore
  - backup / restore / archive metadata flows
  - plugin runtime status persistence
  - Vue settings migration helpers
- Explicitly recorded the remaining gaps that still block marking `6.3` complete, especially the missing manual Tauri smoke pass for the live desktop UI flows.

### 22. Backup and restore operation-state rules extracted

- Added `frontend/settings-ops-runtime.js` as a pure helper for settings backup/restore operation state.
- Moved the repeated rules for:
  - default WebDAV backup/restore labels
  - running/idle state transitions
  - progress-event label mapping for `webdav-backup-progress`
  - progress-event label mapping for `webdav-restore-progress`
  behind the shared helper.
- Updated `frontend/main.js` to use the helper when:
  - starting manual backup
  - finishing manual backup
  - starting manual restore
  - finishing manual restore
  - reacting to backup/restore progress events
- Kept the existing DOM button ids, progress-event names, and Vue settings-ops bridge unchanged so the user workflow remains intact.
- Added `tests/test_settings_ops_runtime.js` to lock the extracted operation-state rules behind executable regression coverage.

## Compatibility Notes

- No Tauri command surface changed in this phase.
- No existing user workflow was intentionally removed or renamed.
- The Vue path remains guarded by `ui.homeFeed.useVueList`, so unsupported message shapes continue to use the previous DOM renderer.

## Verification

### Frontend JS

- `tests/test_feed_state.js`
- `tests/test_feed_view_model.js`
- `tests/test_settings_form_runtime.js`
- `tests/test_settings_runtime_status.js`
- `tests/test_vue_app.js`

These were executed through the Node REPL MCP because shell `node.exe` execution is blocked in the current environment.

### Rust

- `cargo test webdav_sync_runtime_snapshot --offline --quiet`
- `cargo test telegram_bridge_runtime --offline --quiet`
- `cargo test should_auto_start_telegram_bridge --offline --quiet`
- `cargo test restore_archive --offline --quiet`
- `cargo check --offline --quiet`
- `cargo test list_local_backup_archives_for_state_returns_sorted_records --offline --quiet`
- `cargo test auto_backup_status_for_state_combines_settings_and_persisted_state --offline --quiet`
- `cargo test backup_ --offline --quiet`
- `cargo test list_local_backup_archives_for_state_returns_sorted_records --offline --quiet`
- `cargo test auto_backup_status_for_state_combines_settings_and_persisted_state --offline --quiet`
- `cargo check --offline --quiet`

## Remaining Gaps

- `src/main.rs` still carries commented transition residue for the old WebDAV / Telegram inline runtime code and should be fully deleted after the remaining brittle regions are safer to edit.
- Marked page and substantial parts of downloads/settings interactions still rely on imperative DOM logic and are not yet fully migrated into Vue components.
- The settings WebDAV list and the major settings form groups now flow through Vue-backed state, but the page still retains imperative status rendering, button orchestration, and legacy listeners that should be reduced before the old path can be considered removable.
