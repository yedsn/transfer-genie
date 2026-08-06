## Context

Transfer Genie already has backup-related settings and runtime code for scheduled local backup archives, local data backup ZIP files, and settings snapshots. Existing cleanup logic is driven by count-based archive retention or date-window snapshot retention, but records do not consistently distinguish automatic backups from user-created backups with user-visible names and notes.

This change adds a manual backup concept across the local backup archive and snapshot surfaces while keeping automatic cleanup focused on automatic records only.

## Goals / Non-Goals

**Goals:**

- Persist a user-configurable maximum count for automatic local backup archives.
- Allow users to create manual backups from both the local backup archive page and the snapshot page.
- Persist manual backup metadata: name, note, creation time, source/type, and whether the backup is manual.
- Exclude manual backups from automatic cleanup.
- Show manual backup name and note in backup lists after reload.

**Non-Goals:**

- Do not change the ZIP payload format for WebDAV backup or local data backup unless metadata sidecars require it.
- Do not add cloud upload, encryption, or scheduling changes.
- Do not remove the existing date-window cleanup fields for local data snapshots unless implementation proves they are redundant.

## Decisions

- Decision: Store manual-vs-automatic and user text metadata alongside backup records rather than inferring it from filenames.
  - Rationale: Filenames are user-visible and brittle as a behavioral contract. Metadata is explicit and can remain backward-compatible by defaulting missing records to automatic with empty name/note.
  - Alternative considered: Prefix manual files with `manual-`. This is useful as a display hint but insufficient for older records and future renames.

- Decision: Automatic archive count cleanup SHALL filter to automatic records only.
  - Rationale: The setting is named as an automatic retention limit, and manual records are intentionally long-lived.
  - Alternative considered: Apply a global cap to all backups. This violates the requirement that manual backups are outside cleanup scope.

- Decision: Use one manual backup dialog component/state for both pages, with a target/type argument.
  - Rationale: Name/note validation, loading state, and save behavior are identical. The command target determines whether to create a local backup archive or a settings snapshot.

- Decision: Keep name optional but normalize whitespace; keep note optional and preserve user-entered line breaks if the UI supports multiline input.
  - Rationale: Users may want quick manual backups without forced naming, while notes should remain readable after reload.

## Risks / Trade-offs

- Existing backup records have no manual metadata -> Treat missing `manual` as false and missing text fields as empty during deserialization/listing.
- Automatic cleanup currently scans files directly in some paths -> Update cleanup to consult metadata where available or only target known automatic filenames/records.
- Manual backups can grow without bound -> This is intended by the requirement; users can still delete/clear manually through existing or later management actions.
- Chinese UI text touches existing HTML/JS files -> Read and write with UTF-8 and verify visible Chinese strings after edits.

## Migration Plan

- Add serde defaults for new metadata fields so existing settings and backup record JSON files continue loading.
- Backfill list responses at runtime with `manual: false`, empty name, and empty note for old records.
- Keep existing cleanup behavior for automatic records, but skip records marked manual.
