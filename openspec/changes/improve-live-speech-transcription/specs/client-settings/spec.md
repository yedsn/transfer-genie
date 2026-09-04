## ADDED Requirements

### Requirement: Speech Settings
设置界面 SHALL provide speech-to-text configuration for enabling the feature, configuring ASR credentials, selecting available audio input devices, enabling the recording shortcut, choosing cue sound behavior, and setting the retained task count. Saved speech settings SHALL persist across app restarts and SHALL be included in configuration import/export with sensitive values protected according to the existing configuration export rules.

#### Scenario: Enable speech transcription settings
- **WHEN** the user enables speech-to-text and saves valid ASR settings
- **THEN** the settings are persisted
- **AND** later speech recording uses the saved provider configuration

#### Scenario: Missing credentials are rejected
- **WHEN** the user enables speech-to-text without required ASR credentials
- **THEN** the app prevents saving the invalid enabled configuration
- **AND** the app shows a user-visible validation message

#### Scenario: Speech settings survive restart
- **WHEN** the user saves valid speech-to-text settings and restarts the app
- **THEN** the settings page shows the saved speech configuration

### Requirement: Speech Task History Settings Display
设置界面 SHALL show retained speech transcription tasks as one item per recording session. Each task item SHALL show status, duration, transcript preview or error text, and actions to replay the complete audio, download the complete audio, copy recognized text when available, retry transcription, and delete the task.

#### Scenario: Ongoing task appears in settings
- **WHEN** speech transcription is still processing chunks for an active or recently stopped recording session
- **THEN** the settings page shows one task for that recording session with an in-progress status

#### Scenario: Successful task actions
- **WHEN** a retained speech task has recognized text and complete audio
- **THEN** the user can replay the complete audio, download the complete audio, copy the recognized text, retry transcription, or delete the task

#### Scenario: Retention count is enforced
- **WHEN** the number of retained speech tasks exceeds the configured retention count
- **THEN** the app removes the oldest retained speech tasks and keeps the newest tasks only

