## Context

The current automatic speech-polish path calls the existing OpenAI-compatible AI provider after ASR completes. General AI settings contain one provider endpoint, credential, model, temperature, and timeout, while speech settings currently only select whether polish runs and which prompt action is used. The existing request payload has no output bound or reasoning preference. See `proposal.md` and the speech-transcription-polish delta for the observable behavior.

## Goals / Non-Goals

**Goals:**

- Give automatic speech polish a separate fast-model selector without duplicating provider credentials or connection settings.
- Bound speech-polish generation and request duration with speech-specific defaults and validation.
- Place an explicit deep-thinking switch next to the speech-polish model setting, defaulting to off.
- Preserve the existing raw-transcript fallback and single-final-output behavior.
- Keep the common OpenAI-compatible transport usable for providers that ignore or reject optional performance fields.

**Non-Goals:**

- No second AI provider account, API key, or base URL for speech polish.
- No new ASR provider, per-chunk polishing, background replacement, or partial output insertion.
- No automatic benchmarking or model recommendation service.
- No requirement that every provider support the optional reasoning control.

## Decisions

### Reuse the general provider connection and override only the model

Store the dedicated model under `speech_to_text` as an optional override. At request time, use the speech override when non-empty; otherwise use `ai.provider.model`. Continue using `ai.provider.base_url` and `ai.provider.api_key` for both paths.

This keeps the user-facing setup understandable and avoids duplicating sensitive fields in settings, import/export, validation, and secret handling. A separate provider override was considered, but it would expand the feature into connection management rather than solving the model-latency problem.

### Add a small, provider-tolerant performance contract

Extend the common request model with optional output and reasoning controls rather than creating provider-specific request types. The speech path will provide a bounded output limit, a speech-specific temperature, a shorter timeout, and a deep-thinking boolean. The boolean is stored with speech settings and shown beside the dedicated speech-polish model field. Off maps to the provider-compatible disabled or minimal reasoning preference selected by the implementation. On allows the provider's reasoning mode for the speech-polish request.

If a provider rejects a non-standard optional reasoning field, the request is treated as a polish failure and the existing raw-text fallback applies. A provider-specific retry without the optional field can be added only if tests show it is needed; it is not required for the first implementation.

### Keep defaults conservative and bound values centrally

Use defaults suitable for short Chinese transcript cleanup: low temperature, a bounded output limit, a shorter timeout than the general editor timeout, and deep thinking off. Normalize empty model to fallback and clamp numeric values to finite safe ranges. The exact constants should be shared between Rust defaults/normalization and the settings UI so saved values cannot drift.

### Apply the override to both speech polish call styles

The existing implementation has a buffered request for in-app speech and a streaming request for system dictation. Both request builders must resolve the same speech-specific model and performance settings. Streaming remains a delivery mechanism for system dictation; it does not change the rule that final paste waits for completed polished output.

### Preserve compatibility and secrets behavior

New fields use serde defaults so old settings load unchanged. Export/import includes the non-secret override values through the existing settings bundle. Because no new API key is introduced, the existing AI key redaction and sensitive export handling remain the only credential path.

## Risks / Trade-offs

- A fast model may produce weaker corrections or alter wording → Keep the selected action/prompt unchanged, preserve raw transcript metadata, and allow the user to leave the model override empty.
- Providers differ in support for output-limit and deep-thinking fields → Keep common fields optional, validate locally, and fall back to raw transcript on a rejected polish request.
- A very small output limit can truncate longer dictation → Use a bounded but practical default and expose the setting for adjustment.
- A shorter timeout can cause fallback on slow networks → Make it configurable and keep ASR output intact when it triggers.
- The frontend and backend may disagree on defaults → Add focused normalization/settings tests and UI smoke assertions for the serialized payload.

## Migration Plan

1. Add serde-defaulted speech-polish fields and normalize them when settings are loaded or saved.
2. Add settings controls and serialize the optional model/performance values without introducing a second credential block.
3. Resolve the model and request options in both buffered and streaming AI request paths.
4. Keep existing settings valid; empty or absent override fields use the general AI model and conservative defaults.
5. Roll back by shipping the previous build; older builds ignore the new JSON fields and continue using the general AI settings.
