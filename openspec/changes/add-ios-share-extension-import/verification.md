# Verification notes

## 2026-11-04 continuation

- OpenSpec status: all four planning artifacts complete. Strict change validation passed.
- `node tests/test_ios_virtual_deploy.mjs`: passed.
- `npm run ios:simulator:deploy`: archive, in-place install, and launch passed after removing team-scoped entitlements from Simulator ad-hoc signing. Both bundles retain the App Group; pluginkit registers the extension.
- Photos system share sheet displays Transfer Genie. Confirmation and durable receipt were exercised with IMG_0002.JPG (2,567,402 bytes). Opening the host from the extension failed; the batch remained available.
- Manual host opening exposed missing default plugin ACL permissions. After adding list/stage/acknowledge permissions and redeploying, startup imported the retained photo, displayed its Composer preview, saved the draft, and acknowledged the inbox batch. No send action was performed.
- A complete Files share flow, reopening without duplicate attachments, and physical-device acceptance remain unverified. The previously reported physical-device provisioning profile/App Group mismatch remains outstanding.

The requested proposal artifacts are complete. Existing implementation work is retained, but full acceptance is not complete and the change must not be archived yet.

## Automated revalidation

- `cargo test`: 406 library tests and 43 integration tests passed; 2 ignored. Output: /tmp/tg-share-cargo-test.log.
- `xcodebuild test -project gen/apple/transfer-genie.xcodeproj -scheme ShareExtensionTests -destination platform=iOS\ Simulator,id=6719E14E-8424-49B1-B96D-CB0A609311EA -derivedDataPath /tmp/tg-share-derived CODE_SIGNING_ALLOWED=NO -test-timeouts-enabled YES -default-test-execution-time-allowance 15`: 12 passed, zero failures. Output: /tmp/tg-share-swift-test.log.
- `node tests/test_mobile_share_import.js`: passed, including effective generated ACL grants, merge, save-before-ack, retries, retention, and no automatic send.
- `node tests/test_ios_share_archive.mjs`, `node tests/test_ios_virtual_deploy.mjs`, and `node tests/test_ios_wireless_confirmation.mjs`: passed. Wireless confirmation uses stubbed hardware/build tools.
- Browser regression rerun with Microsoft Edge failed at test_mobile_share_import_browser.js:108, waiting for the second warm-share attachment and acknowledgement. Cold-start assertions before that point passed. Task 4.3 remains incomplete.
- Task 2.3 retains its actual share-sheet accessibility verification gate. Files, restart deduplication, and physical acceptance remain outstanding.

## Warm-share notification race fix

The shell reused the current import/navigation promise when another share arrived while Composer was opening. That notification could finish without scanning its new batch. The shell now records another scan request and drains it before finishing the current run. Startup/ready notifications may safely cause additional list calls; staging and acknowledgement remain once per batch.

- `npm run typecheck`: passed.
- `node tests/test_mobile_share_import.js`: passed.
- `CHROME_PATH=/Applications/Microsoft\ Edge.app/Contents/MacOS/Microsoft\ Edge node tests/test_mobile_share_import_browser.js`: passed after the fix, covering cold start, warm draft preservation, duplicate notifications, signed-out recovery, and no automatic send.

## Device acceptance follow-up

- `xcrun devicectl list devices` currently reports the physical iPhone as unavailable; physical acceptance cannot run in this state. The Simulator remains connected.
- Files displays the 43-byte `TG-SHARE-20261104-note.txt` fixture and its long-press context menu. Desktop input attempts dismissed that menu without displaying a share sheet. This does not establish extension receipt or a product failure; Files end-to-end acceptance remains pending.
- The currently installed Simulator app predates the warm-share notification race fix. Browser coverage of that fix must not be described as installed native acceptance. Existing drafts and app data were retained.
- Strict OpenSpec validation passed again. Tasks 2.3, 6.2, and 6.3 remain unchecked.
- A further attempt captured the settled DeviceHub context menu before clicking Share, with the same dismissal and no share sheet. The conventional Simulator.app is absent at the selected Xcode developer directory, so that alternate GUI path is unavailable. Physical iPhone availability was rechecked and remains unavailable. `git diff --check` passed. Completing the remaining native acceptance requires a functioning system-share interaction path and an available, correctly provisioned physical iPhone.
