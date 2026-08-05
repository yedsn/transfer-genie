## ADDED Requirements

### Requirement: Codex forwarding settings
The settings interface SHALL provide Codex forwarding settings that let users enable or disable forwarding, configure the target endpoint URL, and choose whether forwarding errors are shown after sending. The settings SHALL persist across app restarts and SHALL default to disabled for existing users.

#### Scenario: Show default Codex forwarding settings
- **WHEN** the user opens settings before configuring Codex forwarding
- **THEN** the Codex forwarding switch is off
- **AND** no target endpoint is required while the switch remains off

#### Scenario: Save Codex forwarding settings
- **WHEN** the user enables Codex forwarding, enters a valid endpoint URL, and saves settings
- **THEN** the settings are persisted
- **AND** reopening the app shows Codex forwarding enabled with the saved endpoint URL

#### Scenario: Validate enabled forwarding settings
- **WHEN** the user enables Codex forwarding without a valid endpoint URL
- **THEN** the client prevents saving
- **AND** the existing saved settings remain unchanged

#### Scenario: Disable Codex forwarding
- **WHEN** the user turns off Codex forwarding and saves settings
- **THEN** future text sends do not forward prompts to Codex
- **AND** the previous endpoint value MAY remain available for later re-enablement
