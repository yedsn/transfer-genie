# Third-party notices

## FFmpeg

Transfer Genie bundles pinned FFmpeg sidecars from the `eugeneware/ffmpeg-static` `b6.1.1` release matrix for extracting a still preview image from uploaded videos. The Windows x64 and macOS Intel executables report FFmpeg 6.1.1; the published macOS Apple Silicon executable reports FFmpeg 6.0. Every target is pinned by archive and executable SHA-256. The binaries are distributed under GPL-3.0-or-later and are invoked as a separate program. Transfer Genie itself is also distributed under AGPL-3.0-or-later.

FFmpeg project: https://ffmpeg.org/
FFmpeg 6.1.1 source: https://github.com/FFmpeg/FFmpeg/tree/n6.1.1
Binary release: https://github.com/eugeneware/ffmpeg-static/releases/tag/b6.1.1
Binary manifest and checksums: `tools/ffmpeg/sidecars.json`

The matching upstream license and build README are downloaded, checksum-verified, and included beside the executable in every bundle. When the sidecar is absent, Transfer Genie safely skips video preview generation without blocking the original upload.
