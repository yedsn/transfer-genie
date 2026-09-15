## Why

System dictation currently binds its paste target to the foreground window present when recording starts. This conflicts with the intended workflow: users may move to a different input while recording, transcription, or polish is running, and the completed polished text must go to the input focused at output time. The current synchronous polish request also adds avoidable perceived delay before any final result can be delivered.

## What Changes

- Replace start-time focus-target capture and restoration with output-time targeting: after transcription and optional polish complete, paste the final text into the window that is foreground at that moment.
- Preserve the existing rule that automatic polish completes before the final text is copied and pasted; the raw transcript is not emitted first when polish is enabled.
- Keep the dictation overlay non-focusable so it does not intentionally redirect the output target, while retaining the clipboard and result-capsule fallback when no usable foreground target exists.
- Reduce automatic-polish latency by using the existing streaming AI transport and a concise speech-specific polish prompt, without changing the configured provider, model, or user's selected action.
- Add automated coverage for changing the focus target during dictation and for final paste occurring only after polished output is ready.

## Capabilities

### New Capabilities
- `system-dictation-output`: System-wide dictation output targeting, final-text delivery, fallback behavior, and polish-before-paste latency expectations.

### Modified Capabilities
- None.

## Impact

- Affected frontend: system dictation state machine, focus/clipboard delivery helpers, overlay status updates, and automatic speech-polish handling in `src-ui/src/legacy-main.js`.
- Affected backend: Windows foreground-window lookup and simulated paste dispatch in `src/main.rs`.
- Affected tests: `tests/test_speech_to_text_ui_smoke.js` plus focused Rust tests for output-time foreground targeting where platform abstraction permits.
- Dependencies: no new external service or package; reuse the existing Tauri event-based AI streaming command.
