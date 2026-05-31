## ADDED Requirements
### Requirement: Local data backup settings
The client SHALL provide local data backup settings for backup directory, backup frequency, and snapshot retention. The default backup directory SHALL be `TransferGenie/backup` under the user's home directory. The default retention rule SHALL keep all snapshots from the last 3 days and one snapshot per day for the last 7 days.

#### Scenario: Default local backup settings
- **WHEN** the app loads settings that do not contain local backup fields
- **THEN** the client uses a backup directory under the user's home `TransferGenie/backup`
- **AND** the backup frequency and retention windows use their defaults

#### Scenario: Update local backup settings
- **WHEN** the user updates backup directory, backup frequency, or retention windows in settings and saves
- **THEN** later scheduled backups use the updated values

### Requirement: Local data snapshot backup and restore
The client SHALL create a restorable local data snapshot package containing app settings, the local message index, and app-local workspace data required to restore local state. The client SHALL list available snapshot packages from the configured backup directory. The client SHALL restore from a selected snapshot only after explicit confirmation and SHALL create a pre-restore rollback snapshot before overwriting local data.

#### Scenario: Create local data snapshot
- **WHEN** the user starts a manual local data backup
- **THEN** the client writes one snapshot package into the configured backup directory
- **AND** the snapshot appears in the local backup list

#### Scenario: Restore local data snapshot
- **WHEN** the user chooses a local data snapshot and confirms restore
- **THEN** the client creates a rollback snapshot
- **AND** restores settings, local message index, and app-local workspace data from the selected snapshot

#### Scenario: Reject restore without confirmation
- **WHEN** a local data restore is requested without confirmation
- **THEN** the client rejects the restore and leaves current local data unchanged

### Requirement: Snapshot retention cleanup
The client SHALL clean old local backup snapshots using the configured retention rule. It SHALL keep every snapshot inside the keep-all window and at most one snapshot per day inside the daily-retention window after that. Snapshots older than both retention windows MAY be removed.

#### Scenario: Apply default retention
- **WHEN** backup cleanup runs with default retention settings
- **THEN** every snapshot from the last 3 days is retained
- **AND** at least one snapshot per day is retained for days 4 through 7 when snapshots exist

#### Scenario: Apply custom retention
- **WHEN** the user changes the keep-all or daily-retention window
- **THEN** cleanup uses the configured windows for later backup cleanup

## MODIFIED Requirements
### Requirement: WebDAV Data Backup
The client SHALL provide a WebDAV backup function that stores WebDAV data, including `files/`, `history.json`, and manifest history files when present, as a local ZIP archive. The backup process SHALL support large files without loading all remote data into memory, SHALL report progress, and SHALL record created archives in the configured local backup directory or the user-selected path.

#### Scenario: Backup with progress
- **WHEN** the user clicks "Backup WebDAV"
- **THEN** the client asks for a backup path or uses the configured backup directory for scheduled backups
- **WHEN** the user confirms the path
- **THEN** the client starts backup and reports the current file or progress state
- **AND** the backup archive is recorded for listing after completion

### Requirement: WebDAV Data Restore
The client SHALL provide a WebDAV restore function from a local ZIP archive. Restore SHALL require explicit user confirmation before overwriting remote data. Restore SHALL support large files, report progress, and clear remote `files/` and history data before uploading archive contents so the remote state matches the selected backup.

#### Scenario: Restore with progress
- **WHEN** the user clicks "Restore WebDAV" and chooses a valid backup file
- **THEN** the client warns that remote data will be overwritten and asks for confirmation
- **WHEN** the user confirms
- **THEN** the client restores from the archive and reports upload progress
- **AND** the restore archive is recorded in backup history
