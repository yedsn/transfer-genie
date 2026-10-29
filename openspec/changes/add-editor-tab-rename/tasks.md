# Tasks

## 1. Tab rename state

- [x] 1.1 Add a pure workspace operation that trims and applies a non-blank tab title without changing other tab fields; verify unit tests cover valid, blank, and missing-tab inputs.
- [x] 1.2 Expose the rename operation through the composer store and existing persistence path; verify a renamed tab survives serialization, restoration, and movement between panes.

## 2. Tab rename interaction

- [x] 2.1 Add “重命名” to the tab context menu and implement a lightweight naming window with current-title initialization, Enter confirmation, Escape/cancel handling, and blank-name rejection; verify the production frontend build succeeds.
- [x] 2.2 Keep the AI icon button beside the name input and request one concise name only after the user clicks it; replace the input value on success without auto-saving, preserve it on failure, and verify opening the window makes zero AI calls.
- [x] 2.3 Remove the lower AI status and suggestion area, keep compact loading feedback on the icon button, and verify focused styles and the production frontend build.

## 3. Configurable naming prompt

- [x] 3.1 Add a backward-compatible `tab_name_prompt` AI setting with default and blank-value normalization; verify Rust tests cover legacy, custom, and blank settings.
- [x] 3.2 Add the label naming prompt textarea to AI settings and wire load/save form mappings; verify settings markup and payload regression tests cover the field.
- [x] 3.3 Use the configured template for tab naming requests with frontend blank fallback; verify focused tests cover custom and default prompt construction.

## 4. Integration verification

- [x] 4.1 Run Rust settings tests, workspace and composer tests, settings form tests, focused AI naming tests, production frontend build, and strict OpenSpec validation, then confirm no unrelated project files were changed.
