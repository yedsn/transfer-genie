## Why

Speech transcription polish currently reuses the general AI provider and model, so users who choose a stronger model for editor work also pay that latency on every automatic dictation polish. Spoken-transcript cleanup is a narrow, low-reasoning task, so it should be able to use a faster model and stricter generation limits without changing the user's normal AI assistant setup.

## What Changes

- Add a speech-polish-specific model setting that reuses the existing AI Provider base URL and API key, avoiding a second credential set.
- Let automatic speech polish use the dedicated fast model when configured, while falling back to the existing general AI model and selected polish action when not configured.
- Add request-level performance controls for automatic speech polish, including low temperature, bounded output length, a shorter timeout, and a deep-thinking toggle shown next to the dedicated model setting.
- Keep the existing speech polish behavior: ASR finishes first, polish runs once on the complete transcript, failures fall back to the raw transcript, and system dictation still pastes only one final result.
- Do not add partial/background replacement, per-chunk polish, or any new ASR provider.

## Capabilities

### New Capabilities
- `speech-transcription-polish`: Speech transcription post-processing settings, AI provider override behavior, performance parameters, and final-output fallback semantics.

### Modified Capabilities
- `client-settings`: Settings persistence, import/export, and validation for speech-polish-specific AI override fields.

## Impact

- Affected frontend: settings UI, settings form state, automatic speech polish request construction, and related smoke coverage in `src-ui/src/legacy-main.js`, `src-ui/index.html`, and `tests/test_speech_to_text_ui_smoke.js`.
- Affected backend: settings model/defaults, normalization, import/export compatibility, AI request payload options, and `process_text_with_ai` command path in `src/types.rs` and `src/main.rs`.
- Affected specs: new `speech-transcription-polish` behavior plus `client-settings` persistence/import/export requirements.
- Dependencies: no new package or provider SDK; reuse the existing OpenAI-compatible chat completions transport.
