## Context

The app already has speech-to-text settings and a speech transcription flow in the frontend. It also has an AI prompt action library with a default `polish` action and existing AI provider settings. System dictation uses a separate small overlay window that can show recording state and react to events from the main window.

## Goals / Non-Goals

**Goals:**
- Add backward-compatible speech-to-text settings for post-transcription polish.
- Reuse the existing AI prompt action definitions so users can pick any enabled prompt action.
- Run polish after ASR succeeds and before final clipboard/paste/insert output.
- Show a clear "正在进行润色" state in the system dictation capsule while polish is running.
- Preserve raw transcription text when polish fails.

**Non-Goals:**
- Do not add a new AI provider integration or a separate prompt management system.
- Do not change ASR request behavior, chunking, microphone capture, or paste target locking.
- Do not add an AI preview confirmation dialog for automatic speech polish; speech output remains automatic.

## Decisions

- Decision: Store polish settings under `speech_to_text` / `settingsForm.speechToText`.
  - Rationale: The feature is specific to speech transcription behavior and should travel with other speech settings.
  - Alternative considered: store under `ai`; rejected because it would make a speech-only workflow harder to discover.

- Decision: Reference prompt actions by action id, defaulting to `polish`.
  - Rationale: Existing prompt actions already include built-in and customized prompts; storing the id avoids duplicating prompt templates.
  - Alternative considered: copy prompt templates into speech settings; rejected because edits to prompt actions would not be reflected.

- Decision: Use the existing AI action execution path for polishing transcript text, but return the final text directly to the speech flow instead of opening the existing preview dialog.
  - Rationale: Speech dictation needs one-shot output; a preview dialog would break global dictation paste behavior.
  - Alternative considered: reuse the editor AI preview; rejected for system dictation because the target can be outside Transfer Genie.

- Decision: On polish failure, output the raw transcript and surface a non-blocking error/status.
  - Rationale: The ASR result is still valuable, and losing spoken input is worse than skipping polish.
  - Alternative considered: fail the whole speech task; rejected because polish is optional post-processing.

- Decision: System dictation overlay should re/show a compact textual processing state after ASR completes if polish is enabled.
  - Rationale: The user needs feedback that the recording ended successfully and the delay is AI polish, not a stuck recorder.
  - Alternative considered: keep the recording wave visible; rejected because it suggests the microphone is still recording.

## Risks / Trade-offs

- AI polish can add latency after ASR → show explicit polishing status and keep raw transcript fallback.
- Selected action may be disabled or deleted later → fall back to the base `polish` action, then to raw transcript if no valid action is available.
- Automatic AI processing sends transcript text to the configured AI provider → make the feature opt-in and keep it off unless the user enables it.
