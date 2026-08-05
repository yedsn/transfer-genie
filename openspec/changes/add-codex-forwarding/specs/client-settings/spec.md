## ADDED Requirements

### Requirement: Send settings section
The settings interface SHALL group send-related options under a Send Settings section, including send hotkey behavior, default editor format, and send-after-copy behavior.

#### Scenario: Show send settings
- **WHEN** the user opens settings
- **THEN** the settings navigation includes Send Settings
- **AND** send hotkey, default editor format, and send-after-copy controls are available in that section

#### Scenario: Persist send-after-copy setting
- **WHEN** the user enables Send After Copy and saves settings
- **THEN** the setting persists across app restarts
- **AND** successfully sent text or Markdown prompts are copied to the clipboard after sending

#### Scenario: Disable send-after-copy setting
- **WHEN** the user disables Send After Copy and saves settings
- **THEN** future sends do not copy sent prompt text to the clipboard
