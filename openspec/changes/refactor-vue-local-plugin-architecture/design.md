## Context
The current frontend is a single large DOM-driven script. The backend stores part of the app state in SQLite, part in JSON files, part in endpoint-specific cache folders, and part in ad hoc runtime directories. WebDAV sync and Telegram bridge both own business logic directly instead of being isolated behind a runtime contract.

This change must preserve all current features and user-facing behavior while making the codebase easier to extend and safer to recover.

## Goals
- Move frontend UI/state management to Vue 2 without changing user workflows.
- Define a local-first data workspace with explicit ownership for config, cache, history, mirror, backup, and plugin runtime data.
- Record durable file-change history and create recoverable snapshots.
- Introduce plugin-like modules for sync/bridge capabilities.
- Fix unstable incremental loading on the home page.

## Non-Goals
- No product redesign or intentional feature removal.
- No cloud-hosted storage or external database.
- No replacement of WebDAV as the current primary sync path.
- No user-visible migration that requires manual data conversion steps.

## Decisions
- Decision: Use staged compatibility migration.
  - Phase 1 keeps current Tauri commands and backend behavior stable while adding a local workspace abstraction and plugin contracts.
  - Phase 2 moves the frontend to Vue 2 behind the same command surface so the backend API remains compatible.
  - Phase 3 migrates WebDAV and Telegram bridge implementations behind the plugin runtime and enables snapshots and scheduled backup jobs.

- Decision: Define a single local workspace root under app data.
  - Proposed structure:
    - `settings.json`
    - `messages.sqlite`
    - `workspace/endpoints/<endpoint-id>/history-cache/`
    - `workspace/endpoints/<endpoint-id>/snapshots/`
    - `workspace/endpoints/<endpoint-id>/mirrors/`
    - `workspace/endpoints/<endpoint-id>/change-log/`
    - `workspace/plugins/webdav/`
    - `workspace/plugins/telegram-bridge/`
    - `workspace/backups/`
    - `workspace/runtime/`
  - Legacy paths remain readable during migration and are folded into the new workspace abstraction.

- Decision: Persist file changes as append-only records plus materialized snapshots.
  - Change records capture file identity, operation type, source module, timestamp, pre/post metadata, and snapshot references.
  - Snapshots are point-in-time local copies of history manifests and mirrored remote files required for restore.
  - Restore operations rebuild the working state from selected snapshots without mutating unrelated records.

- Decision: Use plugin runtime traits instead of hard-coding integration behavior in app startup.
  - Introduce a sync-plugin contract for pull/push/list/history-related capabilities.
  - Introduce a bridge-plugin contract for long-running inbound/outbound bridge processes.
  - Provide built-in implementations for WebDAV and Telegram Bridge first.
  - Plugin state, enablement, and runtime files live under the workspace.

- Decision: Replace offset-driven home feed pagination with stable window loading.
  - The current implementation mixes descending SQL windows, offset paging, in-memory prepend/append merging, and independent refresh checks.
  - The refactor will use a stable oldest-loaded boundary and deterministic merge rules so load-more, check-new, delete, and filter operations cannot desynchronize the UI list.

- Decision: Preserve backend command compatibility during frontend migration.
  - Existing Tauri commands remain available while Vue 2 components gradually replace imperative DOM rendering.
  - A transitional store/service layer isolates command calls from component code.

## Risks / Trade-offs
- Risk: Migration touches both frontend and backend storage at once.
  - Mitigation: phase-by-phase rollout with compatibility readers and focused regression tests.

- Risk: Snapshot storage may grow quickly for active endpoints.
  - Mitigation: retention policy, scheduled compaction, and configurable backup cadence.

- Risk: Plugin abstraction can add complexity too early.
  - Mitigation: only extract the contracts required by WebDAV and Telegram Bridge first; avoid speculative plugin marketplace features.

## Migration Plan
1. Add workspace abstractions and compatibility readers/writers for current settings, DB, and runtime directories.
2. Add change-log and snapshot storage for history-related files without changing current user operations.
3. Add integration runtime interfaces and migrate WebDAV/Telegram bridge launch paths to the new contracts.
4. Move frontend to Vue 2 with preserved command API and behavior-compatible views.
5. Replace home feed loading with stable boundary-based pagination and verify deletion/refresh/search interactions.
6. Enable scheduled automatic backups and history restore UI/actions.

## Verification Strategy
- Rust tests for workspace path resolution, migration compatibility, change-log writes, snapshot retention, and plugin runtime behavior.
- Frontend checks for home feed load-more reliability, marked list, downloads list, settings flows, and endpoint switching.
- Focused regression on WebDAV sync, Telegram bridge, local history restore, and backup creation/restoration.

## Open Questions
- None blocking for the proposal. Retention defaults can be finalized during implementation as long as the design remains local-first and reversible.
