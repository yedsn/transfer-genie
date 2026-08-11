## Why

Users need a hands-free way to turn short spoken input into text inside Transfer Genie. A press-to-record workflow with a configurable shortcut reduces typing friction while keeping recording explicit and user-controlled.

## What Changes

- Add a speech-to-text action that can be started and stopped from the main UI.
- Add a configurable global shortcut for toggling speech recording, separate from the existing window show/hide shortcut.
- Add settings for the Volcengine Agent Plan ASR provider, including enablement, API key, resource ID, endpoint mode, and shortcut configuration.
- Record microphone audio while active, send the completed segment to ASR, and insert or stage the recognized text in the message composer.
- Show clear recording, transcribing, success, and failure states so the user knows when audio is being captured or processed.
- No breaking changes to existing message sync, WebDAV storage, or the existing window toggle shortcut.

## Capabilities

### New Capabilities
- `speech-to-text`: Covers microphone recording, start/stop controls, ASR transcription, result handling, and error states.

### Modified Capabilities
- `client-settings`: Adds speech-to-text provider settings and a configurable recording shortcut to persisted settings and import/export flows.
- `app-shell`: Adds a second global shortcut action for toggling speech recording while preserving the existing window show/hide shortcut behavior.

## Impact

- Affected code: Tauri commands/events, settings model and serialization, frontend settings UI, message composer UI, microphone capture flow, and shortcut registration.
- External API: Volcengine Agent Plan speech model over `wss://openspeech.bytedance.com/api/v3/plan/sauc/bigmodel_nostream` by default, with `X-Api-Resource-Id: volc.seedasr.sauc.duration`.
- Security/privacy: API key storage must remain secret; microphone recording must only occur after explicit button or shortcut activation and must visibly stop when toggled off.
- Testing: Requires focused tests for settings defaults/validation and manual runtime checks for microphone permission, shortcut toggling, ASR success, and ASR failure handling.
