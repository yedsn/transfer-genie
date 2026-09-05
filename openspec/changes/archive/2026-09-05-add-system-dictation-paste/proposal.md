## Why

Users want a Typeless-like dictation flow that works from any application, not only inside Transfer Genie. The app should let a global shortcut start/stop recording, then paste the recognized text into the currently focused input target while still keeping a copy in Transfer Genie's own editor.

## What Changes

- Add a system-level dictation paste mode driven by a configurable global speech shortcut.
- Let users enable or disable system dictation from settings; when disabled, the global shortcut and capsule overlay do not respond.
- When the shortcut starts recording, the app records audio without showing or focusing the main window.
- Show a small always-on-top capsule overlay while dictation is active, with live voice waveform feedback plus confirm and cancel controls.
- When the shortcut stops recording, the app transcribes the captured audio and writes the final text to the system clipboard.
- Let users finish dictation either by pressing the shortcut again or by clicking the capsule confirm icon.
- Let users cancel dictation by clicking the capsule cancel icon, discarding the current recording without pasting.
- After writing the clipboard, the app simulates the platform paste shortcut so the result is inserted into whichever input target is focused at recording stop time.
- The app does not restore the previous clipboard content after dictation paste.
- The same recognized text is appended to Transfer Genie's active editor draft as a retained local copy.
- If paste fails or the focused target cannot accept paste, the recognized text remains available in Transfer Genie and the clipboard.

## Capabilities

### New Capabilities
- `system-dictation-paste`: System-wide speech dictation flow, clipboard write, paste injection, and local editor copy behavior.

### Modified Capabilities
- `app-shell`: Global shortcut handling expands from window toggling to also support a speech dictation shortcut that works while other applications are focused.
- `client-settings`: Settings expose and persist system dictation paste controls alongside existing speech-to-text configuration.

## Impact

- Affected frontend: speech recording state machine, composer append behavior, capsule overlay UI, waveform feedback, status feedback, and settings UI.
- Affected backend: global shortcut routing, overlay window lifecycle, background recording trigger events, clipboard write, and simulated paste command.
- Affected permissions/platform behavior: paste injection depends on OS-level keyboard simulation support and may require platform-specific handling.
- Affected tests: shortcut registration, no-focus recording start, stop-time paste behavior, clipboard overwrite behavior, and editor append coverage.
