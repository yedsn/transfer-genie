## 1. Data Model and Persistence

- [x] 1.1 Add backup record metadata fields for manual flag, backup name, and note with serde defaults for existing records.
- [x] 1.2 Expose manual metadata in local backup archive and settings snapshot list response types.
- [x] 1.3 Normalize backup settings so `retain_count` backs the UI label `本地备份归档最多自动保留数量` and remains at least 1.
- [x] 1.4 Persist manual backup metadata in sidecar records or manifests for both local backup archives and settings snapshots.

## 2. Backend Backup Behavior

- [x] 2.1 Add or extend Tauri commands to create a manual local backup archive with optional name and note.
- [x] 2.2 Add or extend Tauri commands to create a manual settings snapshot backup with optional name and note.
- [x] 2.3 Update automatic archive count cleanup to count and delete only automatic backup archives.
- [x] 2.4 Update automatic snapshot retention cleanup to skip manual snapshots.
- [x] 2.5 Ensure legacy backup records without manual metadata list correctly as automatic records.
- [x] 2.6 Add a backend command to clear currently listed local backup archives and their metadata records after confirmation from the frontend.

## 3. Frontend UI and State

- [x] 3.1 Add the settings label `本地备份归档最多自动保留数量` and wire it to the existing backup retain count save/load path.
- [x] 3.2 Add `手动备份` buttons to the local backup archive page and the snapshot page.
- [x] 3.3 Add a manual backup dialog with backup name and note fields, loading state, submit, and cancel behavior.
- [x] 3.4 Wire dialog submission to the correct Tauri command based on whether the user started from local backup archive or snapshot.
- [x] 3.5 Display manual backup name, note, and manual marker in backup archive and snapshot lists.
- [x] 3.6 Verify all edited Chinese UI text remains readable and unchanged except for required additions.
- [x] 3.7 Add `新建归档` and `清空归档` actions to the local backup archive page and wire them to existing create plus new clear flows.

## 4. Tests and Validation

- [x] 4.1 Add Rust tests for manual metadata defaults and list serialization for legacy records.
- [x] 4.2 Add Rust tests that automatic archive cleanup preserves manual backups while pruning automatic backups over the count limit.
- [x] 4.3 Add Rust tests that snapshot cleanup preserves manual snapshots.
- [x] 4.4 Add frontend tests for settings retain-count payload mapping and manual backup dialog state/actions.
- [x] 4.5 Run `cargo fmt`, `cargo test`, relevant Node frontend tests, and `openspec validate add-manual-backup-retention --strict`.
- [x] 4.6 Add tests for clearing local backup archives and rerun formatting, Rust tests, frontend tests, and OpenSpec validation.
