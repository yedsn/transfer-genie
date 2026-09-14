## 1. Settings Model and Migration

- [x] 1.1 Add a persisted shortcut master switch to the settings model and verify old settings without the new field load with legacy-compatible behavior.
- [x] 1.2 Update settings normalization so empty window, system dictation, and send-message shortcut values are preserved as disabled states, and verify unit tests cover each empty value.
- [x] 1.3 Update import/export handling to include the shortcut master switch and preserve cleared shortcut values, and verify existing import/export tests or targeted Rust tests pass.

## 2. Backend Shortcut Behavior

- [x] 2.1 Update global window shortcut registration to require both the master switch and a non-empty window shortcut value, and verify registration tests cover master-switch-off and empty-value cases.
- [x] 2.2 Update system dictation shortcut registration and side-Alt hook configuration to require the master switch, enabled system dictation, and a non-empty shortcut value, and verify tests cover each gate.
- [x] 2.3 Change the tray shortcut menu action to a checked “启用快捷键” switch that toggles the master switch for all shortcuts without clearing values, and verify the checked state reflects the master switch state.
- [x] 2.4 Add a checked “启用系统听写” tray switch that toggles the existing system dictation feature setting, refreshes shortcut registration, and syncs the settings UI.

## 3. Settings UI

- [x] 3.1 Add a dedicated “快捷键” settings navigation item and section, and verify the settings page shows all shortcut controls in that section.
- [x] 3.2 Move show/hide window, system dictation, and send-message shortcut controls out of their old settings sections, and verify the old sections no longer show shortcut controls.
- [x] 3.3 Add clear and reset actions for each shortcut, and verify clearing leaves the field empty while reset restores Alt+T, Alt+D, or Enter.
- [x] 3.4 Keep send-message shortcut options limited to Enter, Ctrl+Enter, empty, and reset, and verify no arbitrary send-shortcut capture is exposed.

## 4. Frontend Shortcut Runtime

- [x] 4.1 Update settings state collection/application so the master switch and empty shortcut values round-trip through save/load, and verify settings UI tests cover the new state.
- [x] 4.2 Update editor send handling so an empty send-message shortcut or disabled master switch makes Enter/Ctrl+Enter insert text instead of sending, and verify focused editor tests cover button-only sending.
- [x] 4.3 Update system dictation shortcut capture display so clearing and resetting work without requiring the old per-shortcut enable toggle, and verify the input disabled/enabled states match the new model.

## 5. Verification

- [x] 5.1 Run `cargo test` and verify Rust settings and shortcut behavior tests pass.
- [x] 5.2 Run targeted frontend tests for settings and editor send behavior, including `node tests/test_settings_form_runtime.js` and the relevant Vue/workspace tests.
- [x] 5.3 Manually verify in the app that settings and tray toggles both control all shortcuts without clearing configured values.
