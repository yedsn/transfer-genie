## Why

Users need finer control over local backup archive growth and a way to preserve important backup points beyond automatic cleanup. The current automatic retention behavior does not distinguish user-created backups from routine automatic archives.

## What Changes

- Add a setting named `本地备份归档最多自动保留数量` to control the maximum number of automatic local backup archives retained.
- Apply automatic archive cleanup only to automatic backup records, keeping the newest records up to the configured count.
- Add `手动备份` actions to both the local backup archive page and the settings snapshot page.
- Let users provide a backup name and note when creating a manual backup.
- Mark manual backups so automatic cleanup never removes them.
- Display manual backup name and note in the relevant backup lists after creation and reload.
- No breaking changes to existing backup restore, WebDAV backup, or automatic backup scheduling behavior.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `client-settings`: Local backup settings, local backup archive listing, settings snapshot listing, and retention cleanup behavior change to support automatic archive count limits and manual backups.

## Impact

- Affected backend: backup settings types, backup archive metadata, manual backup commands, settings snapshot metadata, and retention cleanup logic in `src/types.rs`, `src/main.rs`, and workspace snapshot helpers if needed.
- Affected frontend: backup settings UI, local backup archive page, settings snapshot page, manual backup dialog, state mapping, and Tauri command wiring under `src-ui/`.
- Affected tests: Rust tests for retention/manual backup metadata; frontend runtime or Vue tests for new controls and payload mapping.
