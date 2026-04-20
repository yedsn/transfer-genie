## Why

Transfer Genie currently has no built-in desktop update flow, which makes users manually download and replace releases even when a newer version is already available. We want to add a GitHub Releases-backed updater so the desktop app can quietly check for updates after the main window appears and guide users through install and restart without disrupting normal startup.

## What Changes

- Add a desktop auto-update capability backed by `tauri-plugin-updater` and GitHub Releases static metadata.
- Add a persisted client setting that lets users enable or disable automatic update checks.
- Check for updates in the background after the main window is shown, while avoiding repeated prompts during the same session.
- Show in-app confirmation dialogs for update availability, download/install progress, install completion, and restart choice.
- Add release metadata and updater configuration requirements for GitHub-hosted update packages and `latest.json`.

## Capabilities

### New Capabilities
- `desktop-updater`: Desktop app update detection, user confirmation, install flow, restart flow, and GitHub Releases metadata integration.

### Modified Capabilities
- `client-settings`: Add automatic update preference management and a manual check-for-updates entry in settings.

## Impact

- Affected code: `Cargo.toml`, `tauri.conf.json`, `capabilities/default.json`, `src/main.rs`, `src/types.rs`, `frontend/index.html`, `frontend/main.js`, release scripts/docs.
- Dependencies: `tauri-plugin-updater` and possibly `tauri-plugin-process` if restart handling requires it.
- Systems: desktop startup/show lifecycle, settings persistence, frontend dialog flow, GitHub Releases publishing pipeline.
