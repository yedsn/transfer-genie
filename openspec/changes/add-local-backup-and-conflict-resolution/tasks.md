## 1. OpenSpec
- [x] 1.1 Add proposal, design, and delta specs for local backup and conflict handling.
- [x] 1.2 Run `openspec validate add-local-backup-and-conflict-resolution --strict`.

## 2. Backend
- [x] 2.1 Extend backup settings with directory, retention windows, and frequency defaults.
- [x] 2.2 Add local snapshot create/list/restore/cleanup logic with rollback snapshot before restore.
- [x] 2.3 Update scheduled backup to write into the configured backup directory and apply retention rules.
- [x] 2.4 Add WebDAV conflict detection and a serializable pending conflict status.
- [x] 2.5 Add conflict resolution commands for remote-over-local and local-over-remote.

## 3. Frontend
- [x] 3.1 Add settings fields for backup directory, frequency, and retention rules.
- [x] 3.2 Add manual local backup/list/restore controls and require confirmation before restore.
- [x] 3.3 Show WebDAV conflict status with actions to download remote or upload local.

## 4. Docs and Tests
- [x] 4.1 Add Rust tests for settings defaults, retention cleanup, snapshot package validation, and conflict decisions.
- [x] 4.2 Add targeted frontend/runtime tests for backup settings and conflict action wiring.
- [x] 4.3 Update docs for backup, restore, retention, and conflict handling.
- [x] 4.4 Run `cargo test` and targeted JS smoke tests.
