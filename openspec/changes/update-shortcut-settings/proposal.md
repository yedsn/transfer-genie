## Why

Shortcut settings are currently spread across Send, System, and Speech settings, and the tray shortcut toggle only affects the window shortcut. Users need one predictable place to manage shortcuts, with a clear distinction between temporarily disabling all shortcuts and clearing an individual shortcut.

## What Changes

- Add a dedicated Shortcuts settings menu/section that contains all user-configurable shortcut controls.
- Move the window show/hide shortcut, system dictation shortcut, and send-message shortcut controls into that section.
- Replace per-shortcut enable toggles with value-based behavior: a shortcut with a value is active, and a cleared shortcut is disabled.
- Add Clear and Reset-to-default actions for each shortcut.
- Add a shortcut master switch that temporarily enables or disables all configured shortcuts without clearing their saved values.
- Change the tray menu shortcut action to a checked “启用快捷键” item that controls the shortcut master switch and applies to all shortcuts.
- Add a checked “启用系统听写” tray menu item that toggles the existing system dictation feature switch.
- Keep send-message shortcut choices limited to Enter, Ctrl+Enter, Clear, and Reset for the first version.
- Preserve existing default shortcuts: Alt+T for show/hide window, Alt+D for system dictation, and Enter for send-message.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `client-settings`: Settings UI organization and shortcut configuration behavior change.
- `app-shell`: Tray shortcut toggle and global shortcut response behavior change.

## Impact

- Affected specs: `client-settings`, `app-shell`.
- Affected frontend: settings navigation and sections in `src-ui/index.html`, settings state/save handling in `src-ui/src/legacy-main.js`, editor send shortcut handling in `src-ui/src/workspace/DraftEditor.vue`, and related CSS/tests as needed.
- Affected backend: settings model/defaults/import-export in `src/types.rs` and `src/main.rs`, shortcut normalization/registration, tray menu labeling/action, and side-Alt dictation hook enablement.
- No new external dependencies expected.
