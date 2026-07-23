## ADDED Requirements
### Requirement: Workspace pane layout
The application SHALL provide a multi-pane workspace that can display content in single-pane, horizontal two-pane, vertical two-pane, and three-column layouts.

#### Scenario: Create horizontal split
- **WHEN** the user clicks the horizontal split control from a single-pane workspace
- **THEN** the application SHALL create a two-column workspace layout with the current content in one pane and an additional pane available for content

#### Scenario: Expand to three columns
- **WHEN** the user clicks the horizontal split control while a two-column workspace is active
- **THEN** the application SHALL expand the workspace to a three-column layout without closing existing pane tabs

#### Scenario: Create vertical split
- **WHEN** the user clicks the vertical split control from a single-pane workspace
- **THEN** the application SHALL create an upper and lower pane layout with the current content in one pane and an additional pane available for content

### Requirement: Per-pane tab groups
Each workspace pane SHALL maintain its own tab group, active tab, and tab order. Closing a tab SHALL remove it from the visible tab group without deleting the underlying document or message source.

#### Scenario: Open multiple tabs in one pane
- **WHEN** the user opens multiple documents in the same pane
- **THEN** the pane SHALL show them as tabs
- **AND** switching tabs SHALL only change the active content of that pane

#### Scenario: Move tab between panes
- **WHEN** the user moves a tab from one pane to another pane
- **THEN** the source pane SHALL remove that tab from its tab group
- **AND** the target pane SHALL add that tab and make it available in the target tab group

### Requirement: Tab drag docking
The application SHALL allow document tabs to be dragged into pane drop zones. Dropping a tab on the right half of a pane SHALL dock it in a horizontal split. Dropping a tab on the lower half of a pane SHALL dock it in a vertical split. Dropping a tab in the center of a pane SHALL add it to that pane's tab group.

#### Scenario: Dock tab to the right
- **WHEN** the user drags a document tab to the right half of a pane
- **THEN** the application SHALL place the tab in a right-side pane
- **AND** preserve the existing pane content

#### Scenario: Dock tab below
- **WHEN** the user drags a document tab to the lower half of a pane
- **THEN** the application SHALL place the tab in a lower pane
- **AND** preserve the existing pane content

#### Scenario: Add tab to same pane
- **WHEN** the user drags a document tab to the center of a pane
- **THEN** the application SHALL add the tab to that pane's tab group

### Requirement: Detached workspace windows
The application SHALL allow document tabs and message tabs to be dragged outside the main window and opened in a detached window while preserving their relationship to the current workspace.

#### Scenario: Drag tab outside main window
- **WHEN** the user drags a document tab outside the main application window
- **THEN** the application SHALL open that tab in a detached window
- **AND** the detached window SHALL display the tab content independently from the main window

#### Scenario: Close detached window
- **WHEN** the user closes a detached workspace window
- **THEN** the application SHALL preserve or restore its open content according to workspace state rules
- **AND** SHALL NOT delete the underlying document or message source

### Requirement: Workspace state restoration
The application SHALL persist and restore workspace state for open tabs, pane layout, pane tab order, active focus, and detached windows where practical.

#### Scenario: Restore workspace after restart
- **WHEN** the application starts after a previous session with workspace panes and tabs
- **THEN** the application SHALL restore the last saved pane layout and open tabs that still reference available content

#### Scenario: Missing restored content
- **WHEN** a restored tab references content that is no longer available
- **THEN** the application SHALL show a recoverable missing-content state instead of failing to load the workspace