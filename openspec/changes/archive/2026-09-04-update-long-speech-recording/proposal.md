# Change: Support long speech recordings with segmented transcription

## Why
Users may keep recording for longer than a single ASR request can safely handle. The app should allow long manual recording sessions while keeping provider calls within practical audio length limits.

## What Changes
- Remove the user-facing automatic stop behavior for ordinary long speech recordings.
- Keep each recording session as one complete retained audio task.
- Split already-captured audio into about one-minute chunks for ASR submission while recording continues, then submit the final remainder when recording stops.
- Combine chunk recognition results into one transcript and one settings-history task.
- Preserve existing explicit start/stop controls, visible recording state, cue sounds, and retry behavior.

## Impact
- Affected specs: `speech-to-text`, `client-settings`
- Affected code: speech recording logic in `src-ui`, ASR request flow in `src/main.rs`, speech task history storage/tests
