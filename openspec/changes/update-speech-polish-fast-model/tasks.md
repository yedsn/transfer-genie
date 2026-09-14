## 1. Settings Model

- [x] 1.1 Add speech-polish model, deep-thinking flag, temperature, and timeout fields with backward-compatible defaults, and verify focused Rust settings/default tests pass
- [x] 1.2 Normalize speech-polish performance values, including empty model fallback, bounded temperature, bounded timeout, and boolean deep-thinking handling, and verify invalid settings are normalized or rejected by Rust tests
- [x] 1.3 Preserve import/export compatibility without adding a second speech-polish API key field, and verify settings export/import tests cover the new non-secret fields

## 2. AI Request Behavior

- [x] 2.1 Extend the OpenAI-compatible request payload with optional max output and reasoning/deep-thinking controls, and verify serialization tests cover enabled and disabled deep-thinking requests
- [x] 2.2 Resolve automatic speech polish requests to use the dedicated speech-polish model when configured and the general AI model when empty, and verify both paths with focused request-construction tests
- [x] 2.3 Apply speech-specific temperature, output limit, timeout, and deep-thinking values to both buffered and streaming speech-polish calls, and verify existing editor AI actions still use the general AI settings
- [x] 2.4 Keep polish failures, provider rejections, empty output, and timeout behavior falling back to the raw transcript, and verify no second final insert or paste is emitted after fallback

## 3. Settings UI

- [x] 3.1 Add speech-polish model and deep-thinking controls beside the existing speech polish action settings, and verify the deep-thinking switch is visually colocated with the model field in the settings UI
- [x] 3.2 Add UI inputs for speech-polish temperature and timeout with clear bounds, use a dynamic generated-output limit, and verify settings save serializes the normalized values
- [x] 3.3 Load legacy settings into the UI with low-latency defaults and deep thinking off, and verify existing settings smoke tests still pass

## 4. Verification

- [x] 4.1 Update speech-to-text UI smoke coverage for dedicated model selection, deep-thinking toggle on/off, low-latency defaults, and raw-transcript fallback on polish failure
- [x] 4.2 Run `npm run build` and verify the frontend bundle compiles
- [x] 4.3 Run `cargo check` and focused Rust tests for settings normalization and AI request payload behavior
- [x] 4.4 Run `openspec validate update-speech-polish-fast-model --strict` and verify the change remains valid after implementation
