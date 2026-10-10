# FFmpeg sidecar

Transfer Genie looks for the current platform's pinned FFmpeg executable in this directory when generating video preview images.

- Windows: `tools/ffmpeg/ffmpeg.exe`
- macOS: `tools/ffmpeg/ffmpeg`

Release packaging supplies the target-platform binary. Development may also set `TRANSFER_GENIE_FFMPEG` to an explicit executable path. If FFmpeg is unavailable, video upload remains successful and the interface falls back to a video placeholder.

`sidecars.json` pins public assets from the `ffmpeg-static` `b6.1.1` release matrix for Windows x64, macOS Intel, and macOS Apple Silicon, including each executable's reported version, archive size, SHA-256, license, build README, and upstream source tag. The published Windows x64 and macOS Intel executables report FFmpeg 6.1.1, while the published macOS Apple Silicon executable reports FFmpeg 6.0. The release workflow selects the matching target, verifies every downloaded file and that target's exact reported-version prefix, and only then starts the Tauri bundle. No private download URL or checksum secret is required.

Do not commit downloaded binaries directly. To update the FFmpeg release matrix, update every target and its `reportedVersion` in `sidecars.json`, the bundle release version constant in `src/media_preview.rs`, and the third-party notice together, then execute the preparation and verification scripts for each supported target in CI.
