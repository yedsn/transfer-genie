## 1. Updater foundation

- [x] 1.1 Add Tauri updater dependencies and configuration for GitHub Releases metadata and signed updater artifacts.
- [x] 1.2 Grant the minimum desktop updater permissions needed for check/install operations.
- [x] 1.3 Extend persisted settings and import/export payloads with the automatic update preference and backward-compatible defaults.

## 2. Backend update flow

- [x] 2.1 Implement Rust commands for checking desktop updates, downloading/installing updates, and restarting the app.
- [x] 2.2 Add backend state and event emission needed to prevent concurrent checks and report install progress to the frontend.
- [x] 2.3 Add tests for settings compatibility and updater command behavior that can be validated locally.

## 3. Frontend settings and dialogs

- [x] 3.1 Add the automatic update toggle and manual “check for updates” entry to the settings UI.
- [x] 3.2 Wire settings load/save logic for the new preference and manual check command.
- [x] 3.3 Add update availability, progress, completion, and failure dialogs using the existing in-app dialog system.

## 4. Automatic check behavior and release docs

- [x] 4.1 Trigger a delayed automatic update check from the window show flow, with per-session deduplication and silent failure handling.
- [x] 4.2 Update release documentation and helper scripts to describe GitHub Releases assets, signatures, and `latest.json` publishing.
- [x] 4.3 Validate the OpenSpec change and confirm the documented release flow matches the implemented configuration.
