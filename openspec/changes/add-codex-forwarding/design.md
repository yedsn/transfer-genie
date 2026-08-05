## Context

Transfer Genie already has a text send pipeline that writes messages to the active WebDAV endpoint, updates local history, and refreshes the chat-style feed. Users now also use the composer as a prompt drafting workspace before moving content into Codex.

Codex Desktop does not have a guaranteed public in-process API for receiving text into the currently active thread. A robust Transfer Genie feature therefore needs to treat Codex delivery as an external target integration rather than as direct UI control of Codex. The safest first implementation is a configurable local HTTP endpoint that a Codex bridge can expose.

## Goals / Non-Goals

**Goals:**

- Let users opt in to forwarding sent text or Markdown prompts to a Codex-compatible target.
- Preserve the existing WebDAV/local send behavior even when Codex forwarding fails.
- Store forwarding configuration in settings with backward-compatible defaults.
- Keep the forwarding implementation isolated from the WebDAV send pipeline.
- Provide clear success/failure status for forwarding attempts.

**Non-Goals:**

- Do not automate Codex Desktop by default through focus switching, clipboard mutation, paste, or synthetic key presses.
- Do not require a specific Codex bridge implementation inside this change.
- Do not forward file messages to Codex in the first version.
- Do not change existing local HTTP API request shapes for `/api/send-text` or `/api/send-file`.

## Decisions

- Decision: Model Codex forwarding as a new settings group under `Settings`, for example `codex_forwarding`.
  - Rationale: The feature has independent enablement and target configuration, and should not be coupled to AI provider settings or WebDAV endpoint settings.
  - Alternative considered: Add fields under `ai`. Rejected because AI text actions call model providers, while Codex forwarding sends user-authored prompts to another local application or bridge.

- Decision: Use HTTP POST to a user-configured endpoint as the first delivery mode.
  - Rationale: HTTP is already part of the app's runtime dependencies, is testable without desktop focus assumptions, and lets a future Codex bridge decide how to inject the prompt into Codex.
  - Alternative considered: Clipboard and window automation. Rejected for first version because it is brittle, mutates user clipboard state, depends on window focus/title, and can accidentally send to the wrong target.

- Decision: Forward only after the original text send succeeds.
  - Rationale: The primary Transfer Genie action remains the WebDAV/local send. Forwarding a prompt that failed to save locally would create confusing split-brain behavior.
  - Alternative considered: Forward before WebDAV upload. Rejected because Codex could receive prompts that Transfer Genie failed to record.

- Decision: Codex forwarding failures are non-blocking.
  - Rationale: Users should not lose the original Transfer Genie send because an optional external integration is down or misconfigured.
  - Alternative considered: Treat forwarding failure as total send failure. Rejected because it changes existing send semantics and makes an optional integration too invasive.

- Decision: Use a small explicit JSON payload for forwarding: text, format, source metadata, and sent message metadata when available.
  - Rationale: This gives a bridge enough context without exposing WebDAV credentials or unrelated settings.

## Risks / Trade-offs

- Codex bridge endpoint may not exist or may be stopped -> Show a clear non-blocking forwarding error and keep the Transfer Genie send successful.
- Users may expect direct active-thread injection in Codex Desktop -> Label the setting as a target endpoint/bridge integration and document that a compatible receiver is required.
- HTTP endpoint configuration can leak prompt content to a non-local target -> Default to disabled and local endpoint examples; do not send credentials; validate URL shape before saving.
- Forwarding after WebDAV send means Codex may not receive the prompt if forwarding fails -> Keep status visible and consider adding a future manual retry action.

## Migration Plan

- Add serde defaults so existing `settings.json` files load with Codex forwarding disabled.
- Saving settings writes the new group only after the user changes or saves settings through the app.
- Rollback is safe because older versions will ignore unknown JSON fields if they deserialize through tolerant settings handling; if not, users can remove the `codex_forwarding` group from `settings.json`.

## Open Questions

- What concrete Codex bridge endpoint should be recommended in docs once Codex Desktop integration details are confirmed?
- Should a later version support a guarded clipboard/window automation mode for users who explicitly accept the fragility?
