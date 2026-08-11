## ADDED Requirements

### Requirement: Explicit Speech Recording Control
The app SHALL provide a speech-to-text control in the message composer that toggles between idle and recording states. Recording SHALL start only after an explicit button click or speech shortcut activation, and recording SHALL stop when the same control or shortcut is activated again.

#### Scenario: Start recording from composer
- **WHEN** speech-to-text is enabled and the user clicks the composer speech button while idle
- **THEN** the app requests microphone access and starts recording only after access is granted
- **AND** the composer shows an active recording state

#### Scenario: Stop recording from composer
- **WHEN** the app is recording speech and the user clicks the composer speech button again
- **THEN** recording stops and the app starts transcription for the captured segment
- **AND** the composer no longer indicates active microphone capture

#### Scenario: Microphone permission denied
- **WHEN** the user starts speech recording and microphone access is denied or unavailable
- **THEN** the app remains idle
- **AND** the user sees a clear error message

### Requirement: ASR Transcription Request
The app SHALL submit completed speech recordings to the configured Volcengine Agent Plan ASR endpoint and convert successful responses into text. The default endpoint SHALL be `wss://openspeech.bytedance.com/api/v3/plan/sauc/bigmodel_nostream`, and the default Resource ID SHALL be `volc.seedasr.sauc.duration`.

#### Scenario: Transcribe completed recording
- **WHEN** the user stops a valid speech recording
- **THEN** the app sends the captured audio to ASR with the configured API key and Resource ID
- **AND** the app extracts recognized text from the final ASR response

#### Scenario: ASR returns recognized text
- **WHEN** ASR returns a successful response containing recognized text
- **THEN** the app inserts the recognized text into the message composer draft
- **AND** the app does not automatically send the message

#### Scenario: ASR request fails
- **WHEN** ASR authentication, network transport, protocol parsing, or recognition fails
- **THEN** the app shows a sanitized failure message
- **AND** any API key value is not exposed in logs, UI, or error text

### Requirement: Speech State Feedback
The app SHALL expose user-visible states for idle, recording, transcribing, success, and failure during speech-to-text use.

#### Scenario: Transcribing state
- **WHEN** recording has stopped and the ASR request is in progress
- **THEN** the composer shows that transcription is running
- **AND** the user cannot start a second overlapping recording

#### Scenario: Recognition success
- **WHEN** transcription completes successfully
- **THEN** the composer returns to idle state
- **AND** the recognized text is visible in the draft

#### Scenario: Recognition failure
- **WHEN** transcription fails after recording stops
- **THEN** the composer returns to idle state
- **AND** the user can start a new recording attempt

### Requirement: Recording Limits
The app SHALL enforce a bounded single-recording session so accidental long recordings do not run indefinitely or create excessive ASR requests.

#### Scenario: Recording exceeds maximum duration
- **WHEN** an active speech recording reaches the configured maximum duration
- **THEN** the app stops recording automatically
- **AND** starts transcription for the captured segment or reports that no usable audio was captured
