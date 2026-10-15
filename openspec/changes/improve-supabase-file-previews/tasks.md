# Tasks

## 1. Attachment preview data and cache foundations

- [x] 1.1 Add database queries and payload helpers for reading and updating attachment `preview_object_path`, attachment identity, revision, local original path, and preview publication state; verify Rust database tests cover account/profile isolation and empty historical preview paths.
- [x] 1.2 Define stable Supabase preview object paths under the attachment directory and an isolated local preview cache keyed by profile, owner scope, attachment ID, and preview version; verify path tests reject cross-scope collisions and unsafe path segments.
- [x] 1.3 Add structured preview resolution results for ready, loading, unsupported, offline, and failed states while preserving a safe migration path for current callers; verify serialization and command-level tests cover every state.

## 2. Supabase preview publication

- [x] 2.1 Extend Supabase file sending to generate image thumbnails and video posters from the controlled local original, upload `preview.jpg`, and include the stable preview path in attachment metadata when available; verify image and video integration tests store both Storage objects and the attachment snapshot path.
- [x] 2.2 Make preview generation and upload independently retryable without blocking original attachment availability, using stable operation IDs and revision-aware attachment updates; verify failures leave the original downloadable and retries do not create duplicate attachments or operations.
- [x] 2.3 Extend storage-space transfer into Supabase to publish or schedule a target-owned preview instead of copying a source preview path; verify WebDAV-to-Supabase and Supabase-to-Supabase transfer tests produce target-space preview paths and still complete when preview generation fails.
- [x] 2.4 Extend remote attachment deletion and orphan cleanup to include recorded preview objects; verify deletion tests remove only the selected attachment's original and preview paths.

## 3. Supabase preview retrieval and historical completion

- [x] 3.1 Refactor preview resolution to be Provider-aware: keep WebDAV compatibility and download Supabase `preview_object_path` through the authenticated private Storage API into the isolated cache; verify another-device tests render the preview without downloading the original object.
- [x] 3.2 Implement single-flight, bounded-concurrency preview downloads and generation jobs keyed by profile, owner scope, and attachment ID; verify concurrent list/detail requests share one job and a large request set never exceeds configured concurrency.
- [x] 3.3 Implement lazy historical preview completion using a local original first and a temporary streamed remote original only when necessary, then publish the preview with a revision-aware attachment update; verify local-source, remote-source, concurrent-device, offline, and unsupported-format tests.
- [x] 3.4 Ensure temporary originals used for preview completion are not recorded as formal downloads or permanent attachment caches and are cleaned after completion or failure; verify download status and filesystem cleanup tests.

## 4. Unified file preview interface

- [x] 4.1 Add a shared file-preview view model covering image, video, audio, document, archive, code, and unknown files, using MIME plus extension classification; verify frontend unit tests cover representative extensions and missing MIME values.
- [x] 4.2 Keep the message feed's existing image/video thumbnail area without adding a duplicate loading-preview card; retain detail retry actions and fallback file information, and verify UI tests show that preview failure keeps the file name and actions visible.
- [x] 4.3 Update image and video detail previews to reuse cached thumbnails or posters before loading originals, and retain existing on-demand playback/download behavior; verify opening details does not download the full original until the user requests it.
- [x] 4.4 Add consistent audio, document, archive, and unknown-file cards with non-wrapping actions and responsive layouts; verify visual behavior at narrow and standard window sizes.
- [x] 4.5 Reuse the same preview component and cache state in other file lists that show message attachments, including batch-download views where applicable; verify populated dialogs display the same file cards as the message feed.

## 5. Cache lifecycle and integration verification

- [x] 5.1 Clean attachment preview caches when messages or local attachment data are removed without affecting other profiles, accounts, or attachments; verify deletion and account-switch regression tests.
- [x] 5.2 Add end-to-end Supabase tests covering new image upload, video poster upload, Realtime/incremental metadata pull, another-device preview download, historical lazy completion, retry after Storage failure, and RLS path isolation; verify the targeted Rust test suite passes.
- [x] 5.3 Run frontend tests, `cargo test`, and `openspec validate improve-supabase-file-previews --strict`, and manually verify image, video, audio, document, archive, offline-cache, and failed-preview states in both the message list and detail dialog.
- [x] 5.4 Unify message-list media activation with the batch-download interaction model: double-click opens details, ordinary single-click is inert, image thumbnails open a dedicated image preview, video posters expose a hover play action, audio plays inline, and video details load immediately; verify UI smoke coverage for click isolation, playback, retry, and close behavior.
