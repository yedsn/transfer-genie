## Context

Transfer Genie is a Tauri 2 desktop app with a Rust backend, persisted JSON settings, a Vue 3/static frontend mix, and an existing draft composer that supports plain text and Markdown. Settings are centralized in the Rust `Settings` model and saved through a Tauri command, while draft editing lives in the frontend workspace components and only enters the WebDAV message flow after the user sends.

AI text processing introduces three cross-cutting concerns: external provider calls, sensitive API credentials, and editor selection/replacement behavior. The design keeps these concerns separate from the existing send pipeline so AI failures never block normal text/file transfer.

## Goals / Non-Goals

**Goals:**

- Provide a provider-agnostic foundation for AI text actions, with the first implementation using OpenAI-compatible chat completion APIs.
- Persist AI settings and prompt-action configuration with backward-compatible defaults.
- Treat API keys as sensitive configuration in normal settings, import, and export flows.
- Support processing either the active text selection or the whole active draft.
- Show generated output in a preview/confirmation flow before modifying draft text.
- Keep AI processing local to the draft editor until the user explicitly sends the final content.

**Non-Goals:**

- No multi-turn AI chat, message history context, agent workflow, or remote prompt marketplace in the first version.
- No provider-specific SDK matrix in the first version; provider-specific presets can be added later on top of the OpenAI-compatible protocol.
- No automatic background AI processing of received messages.
- No changes to WebDAV file format, `history.json`, local HTTP ingest behavior, or Telegram Bridge behavior.

## Decisions

### Decision: Model the feature as AI text actions, not a single polish function

The settings model will store a list of prompt-backed actions such as `polish`, `formalize`, `shorten`, and user-defined custom actions. Each action has an id, display name, prompt template, optional system prompt, output mode, and enabled/default flags.

Rationale: A single hard-coded polish command would satisfy the first button but would make translation, summarization, Markdown cleanup, and custom prompts future rewrites. An action model lets the UI add menus and shortcuts without changing provider code.

Alternatives considered: Hard-code only polish. This is faster but does not match the extensibility requirement.

### Decision: Implement AI calls in the Rust backend through a Tauri command

The frontend will call a command such as `process_text_with_ai` with the action id, input text, and lightweight context such as draft format. The Rust backend will read current settings, render the prompt, call the configured provider, normalize errors, and return generated text.

For providers that support streaming, the backend also exposes `process_text_with_ai_stream` and emits `ai-text-stream` events. Stream events separate reasoning deltas from output deltas by parsing `<think>...</think>` blocks, including tags split across provider chunks. The frontend can show reasoning while the request is running, while the final preview and apply actions use only output deltas.

Rationale: Keeping provider calls in Rust avoids exposing API keys to frontend code and fits the existing command-driven settings/security model.

Alternatives considered: Call providers directly from the browser frontend. This is simpler for UI prototyping but leaks credentials into renderer state and makes import/export security harder to reason about.

### Decision: Start with OpenAI-compatible chat completions

The first provider kind will be `openai_compatible`, with configurable base URL, API key, model, temperature, and timeout. Provider presets can prefill common base URLs but should still map to the same request path and response parser where possible.

Rationale: This covers OpenAI, many hosted vendors, local gateways such as LM Studio, and Ollama-compatible deployments with one adapter.

Alternatives considered: Add separate adapters for every vendor. That improves vendor-specific polish but creates more configuration and testing surface before the core UX is proven.

### Decision: Always preview AI output before replacing draft content

AI actions will return output to a frontend preview dialog. The user can replace the selected text, replace the whole draft, insert at the cursor, retry, or cancel depending on the action context.

Rationale: AI output is not deterministic, and silent replacement risks losing draft content. A confirmation step keeps the feature reversible and predictable.

Alternatives considered: Directly replace the draft on success. This is lower friction but too risky for long drafts and selected text edits.

### Decision: Keep prompt templating deliberately small

Prompt templates will support simple variable replacement for `{{text}}`, `{{format}}`, and similar known values. Unknown variables are rejected or left unchanged with validation, but no general scripting/template engine is introduced.

Rationale: Simple templates are enough for the first action library and reduce prompt injection surface inside app-controlled prompts.

Alternatives considered: Use a full template engine. That adds flexibility but increases validation and escaping complexity without clear first-version value.

## Risks / Trade-offs

- Provider latency or outage → Set request timeouts, show non-blocking errors, and leave draft text unchanged on failure.
- Invalid credentials or model name → Provide a settings test action and return actionable error messages without saving partial AI results.
- API key leakage through export or logs → Mark AI API keys sensitive, avoid logging request headers/body, and reuse encrypted export handling.
- Prompt output changes Markdown structure unexpectedly → Pass draft format into the prompt context and require preview before applying output.
- Selection handling differs between plain textarea and Markdown editor → Implement textarea selection first and use editor-specific selection APIs for Markdown; if unavailable, fall back to whole-draft processing with clear UI state.
- User-defined prompts can produce unwanted output → Keep built-in prompts conservative, require preview, and allow disabling or resetting prompt actions.

## Migration Plan

Existing settings files will load with `ai.enabled = false`, an empty credential set, and default built-in actions. Saving settings will write the new `ai` section. Import/export will include AI settings, with API keys treated as sensitive fields. Rollback is safe because older builds should ignore unknown JSON fields if they deserialize settings permissively; if not, rollback guidance should remove the `ai` section from settings.

## Open Questions

- Should the first provider presets include only OpenAI-compatible generic fields, or should common Chinese providers be shown as named presets that still use the same adapter?
- Should custom actions be editable in the first implementation, or should the first release ship only editable built-in prompt text with add/delete deferred?
- Should Markdown editor selected-text processing be mandatory for first release, or can whole-draft processing be accepted if selection APIs are unreliable?
