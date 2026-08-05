## Why

Users often draft prompts or notes in Transfer Genie and then paste the sent content into another app. Copying manually after a successful send adds a repetitive step.

This change lets users opt in to copying successfully sent text or Markdown content to the clipboard, so the sent prompt is immediately ready to paste elsewhere.

## What Changes

- Add a Send Settings section that groups send hotkey, default editor format, and send-after-copy controls.
- Add a persisted setting for copying sent text or Markdown content to the clipboard after a successful send.
- Add a send-adjacent shortcut menu for quickly toggling send-after-copy from the composer.
- Preserve existing send behavior when clipboard copying is disabled or when the original send fails.
- No breaking changes to existing WebDAV sync, local HTTP API, Telegram Bridge, or AI text action behavior.

## Capabilities

### Modified Capabilities

- `client-settings`: Settings must expose and persist send-after-copy configuration under Send Settings.
- `message-feed`: Text send behavior must optionally copy successfully sent content to the clipboard while preserving the existing message send pipeline.

## Impact

- Affected frontend: settings UI in `src-ui/index.html`, settings state/save/load mapping in `src-ui/src/legacy-main.js`, and composer send controls.
- Affected backend: settings types in `src/types.rs`, load/save/default handling in `src/main.rs`.
- Affected tests: Rust unit tests for settings defaults; frontend tests for settings form state and save payload mapping.
