## ADDED Requirements
### Requirement: WebDAV sync conflict handling
The client SHALL detect conflicts when local message metadata and remote WebDAV history/file metadata indicate different versions of the same message. When a conflict is detected, sync SHALL return a conflict status and SHALL NOT automatically overwrite local or remote data. The client SHALL allow the user to resolve the conflict by choosing either "download remote and overwrite local" or "upload local and overwrite remote".

#### Scenario: Detect local and remote conflict
- **GIVEN** a message exists locally and remotely with different metadata
- **WHEN** sync processes that message
- **THEN** sync returns a conflict status describing the endpoint and filename
- **AND** neither local nor remote data is overwritten automatically

#### Scenario: Download remote over local
- **GIVEN** a pending WebDAV conflict
- **WHEN** the user chooses "download remote and overwrite local"
- **THEN** the client updates the local index/cache from remote WebDAV data
- **AND** clears the pending conflict

#### Scenario: Upload local over remote
- **GIVEN** a pending WebDAV conflict
- **WHEN** the user chooses "upload local and overwrite remote"
- **THEN** the client writes the local message metadata and content to WebDAV
- **AND** clears the pending conflict
