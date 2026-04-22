# Change: Add tray update check entry

## Why
Users can already check for updates from the settings screen, but when the app is minimized to the tray there is no direct way to trigger the same update flow. Adding a tray entry makes the updater easier to reach and matches the tray-first desktop workflow.

## What Changes
- Add a `检查更新` menu item to the desktop tray menu.
- Show the main window and trigger the existing in-app manual update flow when the tray item is clicked.
- Reuse the current update dialogs instead of introducing a separate native tray prompt flow.

## Impact
- Affected specs: `app-shell`
- Affected code: `src/main.rs`, `frontend/main.js`
