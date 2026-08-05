## ADDED Requirements

### Requirement: AI Provider Configuration

The system SHALL support an AI provider configuration for text processing. The first supported provider type SHALL be an OpenAI-compatible chat completion endpoint with configurable base URL, API key, model, temperature, and timeout. AI text processing SHALL be disabled by default for existing and new installations until the user enables it in settings.

#### Scenario: AI disabled by default
- **WHEN** the app loads settings that do not contain AI configuration
- **THEN** AI text processing is disabled
- **AND** default built-in text actions are available for review but are not executed until AI is enabled and configured

#### Scenario: Configure OpenAI-compatible provider
- **WHEN** the user enables AI text processing and saves a base URL, API key, and model
- **THEN** the system persists the AI provider configuration
- **AND** subsequent AI text actions use the configured provider and model

#### Scenario: Reject incomplete provider configuration
- **WHEN** the user runs an AI text action without an enabled provider, base URL, API key, or model
- **THEN** the system returns an actionable configuration error
- **AND** the current draft text remains unchanged

### Requirement: Prompt-Based Text Actions

The system SHALL define AI text actions as prompt-backed configuration entries. Each action SHALL include an id, name, enabled state, prompt template, optional system prompt, and output mode. The system SHALL provide built-in actions for polishing, making text more formal, and shortening text. Prompt templates SHALL support known variables including the input text and draft format.

#### Scenario: Run built-in polish action
- **WHEN** the user runs the built-in polish action with input text
- **THEN** the system renders the polish prompt with the provided text
- **AND** sends the rendered prompt to the configured AI provider
- **AND** returns generated text without directly modifying the draft

#### Scenario: Run disabled action
- **WHEN** the user attempts to run a disabled AI text action
- **THEN** the system rejects the request with an action unavailable error
- **AND** the current draft text remains unchanged

#### Scenario: Render prompt with draft format
- **WHEN** the user runs an AI action from a Markdown draft
- **THEN** the system includes the draft format in the rendered prompt context
- **AND** the action can instruct the provider to preserve Markdown structure

### Requirement: AI Text Processing Safety

AI text processing SHALL run only after an explicit user action. The system MUST NOT send draft text to an AI provider during normal typing, loading, syncing, receiving messages, or sending messages. Provider request failures, timeouts, invalid responses, or rejected actions SHALL leave draft content unchanged.

#### Scenario: Explicit processing only
- **WHEN** the user types, edits, syncs, or sends messages without invoking an AI action
- **THEN** the system does not send draft or message content to any AI provider

#### Scenario: Provider request fails
- **WHEN** an AI provider request fails, times out, or returns an invalid response
- **THEN** the system shows an error to the user
- **AND** no draft text is replaced or inserted

#### Scenario: Preview before applying output
- **WHEN** an AI provider returns generated text successfully
- **THEN** the system presents the generated text for user confirmation
- **AND** draft content is modified only after the user confirms an apply action

#### Scenario: Stream reasoning separately from final output
- **WHEN** an AI provider streams generated text that contains `<think>` reasoning blocks
- **THEN** the system shows reasoning content separately while processing is in progress
- **AND** the preview output excludes the reasoning blocks and their tags
- **AND** applying the AI result inserts or replaces only the final output text
