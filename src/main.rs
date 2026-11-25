#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    if std::env::args().any(|arg| arg == "--image-bot") {
        if let Err(error) = transfer_genie::run_image_bot() {
            eprintln!("{error}");
            std::process::exit(1);
        }
        return;
    }
    transfer_genie::run();
}
