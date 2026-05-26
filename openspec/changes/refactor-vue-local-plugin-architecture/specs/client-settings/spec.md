## ADDED Requirements
### Requirement: Local workspace data management
The client SHALL manage business data, configuration, local history, snapshots, mirrors, backups, and integration runtime state under a consistent local workspace managed by the application.

#### Scenario: Initialize workspace
- **WHEN** the application starts
- **THEN** it ensures the required local workspace directories exist for settings, database, endpoint data, plugin runtime data, and backups

#### Scenario: Read legacy data during migration
- **WHEN** legacy settings files, database files, cache folders, or bridge runtime files exist
- **THEN** the application reads them through compatibility handling
- **AND** user-visible behavior remains unchanged during migration

### Requirement: Snapshot and backup policy configuration
The client SHALL support local snapshot retention and scheduled automatic backup behavior for endpoint history and mirrored data without requiring users to change existing sync workflows.

#### Scenario: Scheduled backup executes
- **WHEN** automatic backup is enabled and the next scheduled time arrives
- **THEN** the application creates a local backup artifact from the current snapshot set
- **AND** records backup metadata for later inspection and restore

#### Scenario: Snapshot retention cleanup
- **WHEN** new snapshots or backups exceed the retention policy
- **THEN** the application removes expired local artifacts
- **AND** keeps the latest restorable snapshot chain intact

### Requirement: Integration module controls
The client SHALL expose built-in integration modules as independently managed runtime modules with enablement and status controls.

#### Scenario: Disable built-in module
- **WHEN** the user disables an integration module such as WebDAV sync or Telegram Bridge
- **THEN** the application stops scheduling or running that module
- **AND** preserves its local runtime state for later re-enable

#### Scenario: Inspect module status
- **WHEN** the user opens settings
- **THEN** the application shows the current enablement and runtime status of each built-in integration module
