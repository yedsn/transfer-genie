## 1. Settings and Data Model

- [x] 1.1 Add AI provider, AI action, and AI settings structs to the Rust settings model with backward-compatible defaults.
- [x] 1.2 Extend settings normalization, loading, saving, snapshot restore, and default test fixtures to include the new AI settings.
- [x] 1.3 Extend configuration import/export so AI settings are included and AI API keys are treated as sensitive encrypted fields.
- [x] 1.4 Add Rust tests for legacy settings defaults, AI setting persistence, and AI key import/export protection.

## 2. AI Processing Backend

- [x] 2.1 Add prompt rendering utilities for known variables such as input text and draft format.
- [x] 2.2 Implement an OpenAI-compatible provider client with timeout handling and response parsing.
- [x] 2.3 Add a Tauri command for running an AI text action by action id and input context.
- [x] 2.4 Normalize configuration, provider, timeout, invalid response, and disabled-action errors into user-facing messages.
- [x] 2.5 Add Rust tests for prompt rendering, disabled/incomplete configuration errors, provider request mapping, and failure behavior.

## 3. Settings UI

- [x] 3.1 Add an AI assistant section to the settings navigation and settings page.
- [x] 3.2 Wire AI enabled state, provider kind, base URL, API key, model, temperature, and timeout fields into the settings form runtime.
- [x] 3.3 Add UI for viewing and editing built-in AI text actions, including name, enabled state, system prompt, and user prompt template.
- [x] 3.4 Add validation and save/load mapping between frontend form state and backend AI settings.

## 4. Composer UI and Draft Application

- [x] 4.1 Add a one-click polish button above the active draft editor and disable it when AI cannot run.
- [x] 4.2 Capture selected text and full-draft fallback for plain text drafts.
- [x] 4.3 Add editor context-menu actions for selected text and route the chosen action to the backend command.
- [x] 4.4 Add a preview dialog for AI output with apply, insert, retry, and cancel behavior as appropriate for the action context.
- [x] 4.5 Apply confirmed AI output to selected text, whole draft, or cursor insertion without changing send behavior.
- [x] 4.6 Add Markdown draft support for whole-draft processing and selected-text processing where the editor API supports it.

## 5. Verification

- [x] 5.1 Run `cargo test` for Rust settings and AI backend coverage.
- [x] 5.2 Run `npm run typecheck` and `npm run build` for frontend integration.
- [x] 5.3 Manually verify AI disabled state, invalid configuration errors, one-click polish, selected-text right-click action, preview cancel, and confirmed replacement.
- [x] 5.4 Verify normal text sending still uploads through the existing WebDAV/message pipeline after AI output is applied.
