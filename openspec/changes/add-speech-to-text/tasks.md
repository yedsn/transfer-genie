## 1. Settings And Secrets

- [x] 1.1 Add `SpeechToTextSettings` to `src/types.rs` with serde defaults for disabled state, Volcengine provider, Agent Plan ASR endpoint, Resource ID, shortcut fields, and recording limits.
- [x] 1.2 Normalize speech settings in `src/main.rs`, including required-field validation when enabled and shortcut format validation when the speech shortcut is enabled.
- [x] 1.3 Include speech settings in configuration export/import and encrypt the speech API key with the existing secret bundle flow.
- [x] 1.4 Add Rust tests for legacy settings defaults, validation failures, and import/export secret preservation.

## 2. Shortcut And App Events

- [x] 2.1 Track the existing window shortcut and the new speech shortcut independently in `AppState`.
- [x] 2.2 Register, unregister, and refresh both shortcuts on startup, settings save, settings import, and settings restore without one failure unregistering the other.
- [x] 2.3 Emit a main-window event when the speech shortcut is pressed so the frontend can toggle recording.
- [x] 2.4 Add user-facing error handling for speech shortcut registration failures.

## 3. ASR Backend

- [x] 3.1 Add a Tauri command that accepts recorded audio bytes plus format metadata and validates that speech-to-text is enabled and configured.
- [x] 3.2 Implement Volcengine Agent Plan ASR WebSocket protocol for `bigmodel_nostream`, including gzip JSON full request, chunked audio packets, negative final sequence, and response parsing.
- [x] 3.3 Extract final text from `result.text`, retain sanitized `X-Tt-Logid` for diagnostics, and redact API keys from all returned errors.
- [x] 3.4 Add focused unit tests for protocol frame construction and response parsing using synthetic payloads.

## 4. Composer Recording UI

- [x] 4.1 Add a speech button to the composer toolbar with idle, recording, transcribing, success, and failure states.
- [x] 4.2 Implement frontend microphone capture with `MediaRecorder`, including permission-denied handling and max-duration auto-stop.
- [x] 4.3 Send completed audio to the backend transcription command and insert recognized text into the current composer draft without auto-sending.
- [x] 4.4 Listen for the speech shortcut event from Tauri and route it through the same start/stop recording flow as the composer button.

## 5. Settings UI

- [x] 5.1 Add a settings section for speech-to-text enablement, API key, Resource ID, ASR endpoint/mode, speech shortcut enablement, shortcut value, and max recording duration.
- [x] 5.2 Wire settings form load/save/import/export state so speech settings persist and API key fields follow the existing secret-field UX.
- [x] 5.3 Show validation messages for missing API key, invalid endpoint, invalid Resource ID, or invalid shortcut.

## 6. Verification

- [x] 6.1 Run `cargo test` and fix regressions.
- [x] 6.2 Run relevant frontend/runtime tests for settings form behavior if available.
- [ ] 6.3 Manually verify: configure API key, click speech button to record and stop, confirm recognized text appears in the composer.
- [ ] 6.4 Manually verify: configure speech shortcut, press once to record and again to stop, confirm failure states for denied microphone permission and invalid ASR credentials.

## 7. Transcription Task History

- [x] 7.1 Add configurable speech transcription task retention with a default of 14 recent tasks.
- [x] 7.2 Store completed recording audio and transcription status locally for replay, copy, retry, and re-transcription actions.
- [x] 7.3 Add the speech settings task list UI with success, failure, transcribing, empty, and retention summary states.
- [x] 7.4 Cover task creation, copy, failed-task retry, and retention pruning in the speech UI smoke test.

## 8. Recording Cue Sounds

- [x] 8.1 Add persisted speech cue sound settings with defaults for enabled system cue sounds.
- [x] 8.2 Add settings UI controls to enable/disable cue sounds and choose an internal cue sound.
- [x] 8.3 Play the configured cue immediately when the user toggles recording on or off, including automatic stop, without double-playing during later recording state transitions.
- [x] 8.4 Cover cue defaults, disabling, and save payload behavior in the speech UI smoke test.
- [x] 8.5 Add settings cue preview playback using the current unsaved form selection and cover it in the speech UI smoke test.
