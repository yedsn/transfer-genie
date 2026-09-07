## 1. Message Model And Storage

- [x] 1.1 Add optional speech attachment metadata to `src/types.rs`, `src/db.rs`, and history serialization, and verify old messages still deserialize with defaults using `cargo test`.
- [x] 1.2 Implement backend speech-message send support that writes one message containing transcript text plus source-audio file bytes, and verify with focused Rust tests around the send result and stored message metadata.

## 2. Speech Completion Flow

- [x] 2.1 Update the speech recording completion path in `src-ui/src/legacy-main.js` to call the speech-message send command after successful transcription instead of inserting the transcript into the composer, and verify via `tests/test_speech_to_text_ui_smoke.js`.
- [x] 2.2 Change successful speech task history records to reference the sent message/audio file instead of storing a standalone audio blob, while failed task retry still retains audio, and verify via speech UI smoke coverage.
- [x] 2.3 Make the configured speech shortcut copy and paste the recognized text into the current system cursor target immediately after transcription, then send the linked speech message in the background, and verify via speech UI smoke coverage.
- [x] 2.4 Make text-button sends and speech-button sends release the editor first, then complete upload, history refresh, copy-after-send, and speech task reference updates in the background.
- [x] 2.5 Paste successful shortcut dictation into app editors as well as external inputs, using the final polished text.
- [x] 2.6 Preserve and restore the input target captured when shortcut dictation starts so showing the overlay cannot redirect the final paste.
- [x] 2.7 When no system input focus is detectable, automatically copy the result and show a capsule result prompt with a copy action.
- [x] 2.8 Keep the system focus unchanged during shortcut dictation, make the capsule/result prompt non-focusable, and skip simulated paste when no input target was captured.
- [x] 2.9 Show the copied-result prompt whenever shortcut paste does not complete, including after a detected target rejects the paste.
- [x] 2.10 Display the copied final text itself in the shortcut result capsule with a repeat-copy action instead of a copy-status message.
- [x] 2.11 Improve the result capsule layout, add a close action, and treat the pointer over an in-app editable field as a paste target when no native caret is exposed.
- [x] 2.12 Preserve direct paste for a captured input target when the embedded webview changes its internal focus handle during dictation.
- [x] 2.13 Recognize keyboard-focused external editors that render their own caret as shortcut paste targets while preserving the captured foreground-window check.
- [x] 2.14 Always attempt one shortcut paste after transcription, then show the copied result capsule for three seconds unless the user hovers over it.
- [x] 2.15 Order recording-overlay teardown before final-result display and discard delayed recording-overlay commands after the result is dismissed.
- [x] 2.16 Make progress-only dictation capsules fit their status text without reserving hidden action-button space.
- [x] 2.17 Preserve the focused in-app editor and its caret across overlay focus loss, restoring them immediately before shortcut paste.
- [x] 2.18 Make the result capsule translucent but readable by default and restore its opaque action surface only while hovered.

## 3. Feed Display And Playback

- [x] 3.1 Update message feed view-model/rendering so speech-derived messages show transcript text plus a source-audio play action, and verify with `tests/test_feed_view_model.js` or equivalent DOM smoke assertions.
- [x] 3.2 Implement playback for the linked source-audio file without requiring an explicit download-to-folder step, and verify the invoked command/local URL path is covered by tests.
- [x] 3.3 Replace the speech source-audio action with an inline playback control that supports preview, pause, progress display, and seeking.
- [x] 3.4 Preserve and display polished versus raw speech transcript text with default polished display and an original-text toggle.
- [x] 3.5 Limit feed text previews and provide full-text detail/download access.
- [x] 3.6 Make the speech message download action download the linked source audio while retaining a separate text download.
- [x] 3.7 Make speech transcript copy actions follow the selected polished/raw display mode.

## 4. Cleanup And Verification

- [x] 4.1 Update message delete and cleanup paths so speech source-audio references are removed with their owning messages, and verify with Rust cleanup/delete tests.
- [x] 4.2 Run `openspec validate add-speech-audio-linked-message --strict`, `cargo test`, and the affected Node smoke tests, then update this checklist to reflect completed work.
