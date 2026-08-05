## ADDED Requirements

### Requirement: Codex forwarding target
The client SHALL support an optional Codex forwarding target for text prompts. The target SHALL be disabled by default and SHALL use a user-configured HTTP endpoint for the first supported delivery mode.

#### Scenario: Default target disabled
- **WHEN** the app loads settings that do not contain Codex forwarding configuration
- **THEN** Codex forwarding is disabled
- **AND** no text send attempts to contact a Codex target

#### Scenario: Configure HTTP target
- **WHEN** the user enables Codex forwarding and saves a valid HTTP or HTTPS endpoint URL
- **THEN** the client persists the forwarding configuration
- **AND** later text sends can use that endpoint as the Codex forwarding target

#### Scenario: Reject invalid target URL
- **WHEN** the user enables Codex forwarding with an empty or invalid endpoint URL
- **THEN** the client prevents saving the settings
- **AND** shows a validation message describing the invalid Codex forwarding target

### Requirement: Codex forwarding payload
The client SHALL forward text prompts using a JSON payload that includes the prompt text, its editor format, and source metadata. The payload MUST NOT include WebDAV credentials, AI provider API keys, Telegram tokens, or other unrelated sensitive settings.

#### Scenario: Forward plain text prompt
- **WHEN** Codex forwarding is enabled and the user successfully sends a plain text message
- **THEN** the client posts a JSON payload to the configured endpoint
- **AND** the payload includes the original text and `format` value `text`

#### Scenario: Forward Markdown prompt
- **WHEN** Codex forwarding is enabled and the user successfully sends a Markdown message
- **THEN** the client posts a JSON payload to the configured endpoint
- **AND** the payload includes the original Markdown and `format` value `markdown`

#### Scenario: Exclude sensitive settings
- **WHEN** the client builds a Codex forwarding payload
- **THEN** the payload does not contain configured WebDAV passwords, AI API keys, Telegram bot tokens, or local settings export passwords

### Requirement: Codex forwarding result handling
The client SHALL treat Codex forwarding as an optional secondary delivery. Forwarding failures SHALL be visible to the user but SHALL NOT convert the original Transfer Genie send into a failed send.

#### Scenario: Forwarding succeeds
- **WHEN** the original text send succeeds and the Codex endpoint accepts the forwarding request
- **THEN** the client reports that Codex forwarding succeeded or otherwise leaves the send success state intact

#### Scenario: Forwarding fails after send
- **WHEN** the original text send succeeds but the Codex forwarding request fails
- **THEN** the original message remains sent in Transfer Genie
- **AND** the client shows a non-blocking Codex forwarding failure message

#### Scenario: Original send fails
- **WHEN** the original text send fails before a message is stored
- **THEN** the client does not attempt Codex forwarding for that send action
