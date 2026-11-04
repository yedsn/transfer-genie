# Design

## Context

See `proposal.md` for motivation and `specs/mobile-external-share/spec.md` for the behavior contract. The iOS project is generated from `gen/apple/project.yml`, currently contains one application target, and is built from the Tauri-generated Xcode project. The existing `mobile-integration` plugin already owns native photo/document pickers and copies imported files into `Application Support/TransferGenie/MobileImports`; the mobile Composer persists those paths in an account- and space-scoped draft.

## Goals / Non-Goals

**Goals:**

- Add a system share entry for images, videos, and files without duplicating the Composer UI in an extension.
- Make receipt durable across extension termination, app suspension, cold launch, and repeated URL delivery.
- Hand share batches to the existing Composer draft and existing local-first send queue.
- Keep the new native target, entitlement, and signing work reproducible from checked-in project inputs.

**Non-Goals:**

- Automatically sending shared content without user confirmation.
- Supporting Android `ACTION_SEND`, web-share, or URL/text-only sharing in this change.
- Adding multiple simultaneous app drafts or changing the message schema to support one message with multiple attachments.
- Uploading directly from the share extension or bypassing the existing sync queue.

## Decisions

### Use an iOS Share Extension with a shared inbox

Create a `com.transfergenie.ShareExtension` target with an `NSExtensionPointIdentifier` of `com.apple.share-services`. Its activation rule accepts up to 10 images, movies, and generic files. This is the only option that places Transfer Genie in the system share sheet for Photos, Files, and arbitrary apps while preserving access to each app's `NSItemProvider` output.

The extension will have a small custom confirmation/progress screen rather than embedding the Vue Composer. This avoids loading the Tauri runtime and duplicate draft/account state in an extension process. The extension only receives and stages files; the main app owns account selection, drafts, and sending.

### Use an App Group inbox with atomic batches

The app and extension share `group.com.transfergenie`. The extension writes each share into:

```text
<app-group>/TransferGenieShareInbox/
  <batch-uuid>.partial/
    manifest.json
    files/0001-original-name.ext
    files/0002-original-name.ext
  <batch-uuid>/
    manifest.json
    files/0001-original-name.ext
    files/0002-original-name.ext
```

`manifest.json` contains a schema version, batch ID, creation time, and ordered file records (`fileId`, `importName`, `originalName`, `contentType`, `sizeBytes`). A batch is visible to the app only after every file has been copied and the directory has been atomically renamed from `.partial` to `<batch-uuid>`. The next scan may remove abandoned `.partial` directories, but must never delete a complete unacknowledged batch.

This inbox is deliberately separate from `MobileImports`. Extensions cannot write the host app's private Application Support directory, and the app's existing draft path validation expects files in its own sandbox.

### Stage, persist, then acknowledge

The main app imports a complete batch in this order:

1. The `mobile-integration` plugin validates the batch ID and manifest paths.
2. Files are copied to `MobileImports/<batch-uuid>/<importName>` using streaming/copy-on-write file operations and the existing security checks. The deterministic directory and file names make retries overwrite or reuse the same staged paths.
3. The mobile controller appends attachments whose paths are not already in the Composer and shows `已从分享添加 N 个文件`.
4. The controller persists the current Composer draft using the existing account/space-scoped draft API.
5. Only after that save succeeds does the plugin delete the App Group batch.

If the app exits between 2 and 4, the shared batch remains. The next import reuses the same staged paths and skips attachments already present in the restored draft. This provides idempotency without a second database or a new message data model.

Repeated `transfergenie://share-import?batch=<uuid>` notifications are treated as hints. The import command scans complete batches and tracks staged paths, so duplicate URL delivery does not duplicate attachments.

### Open Composer after readiness, with foreground scanning as fallback

Add `transfergenie` to the host app's `CFBundleURLTypes`. The extension attempts to open `transfergenie://share-import?batch=<uuid>` after committing a batch. The Rust run loop handles iOS `RunEvent::Opened`, forwards the URL to the mobile integration layer, and emits a frontend event.

The online URL path is not sufficient by itself: opening an app from a share extension can fail or arrive before initialization. The app therefore also scans complete App Group batches after mobile initialization and on foreground recovery. A pending batch remains invisible to the user while the app is unauthenticated or has no active space; after the user signs in and selects a space, the normal import path resumes.

### Reuse the current Composer and draft scope

External share attachments enter the Composer for the active Supabase account and storage space. If a recoverable draft exists, preserve its text, format, mark metadata, and existing attachments and append the share files. If no draft exists, initialize format from the normal default-format setting. Opening or importing a share does not send.

The mobile shell owns the native child-page transition. It will expose a single `openComposerForExternalShare` path used by both warm events and cold-start pending batches. Direct controller tests can exercise import and draft persistence without the native transition.

### Keep native and build integration reproducible

Update `gen/apple/project.yml` to add the extension target, extension bundle identifier, Info.plist, entitlements, and embedding relationship. Keep the generated `.xcodeproj` in sync with XcodeGen. Add `com.apple.security.application-groups` to both entitlement files and verify the URL scheme survives the Tauri Info.plist merge.

The archive verification path must additionally confirm:

- the host app contains `PlugIns/*.appex`;
- the extension is signed and has the expected share extension point;
- both embedded provisioning profiles include the App Group and required extension identifier;
- the app can still launch when the extension is unavailable.

Signing setup in the Apple Developer account remains a release precondition: App Groups and the Share Extension bundle identifier must be enabled for both provisioning profiles before a device archive can be valid.

## Risks / Trade-offs

- **Large iCloud or video files may exceed the extension's execution window** → copy sequentially with progress UI, avoid loading contents into memory, fail with an actionable message, and keep the normal in-app picker as a fallback.
- **App Group provisioning can invalidate signing or require portal changes** → validate both entitlements and embedded profiles in the build scripts, and document the capability setup before device installation.
- **Custom URL delivery can be delayed or dropped** → treat URL opening as a hint and scan the durable inbox on startup and foreground recovery.
- **A draft persistence failure can leave staged files without a visible attachment** → retain the shared batch until persistence succeeds and make staging deterministic so retries are idempotent.
- **Xcode project regeneration can remove a manually added extension** → define the target in `project.yml` and add an archive/smoke check for the embedded `.appex`.
- **Sharing into an unrelated existing draft could surprise the user** → keep the existing draft intact, append attachments, and show explicit import feedback before the user sends.

## Migration Plan

1. Ship the extension and App Group entitlement with the next iOS build; no existing database schema or user settings migration is required.
2. On first launch after upgrade, scan only complete batches in the new App Group inbox; ignore or clean abandoned `.partial` directories.
3. If the extension is disabled or fails to open the host app, the app can still process any complete batch on its next foreground scan.
4. For rollback, remove the extension target and URL handler; leave existing `MobileImports` files and drafts untouched. Unprocessed complete share batches remain isolated in the App Group directory.

## Open Questions

None for the initial iOS implementation. Android delivery and multi-attachment single-message semantics remain separate future changes.
