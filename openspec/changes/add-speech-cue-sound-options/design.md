## Context

The app already stores speech cue sound preferences under speech-to-text settings and plays cues through a small Web Audio oscillator profile. The editor recording button and system dictation shortcut now share this playback path.

## Goals / Non-Goals

- Goals: add two selectable built-in cue sound profiles, keep existing defaults compatible, and ensure preview plus recording start/stop use the selected profile.
- Non-Goals: importing custom audio files, bundling sampled sound assets, or changing ASR/recording state behavior.

## Decisions

- Decision: Add oscillator-based cue kinds instead of audio assets.
  - Rationale: The existing cue system is generated in Web Audio, is small, and works without asset loading latency.
- Decision: Keep `system` as the default and add new kind ids rather than changing existing ids.
  - Rationale: Existing saved settings remain valid and older behavior is preserved unless the user chooses a new option.

## Risks / Trade-offs

- Generated sounds can only approximate Typeless-style feedback rather than copy an exact proprietary sound asset. Mitigation: use two short, distinct profiles with softer timing and lower volume so users can pick the closest feel.
