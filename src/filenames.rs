use percent_encoding::{percent_decode_str, utf8_percent_encode, AsciiSet, NON_ALPHANUMERIC};
use rand::Rng;
use time::OffsetDateTime;

const SAFE_FILENAME: &AsciiSet = &NON_ALPHANUMERIC
    .remove(b'-')
    .remove(b'.')
    .remove(b'_')
    .remove(b'~');

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MessageKind {
    Text,
    File,
}

impl MessageKind {
    pub fn as_str(self) -> &'static str {
        match self {
            MessageKind::Text => "text",
            MessageKind::File => "file",
        }
    }
}

#[derive(Debug, Clone)]
pub struct ParsedFilename {
    pub timestamp_ms: i64,
    pub sender: String,
    pub original_name: String,
    pub kind: MessageKind,
}

pub fn encode_component(value: &str) -> String {
    utf8_percent_encode(value, SAFE_FILENAME).to_string()
}

pub fn decode_component(value: &str) -> String {
    percent_decode_str(value).decode_utf8_lossy().to_string()
}

pub fn build_message_filename(sender: &str, original_name: &str, timestamp_ms: i64) -> String {
    let mut rng = rand::thread_rng();
    let nonce: u32 = rng.gen();
    let sender_enc = encode_component(sender);
    let name_enc = encode_component(original_name);
    format!(
        "{}__{}__{:08x}__{}",
        timestamp_ms, sender_enc, nonce, name_enc
    )
}

pub fn parse_message_filename(filename: &str) -> Option<ParsedFilename> {
    let mut parts = filename.splitn(4, "__");
    let ts_str = parts.next()?;
    let sender_enc = parts.next()?;
    let _nonce = parts.next()?;
    let name_enc = parts.next()?;

    let timestamp_ms: i64 = ts_str.parse().ok()?;
    let sender = decode_component(sender_enc);
    let original_name = decode_component(name_enc);
    let name_lower = original_name.to_lowercase();
    let kind = if name_lower.ends_with(".txt") || name_lower.ends_with(".md") {
        MessageKind::Text
    } else {
        MessageKind::File
    };

    Some(ParsedFilename {
        timestamp_ms,
        sender,
        original_name,
        kind,
    })
}

pub fn timestamp_bucket_key(timestamp_ms: i64) -> Option<String> {
    let datetime = OffsetDateTime::from_unix_timestamp_nanos((timestamp_ms as i128) * 1_000_000).ok()?;
    Some(format!("{:04}-{:02}", datetime.year(), u8::from(datetime.month())))
}

pub fn timestamp_bucket_path(timestamp_ms: i64) -> Option<String> {
    let datetime = OffsetDateTime::from_unix_timestamp_nanos((timestamp_ms as i128) * 1_000_000).ok()?;
    Some(format!("{:04}/{:02}", datetime.year(), u8::from(datetime.month())))
}

pub fn message_remote_path(filename: &str, timestamp_ms: i64) -> String {
    match timestamp_bucket_path(timestamp_ms) {
        Some(bucket) => format!("files/{bucket}/{filename}"),
        None => format!("files/{filename}"),
    }
}

pub fn thumbnail_remote_path(filename: &str, timestamp_ms: i64) -> String {
    match timestamp_bucket_path(timestamp_ms) {
        Some(bucket) => format!("files/.thumbs/{bucket}/{filename}"),
        None => format!("files/.thumbs/{filename}"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn encode_decode_round_trip() {
        let input = "设备 A/测试.txt";
        let encoded = encode_component(input);
        // . should not be encoded
        assert!(encoded.contains(".txt"));
        // / should be encoded
        assert!(!encoded.contains("/"));

        let decoded = decode_component(&encoded);
        assert_eq!(decoded, input);
    }

    #[test]
    fn build_and_parse_filename() {
        let sender = "My Device";
        let original_name = "photo.png";
        let timestamp_ms = 1_700_000_000_000i64;
        let filename = build_message_filename(sender, original_name, timestamp_ms);

        let parsed = parse_message_filename(&filename).expect("parse should succeed");
        assert_eq!(parsed.timestamp_ms, timestamp_ms);
        assert_eq!(parsed.sender, sender);
        assert_eq!(parsed.original_name, original_name);
        assert_eq!(parsed.kind, MessageKind::File);
    }

    #[test]
    fn parse_invalid_filename() {
        assert!(parse_message_filename("not-a-message").is_none());
    }

    #[test]
    fn timestamp_bucket_helpers_use_month_shards() {
        let timestamp_ms = 1_704_067_200_000i64; // 2024-01-15T00:00:00Z
        assert_eq!(timestamp_bucket_key(timestamp_ms).as_deref(), Some("2024-01"));
        assert_eq!(timestamp_bucket_path(timestamp_ms).as_deref(), Some("2024/01"));
        assert_eq!(
            message_remote_path("message.txt", timestamp_ms),
            "files/2024/01/message.txt"
        );
        assert_eq!(
            thumbnail_remote_path("image.jpg", timestamp_ms),
            "files/.thumbs/2024/01/image.jpg"
        );
    }
}
