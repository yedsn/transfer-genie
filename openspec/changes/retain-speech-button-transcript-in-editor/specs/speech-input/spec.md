## ADDED Requirements

### Requirement: Composer Speech Button Retains Output
When speech input is started with the composer voice button, the app SHALL insert the final transcript into the active composer editor after recognition and optional polish complete, and SHALL retain that text while the existing message send continues in the background.

#### Scenario: Button Recognition Completes
- **WHEN** the user starts and stops speech input with the composer voice button
- **THEN** the final transcript is inserted into the active editor
- **AND** the same final transcript is sent as a speech message

#### Scenario: Button Recognition Uses Polish
- **WHEN** automatic speech polish succeeds after button-triggered recording
- **THEN** only the completed polished transcript is inserted into the active editor
- **AND** the polished transcript is sent as the message transcript

#### Scenario: System Dictation Uses Shortcut
- **WHEN** system dictation is triggered by its shortcut rather than the composer button
- **THEN** final delivery continues to target the output-time focused input
- **AND** Transfer Genie's active editor is not populated solely because system dictation completed
