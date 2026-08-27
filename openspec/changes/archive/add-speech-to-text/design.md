## Context

Transfer Genie is a Tauri 2 desktop app with a Rust backend and a static Vue-based frontend under `src-ui`. Settings are persisted in `settings.json`, normalized in Rust, exposed through Tauri commands, and included in encrypted import/export flows. The app already uses `tauri-plugin-global-shortcut` for the window show/hide shortcut.

The speech-to-text feature needs microphone access, a visible recording lifecycle, configurable credentials, and an ASR request to Volcengine Agent Plan. The validated ASR endpoint for the press-to-record workflow is `wss://openspeech.bytedance.com/api/v3/plan/sauc/bigmodel_nostream` with Resource ID `volc.seedasr.sauc.duration`.

## Goals / Non-Goals

**Goals:**
- Provide an explicit start/stop recording flow from both a composer button and a configurable global shortcut.
- Keep recording state visible and prevent accidental background recording.
- Store Volcengine Agent Plan ASR settings with safe defaults and secret handling.
- Transcribe the completed recording and place the result into the message composer without automatically sending it.
- Reuse existing settings, shortcut, event, and HTTP client patterns where practical.

**Non-Goals:**
- Continuous always-on wake word detection.
- Speaker diarization, translation, TTS playback, or audio file history storage.
- Multi-provider ASR abstraction beyond the first Volcengine Agent Plan provider.
- Automatically sending recognized text as a message.

## Decisions

- Decision: Capture microphone audio in the frontend with browser `MediaRecorder`, then pass the recorded audio bytes to a Rust Tauri command for ASR.
  Alternative considered: capture audio in Rust. That would require platform-specific microphone dependencies and permission handling. Frontend capture is simpler in Tauri WebView and keeps permission prompts close to the visible UI.

- Decision: Default to `bigmodel_nostream` for the first implementation.
  Alternative considered: `bigmodel_async` for live partial text. The requested workflow is start/stop then return text, and `bigmodel_nostream` is the higher-accuracy match. The settings model can retain an endpoint mode field so a future live mode can be added without changing stored structure.

- Decision: Add a separate speech shortcut registration alongside the existing window shortcut.
  Alternative considered: reuse the existing global hotkey. That would conflate window visibility and recording control. Separate shortcuts avoid surprising behavior and allow users to disable either action independently.

- Decision: Backend owns ASR protocol and API key use.
  Alternative considered: call Volcengine directly from the frontend. Keeping ASR calls in Rust avoids exposing the API key to browser code paths beyond settings entry, centralizes request logging/redaction, and aligns with existing provider request handling.

- Decision: Insert recognized text into the composer draft and leave sending to the user.
  Alternative considered: automatically send after transcription. That would make a speech recognition mistake harder to catch and would not match the app's explicit send model.

## Risks / Trade-offs

- Microphone permission may be denied or unavailable -> show a clear error and do not enter recording state unless capture starts successfully.
- Global shortcut conflicts may occur -> validate shortcut syntax, register separately, and keep prior registrations when the new speech shortcut fails.
- ASR API key or endpoint may be misconfigured -> keep speech-to-text disabled until required fields are configured, return sanitized errors, and log `X-Tt-Logid` when available.
- Audio container support can vary by WebView -> prefer a supported `MediaRecorder` MIME type, normalize accepted upload formats in Rust, and document manual testing on Windows.
- Large recordings can increase memory and latency -> impose a practical maximum duration/size for a single segment and guide users toward short dictation.

## Migration Plan

- Add `speech_to_text` settings with serde defaults so existing `settings.json` loads without manual migration.
- Include speech settings in import/export; encrypt the ASR API key with existing secret export machinery.
- Register the speech shortcut during app startup and after settings save/restore/import, without changing the existing window shortcut default.
- Rollback is safe by disabling the feature or removing the new settings fields; legacy configs will ignore unknown fields only after code rollback if the JSON parser allows it, so prefer disabling over downgrading binaries.

## Open Questions

- Whether the final UI should append transcribed text at the cursor, replace selected text, or append to the end of the composer. Default implementation should append at the cursor when possible and otherwise append to the end.
- Whether to expose `bigmodel_async` in settings immediately or keep it internal for a later live-partial-text change.
