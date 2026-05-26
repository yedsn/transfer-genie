## ADDED Requirements
### Requirement: Stable home feed incremental loading
The client SHALL load the home message feed through a stable incremental loading strategy that preserves message order and visible state during refresh, deletion, search, and endpoint switching.

#### Scenario: Load older messages repeatedly
- **WHEN** the user repeatedly scrolls upward to load older messages
- **THEN** the client loads the next older window without skipping or duplicating messages
- **AND** the visible scroll position remains anchored near the previously visible message

#### Scenario: Refresh while older windows are loaded
- **WHEN** the client checks for new messages while older messages are already loaded
- **THEN** newer messages are merged without losing already loaded older windows
- **AND** the client does not reset the visible list unless the active endpoint changes

#### Scenario: Delete during incremental loading
- **WHEN** messages are deleted locally or locally plus remotely while the feed has multiple loaded windows
- **THEN** the remaining messages continue to render in chronological order
- **AND** subsequent older-message loading still works

#### Scenario: Search within loaded feed
- **WHEN** the user searches within the home feed
- **THEN** the client applies the search over the loaded message state without corrupting the incremental loading boundary
- **AND** clearing the search restores the current loaded feed window state
