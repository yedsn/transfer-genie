#[allow(dead_code)]
#[path = "../filenames.rs"]
mod filenames;
#[allow(dead_code)]
#[path = "../history.rs"]
mod history;
#[path = "../telegram_bridge.rs"]
mod telegram_bridge;
#[allow(dead_code)]
#[path = "../types.rs"]
mod types;
#[allow(dead_code)]
#[path = "../webdav.rs"]
mod webdav;

use log::{Level, LevelFilter, Metadata, Record};

struct SimpleLogger;

impl log::Log for SimpleLogger {
    fn enabled(&self, metadata: &Metadata<'_>) -> bool {
        metadata.level() <= Level::Info
    }

    fn log(&self, record: &Record<'_>) {
        if self.enabled(record.metadata()) {
            eprintln!("[{}] {}", record.level(), record.args());
        }
    }

    fn flush(&self) {}
}

static LOGGER: SimpleLogger = SimpleLogger;

#[tokio::main]
async fn main() {
    let _ = log::set_logger(&LOGGER).map(|()| log::set_max_level(LevelFilter::Info));
    if let Err(err) = telegram_bridge::run().await {
        eprintln!("{err}");
        std::process::exit(1);
    }
}
