## 1. Current-Focus Paste Delivery

- [x] 1.1 Remove start-time system-dictation focus capture, stored-target restoration, and stale-window gating from the active delivery path; resolve the foreground target only when final text is ready, and verify focused Rust tests cover current-foreground paste dispatch.
- [x] 1.2 Update the paste result contract and frontend result handling so no foreground target and failed dispatch retain copied text and show the fallback capsule without reporting a successful insertion; verify targeted unit/smoke assertions.
- [x] 1.3 Keep the dictation overlay non-focusable throughout recording, polish status, and result display, and verify a focused external input remains the delivery target after overlay updates.

## 2. Automatic Polish Delivery

- [x] 2.1 Add a system-dictation stream consumer that invokes the existing AI streaming command, collects only output deltas, and returns the complete polished result after the done event; verify streamed output is assembled in order with a focused frontend test.
- [x] 2.2 Route enabled automatic speech polish through the stream consumer, preserve raw-transcript fallback for stream/provider errors, and verify no final paste occurs before polish success or fallback is decided.
- [x] 2.3 Shorten the built-in default polish prompt for direct spoken-text cleanup without overwriting persisted user-defined actions, and verify default-action tests/settings serialization continue to pass.

## 3. Regression Coverage And Validation

- [x] 3.1 Extend `tests/test_speech_to_text_ui_smoke.js` for focus changes during transcription/polish, one final polished paste into the output-time target, and clipboard/result fallback when no target is available.
- [x] 3.2 Add or update Rust tests around Windows paste target lookup/dispatch so they do not assert application-level insertion from keyboard injection alone; verify relevant focused tests pass on supported platforms.
- [x] 3.3 Run `node tests/test_speech_to_text_ui_smoke.js`, `cargo test`, and `openspec validate update-system-dictation-current-focus --strict`; manually verify a browser text input, browser rich-text input, and native editor on Windows receive final dictation in the input focused at output time. (Verified actual insertion in a browser text input, browser `contenteditable` editor, and Windows Notepad.)
