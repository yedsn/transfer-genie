use std::path::Path;
use time::OffsetDateTime;

pub const DEFAULT_RULE: &str = "{filename}.{file_suffix}";

pub fn normalize_save_filename_rule(raw: &str) -> String {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        DEFAULT_RULE
    } else {
        trimmed
    }
    .to_string()
}

pub fn sanitize_filename(name: &str) -> String {
    Path::new(name)
        .file_name()
        .and_then(|value| value.to_str())
        .filter(|value| !value.trim().is_empty())
        .unwrap_or("download.bin")
        .to_string()
}

pub fn build_save_filename(rule: &str, original_name: &str, timestamp_ms: i64) -> String {
    let rule = normalize_save_filename_rule(rule);
    let original = sanitize_filename(original_name);
    let path = Path::new(&original);
    let name = path
        .file_stem()
        .and_then(|value| value.to_str())
        .filter(|value| !value.trim().is_empty())
        .unwrap_or("download");
    let suffix = path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("");
    let rule = if suffix.is_empty() {
        rule.replace(".{file_suffix}", "")
    } else {
        rule
    };
    let date = OffsetDateTime::from_unix_timestamp_nanos(i128::from(timestamp_ms) * 1_000_000)
        .unwrap_or_else(|_| OffsetDateTime::now_utc());
    let date = format!(
        "{:04}{:02}{:02}",
        date.year(),
        u8::from(date.month()),
        date.day()
    );
    sanitize_filename(
        &rule
            .replace("{yyyymmdd}", &date)
            .replace("{filename}", name)
            .replace("{file_suffix}", suffix),
    )
}
