## Context
The app stores durable local data in `settings.json`, `messages.sqlite`, and the `workspace/` tree. WebDAV data is already exportable as a ZIP archive, but scheduled archives currently use a workspace-internal directory and a count-only retention rule. Sync currently trusts remote history/files and can overwrite local index state without a user-visible conflict state.

## Goals / Non-Goals
- Goals: create and restore local snapshot packages, expose backup settings, apply default retention of all snapshots for 3 days and one daily snapshot for the following week, and require explicit WebDAV conflict resolution.
- Goals: keep existing local HTTP API and persisted data readable.
- Non-Goals: introduce new crates, change the SQLite schema, encrypt local backup archives, or redesign WebDAV history layout.

## Decisions
- Local snapshots are ZIP files containing a small manifest plus app-local files: `settings.json`, `messages.sqlite`, and selected `workspace/` subtrees needed to reconstruct cached local state.
- Restore is guarded by an explicit confirmation flag and writes a pre-restore rollback snapshot before replacing local data.
- Backup directory defaults to a `TransferGenie/backup` folder under the user's home directory and can be changed in settings.
- Retention uses two configurable windows: keep all snapshots within `keep_all_days`, then keep one snapshot per day within `keep_daily_days`. Defaults are 3 and 7.
- WebDAV sync returns a serializable conflict status and stores the pending conflict in memory until the user chooses remote-over-local or local-over-remote.

## Risks / Trade-offs
- Restoring local data while sync is active can corrupt state. Mitigation: use the existing sync guard during restore and cancel active sync before replacing files.
- A full workspace snapshot can be large. Mitigation: keep it as a single file and apply retention cleanup after scheduled backups.
- Remote conflict detection based on metadata can miss same-size/same-mtime edits. Mitigation: use available `etag`, `mtime`, size, and local record differences without adding expensive full-content hashing during normal sync.

## Migration Plan
Existing settings receive default backup fields through serde defaults and normalization. No database migration is required.
