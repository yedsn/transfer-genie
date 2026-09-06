## MODIFIED Requirements

### Requirement: Speech Settings
设置界面 SHALL provide speech-to-text configuration for enabling the feature, configuring ASR credentials, selecting available audio input devices, enabling system dictation, choosing cue sound behavior from the built-in cue sound options, and setting the retained task count. Saved speech settings SHALL persist across app restarts and SHALL be included in configuration import/export with sensitive values protected according to the existing configuration export rules.

#### Scenario: Enable speech transcription settings
- **WHEN** the user enables speech-to-text and saves valid ASR settings
- **THEN** the settings are persisted
- **AND** later speech recording uses the saved provider configuration

#### Scenario: Speech settings survive restart
- **WHEN** the user saves valid speech-to-text settings and restarts the app
- **THEN** the settings page shows the saved speech configuration

#### Scenario: Choose built-in cue sound
- **WHEN** the user chooses any built-in recording cue sound option and saves settings
- **THEN** the selected cue sound kind is persisted
- **AND** recording start/stop feedback uses that selected cue sound for both the editor button and system dictation shortcut
