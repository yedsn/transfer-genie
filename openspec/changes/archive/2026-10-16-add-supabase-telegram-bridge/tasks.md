# Tasks

## 1. Source identity and compatibility

- [x] 1.1 Add backward-compatible optional Telegram source fields to the message domain and SQLite schema, enforce idempotency for the stable source tuple within a storage/account scope, and verify migration plus duplicate-ingest Rust tests pass for legacy and new databases.
- [x] 1.2 Extend WebDAV history/manifest serialization and parsing with optional source fields, and verify round-trip tests preserve Telegram identity while old history without the fields still loads unchanged.
- [x] 1.3 Add nullable source fields to the Supabase messages schema, RPC payloads and pull mapping without weakening RLS or revision checks, and verify SQL/probe tests cover insert, retry, incremental pull and old rows with null source fields.
- [x] 1.4 Document the additive source metadata contract in the Supabase setup/migration guidance and verify the documented migration applies cleanly to the maintained test environment.

## 2. Provider-aware integration message service

- [x] 2.1 Extract an internal send service that accepts an immutable explicit target context rather than re-reading the active profile, preserve existing UI and local HTTP send behavior, and verify current send-text/send-file Rust and Node tests remain green.
- [x] 2.2 Add external text ingestion with sender, timestamp and stable source identity for WebDAV and Supabase, and verify WebDAV persistence plus Supabase transactional message/outbox tests.
- [x] 2.3 Add external file ingestion that adopts a controlled local original before remote work, persists Supabase message/attachment/outbox atomically, and verify offline restart plus later-upload tests retain one message and one attachment.
- [x] 2.4 Guard every integration write with profile ID, owner scope and generation validation, and verify a target switch during Telegram file download cannot write into the newly active space.

## 3. Managed Bridge runtime

- [x] 3.1 Refactor reusable Telegram polling, download and send logic away from the standalone WebDAV run loop so it can be called by a managed in-process task, and verify existing Telegram parsing, limits and error-classification tests pass.
- [x] 3.2 Replace the desktop-managed child process with an async task manager holding cancellation, generation and lifecycle status, and verify start, duplicate start, stop, clean exit, unexpected failure and restart tests.
- [x] 3.3 Build immutable WebDAV/Supabase binding contexts from the active Provider, integrate the authoritative bound-Supabase guard from `defer-supabase-space-creation`, and verify disabled, unbound, signed-out and inaccessible profiles fail without fallback.
- [x] 3.4 Restart the managed Bridge when the active profile, destination, Supabase owner scope or relevant Telegram settings change, and verify late work from the old generation is rejected after WebDAV-to-Supabase, Supabase-to-WebDAV and Supabase-space switches.
- [x] 3.5 Preserve the standalone `telegram_bridge` WebDAV configuration and execution path, and verify its legacy config tests plus a targeted standalone WebDAV smoke test still pass.

## 4. Inbound Telegram flows

- [x] 4.1 Route Telegram text updates through the provider-aware ingestion service and persist the chat/message source tuple before advancing the update cursor, and verify duplicate update delivery creates exactly one message for each Provider.
- [x] 4.2 Route Telegram file updates through controlled local storage and the provider-aware file service, retain retryable work on Supabase/network failure, and verify restart recovery plus Telegram size-limit behavior.
- [x] 4.3 Keep Telegram update cursor, imported-update state and diagnostic errors scoped to the local device and binding, and verify switching spaces neither leaks cursor state nor reimports committed updates into the wrong space.
- [x] 4.4 Add tests proving Supabase tokens and Telegram Bot Token are absent from managed runtime files, frontend status payloads and logs while useful redacted Provider/space errors remain available.

## 5. Outbound delivery and loop prevention

- [x] 5.1 Add scoped local-index queries for messages newer than a Bridge start watermark, including owner-scope isolation for Supabase, and verify startup and rebind never replay pre-existing history.
- [x] 5.2 Persist a device-local outbound delivery ledger with reservation, sent, retryable, delivery-unconfirmed and permanent states, and verify crash recovery plus known-failure retry do not duplicate confirmed sends.
- [x] 5.3 Forward new WebDAV and Supabase text/file messages from the local index to Telegram, and verify Provider-specific sync/pull completion makes them eligible without direct remote scanning.
- [x] 5.4 Skip every message whose synchronized source identity is Telegram, and verify two devices running Bridges on the same Supabase space do not echo a Telegram-origin message back to Telegram.
- [x] 5.5 Preserve the rule that uncertain Telegram delivery is not automatically retried, and verify the status is observable and survives application restart.

## 6. Device-local settings and UI

- [x] 6.1 Separate Telegram configuration validity, device auto-start preference and live running state while preserving legacy Settings deserialization, and verify settings normalization plus upgrade tests.
- [x] 6.2 Ensure Bridge auto-start and runtime state never enter Supabase rows, RPC payloads, Storage objects or Realtime changes, and verify a two-device account test leaves the second device's local preference unchanged.
- [x] 6.3 Update the Telegram Bridge settings panel to show the active space name and Provider, replace WebDAV-only wording, and display precise login/binding/access errors; verify frontend runtime and smoke tests cover WebDAV, ready Supabase and unavailable Supabase states.
- [x] 6.4 Update start/stop/auto-start controls for the managed task lifecycle and switching behavior, and verify UI tests cover save-before-start, running-state polling, local stop and automatic rebind feedback.
- [x] 6.5 Update README and Telegram Bridge integration/use-case docs for WebDAV and Supabase, local-only switches, offline Supabase behavior and standalone WebDAV compatibility, and verify links and labels match the implemented UI.

## 7. Integration verification

- [x] 7.1 Run the targeted Rust suites for schema migration, integration ingestion, Bridge lifecycle, generation guards, WebDAV compatibility, Supabase outbox/Storage and loop prevention, then run `cargo test` and record the results.
- [x] 7.2 Run the settings/frontend Node and desktop smoke suites, and verify Bridge controls, Provider summaries and error states work without regressing existing Supabase binding flows.
- [ ] 7.3 Validate WebDAV end to end in both desktop-managed and standalone modes for Telegram text/file inbound, application text/file outbound, restart and duplicate updates, and record that existing behavior remains compatible.
- [ ] 7.4 Validate Supabase end to end with an authorized ordinary-user test account for online and offline inbound text/file, outbox recovery, Storage upload, Realtime outbound, Session expiry and space switching, and record that no management credential is used by the client.
- [ ] 7.5 Validate two devices on the same Supabase account with only one device auto-starting Bridge, and record that settings remain local, Telegram-origin messages do not echo, and ordinary non-Telegram messages follow the explicitly running device behavior.
