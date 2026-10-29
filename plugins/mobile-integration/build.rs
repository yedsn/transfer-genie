const COMMANDS: &[&str] = &[
    "diagnostic",
    "set_navigation_gestures_enabled",
    "navigate_native_page",
    "select_media",
    "select_documents",
    "preview_file",
    "share_file",
    "generate_image_thumbnail",
    "generate_video_poster",
    "cancel_video_poster",
];

fn main() {
    tauri_plugin::Builder::new(COMMANDS)
        .android_path("android")
        .ios_path("ios")
        .build();
}
