## 1. Discovery And Compatibility Baseline
- [x] 1.1 Inventory current frontend views, Tauri commands, local data files, and runtime directories.
- [x] 1.2 Document compatibility constraints for settings, message history, downloads, marked messages, WebDAV sync, and Telegram bridge.
- [x] 1.3 Add regression test coverage for home feed loading, WebDAV sync, Telegram bridge startup, and backup/restore baseline behavior.

## 2. Local Workspace And Change History
- [x] 2.1 Introduce a workspace path abstraction for app data, endpoint data, plugin runtime data, and backup storage.
- [x] 2.2 Add append-only local change records for business file and history-manifest updates.
- [x] 2.3 Add local snapshots/mirrors and restore helpers with retention rules.
- [x] 2.4 Keep backward-compatible readers for existing settings, DB, history cache, and bridge state locations.

## 3. Integration Runtime Refactor
- [x] 3.1 Define sync-plugin and bridge-plugin runtime contracts.
- [x] 3.2 Move WebDAV sync behind the sync-plugin contract without changing current behavior.
- [x] 3.3 Move Telegram Bridge process management behind the bridge-plugin contract with dedicated runtime folders.
- [x] 3.4 Add enable/disable and runtime status persistence for built-in plugins.

## 4. Frontend Vue 2 Migration
- [x] 4.1 Set up Vue 2 app shell and shared service/store layer over existing Tauri commands.
- [ ] 4.2 Migrate home feed, marked page, downloads page, and settings page into Vue 2 components.
- [ ] 4.3 Keep behavior-compatible interactions for sending, marking, deleting, downloading, backup/restore, and settings edits.
- [ ] 4.4 Remove imperative DOM-only rendering paths once Vue 2 parity is verified.

## 5. Home Feed Stability
- [x] 5.1 Replace offset-based incremental loading with a stable boundary-based loading strategy.
- [x] 5.2 Ensure refresh, search, deletion, selection mode, and endpoint switching cannot corrupt feed state.
- [x] 5.3 Add focused regression coverage for repeated load-more and empty/partial result cases.

## 6. Scheduled Backups And Final Verification
- [x] 6.1 Add scheduled local snapshot backup jobs and backup metadata management.
- [x] 6.2 Add restore and rollback flows for snapshots and backup archives.
- [ ] 6.3 Run end-to-end verification on home feed, WebDAV sync, Telegram bridge, local history/snapshot, and backup flows.
- [ ] 6.4 Update final refactor documentation with architecture, storage layout, plugin runtime, backup strategy, bug fixes, and residual recommendations.
