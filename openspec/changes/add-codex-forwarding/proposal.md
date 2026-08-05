## Why

Users increasingly use Transfer Genie as a prompt drafting workspace before moving prompts into Codex. Copying the finished prompt into Codex is repetitive and breaks the flow, especially when the prompt is already ready to send.

This change lets users opt in to forwarding sent text prompts to Codex, so a prompt can be written once in Transfer Genie and delivered to Codex during the normal send action.

## What Changes

- Add a settings option to enable or disable Codex forwarding for text sends.
- Add Codex forwarding configuration with a target endpoint and delivery mode options suitable for a local Codex bridge.
- When the user sends a text or Markdown message, keep the existing Transfer Genie send behavior and also attempt to forward the same prompt to Codex when enabled.
- Report Codex forwarding success or failure without blocking the original WebDAV/local message send.
- Add validation and tests for settings persistence, forwarding payload construction, and send-flow failure handling.
- No breaking changes to existing WebDAV sync, local HTTP API, Telegram Bridge, or AI text action behavior.

## Capabilities

### New Capabilities

- `codex-forwarding`: Configuring and delivering prompt text from Transfer Genie to Codex-compatible local targets.

### Modified Capabilities

- `client-settings`: Settings must expose and persist Codex forwarding configuration.
- `message-feed`: Text send behavior must optionally trigger Codex forwarding while preserving the existing message send pipeline.

## Impact

- Affected frontend: settings UI in `src-ui/index.html`, settings state/save/load mapping in `src-ui/src/legacy-main.js`, and related Vue/store helpers.
- Affected backend: settings types in `src/types.rs`, save/load normalization in `src/main.rs`, and a new Codex forwarding helper or module invoked from the text send flow.
- Affected tests: Rust unit tests for settings/defaults and forwarding payload behavior; frontend tests for settings form state; targeted send-flow tests where practical.
- External systems: a user-configured local Codex bridge or endpoint. The app should not assume direct access to an active Codex Desktop thread unless a stable endpoint is configured.
