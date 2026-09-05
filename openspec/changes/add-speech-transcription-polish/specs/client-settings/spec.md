## ADDED Requirements

### Requirement: Speech transcription polish settings
The settings interface SHALL provide controls for enabling automatic polish after speech transcription and for choosing which existing prompt action is used for the polish step. The default selected action SHALL be the base polish action.

#### Scenario: Show speech polish settings
- **WHEN** the user opens the speech-to-text settings section
- **THEN** the settings interface SHALL show an automatic polish toggle
- **AND** SHALL show a prompt action selector for the polish action
- **AND** SHALL default the selector to the base polish action when no saved choice exists

#### Scenario: Save speech polish settings
- **WHEN** the user enables automatic polish and selects a prompt action
- **THEN** the settings interface SHALL persist both the enabled state and selected prompt action
- **AND** future speech transcriptions SHALL use the saved values

#### Scenario: Disable speech polish
- **WHEN** the user disables automatic polish
- **THEN** future speech transcriptions SHALL output raw transcription text without running the polish action
