## 1. Settings and Shortcut Registration

- [x] 1.1 Add persisted settings for the system dictation master toggle and shortcut value, and verify settings import/export and default loading tests cover backward compatibility.
- [x] 1.2 Add settings UI controls for enabling/disabling system dictation and editing its shortcut, remove the ordinary speech-recording shortcut controls, and verify invalid shortcuts and conflicts with the main window shortcut are rejected.
- [x] 1.3 Register and unregister the system dictation global shortcut separately from the main window shortcut, support side-specific Alt keys for system dictation, and verify shortcut registration tests cover enable, disable, update, and conflict cases.

## 2. Background Dictation Recording Flow

- [x] 2.1 Add a dedicated global-shortcut event path for starting/stopping dictation without showing or focusing the main window, and verify the app window focus behavior with a mocked shortcut event.
- [x] 2.2 Add an always-on-top capsule overlay for active dictation with live waveform feedback plus confirm and cancel controls, and verify the overlay appears and updates while recording.
- [x] 2.3 Reuse the speech recording/transcription state machine for system dictation sessions, and verify one shortcut press starts recording while a second press or overlay confirm stops and transcribes.
- [x] 2.4 Ensure overlay cancel discards the active dictation session without paste or local append, and verify cancel returns the system to idle.
- [x] 2.5 Ensure dictation results are appended to Transfer Genie's active editor draft with existing separator and scroll-preservation behavior, and verify editor text updates once per completed dictation.

## 3. Clipboard Paste Delivery

- [x] 3.1 Add a backend command or event handler that writes recognized dictation text to the system clipboard and dispatches the platform paste shortcut, and verify it leaves the clipboard set to the recognized text.
- [x] 3.2 Route successful system dictation results through clipboard paste delivery after transcription completes or overlay confirm, and verify paste delivery is attempted for external-focus dictation sessions.
- [x] 3.3 Handle paste delivery failures without discarding text, and verify failures leave the recognized text in Transfer Genie history/editor and on the clipboard when clipboard write succeeded.

## 4. History, Feedback, and Verification

- [x] 4.1 Store system dictation sessions in the existing speech task history with complete audio and final text, and verify replay, download, copy, retry, and delete actions still work.
- [x] 4.2 Add focused frontend smoke coverage for system dictation shortcut start/stop, overlay confirm/cancel, waveform feedback, editor append, clipboard overwrite, and no clipboard restore behavior.
- [x] 4.3 Add targeted backend tests for shortcut normalization/registration and paste command failure handling, and verify `cargo test speech` plus relevant shortcut tests pass.
- [x] 4.4 Run `node tests/test_speech_to_text_ui_smoke.js`, `cargo test speech`, `cargo test asr`, and `openspec validate add-system-dictation-paste --strict` to verify the completed change.
