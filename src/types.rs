use serde::{Deserialize, Serialize};

fn default_endpoint_enabled() -> bool {
    true
}

fn default_send_hotkey() -> String {
    "enter".to_string()
}

fn default_global_hotkey_enabled() -> bool {
    true
}

fn default_global_hotkey() -> String {
    "alt+t".to_string()
}

fn default_telegram_poll_interval_secs() -> u64 {
    5
}

fn default_telegram_proxy_url() -> String {
    "http://127.0.0.1:7890".to_string()
}

#[derive(Clone, Serialize, Deserialize)]
pub struct WebDavEndpoint {
    pub id: String,
    #[serde(default)]
    pub name: String,
    pub url: String,
    pub username: String,
    pub password: String,
    #[serde(default = "default_endpoint_enabled")]
    pub enabled: bool,
}

#[derive(Clone, Serialize, Deserialize)]
pub struct TelegramBridgeSettings {
    #[serde(default)]
    pub enabled: bool,
    #[serde(default)]
    pub auto_start: bool,
    #[serde(default)]
    pub bot_token: String,
    #[serde(default)]
    pub chat_id: String,
    #[serde(default)]
    pub proxy_enabled: bool,
    #[serde(default = "default_telegram_proxy_url")]
    pub proxy_url: String,
    #[serde(default = "default_telegram_poll_interval_secs")]
    pub poll_interval_secs: u64,
}

impl Default for TelegramBridgeSettings {
    fn default() -> Self {
        Self {
            enabled: false,
            auto_start: false,
            bot_token: String::new(),
            chat_id: String::new(),
            proxy_enabled: false,
            proxy_url: default_telegram_proxy_url(),
            poll_interval_secs: default_telegram_poll_interval_secs(),
        }
    }
}

#[derive(Clone, Serialize, Deserialize)]
pub struct Settings {
    #[serde(default)]
    pub webdav_endpoints: Vec<WebDavEndpoint>,
    #[serde(default)]
    pub active_webdav_id: Option<String>,
    #[serde(default)]
    pub sender_name: String,
    #[serde(default)]
    pub refresh_interval_secs: u64,
    #[serde(default)]
    pub download_dir: String,
    #[serde(default = "default_send_hotkey")]
    pub send_hotkey: String,
    #[serde(default = "default_global_hotkey_enabled")]
    pub global_hotkey_enabled: bool,
    #[serde(default = "default_global_hotkey")]
    pub global_hotkey: String,
    #[serde(default)]
    pub auto_start: bool,
    #[serde(default)]
    pub telegram: TelegramBridgeSettings,
}

#[derive(Clone, Serialize)]
pub struct Message {
    pub filename: String,
    pub sender: String,
    pub timestamp_ms: i64,
    pub size: i64,
    pub kind: String,
    pub original_name: String,
    pub content: Option<String>,
    pub local_path: Option<String>,
    pub file_hash: Option<String>,
    pub download_exists: bool,
    #[serde(default)]
    pub marked: bool,
    #[serde(default)]
    pub format: String,
}

#[derive(Clone, Serialize)]
pub struct SyncStatus {
    pub running: bool,
    pub last_run_ms: Option<i64>,
    pub last_error: Option<String>,
    pub last_result: Option<String>,
    pub current_source: Option<String>,
}

#[derive(Clone, Serialize)]
pub struct DownloadHistoryRecord {
    pub id: i64,
    pub endpoint_id: String,
    pub filename: String,
    pub original_name: String,
    pub saved_path: Option<String>,
    pub status: String,
    pub error: Option<String>,
    pub file_size: i64,
    pub created_at_ms: i64,
    pub updated_at_ms: i64,
    pub local_exists: bool,
}

impl SyncStatus {
    pub fn idle() -> Self {
        Self {
            running: false,
            last_run_ms: None,
            last_error: None,
            last_result: Some("尚未同步".to_string()),
            current_source: None,
        }
    }
}

#[derive(Clone, Default, Debug)]
pub struct DavEntry {
    pub filename: String,
    pub remote_path: String,
    pub href: String,
    pub etag: Option<String>,
    pub size: Option<u64>,
    pub mtime: Option<String>,
    pub is_collection: bool,
}
