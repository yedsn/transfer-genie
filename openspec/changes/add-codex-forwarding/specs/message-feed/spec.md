## ADDED Requirements

### Requirement: Optional clipboard copy on text send
When send-after-copy is enabled, the client SHALL copy successfully sent text and Markdown message content to the clipboard after the original Transfer Genie send succeeds. Clipboard copying SHALL NOT change the stored message content, message metadata, WebDAV history format, or local message index schema.

#### Scenario: Text send copies after success
- **WHEN** the user sends a text message and the original Transfer Genie send succeeds
- **AND** send-after-copy is enabled
- **THEN** the client copies the same text content to the clipboard

#### Scenario: Markdown send copies after success
- **WHEN** the user sends a Markdown message and the original Transfer Genie send succeeds
- **AND** send-after-copy is enabled
- **THEN** the client copies the same Markdown content to the clipboard

#### Scenario: File send does not copy file content
- **WHEN** the user sends one or more files without text content
- **THEN** the client does not copy file bytes or file metadata to the clipboard

#### Scenario: Original send fails
- **WHEN** the original text send fails before a message is stored
- **THEN** the client does not copy the draft text to the clipboard

### Requirement: Send shortcut menu
The composer SHALL provide a send-adjacent shortcut menu that lets users quickly toggle send-after-copy without leaving the editor. Toggling the option in the menu SHALL persist the same setting used by the Settings page.

#### Scenario: Toggle send-after-copy from composer
- **WHEN** the user opens the send shortcut menu and checks Send After Copy
- **THEN** the app persists the send-after-copy setting
- **AND** the next successful text or Markdown send copies the sent prompt to the clipboard

#### Scenario: Send shortcut menu does not send by itself
- **WHEN** the user checks or unchecks an option in the send shortcut menu
- **THEN** no message is sent until the user activates the send action
