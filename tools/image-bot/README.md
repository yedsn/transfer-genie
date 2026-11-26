The release build prepares the platform-native image bot executable here.
It is bundled as an application resource and is not committed to Git.

macOS universal builds compile both aarch64-apple-darwin and
x86_64-apple-darwin, then combine them with lipo. Install both Rust targets
before building with TAURI_ENV_TARGET_TRIPLE=universal-apple-darwin.
Native Unix resources are explicitly made executable before bundling.
