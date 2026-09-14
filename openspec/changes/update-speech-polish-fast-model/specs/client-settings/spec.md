## ADDED Requirements

### Requirement: Speech polish performance settings

The client settings SHALL persist the optional speech-polish model and performance parameters under the speech-to-text settings. The settings SHALL include a dedicated model identifier, a deep-thinking enabled flag, temperature, maximum output length, and timeout. The settings UI SHALL place the deep-thinking switch beside the dedicated speech-polish model setting. These fields SHALL be optional and backward compatible with settings created before speech-polish performance settings existed. Speech-polish API keys SHALL not be stored as a second credential set; the feature SHALL reuse the existing AI provider credential.

#### Scenario: Save speech polish performance settings
- **WHEN** the user configures a dedicated speech-polish model, chooses a deep-thinking switch value, enters valid performance parameters, and saves settings
- **THEN** the values are persisted under the speech-to-text settings
- **AND** the next automatic speech polish uses the saved values

#### Scenario: Toggle deep thinking beside model setting
- **WHEN** the user changes the deep-thinking switch beside the dedicated speech-polish model setting and saves settings
- **THEN** the selected on/off value is persisted
- **AND** subsequent automatic speech polish requests follow that value

#### Scenario: Load legacy settings
- **WHEN** the client loads settings without speech-polish performance fields
- **THEN** the client supplies backward-compatible defaults
- **AND** the existing general AI provider settings remain unchanged

#### Scenario: Validate invalid performance settings
- **WHEN** the user enters an invalid temperature, output limit, timeout, or unsupported reasoning mode
- **THEN** the client rejects or normalizes the value before saving
- **AND** it does not send an invalid value to the AI Provider

#### Scenario: Keep credentials out of the speech override
- **WHEN** the user exports settings containing speech-polish configuration
- **THEN** the export contains the dedicated model and performance values
- **AND** it does not create or expose a second speech-polish API key field
