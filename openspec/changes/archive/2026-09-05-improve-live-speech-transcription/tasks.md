## 1. Baseline Verification

- [x] 1.1 Add focused frontend smoke coverage for long speech recording chunk timing and verify a test chunk can be submitted while the mocked recording remains active.
- [x] 1.2 Add focused frontend smoke coverage for live composer append behavior and verify multiple mocked chunk results appear exactly once in chronological order.
- [x] 1.3 Review backend ASR error sanitization coverage and verify API key values cannot appear in returned speech transcription errors.

## 2. Recording and Transcription Flow

- [x] 2.1 Refine the speech recording session state so recording remains active while chunk transcription requests are pending, verified by a mocked slow ASR request that does not disable or stop the recording control.
- [x] 2.2 Refine the internal transcription queue so completed short chunks are submitted without blocking audio capture, verified by observing queued chunk count/progress during an active recording smoke test.
- [x] 2.3 Ensure final remainder audio is submitted after user stop and verify short recordings and non-even long recordings both produce final transcript output.
- [x] 2.4 Ensure chunk transcription failures mark the session task failed without stopping active audio capture, verified with a mocked failing chunk during an ongoing recording.

## 3. Composer and Task History

- [x] 3.1 Update composer insertion behavior so successful chunk text is appended immediately, with stable separators and no automatic send, verified by composer state assertions.
- [x] 3.2 Update speech task persistence so each recording session has one retained task with complete audio, combined text, status, error, and progress metadata, verified through IndexedDB-backed task history smoke coverage.
- [x] 3.3 Ensure retry transcription uses the retained complete audio and re-applies internal chunking, verified with a retained long-audio task retry test.
- [x] 3.4 Ensure settings task history shows in-progress, successful, and failed session tasks with expected actions, verified by rendering the settings speech task list in a UI smoke check.

## 4. Integration Verification

- [x] 4.1 Run OpenSpec strict validation for `improve-live-speech-transcription` and verify all deltas pass.
- [x] 4.2 Run the relevant Rust speech tests and verify ASR frame parsing, speech settings normalization, and error sanitization still pass.
- [x] 4.3 Run the targeted speech UI smoke checks and verify continuous recording, periodic chunk transcription, live composer append, stop-finalization, and retry behavior.
