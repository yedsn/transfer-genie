## MODIFIED Requirements

### Requirement: WebDAV data management

客户端 SHALL 提供 WebDAV 数据的手动备份与恢复功能。

#### Scenario: Backup WebDAV data

-   **GIVEN** a user is on the settings page
-   **WHEN** the user clicks the "Backup WebDAV" button
-   **THEN** the application SHALL generate a zip archive containing the `files/` directory and `history.json` from the active WebDAV endpoint.
-   **AND** the application SHALL prompt the user to save the archive to their local disk.

#### Scenario: Restore WebDAV data

-   **GIVEN** a user is on the settings page
-   **WHEN** the user clicks the "Restore WebDAV" button
-   **AND** selects a valid zip archive backup
-   **AND** confirms the action in a warning dialog that data will be overwritten
-   **THEN** the application SHALL delete all content from the `files/` directory on the active WebDAV endpoint.
-   **AND** the application SHALL upload the contents of the `files/` directory from the archive to the WebDAV endpoint.
-   **AND** the application SHALL overwrite the `history.json` on the WebDAV endpoint with the one from the archive.

#### Scenario: Attempt to restore from an invalid file

-   **GIVEN** a user is on the settings page
-   **WHEN** the user clicks the "Restore WebDAV" button
-   **AND** selects a file that is not a valid zip archive or is missing `history.json`
-   **THEN** the application SHALL show an error message.
-   **AND** no changes SHALL be made to the WebDAV endpoint.
