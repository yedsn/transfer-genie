## ADDED Requirements

### Requirement: GitHub-hosted signed desktop update source
The desktop application SHALL retrieve update metadata from a configured static JSON endpoint hosted on GitHub Releases. The update metadata SHALL reference signed updater artifacts for each supported desktop target, and the client MUST reject update packages whose signatures cannot be verified with the configured updater public key.

#### Scenario: Valid signed update is available
- **WHEN** the client retrieves update metadata that advertises a newer version for the current desktop target and the package signature validates against the configured public key
- **THEN** the client treats the release as installable for the current target

#### Scenario: Signature verification fails
- **WHEN** the client retrieves update metadata for the current target but the referenced package cannot be verified with the configured public key
- **THEN** the client rejects the update package
- **AND** the install flow does not proceed

### Requirement: Background update check after main window is shown
The desktop application SHALL support an automatic update check that runs after the main window is shown when the user's automatic update preference is enabled. The application SHALL delay the check briefly so the UI can finish rendering, SHALL perform at most one automatic check per application session, and SHALL avoid starting a second check while another check is still running.

#### Scenario: Automatic check runs once after window show
- **WHEN** the main window is shown and automatic update is enabled for the current user settings
- **THEN** the application schedules a delayed background update check
- **AND** later window show events in the same session do not schedule another automatic check

#### Scenario: Automatic check is disabled
- **WHEN** the main window is shown and automatic update is disabled for the current user settings
- **THEN** the application does not start an automatic update check

### Requirement: Automatic update result visibility
The desktop application SHALL keep automatic update checks non-intrusive. If no update is available, the automatic check SHALL finish silently. If an automatic check fails, the application SHALL log the failure without showing an error dialog. If an update is available, the application SHALL show an in-app confirmation dialog with the current version, target version, and available release notes.

#### Scenario: Automatic check finds no update
- **WHEN** an automatic background update check completes and the current version is already the latest version for the current target
- **THEN** the application does not show an update dialog

#### Scenario: Automatic check finds an update
- **WHEN** an automatic background update check completes and a newer valid version is available for the current target
- **THEN** the application shows an in-app confirmation dialog for installing the update

#### Scenario: Automatic check fails
- **WHEN** an automatic background update check fails because the endpoint is unreachable, malformed, or otherwise invalid
- **THEN** the application records the failure in logs
- **AND** the application does not show an error dialog for the automatic check

### Requirement: User-confirmed install and restart flow
The desktop application SHALL require explicit user confirmation before downloading and installing an available update. During installation, the application SHALL expose progress updates to the frontend. After a successful install, the application SHALL prompt the user to restart immediately or restart later.

#### Scenario: User confirms install
- **WHEN** the user confirms installation from the update dialog
- **THEN** the application downloads and installs the new version
- **AND** the frontend receives install progress events

#### Scenario: Install succeeds
- **WHEN** the update package is downloaded and installed successfully
- **THEN** the application shows a completion dialog
- **AND** the dialog offers “restart now” and “restart later” actions

#### Scenario: Install fails
- **WHEN** the user-confirmed install flow fails during download or installation
- **THEN** the application stops the install flow
- **AND** the user sees an in-app error dialog describing the failure
