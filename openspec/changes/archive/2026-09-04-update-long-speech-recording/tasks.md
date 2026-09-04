## 1. Specification
- [x] 1.1 Validate the speech-to-text and settings requirement deltas.

## 2. Implementation
- [x] 2.1 Update recording stop behavior so ordinary sessions are ended by explicit user action, not the previous short maximum duration.
- [x] 2.2 Add internal audio chunking for transcription requests with an approximately 60-second target chunk length.
- [x] 2.3 Merge chunk transcripts in chronological order into one composer insertion result.
- [x] 2.4 Keep speech task history as one task per recording with the complete audio and combined transcript/error.
- [x] 2.5 Ensure retry transcription uses the retained complete audio and re-applies internal chunking.

## 3. Verification
- [x] 3.1 Add or update focused tests for long recording chunk submission and single-task history behavior.
- [x] 3.2 Run the relevant Rust and speech UI smoke checks.
