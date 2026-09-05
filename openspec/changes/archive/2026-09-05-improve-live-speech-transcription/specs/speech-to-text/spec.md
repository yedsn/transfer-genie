## Purpose

Speech-to-text lets users dictate content into the message composer through an explicit recording session that can continue for long periods while recognized text is appended as short transcription chunks complete.

## ADDED Requirements

### Requirement: Continuous Recording Session
The app SHALL keep an explicit speech recording session active until the user stops it, recording fails, or required microphone permission is unavailable. The app SHALL NOT stop an ordinary recording only because an internal transcription chunk duration has elapsed.

#### Scenario: Recording continues past chunk duration
- **WHEN** the user starts speech recording and keeps speaking beyond the internal chunk duration
- **THEN** the app remains in the active recording state
- **AND** later audio continues to be captured into the same recording session

#### Scenario: User stops recording
- **WHEN** the user stops an active speech recording from the composer control or configured shortcut
- **THEN** the app stops audio capture
- **AND** the app keeps the complete captured audio for the session

### Requirement: Internal Chunked Transcription
The app SHALL divide captured audio into approximately 10-second internal transcription chunks while recording remains active. Completed chunks SHALL be submitted to the configured ASR provider without interrupting ongoing audio capture, and any remaining audio SHALL be submitted after the user stops recording.

#### Scenario: Completed chunk is submitted while recording continues
- **WHEN** an active recording accumulates enough audio for one internal transcription chunk
- **THEN** the app submits that completed chunk for ASR transcription
- **AND** the app continues capturing later audio in the same recording session

#### Scenario: Final remainder is submitted after stop
- **WHEN** the user stops a recording with audio that has not reached a full internal chunk
- **THEN** the app submits the remaining audio as the final transcription chunk

### Requirement: Live Composer Text Append
The app SHALL append each successful chunk transcript to the active composer as soon as that chunk's transcription completes. Appended text SHALL preserve chronological chunk order and SHALL NOT automatically send the message. The app SHALL suppress clearly abnormal repeated-character or repeated-short-phrase transcription output that is likely produced from silence or background noise.

#### Scenario: Chunk text appears during recording
- **WHEN** a completed chunk is transcribed successfully while recording remains active
- **THEN** the recognized text is appended to the active composer
- **AND** the recording remains active

#### Scenario: Multiple chunk results stay ordered
- **WHEN** multiple chunks complete transcription for one recording session
- **THEN** the composer contains their recognized text in recording order

#### Scenario: Transcription does not send message
- **WHEN** recognized text is appended to the composer
- **THEN** the message remains an editable draft
- **AND** the app does not automatically upload or send it

#### Scenario: Abnormal repeated text is suppressed
- **WHEN** ASR returns a chunk transcript dominated by repeated characters or repeated short phrases that indicates likely recognition hallucination
- **THEN** the app does not append that chunk transcript to the composer
- **AND** later valid chunk transcripts for the same recording can still be appended

### Requirement: Low-Energy Chunk Filtering
The app SHALL avoid submitting internal long-recording chunks that are clearly near-zero digital silence. Filtering SHALL be conservative so quiet speech and ordinary background noise can still be transcribed rather than being discarded locally.

#### Scenario: Silent long-recording chunk is skipped
- **WHEN** a long recording accumulates an internal chunk whose audio is near-zero digital silence
- **THEN** the app does not submit that chunk to ASR
- **AND** the app continues recording and processing later chunks

### Requirement: Speech Failure Handling
The app SHALL distinguish recording failures from transcription failures. A transcription failure for one or more chunks SHALL mark the retained task as failed and show a sanitized error, but it SHALL NOT stop audio capture that is still actively recording.

#### Scenario: Chunk transcription fails while recording continues
- **WHEN** ASR authentication, network transport, protocol parsing, or recognition fails for a submitted chunk while recording is still active
- **THEN** the app records a sanitized transcription error for the session
- **AND** the app continues capturing audio until the user stops or recording itself fails

#### Scenario: Recording setup fails
- **WHEN** microphone permission is denied or no usable input device is available
- **THEN** the app does not start the recording session
- **AND** the app shows a user-visible recording error

### Requirement: Session Task Retention
The app SHALL retain one speech transcription task per recording session. The task SHALL include the complete captured audio, combined recognized text, overall status, failure message when applicable, and enough progress metadata to show that transcription is ongoing or complete.

#### Scenario: Successful long recording task
- **WHEN** a long recording is transcribed through multiple internal chunks
- **THEN** the task history shows one task for the complete recording session
- **AND** the task contains the combined transcript from successful chunks in chronological order

#### Scenario: Failed task can be retried
- **WHEN** a retained recording task has failed transcription and contains complete audio
- **THEN** the user can retry transcription from that complete audio
- **AND** retry uses internal chunking again when the audio is longer than one chunk
