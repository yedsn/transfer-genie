## Context
The current speech-to-text workflow records a single segment in the frontend, sends that segment to the Rust ASR command, and stores one task in the settings history. Existing settings include `max_duration_secs`, and normalization currently clamps it to a bounded range. The archived speech-to-text spec describes automatic stop at the maximum duration to avoid indefinitely long recordings.

The requested behavior changes that model: recording should be allowed to continue for a very long time, but ASR calls should still receive shorter audio chunks because the provider may reject or degrade on long audio.

## Goals / Non-Goals
- Goals: allow long explicit recording sessions; keep one complete playable/downloadable audio artifact per session; submit approximately one-minute chunks to ASR; merge chunk transcripts in order; show only one retained transcription task for the recording.
- Non-Goals: live partial transcription while recording; automatic background recording; multiple simultaneous speech recordings; changing ASR provider.

## Decisions
- Decision: Keep capture as one frontend recording session while maintaining an internal rolling ASR buffer. Completed chunk windows are submitted during recording, and the final remainder is submitted when the user stops.
  Alternative considered: wait until the user stops and then split the complete audio. That keeps implementation simpler, but it does not satisfy the need to pull out not-yet-transcribed audio during a very long recording.

- Decision: Treat chunking as an internal transcription transport detail.
  Alternative considered: store each chunk as its own task. That does not match the settings/history requirement and makes retry/copy/download behavior noisy for long recordings.

- Decision: Use a fixed internal target chunk duration of about 60 seconds initially.
  Alternative considered: expose a setting for chunk duration. The user need is provider-limit compatibility, not tuning; avoiding another setting keeps the UI simpler.

- Decision: Mark the single task failed if any required chunk fails, while preserving the complete captured audio for retry.
  Alternative considered: insert partial text on partial failure. That risks silently losing parts of a long recording unless a later UI explicitly supports partial-status review.

## Risks / Trade-offs
- Long recordings can use substantial memory if captured fully before processing. Mitigation: keep the behavior explicit and visible, and implement chunk preparation with bounded intermediate buffers where practical.
- Chunk boundaries can split words. Mitigation: target roughly one-minute chunks but keep ordering stable; future work can add overlap if provider results show boundary loss.
- Total transcription latency increases with duration. Mitigation: submit completed chunks during recording and process them sequentially for correctness first; parallelism can be evaluated later if the ASR endpoint supports it safely.

## Migration Plan
- Existing saved settings continue to load.
- Existing retained tasks remain valid.
- `max_duration_secs` should no longer force automatic stop for normal recordings; if retained for compatibility, it should not be surfaced as the long-recording limit.
