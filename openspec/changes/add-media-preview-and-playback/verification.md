# Verification

## Result

The media preview and playback change is implemented and verified on Windows with the real Tauri WebView2 application. Automated coverage exercises preview generation, upload entry points, playback cache behavior, media UI lifecycle, bulk-selection isolation, and existing application regressions.

macOS release inputs are pinned and audited for both Apple Silicon and Intel, and the release workflow uses native architecture-specific runners. This workstation cannot produce or launch macOS `.app`/`.dmg` bundles, so the final native macOS bundle execution remains a release-CI verification item.

## FFmpeg sidecar and packaging

- Version: FFmpeg `6.1.1`, release tag `b6.1.1` from `eugeneware/ffmpeg-static`.
- License: GPL-3.0-or-later; `THIRD_PARTY_NOTICES.md`, the matching upstream license, build README, and `tools/ffmpeg/sidecars.json` are included as bundle resources.
- Pinned archive SHA-256 values:
  - Windows x64: `8883a3dffbd0a16cf4ef95206ea05283f78908dbfb118f73c83f4951dcc06d77`
  - macOS Apple Silicon: `8923876afa8db5585022d7860ec7e589af192f441c56793971276d450ed3bbfa`
  - macOS Intel: `929b375c1182d956c51f7ac25e0b2b0411fb01f6f407aa15c9758efeb4242106`
- Pinned decompressed executable SHA-256 values:
  - Windows x64: `04e1307997530f9cf2fe35cba2ca7e8875ca91da02f89d6c7243df819c94ad00`
  - macOS Apple Silicon: `a90e3db6a3fd35f6074b013f948b1aa45b31c6375489d39e572bea3f18336584`
  - macOS Intel: `ebdddc936f61e14049a2d4b549a412b8a40deeff6540e58a9f2a2da9e6b18894`
- `scripts/verify_ffmpeg_manifest.ps1 -CheckRemoteMetadata -CheckArchives` verified the public release metadata, downloaded archive hashes, license/readme hashes, and executable architecture headers for PE x64, Mach-O arm64, and Mach-O x86_64. The network-only audit was also run through the local proxy after direct GitHub asset download stalled.
- `scripts/prepare_ffmpeg_sidecar.ps1` now verifies both the pinned archive hash and the decompressed executable hash before accepting a sidecar.
- FFmpeg artifact downloads retry transient GitHub/CDN failures up to three times, and the verification workflow writes a stage-specific JSON report even when preparation fails before bundle creation.
- `scripts/verify_release_bundle.ps1` verifies the finished bundle:
  - Windows: latest NSIS installer hash, generated installer resource list, and packaged FFmpeg executable hash/version.
  - macOS: mounts the latest DMG, verifies required resources and FFmpeg hash, resolves the application binary from `CFBundleExecutable`, checks FFmpeg and application Mach-O architecture, and optionally launches the packaged application for 8 seconds with isolated app data and a harmless smoke-test argument.
  - On failure, the script exits non-zero, prints the concrete error in the Actions log, and writes a JSON report containing the same error plus every bundle field that had already been verified.
- Local Windows debug bundle verification passed and produced `target/release-verification/windows-x64.json`.
- `actionlint v1.7.12` validated both `release.yml` and the new `verify-release-bundles.yml`.
- `release.yml` now runs `verify-release-bundles.yml` as a pre-publish gate, so bundles are verified before the release job publishes assets.
- `scripts/verify_ffmpeg_bundle.ps1` verified the local Windows executable reports FFmpeg 6.1.1 and all metadata files are present.
- Rust path tests cover the Windows installed resource path and macOS `.app/Contents/Resources/tools/ffmpeg/ffmpeg` candidate.
- Native Windows package command:
  - `npx tauri build --debug --bundles nsis --config '{"bundle":{"createUpdaterArtifacts":false}}'`
  - Output: `target/debug/bundle/nsis/Transfer Genie_0.4.39_x64-setup.exe`
  - Size: `34,315,879` bytes (about 32.7 MiB).
  - Generated NSIS script contains `ffmpeg.exe`, `FFMPEG_LICENSE.txt`, `FFMPEG_BUILD_README.txt`, `README.md`, `sidecars.json`, and `THIRD_PARTY_NOTICES.md`.
- Missing/invalid FFmpeg behavior is covered by `preview_generation_failure_does_not_change_upload_success_or_history`: the original upload and completed upload history remain successful while no preview is published.

## Rust verification

Commands:

- `cargo fmt -- --check`
- `cargo test`

Results:

- Telegram bridge binary: 39 passed.
- Main desktop binary: 216 passed after the cross-platform bundle-path test was added.
- Relevant direct evidence includes:
  - versioned preview paths, month buckets, encoded/special filenames, endpoint-scoped cache keys, and legacy `.thumbs`;
  - JPEG size limits, real/fake FFmpeg extraction, paths with spaces, invalid media, bounded stderr, timeout cleanup, and bounded generation concurrency;
  - path upload, byte upload, real local HTTP multipart upload with request-temp cleanup, and upload-success behavior when preview generation fails;
  - preview resolution order across local, remote, legacy local/remote, missing resources, and endpoint isolation;
  - local/remote preview cleanup without touching user downloads;
  - playback source precedence, camelCase result/progress contracts, remote download deduplication, progress, cancellation, atomic completion, failure cleanup, and retry;
  - playback cache does not update message `local_path`, download history, or bulk-download status;
  - cache limit/age cleanup, oldest-first order, active-file protection, endpoint isolation, and path-boundary protection.

## Frontend and browser verification

- 批量下载弹框的音视频播放入口已移入缩略图悬停/聚焦层；音频点击后使用卡片内覆盖播放器，自动化验证平铺、详细信息、列表、小图标和大图标五种视图在打开及收起播放器前后尺寸保持不变，且播放控件不改变选择状态或启动矩形框选。

Commands:

- All `tests/test_*.js` files, with `test_local_http_api.js --help` for the interactive HTTP smoke script.
- `npm run build`.

Results:

- Media runtime, bulk download runtime, feed state/view model, settings runtime, Vue bridge, workspace, and browser UI smoke tests passed.
- Production `vue-tsc` and Vite build passed.
- Browser coverage verifies:
  - media classification by extension/MIME, decode capability fallback, and single active media session;
  - pending image preview, audio/video controls, single-session switching, removal cleanup, and no implicit send;
  - real clipboard-file event routes image bytes through `send_file_data`;
  - message image/video preview, ordinary and speech-source audio playback, load/progress/cancel, duplicate suppression, retry, unsupported-format fallback, and download/system-open actions;
  - close button, Escape, backdrop, message switch, endpoint switch, page change, and message delete stop playback; closing preserves message-list scroll state;
  - bulk image/video lazy previews, missing-preview fallback, four-request concurrency cap, video overlay, inline audio playback with play/pause, current/total time and draggable progress, one active media, category/page/view/modal cleanup;
  - clicking, long-pressing, and dragging media controls does not change selection or start rectangle selection; existing page selection and download queue behavior remains correct.

## Real desktop media matrix

Command: `node tests/test_desktop_media_e2e.js`

The script starts an isolated real `transfer-genie.exe`, a local WebDAV fixture, and the actual Tauri WebView2 UI. It generated and uploaded real media fixtures using the bundled FFmpeg. Each run now uses an isolated WebView2 data directory, recognizes both the Vite development URL and the bundled `tauri.localhost` URL, detects early application exit, and preserves startup output in timeout errors. This keeps the real-desktop check stable after either a development build or a packaged build.

Verified formats and behavior:

- PNG: generated preview and full-screen image preview.
- MP3 and WAV: application playback and close lifecycle.
- MP4/H.264 and WebM/VP9: generated video covers and application playback.
- MKV/FFV1: classified as video and displayed the unsupported in-app playback message while retaining fallback actions.
- Endpoint A/B previews resolved to different endpoint-scoped cache paths.
- Removing the uploaded MP4 local copy forced a real WebDAV fetch; the returned source was `remoteCache`.
- After playback caching, the same media remained `notDownloaded` in bulk download resources.
- The bulk audio card rendered the custom inline player, loaded real MP3 metadata, enabled its seek bar, and displayed current/total time.
- Bulk media controls did not change the selected state.

## Remaining release-CI evidence

The repository release matrix now prepares and verifies the pinned sidecar on:

- `macos-15` / `aarch64-apple-darwin`;
- `macos-15-intel` / `x86_64-apple-darwin`;
- `windows-latest` / x64.

Windows was built locally. Native macOS `.app`/`.dmg` production and launch evidence must come from the next release workflow run on those two native runners.

The first native macOS Intel run successfully built and mounted the DMG and verified its packaged resources and FFmpeg executable, then exposed a launch-verifier bug: the verifier selected the first file under `Contents/MacOS`, which could be the auxiliary `telegram_bridge` binary instead of the application entry point. That helper correctly looked for `telegram-bridge.json` and exited. The verifier now reads the exact `CFBundleExecutable` from `Info.plist` and passes a harmless `--release-smoke-test` argument. A follow-up native run is still required before marking the macOS tasks complete.

The new `verify-release-bundles.yml` workflow now builds the same three targets on pull requests, manual dispatch, pushes to `master`, and as a pre-publish gate in `release.yml`, then runs the finished-bundle verifier and uploads the JSON report. It has not yet been executed in GitHub Actions from this working tree, so the native macOS evidence is still pending until those runs complete.
