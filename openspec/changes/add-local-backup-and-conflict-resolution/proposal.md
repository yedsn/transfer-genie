# Change: Add local backup and WebDAV conflict resolution

## Why
Transfer Genie already backs up WebDAV data, but users also need a restorable local data snapshot that covers app settings, the local SQLite index, cached endpoint files, and runtime metadata. WebDAV sync also needs explicit conflict handling so local and remote edits are not overwritten silently.

## What Changes
- Add configurable local data backup settings: backup directory, frequency, and retention rules.
- Add local data snapshot creation, listing, restore, and cleanup behavior without changing the current SQLite schema or local HTTP API payloads.
- Keep WebDAV ZIP backup and restore compatible while recording archives in the configured backup directory.
- Add conflict detection during WebDAV sync when local and remote metadata differ, returning a conflict state instead of overwriting automatically.
- Add explicit conflict resolution actions: download remote to overwrite local, or upload local to overwrite remote.
- Update settings UI and docs for backup directory, frequency, retention, manual backup/restore, and conflict resolution.

## Impact
- Affected specs: `client-settings`, `message-feed`
- Affected code: `src/types.rs`, `src/main.rs`, `src/webdav.rs`, `frontend/index.html`, `frontend/main.js`, `frontend/vue-app.js`, `frontend/utils/*`, `tests/*`, `docs/*`
- Breaking changes: none. Existing settings JSON, local HTTP API, and WebDAV history data remain backward compatible.
