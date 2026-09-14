## Purpose

为语音转文字结果提供低延迟的自动润色配置，让短文本纠错使用更合适的快速模型，同时保留现有语音输出和失败回退行为。

## ADDED Requirements

### Requirement: Dedicated speech polish model

When automatic speech polish is enabled, the system SHALL allow the user to configure a dedicated speech-polish model independently from the general AI model. The dedicated model SHALL reuse the existing configured AI Provider base URL and API key. When the dedicated model is empty or unavailable, the system SHALL fall back to the general AI model rather than disabling speech transcription.

#### Scenario: Use the dedicated fast model
- **WHEN** speech polish is enabled and a dedicated speech-polish model is configured
- **THEN** the automatic speech polish request uses that model
- **AND** the general AI editor actions continue to use the general AI model

#### Scenario: Fall back to the general model
- **WHEN** speech polish is enabled and the dedicated speech-polish model is empty
- **THEN** the automatic speech polish request uses the general AI model
- **AND** existing speech transcription behavior remains available

#### Scenario: Dedicated model is rejected by the provider
- **WHEN** the dedicated speech-polish model request fails because the model is unavailable or rejected
- **THEN** the system preserves the raw transcript as the final speech result
- **AND** the failure does not block later speech transcription attempts

### Requirement: Built-in speech polish prompts

Automatic speech polish SHALL provide a built-in selectable prompt library independent of the general AI assistant actions. The default prompt SHALL prioritize complete, faithful transcript output: it SHALL allow correction of obvious recognition errors, punctuation, and sentence breaks, but SHALL preserve the original meaning and preserve numbers, identifiers, code, URLs, proper nouns, and uncertain wording whenever possible. The built-in prompt SHALL instruct the provider to output only the processed transcript without explanations.

#### Scenario: Use the faithful built-in prompt
- **WHEN** the user selects the default speech polish mode
- **THEN** the request uses the built-in faithful transcript prompt
- **AND** a spoken value such as `1234` remains `1234` rather than being rewritten or explained

#### Scenario: Speech polish does not reuse assistant actions
- **WHEN** the general AI assistant action library is changed or contains a summarization action
- **THEN** automatic speech polish continues to use only the selected built-in speech prompt
- **AND** the transcript is not summarized or rewritten by an unrelated assistant action

### Requirement: Speech polish performance parameters

The system SHALL allow automatic speech polish to use speech-specific performance parameters for temperature, dynamically computed maximum output length, request timeout, and deep-thinking mode. The system SHALL validate and bound numeric values before sending a request. Deep thinking SHALL be disabled by default for speech polish. When deep thinking is disabled, the system SHALL pass a disabled or minimal reasoning preference through the OpenAI-compatible request contract where supported by the provider. When deep thinking is enabled, the system SHALL allow the provider to use its reasoning mode for the speech polish request.

#### Scenario: Bound the generated output dynamically
- **WHEN** automatic speech polish is requested for a short transcript
- **THEN** the provider request includes a small output limit suitable for short cleanup
- **AND** the output limit prevents the model from generating an unbounded response for a short transcript

#### Scenario: Allow longer polished output for long recordings
- **WHEN** automatic speech polish is requested for a long merged transcript
- **THEN** the provider request includes a larger output limit derived from the transcript length
- **AND** the long recording is not constrained by the short-transcript output limit

#### Scenario: Use low-latency defaults
- **WHEN** a new or legacy installation has no speech-polish performance settings
- **THEN** the system uses a low temperature, a bounded output length, a shorter speech-polish timeout, and disabled deep-thinking mode
- **AND** existing settings remain loadable without migration errors

#### Scenario: Toggle deep thinking for speech polish
- **WHEN** the user enables deep thinking beside the dedicated speech-polish model setting
- **THEN** automatic speech polish requests may use the provider's reasoning mode
- **AND** disabling the switch returns speech polish to the low-latency non-reasoning preference

#### Scenario: Provider does not support deep-thinking control
- **WHEN** a provider does not support the optional deep-thinking or reasoning parameter
- **THEN** the system still sends the speech polish request using the common request fields
- **AND** a deep-thinking-parameter rejection is handled as a polish failure with raw-transcript fallback

### Requirement: Preserve final speech output semantics

The performance optimization SHALL not change the ordering or fallback semantics of speech transcription. The system SHALL still run optional polish after ASR produces the transcript, SHALL use the polished text only after the polish request completes, and SHALL preserve the raw transcript when polish fails or returns unusable output.

#### Scenario: Successful automatic polish
- **WHEN** ASR returns usable text and speech polish completes with usable output
- **THEN** the final composer insertion, clipboard copy, system-dictation paste, and sent transcript use the polished text
- **AND** the raw transcript remains available through the existing speech transcript metadata behavior

#### Scenario: Polish timeout
- **WHEN** the speech-polish request exceeds its configured timeout
- **THEN** the system stops waiting for that polish request
- **AND** uses the raw transcript as the final speech result
- **AND** does not emit a second final paste or insertion
