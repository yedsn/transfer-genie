## Context

The current UI already captures microphone audio through Web Audio sampling, stores complete-session audio for task history, and has a rolling buffer that can submit short recognition chunks. The unstable user experience is likely caused by unclear boundaries between recording state, transcription progress, composer insertion, and retained task status.

The ASR provider remains the existing Volcengine Agent Plan WebSocket endpoint. The app currently sends one audio payload per backend command invocation, so live behavior is coordinated primarily in the frontend by building per-chunk WAV payloads and invoking the existing transcription command.

## Goals / Non-Goals

**Goals:**
- Keep audio capture running independently from ASR request latency or chunk failures.
- Make the active recording session the durable owner of complete audio, chunk progress, transcript text, and final status.
- Append successful chunk transcripts to the composer exactly once and in recording order.
- Keep settings task history simple: one visible item per recording session.

**Non-Goals:**
- No streaming partial words or interim ASR hypotheses within a chunk.
- No provider switch or new cloud dependency.
- No automatic background recording without an explicit user start action.
- No multi-session simultaneous recording.

## Decisions

- Decision: Treat recording and transcription as two cooperating pipelines.
  - Recording owns audio device lifetime, audio capture, level metering, and complete-session audio retention.
  - Transcription owns a queue of completed chunk payloads, ordered ASR submission, chunk result aggregation, composer append, and task status updates.
  - Alternative considered: keep one combined state machine. That is simpler to read initially, but ASR delays and failures can leak into recording controls and make the session feel unstable.

- Decision: Keep chunk submission ordered at first.
  - Each chunk receives a monotonic sequence number. The app SHALL append text only when all earlier appendable chunks have been handled, even if internal implementation later allows concurrent ASR requests.
  - Alternative considered: append whichever chunk returns first. That improves perceived speed when parallelized, but it can scramble dictated text.

- Decision: Use approximately 10 seconds as the fixed internal chunk target for sparse speech recordings.
  - Shorter chunks reduce long silence inside each ASR request and make intermittent speech appear sooner.
  - Alternative considered: expose a chunk-duration setting. That would complicate settings for a transport detail most users should not need to understand.

- Decision: Preserve one retained task per recording session.
  - The retained task should store complete audio and combined text. Chunk count/progress can be metadata, but chunk records should not become separate visible history items.
  - Alternative considered: store each chunk as a separate task. That makes retry and review noisy for long recordings and hides the fact that the user made one recording.

- Decision: Chunk transcription failure does not stop active recording.
  - The session records a sanitized transcription error and can show the task as failed after the user stops, while continuing to capture audio unless the recorder itself fails.
  - Alternative considered: stop immediately on first ASR failure. That protects users from continued untranscribed speech but violates the requirement that recording remain continuous.

## Risks / Trade-offs

- Long recordings increase memory use because complete audio is retained for replay and retry -> Keep audio encoded/downsampled consistently, avoid duplicate large buffers where practical, and prune retained tasks by configured count.
- Chunk boundaries can cut words or phrases -> Keep chunk order stable now; evaluate small overlap or provider-native streaming later only if boundary loss appears in testing.
- ASR backlog can grow if recognition is slower than real time -> Surface in-progress status and queue progress; keep recording unaffected, but mark the task failed if required queued chunks cannot complete.
- Appending text while the user edits the composer can be surprising -> Append to the active draft with stable separators and avoid sending automatically; later work can add an explicit insertion marker if user testing shows conflicts.

## Migration Plan

- Existing saved settings continue to load with current default values.
- Existing retained speech task records remain valid; missing progress metadata is treated as complete or unknown rather than invalid.
- Implementation should update current behavior in place without schema migration beyond optional task metadata fields.
