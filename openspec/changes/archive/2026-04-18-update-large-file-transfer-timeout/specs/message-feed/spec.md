## ADDED Requirements

### Requirement: Large file upload resilience
The client SHALL support large file uploads to the active WebDAV endpoint without failing solely because the transfer duration exceeds a fixed 30-second request limit. As long as upload bytes continue to flow, the client SHALL keep the upload active, continue reporting progress, and only fail when the underlying connection, authentication, or server request actually fails. File send flows that reuse the same upload pipeline SHALL inherit the same behavior.

#### Scenario: Frontend upload continues beyond 30 seconds
- **GIVEN** the user has selected a valid active WebDAV endpoint
- **WHEN** the user sends a large file and the upload duration exceeds 30 seconds
- **AND** upload bytes are still being transferred
- **THEN** the client continues the upload instead of aborting due to a fixed total request timeout
- **AND** the client continues reporting upload progress until completion or a real transport failure occurs

#### Scenario: Local HTTP file send reuses the resilient upload path
- **GIVEN** the local HTTP file send endpoint is enabled
- **AND** the application has a valid active WebDAV endpoint
- **WHEN** another program submits a large file whose remote upload lasts longer than 30 seconds
- **THEN** the system uses the same long-running upload behavior as the frontend file send flow
- **AND** the request is not failed solely because a fixed 30-second upload limit was reached

#### Scenario: Large file upload reports transport failure without false success
- **GIVEN** the user starts sending a large file
- **WHEN** the network connection drops, authentication fails, or the WebDAV server rejects the request before upload completion
- **THEN** the client reports a failure to the user
- **AND** the system does not record the message as a successful completed send
