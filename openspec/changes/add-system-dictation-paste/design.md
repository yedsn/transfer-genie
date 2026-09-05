## Context

The app already has speech-to-text recording, ASR transcription, task history, editor append behavior, and Tauri global shortcut registration. Current speech recording is mainly driven by the app window or an in-window shortcut event. System dictation requires the same recording/transcription pipeline to run while another application remains focused, show a Typeless-like capsule overlay during recording, then deliver the final text through clipboard paste injection.

## Goals / Non-Goals

**Goals:**
- Reuse the existing speech recording and transcription pipeline where practical.
- Keep the focused external application active when dictation starts.
- Show a compact always-on-top capsule overlay with live waveform feedback and confirm/cancel controls while dictation is active.
- Paste into the focus target that exists when dictation stops.
- Leave the recognized text on the clipboard after paste.
- Always append recognized text to Transfer Genie's active editor draft and retained speech history.

**Non-Goals:**
- No attempt to restore the previous clipboard value.
- No direct per-application text field integration.
- No hidden always-on recording; recording starts only after an explicit shortcut press.
- No full main-window activation for dictation status.
- No guarantee that every external application will accept paste injection.

## Decisions

- Decision: Add a separate global dictation shortcut instead of reusing the main window shortcut.
  - Rationale: The existing global shortcut controls window visibility. Dictation has different focus behavior and must not show or focus the main window when recording starts.
  - Alternative considered: Reuse the existing global shortcut with mode switching. That would make the shortcut harder to reason about and risks toggling the window during dictation.

- Decision: Route global dictation through the existing frontend recording state machine by emitting a dedicated event.
  - Rationale: The frontend already owns microphone capture, live speech segmentation, final transcription, editor append, and task history. Reusing it keeps behavior consistent with the existing speech button.
  - Alternative considered: Move recording fully to Rust. That would make background operation more independent, but it would duplicate or replace the browser Web Audio path and increase platform-specific microphone work.

- Decision: Keep the main window hidden/unfocused when starting dictation from the global shortcut.
  - Rationale: The user wants to paste into the system focus target, so focus must remain with the other application until the user chooses to stop or move focus.
  - Alternative considered: Show the main Transfer Genie window. That gives stronger feedback but steals focus and conflicts with paste-at-stop behavior.

- Decision: Use a dedicated always-on-top capsule overlay for dictation status and controls.
  - Rationale: A small overlay gives visible feedback without exposing the full app. It can show microphone waveform, confirm, and cancel in a compact surface similar to Typeless.
  - Alternative considered: Use only system tray or toast feedback. That is less intrusive, but it does not provide live waveform or direct confirm/cancel controls.

- Decision: Treat shortcut stop and overlay confirm as the same commit action.
  - Rationale: Both actions mean finish recording, transcribe, paste, and retain locally, so they should share one path and one set of failure handling rules.
  - Alternative considered: Make overlay confirm only stop recording while shortcut stop also pastes. That would create two subtly different endings and make behavior harder to predict.

- Decision: Treat overlay cancel as a discard action.
  - Rationale: Cancel should stop recording and close the capsule without transcription, paste, clipboard overwrite, or local editor append for that session.
  - Alternative considered: Save canceled audio to history. That protects data, but conflicts with the expected meaning of cancel and can clutter task history.

- Decision: Use clipboard overwrite plus platform paste shortcut injection.
  - Rationale: This is the most compatible cross-application delivery mechanism available to a desktop utility. The user explicitly accepted that the clipboard should remain overwritten with recognized text.
  - Alternative considered: Restore the previous clipboard after paste. The user rejected this and it can race with target application paste handling.

- Decision: Paste target is determined at stop time.
  - Rationale: The user explicitly wants the result pasted wherever focus is when recording ends. This allows starting dictation, moving to the desired field, and then stopping.
  - Alternative considered: Lock the focus target at start time. That is less surprising for some dictation tools but conflicts with the requested behavior.

## Risks / Trade-offs

- Some platforms may require accessibility/input-monitoring permissions for paste injection -> Detect injection failures where possible and leave text in the clipboard and Transfer Genie editor.
- A clickable always-on-top overlay can steal focus when clicked -> Capture the intended paste target at commit time immediately before or around the confirm action, and verify platform behavior; if clicking the capsule necessarily changes focus, prefer refocusing the previous active app before paste where feasible.
- The app cannot always know whether paste succeeded -> Treat clipboard write and paste shortcut dispatch as best effort; local editor append remains the reliable copy.
- If the user stops dictation while the wrong application is focused, text may paste there -> Use clear audio/status feedback and keep the clipboard result available for correction.
- Running recording from a hidden/unfocused window may behave differently across WebView platforms -> Verify on the target desktop platforms and fall back to showing a non-disruptive error if microphone capture cannot start.

## Migration Plan

- Existing speech-to-text settings continue to load unchanged.
- Existing main window global shortcut behavior remains unchanged.
- New dictation settings default to disabled unless the existing speech shortcut setting can be safely migrated without conflicting with the window shortcut.
- If shortcut registration fails, keep the previous working configuration and surface the registration error to the user.
