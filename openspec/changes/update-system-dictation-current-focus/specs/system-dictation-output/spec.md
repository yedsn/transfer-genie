## Purpose

This capability delivers a completed system dictation to the input that is active when final text is ready, while preserving a reliable clipboard fallback and polish-before-paste behavior.

## ADDED Requirements

### Requirement: Output-time current-focus delivery
The app SHALL determine the system dictation paste target when the final output text is ready, after transcription and any enabled automatic polish have completed. The app SHALL paste the final text into the input in the foreground at that time. The app SHALL NOT retain, restore, or require the input target that was focused when recording started or stopped.

#### Scenario: User changes input while dictation is processing
- **WHEN** a user starts dictation in one input, then moves focus to another application's input before final text is ready
- **THEN** the app pastes the final text into the latter input

#### Scenario: User keeps focus in the original input
- **WHEN** a user leaves the original input focused until final text is ready
- **THEN** the app pastes the final text into that input

#### Scenario: Overlay does not change the output target
- **WHEN** the dictation overlay is visible while the user changes focus to a text input
- **THEN** showing status or result feedback does not intentionally focus Transfer Genie or the overlay before paste delivery

### Requirement: Polished final text delivery
When automatic polish is enabled, the app SHALL wait for the polish result before copying or pasting the dictation output. The app SHALL paste the polished result exactly once and SHALL NOT first paste the raw transcript.

#### Scenario: Polish completes successfully
- **WHEN** transcription completes and automatic polish returns text
- **THEN** the app copies and pastes the polished text into the output-time focused input
- **AND** the raw transcript is not pasted separately

#### Scenario: Polish falls back to raw transcript
- **WHEN** automatic polish fails after a successful transcription
- **THEN** the app retains the raw transcript as the final text
- **AND** pastes that raw transcript into the output-time focused input exactly once

### Requirement: Paste fallback and result availability
The app SHALL copy final dictation text to the system clipboard before attempting paste delivery. If there is no foreground target or simulated paste cannot be dispatched, the app SHALL keep the final text on the clipboard and expose it in the dictation result feedback without claiming that it was inserted.

#### Scenario: No output target is available
- **WHEN** final dictation text is ready and no foreground window can receive paste input
- **THEN** the app leaves the final text on the clipboard
- **AND** displays the text in result feedback for manual copy

#### Scenario: Target rejects a simulated paste
- **WHEN** the app dispatches a paste shortcut but the target does not accept it
- **THEN** the app preserves the final text on the clipboard
- **AND** displays the text in result feedback

### Requirement: Responsive automatic polish
The app SHALL use a delivery path that can receive automatic-polish output incrementally while still pasting only the complete final text. The app SHALL keep the user informed that polish is in progress without stealing focus from the intended output application.

#### Scenario: Automatic polish is in progress
- **WHEN** transcription has completed and automatic polish is running
- **THEN** the app displays a non-focus-stealing polishing status
- **AND** does not paste partial output into the foreground input

#### Scenario: Automatic polish streams output
- **WHEN** the configured AI provider supports the existing streaming text-action protocol
- **THEN** the app receives polish output through that protocol
- **AND** waits until the stream completes before final paste delivery
