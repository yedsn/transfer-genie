## ADDED Requirements
### Requirement: Local HTTP file send endpoint
The system SHALL provide a local HTTP file send endpoint so other programs can send one file to the currently active WebDAV endpoint. The endpoint SHALL accept `multipart/form-data`, read the uploaded file bytes and original filename, and reuse the existing file send pipeline so remote upload, local cache, history, and index behavior stay aligned with the frontend send flow. The endpoint SHALL also support an optional multipart text field named `markedOptions` whose value is a JSON object describing marked state and tag operations for the new message.

#### Scenario: Send a file through the local HTTP endpoint
- **GIVEN** the local HTTP API is enabled
- **AND** the application has an active WebDAV endpoint
- **WHEN** another program submits a file with `multipart/form-data`
- **THEN** the system sends the file to the current WebDAV endpoint
- **AND** the system saves the matching local index, upload history, and cache records
- **AND** the HTTP response returns success status and the sent message identifier

#### Scenario: Send a file with marked state and tag operations
- **GIVEN** the local HTTP API is enabled
- **AND** the application has an active WebDAV endpoint
- **WHEN** another program uploads a file and also provides a `markedOptions` multipart field
- **THEN** the system applies the requested marked state to the new message
- **AND** the system applies selected tag ids, newly created tags, and deleted tag ids using the existing marked/tag workflow

#### Scenario: Reject unsupported request body
- **GIVEN** the local HTTP API is enabled
- **WHEN** the file send endpoint receives a non-`multipart/form-data` request or a request without a file part
- **THEN** the system rejects the request with a 4xx error
- **AND** the system does not create any message record

#### Scenario: Reject invalid marked options for file send
- **GIVEN** the local HTTP API is enabled
- **WHEN** the file send endpoint receives a `markedOptions` field that is not valid JSON
- **THEN** the system rejects the request with a 4xx error
- **AND** the system does not create any message record

#### Scenario: Report send failure
- **GIVEN** the local HTTP API is enabled
- **AND** the current WebDAV endpoint is unavailable or upload fails
- **WHEN** another program submits a file to the endpoint
- **THEN** the system returns a failure status with an error message
- **AND** the system does not treat the request as a successful send

### Requirement: Local HTTP text send endpoint
The system SHALL provide a local HTTP text send endpoint so other programs can send text messages to the currently active WebDAV endpoint through HTTP JSON requests. The endpoint SHALL use `POST /api/send-text`, require a `text` field, allow an optional `format` field, and reuse the existing text send pipeline so remote message storage, history, and index behavior stay aligned with the frontend send flow. The endpoint SHALL also support an optional `markedOptions` JSON property using the same payload shape as the existing marked/tag send flow.

#### Scenario: Send a plain text message through the local HTTP endpoint
- **GIVEN** the local HTTP API is enabled
- **AND** the application has an active WebDAV endpoint
- **WHEN** another program submits JSON `{ "text": "hello" }` to `POST /api/send-text`
- **THEN** the system sends the text message to the current WebDAV endpoint
- **AND** the HTTP response returns success status and the sent message identifier

#### Scenario: Send a markdown message through the local HTTP endpoint
- **GIVEN** the local HTTP API is enabled
- **WHEN** another program submits JSON `{ "text": "# title", "format": "markdown" }` to `POST /api/send-text`
- **THEN** the system treats the request as a Markdown text message
- **AND** the generated message format matches the frontend Markdown send behavior

#### Scenario: Send a text message with marked state and tag operations
- **GIVEN** the local HTTP API is enabled
- **AND** the application has an active WebDAV endpoint
- **WHEN** another program submits JSON containing `text` and `markedOptions` to `POST /api/send-text`
- **THEN** the system applies the requested marked state to the new text message
- **AND** the system applies selected tag ids, newly created tags, and deleted tag ids using the existing marked/tag workflow

#### Scenario: Reject unsupported text format
- **GIVEN** the local HTTP API is enabled
- **WHEN** another program submits JSON with an unknown `format`
- **THEN** the system rejects the request with a 4xx error
- **AND** the system does not create any message record

#### Scenario: Reject invalid marked options for text send
- **GIVEN** the local HTTP API is enabled
- **WHEN** another program submits JSON whose `markedOptions` value does not match the expected structure
- **THEN** the system rejects the request with a 4xx error
- **AND** the system does not create any message record

### Requirement: Configurable HTTP bind address and port
The system SHALL bind the local HTTP API to the configured address and port. The default binding SHALL be `127.0.0.1:6011`, and the system SHALL allow users to bind the API to non-local addresses.

#### Scenario: Bind to default address and port
- **WHEN** the user enables the local HTTP API without changing the binding settings
- **THEN** the system listens on `127.0.0.1:6011`

#### Scenario: Bind to a non-local address
- **WHEN** the user configures a non-local bind address and enables the service
- **THEN** the system starts listening on the configured address and port
- **AND** the externally displayed API address matches the actual binding

### Requirement: HTTP service status feedback
The system SHALL expose the current runtime status of the local HTTP API, including at least disabled, running, and start-failed states. When startup fails, the system SHALL retain diagnostic error details, and when running, the system SHALL return the current API address.

#### Scenario: Show running status after enable
- **WHEN** the user enables the local HTTP API and startup succeeds
- **THEN** the system reports the API status as running
- **AND** the system can display the current API address to the user

#### Scenario: Show start failure status
- **WHEN** the user enables the local HTTP API but startup fails
- **THEN** the system reports the API status as start-failed
- **AND** the system displays the startup error reason
