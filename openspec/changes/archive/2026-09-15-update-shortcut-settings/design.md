## Context

The app currently stores three shortcut-related settings in different places: `global_hotkey_enabled/global_hotkey` for the window shortcut, `send_hotkey` for editor send behavior, and `speech_to_text.system_dictation_enabled/system_dictation_shortcut` for system dictation. The tray menu toggles only `global_hotkey_enabled`. System dictation also has platform-specific side-Alt hooks that are controlled by the dictation setting.

The settings UI is a static/Vue-hybrid page in `src-ui/index.html` with runtime state in `src-ui/src/legacy-main.js`. Global shortcut registration happens in the Rust backend. Send-message shortcut handling happens inside the frontend editor and must be coordinated with backend-persisted settings.

## Goals / Non-Goals

**Goals:**

- Represent global shortcut availability with one persisted master switch.
- Represent each individual shortcut's availability by whether its shortcut value is empty.
- Keep existing defaults and old settings files working.
- Keep the system dictation feature switch separate from the dictation shortcut value.
- Ensure tray toggling, backend registrations, side-Alt hooks, and editor send handling follow the same master switch.

**Non-Goals:**

- Do not add arbitrary send-message shortcut capture in the first version.
- Do not remove the system dictation feature setting.
- Do not change ASR, editor, or tray behavior beyond shortcut enablement and configuration placement.

## Decisions

- Decision: Add a persisted shortcut master switch rather than reusing `global_hotkey_enabled` as the long-term setting.
  - Rationale: `global_hotkey_enabled` currently means the window shortcut only. Reusing it would preserve the confusing name and make import/export behavior harder to reason about.
  - Alternative considered: Toggle every individual shortcut value from the tray. That would destroy user configuration and conflict with the requirement that disabling all shortcuts should not clear values.

- Decision: Treat empty shortcut values as disabled individual shortcuts.
  - Rationale: This matches the requested user model: setting a shortcut enables it, clearing it disables it. It avoids separate per-shortcut enable switches and reduces mismatch between UI state and persisted data.
  - Alternative considered: Keep per-shortcut enabled booleans. That would require users to reason about both a value and a checkbox for every shortcut.

- Decision: Keep legacy `global_hotkey_enabled` compatible during migration/import.
  - Rationale: Existing settings and exported configurations include `global_hotkey_enabled`. Loading an old file should map that value to the new master switch and preserve `global_hotkey` as the window shortcut value.
  - Alternative considered: Force new defaults whenever the new field is missing. That could unexpectedly re-enable shortcuts for users who had disabled the window shortcut previously.

- Decision: Preserve `speech_to_text.system_dictation_enabled` as a feature gate, while `system_dictation_shortcut` controls whether keyboard activation exists.
  - Rationale: Users may enable or disable the feature independently of whether a shortcut is configured. System dictation must respond only when the master switch is on, the feature is enabled, and the shortcut value is non-empty.
  - Alternative considered: Clear the dictation shortcut when system dictation is disabled. That would lose user configuration unnecessarily.

- Decision: Keep send-message shortcut choices as `Enter`, `Ctrl+Enter`, or empty.
  - Rationale: The editor already supports the first two modes. Empty can be added as “button only” without introducing arbitrary keyboard capture or new conflict rules.
  - Alternative considered: Support arbitrary send shortcuts immediately. That adds complexity around text editing conflicts and is outside the first-version scope.

## Risks / Trade-offs

- Existing `send_hotkey` normalization may default unknown or empty values back to `Enter` → Update normalization so empty is preserved as “disabled” while invalid non-empty values still fall back or fail predictably.
- Backend and frontend may disagree on the master switch name during migration → Add one canonical field in settings state and map legacy fields in load/import/export paths.
- Side-Alt dictation hooks may still fire when the master switch is off → Include the master switch in side-Alt hook config updates, not only the dictation feature flag.
- The tray menu changes app state while the settings window may be open → Existing settings reload/sync behavior should be reused or extended so the UI reflects the new master switch after tray changes.
- Clearing shortcuts could conflict with old defaulting behavior → Tests should cover empty window shortcut, empty dictation shortcut, and empty send shortcut persistence.

## Migration Plan

1. Add the new shortcut master switch with a default enabled state for first-run settings.
2. On load/import, use the new field when present; otherwise map legacy `global_hotkey_enabled` to the master switch for backward compatibility.
3. Preserve existing shortcut values when disabling the master switch from settings or tray.
4. Export both the new master switch and enough legacy-compatible data to avoid breaking older import paths where practical.
5. Rollback can keep the saved shortcut values; older builds will ignore the new field and continue using `global_hotkey_enabled` for the window shortcut.
