# Third-party notices

## FFmpeg

Transfer Genie bundles an FFmpeg 6.1.1 sidecar for extracting a still preview image from uploaded videos. The binaries are distributed by the `eugeneware/ffmpeg-static` project under GPL-3.0-or-later and are invoked as a separate program. Transfer Genie itself is also distributed under AGPL-3.0-or-later.

FFmpeg project: https://ffmpeg.org/
FFmpeg 6.1.1 source: https://github.com/FFmpeg/FFmpeg/tree/n6.1.1
Binary release: https://github.com/eugeneware/ffmpeg-static/releases/tag/b6.1.1
Binary manifest and checksums: `tools/ffmpeg/sidecars.json`

The matching upstream license and build README are downloaded, checksum-verified, and included beside the executable in every bundle. When the sidecar is absent, Transfer Genie safely skips video preview generation without blocking the original upload.
