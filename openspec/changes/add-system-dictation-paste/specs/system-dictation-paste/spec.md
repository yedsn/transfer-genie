## Purpose

This capability lets users invoke speech dictation from anywhere on the system, then paste the recognized text into the currently focused input target while also preserving a local copy inside Transfer Genie. It is intended to behave like a system-wide dictation tool rather than a window-local recording button.

## ADDED Requirements

### Requirement: System-wide dictation shortcut
The app SHALL provide a configurable global shortcut that starts and stops speech dictation anywhere on the system. Starting dictation SHALL not require the Transfer Genie window to be visible or focused.

#### Scenario: Start dictation from another application
- **WHEN** the user presses the configured global dictation shortcut while another application is focused
- **THEN** Transfer Genie begins recording speech without stealing focus from the active application

#### Scenario: Stop dictation from another application
- **WHEN** the user presses the configured global dictation shortcut again while dictation is active
- **THEN** Transfer Genie stops recording and begins transcription of the captured audio

### Requirement: Focus-locked paste target
The app SHALL paste the dictation result into the input target that is focused at the moment dictation stops. The app SHALL use the system clipboard and the platform paste shortcut to deliver the text. The app SHALL NOT restore the previous clipboard contents after dictation paste.

#### Scenario: Paste into the stop-time focus target
- **WHEN** dictation stops while a text field in another application is focused
- **THEN** the recognized text is written to the clipboard and pasted into that focused field

#### Scenario: No clipboard restore
- **WHEN** dictation paste completes
- **THEN** the clipboard remains set to the recognized text

### Requirement: Local editor retention
The app SHALL append the recognized dictation text to Transfer Genie's active editor draft as a retained local copy. This local append SHALL happen even when the system paste target is outside Transfer Genie.

#### Scenario: Dictation also appears in the editor
- **WHEN** dictation completes successfully
- **THEN** the same recognized text is appended to Transfer Genie's active draft

#### Scenario: Paste target is unavailable
- **WHEN** the focused system input target cannot accept a paste action
- **THEN** the recognized text still remains appended in Transfer Genie and remains on the clipboard

### Requirement: Dictation failure handling
The app SHALL keep the recognized text available locally when recording, transcription, or paste injection fails. A paste failure SHALL NOT discard the dictation result that was already recognized.

#### Scenario: Paste injection fails
- **WHEN** the app cannot inject the platform paste shortcut after updating the clipboard
- **THEN** the recognized text remains available in Transfer Genie for manual copy or later use

