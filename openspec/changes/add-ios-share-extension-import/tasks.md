# Tasks

## 1. iOS share extension scaffold

- [x] 1.1 Add `com.transfergenie.ShareExtension` to `gen/apple/project.yml` with its Info.plist, entitlements, share-services activation rule, and host app embedding; regenerate the Xcode project with XcodeGen and verify `xcodebuild -list` shows the host target and embedded extension.
- [x] 1.2 Add the `group.com.transfergenie` App Group entitlement to both the host app and extension, and register the `transfergenie` URL scheme in the iOS Info merge inputs; verify the generated app Info.plist contains the scheme and `codesign -d --entitlements :-` shows the group on both bundles.
- [x] 1.3 Add shared manifest and secure file-name helpers usable by the extension and importer; verify Swift tests cover schema version, UUID validation, sanitized duplicate names, and rejection of traversal paths.

## 2. Durable share receipt

- [x] 2.1 Implement ordered `NSItemProvider` intake for up to 10 images, movies, and files with streamed, coordinated copies into `<batch-uuid>.partial`; verify tests prove source removal after copying does not affect the staged file.
- [x] 2.2 Commit a batch only after every file and `manifest.json` is written by atomically renaming the partial directory; verify tests never expose incomplete batches and clean only abandoned partial directories.
- [ ] 2.3 Build the extension confirmation and progress UI, including cancel, unsupported-type, partial-failure, and success states; verify labels and accessibility identifiers from a Simulator share-sheet smoke test.
- [x] 2.4 Open `transfergenie://share-import?batch=<uuid>` after a committed batch and leave the batch intact when opening fails; verify with an injected failing open handler that no data is lost.

## 3. Main app import and routing

- [x] 3.1 Add `mobile-integration` commands to list, stage, and acknowledge complete share batches while validating batch IDs, manifest paths, file sizes, and App Group containment; verify Swift tests cover forged IDs, symlink escapes, duplicate names, and retry idempotency.
- [x] 3.2 Stage share files into deterministic `MobileImports/<batch-uuid>/<import-name>` paths and skip files already present; verify repeated staging produces one attachment path per manifest file.
- [x] 3.3 Handle iOS `RunEvent::Opened` for the share URL and emit a frontend import notification without consuming the inbox; verify Rust URL parsing tests cover cold launch, warm delivery, unknown schemes, and malformed batch IDs.
- [x] 3.4 Scan complete share batches after mobile initialization and foreground recovery, and retain them while the user is signed out or has no active space; verify mocked runtime tests show no loss and no import before readiness.

## 4. Composer integration

- [x] 4.1 Add controller support to append imported share attachments without replacing existing draft text, format, tags, due date, or attachments; verify controller tests cover empty drafts, recoverable drafts, duplicate deliveries, and missing staged files.
- [x] 4.2 Persist the merged draft before acknowledging the shared batch, and show `已从分享添加 N 个文件` plus actionable failure feedback; verify a forced draft-save failure leaves the batch retryable and never reports the share as complete.
- [x] 4.3 Route warm share events into the active Composer and cold-start pending imports into a ready Composer page without a blank intermediate draft; verify browser tests for cold start, warm composer, signed-out resume, and no automatic send.
- [x] 4.4 Document the visible external-share flow and troubleshooting in `docs/develop/ios.md`; verify the documented commands and file paths match the implemented project.

## 5. Signing and build verification

- [x] 5.1 Extend the wireless and virtual deployment verification to require a signed `PlugIns/*.appex`, the share extension point, and App Group entitlements on both bundles; run the scripts' check-only paths and verify invalid fixtures fail with actionable errors.
- [x] 5.2 Update XcodeGen regeneration and `.xcscheme`/archive handling so a project regeneration preserves the extension and host embedding; verify a clean `xcodegen generate` followed by an archive contains exactly one host app and its extension.
- [x] 5.3 Update the release/build documentation with the Apple Developer App Group and extension provisioning prerequisites; verify a fresh checkout can follow the documented setup without editing generated `project.pbxproj` by hand.

## 6. Integration acceptance

- [x] 6.1 Run focused Swift, Rust, and mobile frontend tests covering intake, staging, URL routing, draft persistence, and failure recovery; record the exact commands and passing output in the change verification notes.
- [ ] 6.2 Build and launch a Simulator archive, then verify sharing from Photos and Files produces one Composer draft with the expected attachments and no duplicate after reopening the app.
- [ ] 6.3 On the authoritative physical iPhone, verify Photos, Files, and a third-party share source; cover cold start, warm app, existing draft, signed-out state, large iCloud item failure/fallback, and in-place upgrade with retained app data.
- [x] 6.4 Run `openspec validate add-ios-share-extension-import --strict` and resolve every specification or artifact validation error.

## Workflow follow-up

- Archive the change only after the implementation and device acceptance are complete.
- Run `openspec validate --strict` after archiving.
