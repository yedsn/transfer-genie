## Why

Current speech transcription feels uneven for long recordings: users need recording to keep running while text appears in the composer as each recognized segment completes. The app should make this continuous-recording behavior explicit and reliable instead of treating transcription as a final step after recording stops.

## What Changes

- Introduce a speech-to-text capability that supports one explicit recording session continuing until the user stops it.
- Segment captured audio internally into approximately 20-second ASR chunks while recording remains active.
- Submit completed chunks for transcription in the background and append each successful chunk result to the active composer as soon as it is available.
- Submit the final remaining audio after the user stops recording, then finalize the retained task with the complete audio and combined transcript.
- Keep user-visible task history at one task per recording session, with progress, combined text, retained complete audio, and retry support.
- Treat chunk failures as task-level failures without interrupting ongoing audio capture unless recording itself fails.

## Capabilities

### New Capabilities
- `speech-to-text`: Speech recording, internal ASR chunking, live composer insertion, failure handling, and task history behavior.

### Modified Capabilities
- `client-settings`: Settings page behavior for speech configuration and speech transcription task history.

## Impact

- Affected frontend: speech recording state machine, audio sampling/chunk queues, composer insertion, task history UI, retry behavior.
- Affected backend: `transcribe_speech` ASR request handling and error sanitization boundaries.
- Affected storage: browser IndexedDB speech task records remain client-side, with one retained record per full recording session.
- No new external provider is planned; the existing Volcengine Agent Plan ASR endpoint remains the target.
