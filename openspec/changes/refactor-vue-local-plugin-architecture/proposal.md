# Change: Refactor App For Vue 2, Local Data Workspace, And Plugin Runtime

## Why
The current app couples frontend rendering, message-feed state, local persistence, WebDAV sync, and Telegram bridge logic into a few oversized modules. This makes regression-safe changes slow, obscures local data ownership, and contributes to unstable home-page incremental loading.

The project also needs a consistent local-first data model with file change history, recoverable snapshots, scheduled backups, and extensible integration modules without changing existing user workflows.

## What Changes
- Refactor the static frontend into a Vue 2 application while preserving current features, user flows, and visible behavior.
- Introduce a local data workspace layout for settings, database, endpoint caches, change logs, history snapshots, bridge runtime state, and scheduled backups.
- Add a local change-record and snapshot mechanism for business files and history manifests, including browse, restore, and rollback support.
- Add scheduled automatic snapshot backups inspired by SeaTable-style local history, adapted to this app's WebDAV-centric workflow.
- Refactor WebDAV sync and Telegram Bridge into plugin-like runtime modules that can be enabled, disabled, and extended independently.
- Stabilize home-page incremental loading so older-message loading remains reliable during refresh, search, deletion, and endpoint switching.
- Keep transitional compatibility layers so existing settings, message history, and user operations continue to work during migration.

## Impact
- Affected specs: `message-feed`, `client-settings`
- Added specs: `local-data-runtime`, `integration-runtime`
- Affected code: `frontend/index.html`, `frontend/main.js`, `frontend/styles.css`, `src/main.rs`, `src/db.rs`, `src/history.rs`, `src/webdav.rs`, `src/telegram_bridge.rs`, `src/types.rs`
