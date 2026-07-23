## ADDED Requirements
### Requirement: Message drag workspace docking
The message feed SHALL allow supported message cards to be dragged into workspace pane drop zones. Dropping a message on the right half of a pane SHALL open the message in a right-side pane. Dropping a message on the lower half of a pane SHALL open the message in a lower pane. Dropping a message in the center of a pane SHALL open the message as a tab in that pane.

#### Scenario: Dock message to the right
- **WHEN** the user drags a message card to the right half of a workspace pane
- **THEN** the application SHALL open that message in a right-side workspace pane
- **AND** the original message SHALL remain in the message feed

#### Scenario: Dock message below
- **WHEN** the user drags a message card to the lower half of a workspace pane
- **THEN** the application SHALL open that message in a lower workspace pane
- **AND** the original message SHALL remain in the message feed

#### Scenario: Open message in current pane
- **WHEN** the user drags a message card to the center of a workspace pane
- **THEN** the application SHALL open that message as a tab in the target pane
- **AND** the original message SHALL remain in the message feed

#### Scenario: Drag message outside main window
- **WHEN** the user drags a message card outside the main application window
- **THEN** the application SHALL open that message in a detached workspace window
- **AND** the original message SHALL remain in the message feed