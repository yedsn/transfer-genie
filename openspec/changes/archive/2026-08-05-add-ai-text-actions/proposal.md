## Why

Transfer Genie already supports drafting and sending text, but users must leave the app to polish, rewrite, or otherwise process draft content with AI. Adding configurable AI text actions lets users improve selected text or whole drafts in-place while keeping the existing send and WebDAV sync flow unchanged.

The feature should be designed as an extensible AI text action system rather than a single hard-coded polish button, so future actions such as translation, summarization, tone changes, Markdown cleanup, or custom prompts can reuse the same provider and prompt infrastructure.

## What Changes

- Add an AI text action capability for processing selected text or the active draft through a configured AI provider.
- Add settings for enabling AI features, configuring an OpenAI-compatible provider, choosing a model, storing credentials, and managing prompt-based text actions.
- Add a one-click polish entry above the draft input that applies the configured default polish action to the current selection or draft.
- Add an editor context-menu entry for running AI actions against selected text.
- Show AI output in a preview/confirmation flow before replacing or inserting text, so generated content never silently overwrites a draft.
- Keep sending, WebDAV storage, message history, and local HTTP ingest behavior unchanged; AI processing only changes the local draft when the user confirms the result.

## Capabilities

### New Capabilities

- `ai-text-actions`: Covers AI provider configuration, prompt-based text actions, text processing requests, and output confirmation behavior.

### Modified Capabilities

- `client-settings`: Settings SHALL persist AI provider and prompt-action configuration, including sensitive credential handling and import/export behavior.
- `message-feed`: The draft composer SHALL expose AI polish/action entry points and apply confirmed AI output to selected text or the active draft.

## Impact

- Affected Rust code: settings model and normalization in `src/types.rs` and `src/main.rs`; new Tauri command and provider client for AI text processing; tests for settings defaults, prompt rendering, provider request mapping, and error handling.
- Affected frontend code: settings UI in `src-ui/index.html` and settings runtime helpers; draft editor/workspace components under `src-ui/src/workspace/`; legacy bridge code where current settings and draft actions are synchronized.
- Affected data: persisted settings gain a backward-compatible `ai` section. AI API keys are sensitive configuration and must follow existing encrypted export/import expectations.
- External systems: user-configured OpenAI-compatible HTTP APIs; the app must handle unavailable providers, invalid credentials, timeouts, and malformed responses without disrupting normal transfer workflows.
