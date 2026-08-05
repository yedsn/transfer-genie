## 1. Settings Model

- [x] 1.1 Add persisted send settings with `copy_after_send` disabled by default.
- [x] 1.2 Extend frontend settings form state, load mapping, save payload mapping, and defaults for send-after-copy.

## 2. Send Runtime

- [x] 2.1 Copy sent text or Markdown content to the clipboard only after the original send succeeds.
- [x] 2.2 Ensure file-only sends do not copy file bytes or file metadata to the clipboard.
- [x] 2.3 Preserve original send success state when clipboard copy fails.

## 3. Settings UI and Composer Shortcut

- [x] 3.1 Move send hotkey, default editor format, and send-after-copy controls under a Send Settings section.
- [x] 3.2 Add a send-adjacent shortcut menu for toggling send-after-copy from the composer.
- [x] 3.3 Wire shortcut menu toggles to the existing settings save path without sending messages.
- [x] 3.4 Verify Chinese UI text remains readable after edits.

## 4. Tests and Validation

- [x] 4.1 Add Rust tests for send settings defaults.
- [x] 4.2 Add or update frontend tests for send settings form payload mapping.
- [x] 4.3 Run `cargo test`, relevant Node frontend tests, and `openspec validate add-codex-forwarding --strict`.
