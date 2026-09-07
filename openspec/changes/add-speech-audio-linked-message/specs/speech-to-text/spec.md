## ADDED Requirements

### Requirement: Direct Speech Message Send
The app SHALL send a completed speech recording as an outbound message after transcription succeeds, including recordings started from the speech button and recordings started from the configured speech shortcut. The final transcript text SHALL be used as the message content, and the captured audio SHALL be attached to the same message as its source recording. The app SHALL clear and release the composer before backend speech-message sending completes. For shortcut recordings, the app SHALL copy the final text to the clipboard and attempt exactly one paste into the foreground window captured when the shortcut started, regardless of mouse position or input-focus detection. The dictation capsule and result prompt SHALL remain non-focusable and SHALL NOT move the system focus or force the originally captured window to the foreground. The app SHALL preserve a focused in-app editor and caret before showing the dictation capsule, and SHALL restore that editor immediately before the paste attempt if showing the capsule changes the WebView's internal focus. The app SHALL only send the paste shortcut when that captured window remains foregrounded when transcription completes. When polish succeeds, the pasted and copied text SHALL be the polished result. Progress-only dictation capsules SHALL fit their status text without reserving space for hidden actions, while final result capsules SHALL retain their wider multiline layout and actions. Final result capsules SHALL use a translucent readable surface by default and an opaque action surface only while hovered. The recording capsule SHALL be closed before the final result capsule is displayed. The app SHALL display the copied final text in the result capsule after every shortcut transcription; the capsule SHALL automatically close after three seconds unless the user hovers over it, in which case it SHALL remain open until manually dismissed. Once the result capsule is dismissed, delayed recording-capsule show or hide requests from that completed dictation SHALL be ignored. The backend send SHOULD run in the background so composer release and paste steps do not wait on network completion. The app SHALL NOT insert the recognized text into the composer as a required preview step before sending.

#### Scenario: Completed speech recording sends message
- **WHEN** the user stops a valid speech recording and transcription succeeds
- **THEN** the app sends one outbound message automatically
- **AND** the message content is the recognized text
- **AND** the message includes a source-audio file reference
- **AND** the composer is cleared before backend message sending completes
- **AND** the composer draft is not used as an intermediate preview

#### Scenario: Shortcut speech recording sends message
- **WHEN** the user starts and stops a valid speech recording through the configured speech shortcut and transcription succeeds
- **THEN** the app sends one outbound message automatically
- **AND** the app clears and releases the composer before backend message sending completes
- **AND** the app copies the final text to the clipboard
- **AND** the app attempts exactly one paste into the foreground window captured at shortcut start regardless of mouse position
- **AND** showing the dictation overlay does not move system focus away from that input
- **AND** showing the overlay cannot prevent paste from reaching a focused in-app editor because its captured editor and caret are restored before the paste
- **AND** the app does not force focus back to the captured window before pasting
- **AND** when polish succeeds, the pasted and copied text is the polished result rather than the raw transcript
- **AND** a progress-only capsule fits its status text without hidden-action whitespace while the final result retains its wider layout
- **AND** the result capsule remains translucent and readable by default and becomes opaque only while hovered
- **AND** the app displays the copied final text in a result capsule that closes after three seconds unless hovered
- **AND** delayed recording-capsule requests do not reopen the capsule after the result is dismissed
- **AND** the backend send happens in the background
- **AND** the composer draft is not used as an intermediate preview

#### Scenario: Transcription fails
- **WHEN** the user stops a speech recording and transcription fails
- **THEN** the app does not send a message
- **AND** the app shows a sanitized failure message
- **AND** any API key value is not exposed in logs, UI, or error text

#### Scenario: Shortcut paste does not complete
- **WHEN** shortcut dictation completes and the paste operation does not complete
- **THEN** the final text is copied to the clipboard automatically
- **AND** the dictation capsule directly shows the copied final text without a separate copy-status message
- **AND** the capsule offers a copy action for the final text
- **AND** the capsule offers a close action for dismissing the result
- **AND** the app has still attempted one paste into the captured foreground window
- **AND** the linked message still sends in the background

### Requirement: Speech Task Audio Lifecycle
The app SHALL avoid standalone local retention of captured audio for successful speech recordings that are sent as messages, including recordings started from the configured speech shortcut. A successful speech-send task SHALL reference the audio file associated with the sent message instead of storing an independent audio copy. Failed tasks MAY retain captured audio for retry according to the configured speech task retention count.

#### Scenario: Successful speech-send task references message file
- **WHEN** speech transcription succeeds and the message is sent
- **THEN** any retained task metadata references the sent message audio file
- **AND** the task does not keep a separate local audio blob or standalone audio file

#### Scenario: Failed task can still retry
- **WHEN** speech transcription fails after audio was captured
- **THEN** the failed task may retain the captured audio for retry
- **AND** speech task retention still limits failed retained tasks to the configured count
