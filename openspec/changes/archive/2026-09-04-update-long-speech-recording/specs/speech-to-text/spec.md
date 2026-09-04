## MODIFIED Requirements

### Requirement: ASR Transcription Request
The app SHALL submit speech audio to the configured Volcengine Agent Plan ASR endpoint and convert successful responses into text. The default endpoint SHALL be `wss://openspeech.bytedance.com/api/v3/plan/sauc/bigmodel_nostream`, and the default Resource ID SHALL be `volc.seedasr.sauc.duration`. For long recordings, the app SHALL submit already-captured audio in approximately one-minute chunks while recording continues, SHALL submit the final remaining chunk after the user stops recording, and SHALL combine chunk results in chronological order into one transcript.

#### Scenario: Transcribe completed recording
- **WHEN** the user records a valid short speech segment and stops before one ASR chunk is complete
- **THEN** the app sends the captured audio to ASR with the configured API key and Resource ID after the user stops
- **AND** the app extracts recognized text from the final ASR response

#### Scenario: Transcribe completed chunks while recording continues
- **WHEN** an active speech recording exceeds the internal ASR chunk duration
- **THEN** the app submits the completed chunk to ASR while recording remains active
- **AND** the app continues capturing later audio into the same recording session

#### Scenario: Transcribe final remainder after stop
- **WHEN** the user stops a long speech recording with unsubmitted remaining audio
- **THEN** the app submits the remaining audio as the final ASR chunk
- **AND** the app combines successful chunk results into one recognized text value

#### Scenario: ASR returns recognized text
- **WHEN** ASR returns successful responses containing recognized text for all submitted chunks
- **THEN** the app inserts the combined recognized text into the message composer draft
- **AND** the app does not automatically send the message

#### Scenario: ASR request fails
- **WHEN** ASR authentication, network transport, protocol parsing, or recognition fails for the recording or any required chunk
- **THEN** the app shows a sanitized failure message
- **AND** any API key value is not exposed in logs, UI, or error text

### Requirement: Recording Limits
The app SHALL allow an explicit speech recording session to continue until the user stops it with the composer control or speech shortcut. The app SHALL NOT automatically stop ordinary recordings only because they exceed the ASR chunk duration; chunking SHALL be an internal transcription submission detail that does not create additional visible recording sessions or task items.

#### Scenario: Recording continues beyond ASR chunk duration
- **WHEN** an active speech recording continues beyond the internal ASR chunk duration
- **THEN** the app remains in the active recording state
- **AND** the app may submit completed audio chunks to ASR without stopping the recording

#### Scenario: User stops long recording
- **WHEN** the user stops a long active speech recording
- **THEN** recording stops
- **AND** transcription starts for the complete captured recording using internal ASR chunks as needed

### Requirement: Transcription Task History
The app SHALL keep a configurable number of recent speech transcription tasks with their complete captured audio, recognition status, combined result text, and failure message when available. The default retention count SHALL be 14 tasks. A single recording session SHALL appear as one task in the settings speech section even when the app submits multiple ASR chunks internally.

#### Scenario: Successful task is retained
- **WHEN** a speech recording is transcribed successfully
- **THEN** one task for the recording appears in the settings speech section
- **AND** the user can replay or download the complete captured audio and copy the combined recognized text

#### Scenario: Long recording task is retained as one item
- **WHEN** a long speech recording is transcribed through multiple ASR chunks
- **THEN** the settings speech section shows one task for the complete recording
- **AND** the task does not expose chunk-level history items

#### Scenario: Failed task can be retried
- **WHEN** a speech transcription fails after audio was captured
- **THEN** one failed task appears in the settings speech section with the error message
- **AND** the user can retry transcription using the retained complete audio
- **AND** retry uses internal ASR chunks again when needed

#### Scenario: Retention count is enforced
- **WHEN** the number of retained transcription tasks exceeds the configured retention count
- **THEN** the app removes the oldest tasks and keeps the most recent tasks only
