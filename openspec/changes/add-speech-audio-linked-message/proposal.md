## Why

Speech-to-text currently treats the captured recording as transcription task data and returns recognized text to an input or paste flow. Users need dictated messages to be sent as complete message records where the recognized text and source audio stay linked in the message feed and share the same cleanup lifecycle.

## What Changes

- Send a completed speech recording directly as a message instead of previewing the recognized text in the composer first.
- Store the source recording through the normal message file path and use the recognized text as that message's displayed content.
- Show speech-derived text messages in the feed with a clear source-audio affordance that can play the linked recording.
- Preserve the raw speech transcript alongside polished text, with the feed defaulting to polished text and offering an original-text toggle.
- Limit text previews in the message list while keeping full text available through the detail dialog and download path.
- Remove standalone retained audio storage for successful speech-send tasks; cleanup must follow message deletion and message cleanup behavior.

## Capabilities

### New Capabilities

- `speech-to-text`: Covers speech recording, transcription, and how completed recordings become outbound messages.

### Modified Capabilities

- `message-feed`: Adds linked speech-audio message display, playback, and cleanup behavior to the existing message feed lifecycle.

## Impact

- Affected code: `src-ui/src/legacy-main.js`, `src-ui/src/system-dictation.ts`, `src-ui/src/services/tauri-api.js`, `src/types.rs`, `src/db.rs`, `src/main.rs`, message feed rendering, message delete/cleanup paths, and focused tests.
- Data model: message metadata needs a backward-compatible way to reference speech audio for a text-like message without creating standalone transcription audio storage.
- Dependencies: no new external dependencies expected.
