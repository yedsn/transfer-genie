## Why

The draft editor already supports configured AI text actions, but users cannot quickly write a one-off prompt near the composer or save a useful prompt back into the prompt library from that same flow. Adding a lightweight prompt dialog next to the existing one-click polish entry gives users a faster way to direct AI processing without visiting settings first.

## What Changes

- Add an AI icon next to the existing one-click polish controls in the draft editor.
- Clicking the icon opens a lightweight prompt dialog centered on a single prompt input box.
- The prompt dialog provides prompt-library and save actions as secondary icons inside the input area, with the run action as a button on the right side of the input.
- Users can select an existing built-in or saved prompt from the prompt library to fill the input box.
- Users can run the current prompt without saving it; unsaved prompts are used only for that run.
- Users can click save to enter a secondary save flow that requires a prompt name and category, then persists the current prompt into the settings prompt-action list.
- AI output continues to use the existing preview and explicit insert/replace confirmation flow.
- No breaking changes.

## Capabilities

### New Capabilities
- `ai-text-actions`: Defines prompt-backed AI processing, including temporary prompt execution and saving prompt actions from the composer.

### Modified Capabilities
- `message-feed`: Adds the composer AI prompt dialog entry and user-facing dialog behavior to the draft editor.

## Impact

- Affected frontend: `src-ui/src/workspace/DraftEditor.vue`, related styles, and any shared settings/action helpers used by the Vue store.
- Affected backend/API: AI text-processing request types and commands in `src/main.rs` and AI settings normalization/validation in `src/types.rs` if temporary prompts need backend support.
- Affected settings: saved prompts are persisted in the existing AI prompt action list and should appear in the settings page, the existing AI action dropdown, and the new prompt library.
- Tests: add focused Rust tests for temporary prompt execution and frontend tests or smoke checks for dialog state, save behavior, and existing preview flow preservation.
