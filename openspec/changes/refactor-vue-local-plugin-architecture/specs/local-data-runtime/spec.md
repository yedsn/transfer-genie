## ADDED Requirements
### Requirement: File change journal
The system SHALL record local file and manifest mutations as append-only change events so users can inspect, restore, or roll back local business state.

#### Scenario: Record history mutation
- **WHEN** the application writes message history, tags, snapshots, or mirrored business files
- **THEN** it appends a local change record describing the operation, target, timestamp, and related snapshot identifiers

#### Scenario: Inspect prior state
- **WHEN** the user requests history inspection for a tracked local artifact
- **THEN** the application can resolve the relevant snapshots and change records needed to show prior recoverable states

### Requirement: Local snapshots and restore
The system SHALL maintain restorable local snapshots for tracked endpoint data and support restore to a selected snapshot.

#### Scenario: Create snapshot after tracked change
- **WHEN** tracked endpoint data changes
- **THEN** the application materializes or updates the local snapshot set for that endpoint

#### Scenario: Restore selected snapshot
- **WHEN** the user selects a valid local snapshot to restore
- **THEN** the application restores the tracked local state from that snapshot
- **AND** records the restore as a new change event
