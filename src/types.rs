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
}

#[derive(Clone, Serialize)]
pub struct SyncStatus {
  pub running: bool,
  pub last_run_ms: Option<i64>,
  pub last_error: Option<String>,
  pub last_result: Option<String>,
}

impl SyncStatus {
  pub fn idle() -> Self {
    Self {
      running: false,
      last_run_ms: None,
      last_error: None,
      last_result: Some("尚未同步".to_string()),
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
