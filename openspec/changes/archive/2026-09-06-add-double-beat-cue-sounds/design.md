## Context

Speech cue sounds are currently synthesized in the frontend with Web Audio oscillators. The app already uses a shared cue playback path for the editor button, system dictation shortcut, and cue preview button.

## Goals / Non-Goals

- Goals: add multiple built-in double-beat cue sound options, keep existing cue kinds working, and preserve the current settings storage format with backward-compatible new kind ids.
- Non-Goals: bundling mp3/wav assets, changing ASR behavior, or changing recording state timing.

## Decisions

- Decision: Implement the double-beat cue as two short Web Audio pulses inside the existing playback function.
  - Rationale: This keeps the feature lightweight and consistent with the current synthesized cue system.
- Decision: Add new cue kind ids instead of altering the meaning of existing kinds.
  - Rationale: Existing saved settings and import/export data continue to work without migration.

## Risks / Trade-offs

- Two-pulse feedback is slightly longer than the current single cue, which may feel more noticeable during rapid toggling. Mitigation: keep each pulse short and provide several double-beat options with different intensity.
