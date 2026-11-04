## 1. Data model and migration

- [x] 1.1 Add account/space-scoped partial_download_segments schema, indexes, and migration coverage.
- [x] 1.2 Add database CRUD helpers for segment creation, progress checkpoints, completion, retry count, listing, and cleanup.
- [x] 1.3 Preserve and safely migrate existing single-stream partial_downloads records.

## 2. Supabase Range transport

- [x] 2.1 Add a Supabase Storage GET response type exposing status, content length, content range, etag, and byte stream.
- [x] 2.2 Implement authenticated ranged requests with strict 206/Content-Range validation.
- [x] 2.3 Implement bounded retry classification and fallback from segmented mode to single-stream resume/full download.

## 3. Unified download coordinator

- [x] 3.1 Implement the 16MB threshold, four-segment layout, per-segment temporary files, and concurrency limit.
- [x] 3.2 Persist progress at safe checkpoints and resume only incomplete segments after restart or foreground recovery.
- [x] 3.3 Merge segments in order, verify expected size and SHA-256, and atomically publish the final cache.
- [x] 3.4 Preserve account/object identity checks and ensure stale tasks cannot publish after account or space changes.
- [x] 3.5 Route attachment save, preview, media cache, and mobile recovery through the coordinator.
- [x] 3.6 Emit aggregate byte progress with the segment count so the transfer page shows the real percentage and a parallel-download label.

## 4. Verification

- [x] 4.1 Extend the Supabase test server to honor Range, emit Content-Range, and simulate per-segment EOF/retry.
- [x] 4.2 Add tests for restart, partial segment reuse, fallback when Range is unsupported, and invalid Content-Range.
- [x] 4.3 Add tests for account isolation, object replacement, checksum failure, atomic publish, and cleanup.
- [x] 4.4 Run cargo test, formatting checks, and strict OpenSpec validation.
