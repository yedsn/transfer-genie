# Supabase acceptance record

Date: 2026-10-12  
Application: Transfer Genie 0.4.46  
Target: authorized self-hosted Supabase test environment  
Schema: `transfer_genie`  
Bucket: `transfer-genie-files`

## Scope and test model

The Rust `supabase_probe` used the same Auth, PostgREST/RPC, Realtime WebSocket, and Storage HTTP protocols as the desktop client. It created two temporary ordinary Auth users. User A signed in twice to create two independent sessions representing two devices; user B was a separate account used for isolation checks. The probe used a management credential only to create and remove temporary users, kept it in process environment variables, and did not print or persist it.

This was a real target-environment protocol acceptance run, not a two-physical-computer manual UI run. Local-first and recovery behavior that requires process or SQLite fault injection was verified by Rust tests against temporary local databases.

## Acceptance matrix

| Area | Evidence and observed result | Result |
|---|---|---|
| Auth sign-in and refresh | Two ordinary users signed in through Auth. User A refreshed its token and `/auth/v1/user` returned the same user ID. A second independent session for user A also signed in successfully. | Pass, real target |
| Schema and RPC discovery | `cloud_status` returned schema version `001_transfer_genie_initial`, the authenticated user ID, the private bucket name, and the Realtime table. Direct authenticated writes to business tables were denied, preserving the RPC-only write boundary. | Pass, real target |
| Same-person two-session sync | User A device/session 1 created a message. User A device/session 2 updated it with the expected base revision. Session 1 then read the resulting change through `pull_changes`. | Pass, real target |
| Account and RLS isolation | User B used the same `space_id` value but could not read user A's message or Storage object. User A retained access. Direct table mutation was denied. | Pass, real target |
| Offline local edit | Supabase message, tag, mark, pin, delete, and file commands committed to SQLite and outbox without network dependency. Cached preview opened without network. | Pass, Rust tests |
| Marked message metadata | A marked message was read from the second session with its tag ID, pinned state, and day-precision due date intact. The tag was renamed from the second session and read back from the first. | Pass, real target |
| Tag deletion cleanup | The message tag reference was removed at the next message revision before the tag tombstone was applied. The second session pulled both changes and read the message with no dangling tag IDs. | Pass, real target + Rust dependency-order test |
| Immediate marked sync | Mark, tag, pin, send, and delete transactions signal the background sync loop instead of waiting for the current Realtime wait to time out. A running desktop acceptance send reached local synced state in 779 ms. | Pass, desktop runtime + Rust wake-up test |
| Response loss and idempotency | Replaying the same `operation_id` and payload returned the identical RPC result. Reusing the ID with a different payload was rejected. Local lease recovery preserved operation identity and immutable payload. | Pass, real target + Rust tests |
| Process interruption and retry | Claimed outbox rows were recoverable without changing operation identity; retry/backoff and manual retry paths did not strand `sending` rows. | Pass, Rust tests |
| Revision conflict | A stale base revision produced a server conflict with the current remote revision. Local tests verified both resolution paths: retain local by creating a new operation on the remote revision, and accept remote by applying its snapshot and superseding the old outbox operation. | Pass, real target + Rust tests |
| Deletion tombstone | User A deleted the message at the expected revision. The second session pulled a `delete` change with revision 4, proving deletion propagation through the change log. | Pass, real target |
| Pull/checkpoint crash safety | SQLite business changes and checkpoint advancement rolled back together under injected failure, then replayed exactly once after recovery. | Pass, Rust tests |
| Realtime delivery | An authenticated subscription to `transfer_genie.change_log` received the expected message change. | Pass, real target |
| Realtime loss and reconnect | Session 1 disconnected its WebSocket; session 2 modified the message; session 1 reconnected and `pull_changes` after its previous checkpoint returned the missed revision. Realtime was used only as a wake-up signal. | Pass, real target |
| Event-driven desktop loop | The desktop keeps one authenticated Realtime subscription while idle, uploads immediately on local outbox signals, and pulls on remote events. Fixed 45-second business polling was removed; disconnects use bounded 1–30 second backoff and pull once after the subscription is restored. | Pass, code-path review + Rust backoff test |
| Storage private access | User A uploaded and read exact bytes. User B was denied access to the same object path. | Pass, real target |
| Storage/metadata interruption | The object upload completed, then attachment metadata was intentionally rejected with `MESSAGE_NOT_FOUND`. The object remained readable and the same stable operation/path was successfully retried with valid metadata. | Pass, real target |
| Offline attachment behavior | An already cached Supabase preview opened without network. A new file send retained the controlled local original and queued message/attachment metadata before network upload. | Pass, Rust tests |
| Orphan cleanup | Candidates excluded referenced objects, pending-upload objects, and objects within the grace period; cleanup is bounded per run. | Pass, Rust tests |
| Account-scoped local cache | The same profile could store identical filenames and tag IDs for different `owner_scope` values without collisions; feed queries returned only the selected account. | Pass, Rust tests |
| WebDAV to Supabase import | Persistent import progress resumed pending/error items without duplicate business or outbox rows. Source WebDAV data is only read and is never deleted or written back by the import path. | Pass, Rust tests + code-path review |
| Imported marked metadata | The completed real import contained 378 messages and two tags. All 380 items were applied with zero failures; 10 marked messages and three due dates matched the source row-for-row, and the target had zero invalid tag references. | Pass, real target + local/remote reconciliation |

## Suite evidence

- `cargo test`: 39 Telegram Bridge tests and 242 main application tests passed after the final conflict-resolution test was added; the probe binary has no unit tests.
- All `tests/test_*.js` checks passed, including desktop media E2E and speech-to-text UI smoke tests.
- `npm run typecheck`, `npm run build`, `npm run docs:build`, and `cargo fmt --check` passed.
- `cargo run --bin supabase_probe` printed only: `Supabase probe passed: Auth, RPC, RLS, Realtime and Storage`.

## Server-side post-run checks

Read-only metadata checks observed:

- migration version `001_transfer_genie_initial`: one row;
- RLS enabled on all seven application tables;
- seven application RLS policies present;
- `transfer_genie.change_log` present once in `supabase_realtime`;
- `transfer-genie-files` present and private;
- zero temporary probe users, probe objects, or probe messages after cleanup.

## Remaining limitations

- No manual acceptance was performed on two separate physical computers. Two independent Auth sessions exercised the real target environment and protocol boundary, but OS-specific suspend/resume and Credential Manager/Keychain behavior still depend on the target machines.
- Large-file resumable upload is not part of this version; a failed whole-file upload retries from the controlled local original.
- Long-term behavior beyond tombstone or operation-record retention has no automatic pruning policy in this version. An exceptionally old device would require a controlled resync if such retention is introduced later.
- WebDAV and Supabase remain intentionally independent. Import is an explicit, resumable copy and does not create ongoing dual-write synchronization.
