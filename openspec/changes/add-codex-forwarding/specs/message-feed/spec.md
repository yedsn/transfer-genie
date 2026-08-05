## ADDED Requirements

### Requirement: Optional Codex forwarding on text send
When Codex forwarding is enabled, the client SHALL attempt to forward successfully sent text and Markdown messages to the configured Codex target. This secondary forwarding SHALL NOT change the stored message content, message metadata, WebDAV history format, or local message index schema.

#### Scenario: Text send triggers forwarding
- **WHEN** the user sends a text message and the original Transfer Genie send succeeds
- **AND** Codex forwarding is enabled with a valid target
- **THEN** the client attempts to forward the same text content to the configured Codex target

#### Scenario: Markdown send triggers forwarding
- **WHEN** the user sends a Markdown message and the original Transfer Genie send succeeds
- **AND** Codex forwarding is enabled with a valid target
- **THEN** the client attempts to forward the same Markdown content and format to the configured Codex target

#### Scenario: File send does not trigger forwarding
- **WHEN** the user sends one or more files without text content
- **THEN** the client does not forward file bytes or file metadata to Codex

#### Scenario: Forwarding does not alter message feed data
- **WHEN** Codex forwarding is enabled and a text send completes
- **THEN** the message feed stores and displays the message using the same content, format, tags, marked state, and send status semantics as a normal text send
