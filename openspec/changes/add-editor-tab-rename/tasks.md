# Tasks

## 1. Tab rename state

- [ ] 1.1 Add a pure workspace operation that trims and applies a non-blank tab title without changing other tab fields; verify unit tests cover valid, blank, and missing-tab inputs.
- [ ] 1.2 Expose the rename operation through the composer store and existing persistence path; verify a renamed tab survives serialization, restoration, and movement between panes.

## 2. Tab rename interaction

- [ ] 2.1 Add “重命名” to the tab context menu and implement a lightweight naming window with current-title initialization, Enter confirmation, Escape/cancel handling, and blank-name rejection; verify the production frontend build succeeds.
- [ ] 2.2 Automatically request one concise name through the existing AI temporary-prompt API when an eligible naming window opens, normalize the response, ignore stale results, and keep manual naming usable for empty drafts, unavailable AI, and request failures; verify focused UI tests cover loading, success, empty, unavailable, failure, and stale-result states.
- [ ] 2.3 Render the AI result below the input as a one-click suggestion that saves and closes the window, and add focused styles for loading, failure, suggestion, keyboard focus, and narrow layouts while preserving long-name ellipsis in the tab strip; verify the production frontend build succeeds.

## 3. Integration verification

- [ ] 3.1 Run the workspace, composer draft, focused AI naming UI tests, production frontend build, and strict OpenSpec validation, then confirm no unrelated project files were changed.
