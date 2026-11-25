// Share the protocol and downloader implementation with the host's tests while
// building a separate executable without Tauri or application startup.
#[path = "../../../../src/plugin_protocol.rs"]
mod plugin_protocol;
#[path = "../../../../src/image_bot.rs"]
mod image_bot;

fn main() {
    if let Err(error) = image_bot::run() {
        eprintln!("{error}");
        std::process::exit(1);
    }
}
