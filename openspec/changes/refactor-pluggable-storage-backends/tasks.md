# Tasks

## 1. Supabase cloud foundation

- [ ] 1.1 Review and promote `supabase/001_transfer_genie_initial.sql` into the repository migration path, then verify it executes transactionally on a test Supabase project and records migration version 001
- [ ] 1.2 Add `transfer_genie` to the target PostgREST exposed schemas without replacing existing schemas, reload the cache, and verify REST/RPC discovery succeeds with the public key
- [ ] 1.3 Verify the private `transfer-genie-files` bucket, Storage policies, and `change_log` Realtime publication with two ordinary Auth users, including cross-user denial and cleanup
- [ ] 1.4 Add a repeatable Rust Supabase integration probe for Auth refresh, RPC CRUD, RLS, Realtime and Storage, and verify it passes without exposing credentials in output

## 2. Storage profiles and local migration

- [ ] 2.1 Add provider-aware storage profile settings and migrate legacy `webdav_endpoints`/`active_webdav_id`, verifying existing configuration round-trips without losing credentials or active selection
- [ ] 2.2 Add account/profile-isolated SQLite schema for stable message IDs, revisions, tombstones, outbox, checkpoints, conflicts and attachment state, verifying migration from an existing messages database preserves all rows
- [ ] 2.3 Introduce the storage Provider interface and adapt existing WebDAV send, sync, download and delete behavior, verifying current WebDAV Rust and frontend regression tests remain green
- [ ] 2.4 Update settings import/export and local backup/restore for storage profiles while keeping sensitive fields protected, verifying legacy and new bundles both import safely

## 3. Supabase authentication and connection setup

- [ ] 3.1 Implement Rust Auth sign-in, token refresh, logout and current-user checks using only API URL and public Key, verifying invalid credentials and revoked sessions produce distinct states
- [ ] 3.2 Store Supabase Session material in Windows Credential Manager and macOS Keychain and keep it out of settings/logs/exports, verifying restart restores login without persisting the password
- [ ] 3.3 Add layered connection checks for network, Key, Auth, Schema version, RPC, RLS-readable space, Realtime and bucket, verifying missing Schema is reported separately from bad credentials
- [ ] 3.4 Add settings UI for Supabase configuration, login and masked account status, and verify the UI never requests a database password or management Key

## 4. Local-first synchronization

- [ ] 4.1 Route message, tag, mark and delete mutations through one SQLite transaction that writes business data and outbox, verifying rollback produces neither saved data nor queued operations
- [ ] 4.2 Implement recoverable outbox claiming, stable operation IDs, immutable payloads, retry/backoff and startup recovery, verifying response loss and process interruption do not duplicate operations or strand sending rows
- [ ] 4.3 Implement Supabase RPC push with base revision conflict handling and tombstones, verifying concurrent edits retain local/remote versions and offline edits cannot silently revive deleted records
- [ ] 4.4 Implement `pull_changes` pagination and atomic SQLite checkpoint advancement, verifying interrupted pulls replay safely and every sequence is applied once
- [ ] 4.5 Add user-visible pending/offline/syncing/synced/login/error/conflict states and manual sync results, verifying fast uploads still emit observable `0 -> N -> 0` pending transitions

## 5. Realtime and attachments

- [ ] 5.1 Implement authenticated Realtime subscription to `transfer_genie.change_log` and reconnect-driven补拉, verifying changes made while disconnected arrive through the checkpoint protocol after reconnection
- [ ] 5.2 Implement controlled local attachment copies, private Storage upload, hash/size verification and metadata RPC commit, verifying metadata failure retains a retryable local original
- [ ] 5.3 Adapt download, preview, playback and delete paths to Provider storage while preserving on-demand local caching, verifying offline cached files open and uncached files request connectivity
- [ ] 5.4 Implement bounded orphan-object cleanup rules and tests, verifying referenced or pending-upload objects are never deleted

## 6. Storage UI and WebDAV import

- [ ] 6.1 Replace the home WebDAV endpoint selector with a provider-aware storage-space selector, verifying switching immediately loads the target SQLite cache and late callbacks cannot cross profiles
- [ ] 6.2 Add WebDAV-to-Supabase import preview, stable ID mapping and persistent batch progress, verifying an interrupted import resumes without duplicates and leaves WebDAV unchanged
- [ ] 6.3 Add conflict and pending-operation entry points with actionable retry/login/resolve behavior, verifying blocked operations are distinguishable from ordinary pending work
- [ ] 6.4 Update user and deployment documentation for provider selection, Supabase initialization, login, offline behavior, file limitations and migration, verifying all documented paths and commands exist

## 7. Integration acceptance

- [ ] 7.1 Run Rust unit/integration tests, frontend typecheck/build and applicable UI tests, verifying the complete suite passes
- [ ] 7.2 Run a real two-device/account-isolation acceptance matrix covering Auth refresh, offline edits, response loss, conflicts, deletion, Realtime loss/reconnect and Storage interruption, recording observed evidence and unresolved limitations
- [ ] 7.3 Run OpenSpec strict validation and confirm every completed task is checked only after its implementation and verification evidence exists
