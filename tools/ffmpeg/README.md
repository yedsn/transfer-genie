# FFmpeg sidecar

Transfer Genie looks for a pinned FFmpeg `6.1.1` executable in this directory when generating video preview images.

- Windows: `tools/ffmpeg/ffmpeg.exe`
- macOS: `tools/ffmpeg/ffmpeg`

Release packaging supplies the target-platform binary. Development may also set `TRANSFER_GENIE_FFMPEG` to an explicit executable path. If FFmpeg is unavailable, video upload remains successful and the interface falls back to a video placeholder.

`sidecars.json` pins public `ffmpeg-static` release assets for Windows x64, macOS Intel, and macOS Apple Silicon, including the archive size, SHA-256, license, build README, and upstream source tag. The release workflow selects the matching target, verifies every downloaded file, verifies that the executable reports FFmpeg 6.1.1, and only then starts the Tauri bundle. No private download URL or checksum secret is required.

Do not commit downloaded binaries directly. To update FFmpeg, update every target in `sidecars.json`, the version constant in `src/media_preview.rs`, and the third-party notice together, then execute the preparation and verification scripts for each supported target in CI.
