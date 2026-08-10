## 1. Backend AI Request Support

- [x] 1.1 Extend AI text request types to accept a temporary prompt payload without requiring a saved action ID.
- [x] 1.2 Route temporary prompts through the existing provider validation, prompt rendering, streaming, reasoning filtering, and output preview response path.
- [x] 1.3 Ensure temporary prompt execution does not mutate AI settings or saved action lists.
- [x] 1.4 Add Rust tests for successful temporary prompt execution and rejection when AI settings or prompt text are invalid.

## 2. Prompt Save Path

- [x] 2.1 Add or reuse a frontend settings-store action that appends a custom AI prompt action with generated unique ID, name, category, enabled state, and prompt template.
- [x] 2.2 Persist saved prompts through the existing settings save path so they survive restart and import/export flows.
- [x] 2.3 Ensure saved prompts immediately appear in the existing AI action dropdown, settings prompt action list, and new prompt library.
- [x] 2.4 Prevent saving without prompt text, name, or category and show readable validation errors.

## 3. Composer Prompt Dialog UI

- [x] 3.1 Add an icon-only AI prompt button beside the existing one-click polish controls with an accessible label and tooltip.
- [x] 3.2 Build the prompt dialog with a single primary prompt input, prompt-library icon and save icon at the input's lower-left, and a run button on the input's right side.
- [x] 3.3 Implement prompt-library selection so built-in and saved prompts fill the input without triggering AI processing.
- [x] 3.4 Implement the save flow so name and category fields appear only after the user chooses to save.
- [x] 3.5 Wire the run button to execute either current selected text or the active draft text using the prompt input as a temporary prompt.
- [x] 3.6 Reuse the existing AI loading, reasoning, result preview, insert, replace, cancel, and error handling flows.

## 4. Verification

- [x] 4.1 Run `cargo test` or targeted Rust AI tests.
- [x] 4.2 Run frontend type/build checks available for `src-ui`.
- [ ] 4.3 Manually verify the prompt dialog can run an unsaved prompt without persisting it.
- [ ] 4.4 Manually verify saving a prompt requires name/category and makes it available from the prompt library, existing dropdown, and settings page.
- [x] 4.5 Verify edited Chinese UI text remains readable with no mojibake, truncation, or unintended replacement.
