## Purpose

语音转录除了把声音变成文字，还要能把结果直接整理成更适合发送或继续编辑的文本。这个能力让用户在完成听写后可以选择自动润色，并在系统听写界面得到明确的处理状态反馈。

## ADDED Requirements

### Requirement: Speech transcription polish pipeline
When speech transcription polish is enabled, the system SHALL send the transcript through a selected text-action prompt before presenting the final result. The polish step SHALL use the configured prompt action from the existing prompt action library, and the default selection SHALL be the base polish action.

#### Scenario: Auto polish after transcription
- **WHEN** the user completes a speech transcription with polish enabled
- **THEN** the system SHALL first produce the raw transcript
- **AND** SHALL then run the selected polish action on that transcript
- **AND** SHALL present the polished text as the final result

#### Scenario: Use the default polish action
- **WHEN** the user enables polish without changing the selected action
- **THEN** the system SHALL use the base polish action as the default prompt

### Requirement: Speech transcription polish failure handling
If the polish step fails, the system SHALL preserve the original transcript as the final transcription result and SHALL surface the polish failure state without losing the raw text.

#### Scenario: Polish action fails
- **WHEN** the selected polish action cannot complete successfully
- **THEN** the system SHALL keep the raw transcript available as the output
- **AND** SHALL indicate that polish failed
- **AND** SHALL not discard the transcription result

### Requirement: System dictation polish status
The system dictation capsule SHALL display a visible status message while a completed transcript is being polished. The status SHALL indicate that polishing is in progress and SHALL remain visible until the polished or fallback text is ready.

#### Scenario: Show polishing status
- **WHEN** a system dictation recording has finished transcription and polish is enabled
- **THEN** the capsule SHALL show a "正在进行润色" status
- **AND** SHALL keep that status until the final text is ready or polish fails

### Requirement: System dictation final output after polish
When polish is enabled for system dictation, the final inserted or pasted text SHALL use the polished result rather than the raw transcript. The text SHALL still be inserted or pasted only once for the completed dictation session.

#### Scenario: Insert polished dictation result
- **WHEN** a system dictation session completes successfully with polish enabled
- **THEN** the system SHALL insert or paste the polished text as the final result
- **AND** SHALL not emit the raw transcript as the final output
