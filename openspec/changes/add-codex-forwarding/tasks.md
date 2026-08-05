## 1. Settings Model

- [ ] 1.1 Add `CodexForwardingSettings` to Rust settings types with serde defaults disabled by default.
- [ ] 1.2 Normalize and validate Codex forwarding settings when saving settings, including URL validation when enabled.
- [ ] 1.3 Extend frontend settings form state, load mapping, save payload mapping, and defaults for Codex forwarding fields.

## 2. Forwarding Runtime

- [ ] 2.1 Add an isolated Codex forwarding helper/module that builds the JSON payload without sensitive settings.
- [ ] 2.2 Implement HTTP POST forwarding with timeout/error handling using existing HTTP runtime patterns.
- [ ] 2.3 Ensure forwarding runs only after successful text or Markdown sends and never for file-only sends.
- [ ] 2.4 Surface forwarding failures as non-blocking status messages while preserving original send success state.

## 3. Settings UI

- [ ] 3.1 Add Codex forwarding controls to the settings page with enable switch, endpoint URL input, and concise helper text.
- [ ] 3.2 Wire settings controls to existing Vue/legacy form update helpers without changing unrelated settings sections.
- [ ] 3.3 Verify Chinese UI text remains readable after edits.

## 4. Tests and Validation

- [ ] 4.1 Add Rust tests for settings defaults, URL validation, and forwarding payload construction.
- [ ] 4.2 Add or update frontend tests for settings form state and save payload mapping.
- [ ] 4.3 Add a targeted forwarding test using a local/mock HTTP receiver or an isolated payload helper test.
- [ ] 4.4 Run `cargo test`, relevant Node frontend tests, and `openspec validate add-codex-forwarding --strict`.
