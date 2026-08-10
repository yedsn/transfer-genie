## ADDED Requirements

### Requirement: Temporary Prompt Text Action
The system SHALL allow AI text processing requests to use a temporary prompt supplied by the user for the current run. A temporary prompt SHALL support the same text input, draft format context, template rendering, provider validation, streaming behavior, reasoning filtering, and output preview contract as saved AI text actions. Temporary prompts SHALL NOT be persisted unless the user explicitly saves them.

#### Scenario: Run unsaved prompt
- **WHEN** the user enters a prompt in the composer prompt dialog and runs it without saving
- **THEN** the system renders that prompt with the current draft input
- **AND** sends the rendered request to the configured AI provider
- **AND** does not add the prompt to the saved AI action list

#### Scenario: Temporary prompt uses current draft context
- **WHEN** the user runs a temporary prompt from a Markdown draft
- **THEN** the system includes the draft format in the prompt context
- **AND** the AI result is returned for preview without directly modifying the draft

#### Scenario: Reject invalid temporary prompt run
- **WHEN** the user runs a temporary prompt while AI is disabled, provider settings are incomplete, or the prompt text is empty
- **THEN** the system returns an actionable error
- **AND** the current draft text remains unchanged

### Requirement: Save Prompt From Composer
The system SHALL allow users to save the current composer prompt into the existing AI prompt action settings list. Saving SHALL require a prompt name and category, SHALL create a custom enabled prompt action, and SHALL make the saved prompt available through settings, the existing AI action dropdown, and the composer prompt library. Saving a prompt SHALL NOT automatically run it.

#### Scenario: Save prompt with name and category
- **WHEN** the user enters prompt text, chooses to save it, and provides a valid name and category
- **THEN** the system creates a custom AI prompt action in settings
- **AND** the saved action uses the entered prompt text as its user prompt template
- **AND** the saved action is available for later selection

#### Scenario: Save requires metadata only in save flow
- **WHEN** the user opens the prompt dialog and has not clicked save
- **THEN** the system does not require prompt name or category fields
- **WHEN** the user clicks save to prompt library
- **THEN** the system requires prompt name and category before persisting the prompt

#### Scenario: Saved prompt is reusable
- **WHEN** a prompt has been saved from the composer
- **THEN** it appears in the prompt library for the AI prompt dialog
- **AND** it appears in the existing AI action dropdown and settings prompt action list

#### Scenario: Cancel save keeps prompt unsaved
- **WHEN** the user starts the save flow and cancels before confirming
- **THEN** no new prompt action is added to settings
- **AND** the prompt text remains available in the current dialog until the dialog is closed or edited

### Requirement: AI Text Processing Safety
AI text processing SHALL run only after an explicit user action. The system MUST NOT send draft text to an AI provider during normal typing, prompt editing, selecting prompt-library entries, saving prompts, loading, syncing, receiving messages, or sending messages. Provider request failures, timeouts, invalid responses, rejected actions, or invalid temporary prompts SHALL leave draft content unchanged.

#### Scenario: Prompt editing does not call provider
- **WHEN** the user opens the prompt dialog, types a prompt, selects a prompt-library item, or saves a prompt
- **THEN** the system does not send draft or prompt content to any AI provider

#### Scenario: Preview before applying output
- **WHEN** an AI provider returns generated text successfully for a saved or temporary prompt
- **THEN** the system presents the generated text for user confirmation
- **AND** draft content is modified only after the user confirms an apply action

#### Scenario: Provider request fails
- **WHEN** an AI provider request fails, times out, or returns an invalid response
- **THEN** the system shows an error to the user
- **AND** no draft text is replaced or inserted
