## Context

See [proposal.md](proposal.md) for motivation and the `system-dictation-output` specification for observable behavior. The current frontend captures an in-app editable target at recording start, while the backend stores a Windows foreground-window handle at the same time. Final delivery restores or validates that stored state before it sends `Ctrl+V`. This means a user cannot redirect output while ASR or AI polish is still running.

Automatic speech polish currently calls the non-streaming AI command and awaits the entire response. The backend already exposes a streaming text-action command that emits output events, and the Vue editor already consumes it for normal AI actions.

## Goals / Non-Goals

**Goals:**
- Make the final paste depend only on the foreground window at final-output time.
- Preserve the explicit ordering of ASR, optional polish, final clipboard write, and one paste attempt.
- Reuse the existing AI stream event protocol without changing provider configuration or result semantics.
- Keep an observable clipboard/result-capsule fallback when a target is unavailable.

**Non-Goals:**
- Detect or directly mutate arbitrary third-party input controls.
- Guarantee that every application accepts simulated keyboard input.
- Paste partial streaming output, replace text after it was pasted, or add a new provider-specific AI API.
- Restore the user's prior clipboard contents.

## Decisions

### Resolve the paste target at final delivery

The frontend will stop storing or restoring its initial editable element for system dictation. The backend will stop retaining a foreground-window handle at recording start. The paste command will write the clipboard and read the foreground window immediately before sending the platform paste shortcut.

This directly implements output-time focus, allows users to switch applications during processing, and avoids stale-handle checks. Capturing the target at recording stop was considered, but polish can continue after recording stops and would still make the target stale relative to the requested behavior.

### Treat OS paste dispatch as best effort

The backend can verify that a foreground window exists and that keyboard injection was accepted by the OS, but cannot reliably observe a third-party input's content. The command result will distinguish no foreground target from a dispatched shortcut, while the UI will always retain the copied final text in the result capsule. Tests will not claim proof of insertion merely because input injection was dispatched.

UI Automation or per-application integration was considered, but it cannot cover web editors and custom controls consistently and would broaden platform permissions and maintenance cost.

### Stream automatic polish but paste only after completion

System dictation will use the existing streaming AI command when polish is enabled. It will collect output deltas in memory, ignore reasoning deltas for final text, and wait for the stream's completion event before selecting the final text for clipboard/paste. If stream setup, stream execution, or output validation fails, it will use the raw transcript as it does today.

Using the existing non-streaming command is simpler but forces delivery to wait for full buffered HTTP response. Pasting the raw transcript first and later replacing it was rejected because the user explicitly requires the polished text to be pasted once after completion.

### Use a concise speech-polish instruction without overwriting user actions

The built-in `polish` action's text will be shortened to the instruction needed for spoken transcript cleanup and direct output. Existing user-configured actions remain unchanged, and selecting a custom action continues to use that action as-is. This reduces request prompt tokens for the default speech path without silently changing customized workflows.

Introducing a second provider/model setting for speech polish was rejected because it increases configuration complexity and does not address stale focus behavior.

## Risks / Trade-offs

- A user can focus a non-editable foreground window before output is ready, causing paste to go nowhere. → Keep the result in the clipboard and display it in the result capsule.
- Windows keyboard injection success cannot prove application-level insertion. → Report dispatch status accurately and add manual verification coverage for common browser and native inputs.
- Some OpenAI-compatible providers may not implement streaming correctly. → Fall back to the existing raw transcript behavior on stream error; retain a tested non-streaming fallback only if streaming is unavailable at runtime.
- Changing the built-in prompt affects fresh/default configurations. → Limit the prompt change to concise equivalently scoped cleanup instructions and do not overwrite persisted custom actions.

## Migration Plan

1. Release with no settings schema migration: existing dictation and polish settings remain valid.
2. Remove stale focus-target state from the active delivery path and update paste-command response semantics where needed.
3. Verify Windows external-input behavior manually across a browser input, browser rich-text editor, and a native desktop editor; run existing smoke and Rust tests.
4. Roll back by restoring the prior application build. No user data migration is required; clipboard content from completed dictation remains intentionally transient.
