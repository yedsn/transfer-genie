#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod db;
mod filenames;
mod types;
mod webdav;

use crate::db::DbMessage;
use crate::filenames::{build_message_filename, parse_message_filename, MessageKind};
use crate::types::{Message, Settings, SyncStatus, WebDavEndpoint};
use aes_gcm::aead::Aead;
use aes_gcm::{Aes256Gcm, KeyInit, Nonce};
use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use log::LevelFilter;
use pbkdf2::pbkdf2_hmac;
use rand::rngs::OsRng;
use rand::{Rng, RngCore};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use log::info;
use sha2::{Digest, Sha256};
use std::collections::{HashMap, HashSet};
use tauri_plugin_log::{Target, TargetKind};
use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_opener::OpenerExt;
use tokio::sync::{oneshot, Mutex as AsyncMutex};
use tauri::Window;
#[cfg(desktop)]
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut};

struct AppState {
  settings_path: PathBuf,
  db_path: PathBuf,
  files_base_dir: PathBuf,
  default_download_dir: PathBuf,
  settings: Mutex<Settings>,
  sync_status: Mutex<SyncStatus>,
  sync_guard: AsyncMutex<()>,
  sync_cancel: Mutex<Option<oneshot::Sender<()>>>,
  http: Client,
  registered_hotkey: Mutex<Option<Shortcut>>,
}

const EXPORT_VERSION: u8 = 1;
const EXPORT_KDF_ITERATIONS: u32 = 100_000;
const DEFAULT_GLOBAL_HOTKEY: &str = "alt+t";
const HOTKEY_MENU_ID: &str = "toggle-hotkey";
const DEFAULT_SEND_HOTKEY: &str = "enter";
const SEND_HOTKEY_CTRL_ENTER: &str = "ctrl_enter";
const SYNC_TIMEOUT_SECS: u64 = 45;

fn default_export_global_hotkey_enabled() -> bool {
  true
}

#[cfg(desktop)]
fn load_app_icon() -> Result<tauri::image::Image<'static>, String> {
  tauri::image::Image::from_bytes(include_bytes!("../icons/icon.png"))
    .map(|image| image.to_owned())
    .map_err(|err| format!("加载图标失败: {err}"))
}

#[derive(Clone, Serialize, Deserialize)]
struct HistoryEntry {
  filename: String,
  sender: String,
  timestamp_ms: i64,
  size: i64,
  kind: String,
  original_name: String,
  #[serde(default)]
  marked: bool,
  #[serde(default)]
  format: String,
}

#[derive(Deserialize)]
struct LegacySettings {
  #[serde(default)]
  webdav_url: String,
  #[serde(default)]
  username: String,
  #[serde(default)]
  password: String,
  #[serde(default)]
  sender_name: String,
  #[serde(default)]
  refresh_interval_secs: u64,
  #[serde(default)]
  download_dir: String,
}

#[derive(Serialize, Deserialize)]
struct ExportBundle {
  version: u8,
  settings: ExportSettings,
  crypto: CryptoPayload,
}

#[derive(Serialize, Deserialize)]
struct ExportSettings {
  #[serde(default)]
  webdav_endpoints: Vec<WebDavEndpoint>,
  #[serde(default)]
  active_webdav_id: Option<String>,
  #[serde(default)]
  refresh_interval_secs: u64,
  #[serde(default = "default_export_global_hotkey_enabled")]
  global_hotkey_enabled: bool,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  global_hotkey: Option<String>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  send_hotkey: Option<String>,
}

#[derive(Serialize, Deserialize)]
struct CryptoPayload {
  kdf: String,
  cipher: String,
  iterations: u32,
  salt: String,
  nonce: String,
  ciphertext: String,
}

#[derive(Serialize, Deserialize)]
struct ExportSecrets {
  endpoints: Vec<EndpointSecret>,
}

#[derive(Serialize, Deserialize)]
struct EndpointSecret {
  id: String,
  username: String,
  password: String,
}

#[derive(Serialize)]
struct DownloadResult {
  status: String,
  path: Option<String>,
  suggested_path: Option<String>,
}

#[derive(Serialize)]
struct DeleteSummary {
  deleted: usize,
  failed: Vec<String>,
}

#[derive(Deserialize)]
enum CleanupRange {
  #[serde(rename = "all")]
  All,
  #[serde(rename = "before_7_days")]
  Before7Days,
}

#[derive(Deserialize)]
enum CleanupScope {
  #[serde(rename = "local_only")]
  LocalOnly,
  #[serde(rename = "with_remote")]
  WithRemote,
}

#[derive(Clone, Serialize)]
struct DownloadProgress {
  filename: String,
  received: u64,
  total: Option<u64>,
  status: String,
  error: Option<String>,
}

#[derive(Clone, Serialize)]
struct UploadProgress {
  client_id: String,
  filename: Option<String>,
  original_name: Option<String>,
  received: u64,
  total: u64,
  status: String,
  error: Option<String>,
}

#[derive(Clone, Serialize)]
struct BackupRestoreProgress {
  filename: String,
  current: u64,
  total: u64,
  state: String,
}

fn emit_backup_restore_progress(
  window: &Window,
  event_name: &str,
  filename: &str,
  current: u64,
  total: u64,
  state: &str,
) {
  let payload = BackupRestoreProgress {
    filename: filename.to_string(),
    current,
    total,
    state: state.to_string(),
  };
  
  if let Err(e) = window.emit(event_name, payload) {
    log::warn!("Failed to emit {}: {}", event_name, e);
  }
}

#[tauri::command]
fn get_settings(state: State<'_, AppState>) -> Result<Settings, String> {
  let settings = state
    .settings
    .lock()
    .map_err(|_| "读取设置失败".to_string())?;
  Ok(settings.clone())
}

#[tauri::command]
fn save_settings(app: AppHandle, state: State<'_, AppState>, settings: Settings) -> Result<Settings, String> {
  let normalized = normalize_settings(settings, &state.default_download_dir)?;

  #[cfg(desktop)]
  update_global_hotkey_registration(&app, &state, &normalized)?;

  write_settings(&state.settings_path, &normalized)?;

  #[cfg(desktop)]
  {
    // 设置开机自启动
    if let Err(err) = set_autostart(&app, normalized.auto_start) {
      // 自启动设置失败时返回错误，让用户知道设置失败
      return Err(format!("设置开机自启动失败: {err}"));
    }
  }

  let mut guard = state
    .settings
    .lock()
    .map_err(|_| "写入设置失败".to_string())?;
  *guard = normalized.clone();
  Ok(normalized)
}

#[tauri::command]
fn save_send_hotkey(state: State<'_, AppState>, send_hotkey: String) -> Result<String, String> {
  let mut settings = current_settings(&state)?;
  settings.send_hotkey = send_hotkey;
  let normalized = normalize_settings(settings, &state.default_download_dir)?;
  write_settings(&state.settings_path, &normalized)?;
  let persisted = normalized.send_hotkey.clone();
  let mut guard = state
    .settings
    .lock()
    .map_err(|_| "写入设置失败".to_string())?;
  *guard = normalized;
  Ok(persisted)
}

#[tauri::command]
fn get_device_name() -> String {
  resolve_device_name()
}

#[tauri::command]
fn export_settings(
  state: State<'_, AppState>,
  path: String,
  password: String,
) -> Result<(), String> {
  if path.trim().is_empty() {
    return Err("未选择导出路径".to_string());
  }
  let settings = current_settings(&state)?;
  let secrets = extract_export_secrets(&settings);
  let crypto = encrypt_export_secrets(&password, &secrets)?;

  let mut export_settings = ExportSettings {
    webdav_endpoints: settings.webdav_endpoints.clone(),
    active_webdav_id: settings.active_webdav_id.clone(),
    refresh_interval_secs: settings.refresh_interval_secs,
    global_hotkey_enabled: settings.global_hotkey_enabled,
    global_hotkey: Some(settings.global_hotkey.clone()),
    send_hotkey: Some(settings.send_hotkey.clone()),
  };
  for endpoint in export_settings.webdav_endpoints.iter_mut() {
    endpoint.username.clear();
    endpoint.password.clear();
  }

  let bundle = ExportBundle {
    version: EXPORT_VERSION,
    settings: export_settings,
    crypto,
  };

  let data = serde_json::to_string_pretty(&bundle)
    .map_err(|err| format!("序列化配置失败: {err}"))?;
  let target_path = PathBuf::from(path);
  ensure_parent_dir(&target_path)?;
  fs::write(&target_path, data).map_err(|err| format!("写入导出文件失败: {err}"))?;
  Ok(())
}

#[tauri::command]
fn import_settings(
  app: AppHandle,
  state: State<'_, AppState>,
  path: String,
  password: String,
) -> Result<Settings, String> {
  if path.trim().is_empty() {
    return Err("未选择导入文件".to_string());
  }
  let data = fs::read(&path).map_err(|err| format!("读取导入文件失败: {err}"))?;
  let bundle: ExportBundle =
    serde_json::from_slice(&data).map_err(|err| format!("解析导入文件失败: {err}"))?;
  if bundle.version != EXPORT_VERSION {
    return Err("不支持的配置版本".to_string());
  }

  let secrets_bytes = decrypt_export_secrets(&password, &bundle.crypto)?;
  let secrets: ExportSecrets = serde_json::from_slice(&secrets_bytes)
    .map_err(|err| format!("解析配置凭据失败: {err}"))?;

  let existing = current_settings(&state)?;
  let mut settings = Settings {
    webdav_endpoints: bundle.settings.webdav_endpoints,
    active_webdav_id: bundle.settings.active_webdav_id,
    sender_name: existing.sender_name,
    refresh_interval_secs: bundle.settings.refresh_interval_secs,
    global_hotkey_enabled: bundle.settings.global_hotkey_enabled,
    global_hotkey: bundle
      .settings
      .global_hotkey
      .unwrap_or_else(|| existing.global_hotkey.clone()),
    send_hotkey: bundle
      .settings
      .send_hotkey
      .unwrap_or_else(|| existing.send_hotkey.clone()),
    download_dir: existing.download_dir,
    auto_start: existing.auto_start,
  };
  apply_export_secrets(&mut settings, secrets)?;
  let normalized = normalize_settings(settings, &state.default_download_dir)?;

  #[cfg(desktop)]
  update_global_hotkey_registration(&app, &state, &normalized)?;

  write_settings(&state.settings_path, &normalized)?;
  let mut guard = state
    .settings
    .lock()
    .map_err(|_| "写入设置失败".to_string())?;
  *guard = normalized.clone();
  Ok(normalized)
}

#[derive(Serialize)]
struct MessagesResult {
  messages: Vec<Message>,
  total: i64,
  has_more: bool,
  marked_count: i64,
}

#[tauri::command]
async fn mark_message(state: State<'_, AppState>, filename: String) -> Result<(), String> {
  set_message_marked(&state, filename, true).await
}

#[tauri::command]
async fn unmark_message(state: State<'_, AppState>, filename: String) -> Result<(), String> {
  set_message_marked(&state, filename, false).await
}

async fn set_message_marked(
  state: &AppState,
  filename: String,
  marked: bool,
) -> Result<(), String> {
  let settings = current_settings(state)?;
  let endpoint = resolve_active_endpoint(&settings)?;

  // 1. Update local DB
  let existing = db::get_message(&state.db_path, &endpoint.id, &filename)
    .map_err(|err| err.to_string())?;
  
  if let Some(mut message) = existing {
    message.marked = marked;
    db::upsert_message(&state.db_path, &message).map_err(|err| err.to_string())?;
  } else {
    return Err("未找到消息".to_string());
  }

  // 2. Update remote history.json
  let _guard = state.sync_guard.lock().await; 
  
  let mut history = load_history(state, &endpoint).await?;
  let mut changed = false;
  
  for entry in history.iter_mut() {
    if entry.filename == filename {
      if entry.marked != marked {
        entry.marked = marked;
        changed = true;
      }
      break;
    }
  }
  
  // If not found in history but exists locally, maybe we should add it to history?
  // But history usually contains what's on remote. If it's local only, it shouldn't be in history.json yet?
  // But sync_once adds local messages to history if they are missing? 
  // Wait, sync_once adds *downloaded* messages to history. 
  // If I sent a message, it is added to history.
  // If I just mark a message, it should be in history.
  
  if changed {
    save_history(state, &endpoint, &history).await?;
  }

  Ok(())
}

#[tauri::command]
fn list_messages(
  state: State<'_, AppState>,
  limit: Option<i64>,
  offset: Option<i64>,
  only_marked: Option<bool>,
) -> Result<MessagesResult, String> {
  let settings = current_settings(&state)?;
  let endpoint = resolve_active_endpoint(&settings)?;
  
  let marked_filter = only_marked.unwrap_or(false);
  let total = db::count_messages(&state.db_path, &endpoint.id, marked_filter).map_err(|err| err.to_string())?;
  
  // Always get the total count of marked messages for the badge
  let marked_count = if marked_filter {
    total
  } else {
    db::count_messages(&state.db_path, &endpoint.id, true).map_err(|err| err.to_string())?
  };

  let mut messages =
    db::list_messages_paged(&state.db_path, &endpoint.id, limit, offset, marked_filter).map_err(|err| err.to_string())?;
  
  let base_dir = resolve_download_dir(&state, &settings);
  for message in messages.iter_mut() {
    if message.kind == MessageKind::File.as_str() {
      let file_name = sanitize_filename(&message.original_name);
      let target_path = base_dir.join(file_name);
      // 优先使用哈希值判断文件是否已下载
      if let Some(ref expected_hash) = message.file_hash {
        if target_path.is_file() {
          // 文件存在，检查哈希值是否匹配
          if let Some(actual_hash) = compute_file_hash_from_path(&target_path) {
            message.download_exists = &actual_hash == expected_hash;
          } else {
            message.download_exists = false;
          }
        } else {
          message.download_exists = false;
        }
      } else {
        // 没有哈希值（旧数据），回退到检查文件是否存在
        message.download_exists = target_path.exists();
      }
    } else {
      message.download_exists = false;
    }
  }
  
  let current_offset = offset.unwrap_or(0);
  let current_limit = limit.unwrap_or(total);
  let has_more = current_offset + current_limit < total;
  
  Ok(MessagesResult {
    messages,
    total,
    has_more,
    marked_count,
  })
}

#[tauri::command]
async fn send_text(state: State<'_, AppState>, text: String, format: Option<String>) -> Result<(), String> {
  let settings = current_settings(&state)?;
  let endpoint = resolve_active_endpoint(&settings)?;

  let format = format.unwrap_or_else(|| "text".to_string());
  let is_markdown = format == "markdown";
  let extension = if is_markdown { "message.md" } else { "message.txt" };

  let timestamp_ms = now_ms();
  let filename = build_message_filename(&settings.sender_name, extension, timestamp_ms);
  let remote_path = format!("files/{}", filename);
  let data = text.clone().into_bytes();

  webdav::ensure_directory(&state.http, &endpoint, "files").await?;
  webdav::upload_file(&state.http, &endpoint, &remote_path, data.clone()).await?;

  let message = DbMessage {
    endpoint_id: endpoint.id.clone(),
    filename: filename.clone(),
    sender: settings.sender_name.clone(),
    timestamp_ms,
    size: data.len() as i64,
    kind: MessageKind::Text.as_str().to_string(),
    original_name: extension.to_string(),
    etag: None,
    mtime: None,
    content: Some(text),
    local_path: None,
    file_hash: None,
    marked: false,
    format,
  };

  db::upsert_message(&state.db_path, &message).map_err(|err| err.to_string())?;
  let _ = append_history(&state, &endpoint, message_to_history(&message)).await;
  Ok(())
}

fn is_image_file(filename: &str) -> bool {
  let lower = filename.to_lowercase();
  lower.ends_with(".png")
    || lower.ends_with(".jpg")
    || lower.ends_with(".jpeg")
    || lower.ends_with(".gif")
    || lower.ends_with(".webp")
    || lower.ends_with(".bmp")
}

fn generate_thumbnail(data: &[u8]) -> Result<Vec<u8>, String> {
  use image::io::Reader as ImageReader;
  use std::io::Cursor;

  let img = ImageReader::new(Cursor::new(data))
    .with_guessed_format()
    .map_err(|e| format!("无法识别图片格式: {}", e))?
    .decode()
    .map_err(|e| format!("图片解码失败: {}", e))?;

  let thumbnail = img.thumbnail(200, 200);
  let mut buf = Cursor::new(Vec::new());
  // Always use JPEG for thumbnails for consistency and small size
  thumbnail
    .write_to(&mut buf, image::ImageFormat::Jpeg)
    .map_err(|e| format!("缩略图生成失败: {}", e))?;

  Ok(buf.into_inner())
}

#[tauri::command]
async fn send_file(
  window: Window,
  state: State<'_, AppState>,
  path: String,
  client_id: Option<String>,
) -> Result<(), String> {
  let settings = current_settings(&state)?;
  let endpoint = resolve_active_endpoint(&settings)?;

  let file_path = PathBuf::from(path);
  let original_name = file_path
    .file_name()
    .and_then(|name| name.to_str())
    .ok_or_else(|| "无法读取文件名".to_string())?
    .to_string();

  let data = fs::read(&file_path).map_err(|err| format!("读取文件失败: {err}"))?;
  let total_bytes = data.len() as u64;
  let file_hash = compute_file_hash(&data);
  let timestamp_ms = now_ms();
  let filename = build_message_filename(&settings.sender_name, &original_name, timestamp_ms);
  let remote_path = format!("files/{}", filename);

  let client_id = client_id
    .and_then(|value| {
      if value.trim().is_empty() {
        None
      } else {
        Some(value)
      }
    })
    .unwrap_or_else(|| filename.clone());

  webdav::ensure_directory(&state.http, &endpoint, "files").await?;
  emit_upload_progress(
    &window,
    &client_id,
    Some(&filename),
    Some(&original_name),
    0,
    total_bytes,
    "progress",
    None,
  );

  let progress_window = window.clone();
  let progress_client_id = client_id.clone();
  let progress_filename = filename.clone();
  let progress_original_name = original_name.clone();
  let upload_result = webdav::upload_file_with_progress(
    &state.http,
    &endpoint,
    &remote_path,
    data.clone(),
    move |sent, total| {
      emit_upload_progress(
        &progress_window,
        &progress_client_id,
        Some(&progress_filename),
        Some(&progress_original_name),
        sent,
        total,
        "progress",
        None,
      );
    },
  )
  .await;

  if let Err(err) = upload_result {
    emit_upload_progress(
      &window,
      &client_id,
      Some(&filename),
      Some(&original_name),
      0,
      total_bytes,
      "error",
      Some(err.clone()),
    );
    return Err(err);
  }
  emit_upload_progress(
    &window,
    &client_id,
    Some(&filename),
    Some(&original_name),
    total_bytes,
    total_bytes,
    "complete",
    None,
  );

  let endpoint_dir = endpoint_files_dir(&state, &endpoint.id);
  let local_path = endpoint_dir.join(&filename);
  fs::create_dir_all(&endpoint_dir).map_err(|err| format!("创建目录失败: {err}"))?;
  fs::copy(&file_path, &local_path).map_err(|err| format!("保存本地文件失败: {err}"))?;

  // Generate and upload thumbnail if it's an image
  if is_image_file(&original_name) {
    if let Ok(thumb_data) = generate_thumbnail(&data) {
      let thumb_remote_path = format!("files/.thumbs/{}", filename);
      let _ = webdav::ensure_directory(&state.http, &endpoint, "files/.thumbs").await;
      let _ = webdav::upload_file(&state.http, &endpoint, &thumb_remote_path, thumb_data.clone()).await;
      
      // Save local thumbnail cache
      let thumb_local_dir = endpoint_dir.join(".thumbs");
      let _ = fs::create_dir_all(&thumb_local_dir);
      let _ = fs::write(thumb_local_dir.join(&filename), thumb_data);
    }
  }

  let message = DbMessage {
    endpoint_id: endpoint.id.clone(),
    filename: filename.clone(),
    sender: settings.sender_name.clone(),
    timestamp_ms,
    size: total_bytes as i64,
    kind: MessageKind::File.as_str().to_string(),
    original_name: original_name.clone(),
    etag: None,
    mtime: None,
    content: None,
    local_path: Some(local_path.to_string_lossy().to_string()),
    file_hash: Some(file_hash),
    marked: false,
    format: "text".to_string(),
  };

  db::upsert_message(&state.db_path, &message).map_err(|err| err.to_string())?;
  let _ = append_history(&state, &endpoint, message_to_history(&message)).await;
  Ok(())
}

#[tauri::command]
async fn send_file_data(
  window: Window,
  state: State<'_, AppState>,
  data: Vec<u8>,
  original_name: String,
  client_id: Option<String>,
) -> Result<(), String> {
  let settings = current_settings(&state)?;
  let endpoint = resolve_active_endpoint(&settings)?;

  let total_bytes = data.len() as u64;
  let file_hash = compute_file_hash(&data);
  let timestamp_ms = now_ms();
  let filename = build_message_filename(&settings.sender_name, &original_name, timestamp_ms);
  let remote_path = format!("files/{}", filename);

  let client_id = client_id
    .and_then(|value| {
      if value.trim().is_empty() {
        None
      } else {
        Some(value)
      }
    })
    .unwrap_or_else(|| filename.clone());

  webdav::ensure_directory(&state.http, &endpoint, "files").await?;
  emit_upload_progress(
    &window,
    &client_id,
    Some(&filename),
    Some(&original_name),
    0,
    total_bytes,
    "progress",
    None,
  );

  let progress_window = window.clone();
  let progress_client_id = client_id.clone();
  let progress_filename = filename.clone();
  let progress_original_name = original_name.clone();
  let upload_result = webdav::upload_file_with_progress(
    &state.http,
    &endpoint,
    &remote_path,
    data.clone(),
    move |sent, total| {
      emit_upload_progress(
        &progress_window,
        &progress_client_id,
        Some(&progress_filename),
        Some(&progress_original_name),
        sent,
        total,
        "progress",
        None,
      );
    },
  )
  .await;

  if let Err(err) = upload_result {
    emit_upload_progress(
      &window,
      &client_id,
      Some(&filename),
      Some(&original_name),
      0,
      total_bytes,
      "error",
      Some(err.clone()),
    );
    return Err(err);
  }
  emit_upload_progress(
    &window,
    &client_id,
    Some(&filename),
    Some(&original_name),
    total_bytes,
    total_bytes,
    "complete",
    None,
  );

  let endpoint_dir = endpoint_files_dir(&state, &endpoint.id);
  let local_path = endpoint_dir.join(&filename);
  fs::create_dir_all(&endpoint_dir).map_err(|err| format!("创建目录失败: {err}"))?;
  fs::write(&local_path, &data).map_err(|err| format!("保存本地文件失败: {err}"))?;

  // Generate and upload thumbnail if it's an image
  if is_image_file(&original_name) {
    if let Ok(thumb_data) = generate_thumbnail(&data) {
      let thumb_remote_path = format!("files/.thumbs/{}", filename);
      let _ = webdav::ensure_directory(&state.http, &endpoint, "files/.thumbs").await;
      let _ = webdav::upload_file(&state.http, &endpoint, &thumb_remote_path, thumb_data.clone()).await;
      
      // Save local thumbnail cache
      let thumb_local_dir = endpoint_dir.join(".thumbs");
      let _ = fs::create_dir_all(&thumb_local_dir);
      let _ = fs::write(thumb_local_dir.join(&filename), thumb_data);
    }
  }

  let message = DbMessage {
    endpoint_id: endpoint.id.clone(),
    filename: filename.clone(),
    sender: settings.sender_name.clone(),
    timestamp_ms,
    size: total_bytes as i64,
    kind: MessageKind::File.as_str().to_string(),
    original_name,
    etag: None,
    mtime: None,
    content: None,
    local_path: Some(local_path.to_string_lossy().to_string()),
    file_hash: Some(file_hash),
    marked: false,
    format: "text".to_string(),
  };

  db::upsert_message(&state.db_path, &message).map_err(|err| err.to_string())?;
  let _ = append_history(&state, &endpoint, message_to_history(&message)).await;
  Ok(())
}

#[tauri::command]
async fn get_thumbnail(
  state: State<'_, AppState>,
  filename: String,
) -> Result<String, String> {
  let settings = current_settings(&state)?;
  let endpoint = resolve_active_endpoint(&settings)?;
  
  let endpoint_dir = endpoint_files_dir(&state, &endpoint.id);
  let thumb_local_path = endpoint_dir.join(".thumbs").join(&filename);
  
  if thumb_local_path.exists() {
    return Ok(thumb_local_path.to_string_lossy().to_string());
  }
  
  // Try to download from server
  let thumb_remote_path = format!("files/.thumbs/{}", filename);
  match webdav::download_optional_file(&state.http, &endpoint, &thumb_remote_path).await? {
    Some(data) => {
      let thumb_local_dir = endpoint_dir.join(".thumbs");
      let _ = fs::create_dir_all(&thumb_local_dir);
      fs::write(&thumb_local_path, &data).map_err(|e| format!("写入缩略图缓存失败: {}", e))?;
      Ok(thumb_local_path.to_string_lossy().to_string())
    }
    None => Err("缩略图不存在".to_string()),
  }
}

#[tauri::command]
async fn download_message_file(
  window: Window,
  state: State<'_, AppState>,
  filename: String,
  original_name: String,
  conflict_action: Option<String>,
) -> Result<DownloadResult, String> {
  let settings = current_settings(&state)?;
  let endpoint = resolve_active_endpoint(&settings)?;

  let base_dir = resolve_download_dir(&state, &settings);
  fs::create_dir_all(&base_dir).map_err(|err| format!("创建下载目录失败: {err}"))?;

  let file_name = sanitize_filename(&original_name);
  let target_path = base_dir.join(file_name);
  let action = parse_conflict_action(conflict_action);
  let final_path = match resolve_download_target(&target_path, action)? {
    DownloadDecision::Conflict { suggested } => {
      return Ok(DownloadResult {
        status: "conflict".to_string(),
        path: None,
        suggested_path: Some(suggested.to_string_lossy().to_string()),
      });
    }
    DownloadDecision::Ready(path) => path,
  };

  let remote_path = format!("files/{}", filename);
  let window = window.clone();
  let bytes = match webdav::download_file_with_progress(
    &state.http,
    &endpoint,
    &remote_path,
    |received, total| {
      emit_download_progress(
        &window,
        &filename,
        received,
        total,
        "progress",
        None,
      );
    },
  )
  .await
  {
    Ok(bytes) => {
      emit_download_progress(
        &window,
        &filename,
        bytes.len() as u64,
        Some(bytes.len() as u64),
        "complete",
        None,
      );
      bytes
    }
    Err(err) => {
      emit_download_progress(&window, &filename, 0, None, "error", Some(err.clone()));
      return Err(err);
    }
  };
  ensure_parent_dir(&final_path)?;
  fs::write(&final_path, &bytes).map_err(|err| format!("保存文件失败: {err}"))?;
  let file_hash = compute_file_hash(&bytes);
  update_message_local_path(
    &state.db_path,
    &endpoint.id,
    &filename,
    &final_path,
    bytes.len() as i64,
    Some(file_hash),
  )?;

  Ok(DownloadResult {
    status: "saved".to_string(),
    path: Some(final_path.to_string_lossy().to_string()),
    suggested_path: None,
  })
}

#[tauri::command]
async fn save_message_file_as(
  window: Window,
  state: State<'_, AppState>,
  filename: String,
  target_path: String,
) -> Result<DownloadResult, String> {
  let settings = current_settings(&state)?;
  let endpoint = resolve_active_endpoint(&settings)?;

  if target_path.trim().is_empty() {
    return Err("未选择保存路径".to_string());
  }
  let final_path = PathBuf::from(target_path);
  let remote_path = format!("files/{}", filename);
  let window = window.clone();
  let bytes = match webdav::download_file_with_progress(
    &state.http,
    &endpoint,
    &remote_path,
    |received, total| {
      emit_download_progress(
        &window,
        &filename,
        received,
        total,
        "progress",
        None,
      );
    },
  )
  .await
  {
    Ok(bytes) => {
      emit_download_progress(
        &window,
        &filename,
        bytes.len() as u64,
        Some(bytes.len() as u64),
        "complete",
        None,
      );
      bytes
    }
    Err(err) => {
      emit_download_progress(&window, &filename, 0, None, "error", Some(err.clone()));
      return Err(err);
    }
  };
  ensure_parent_dir(&final_path)?;
  fs::write(&final_path, &bytes).map_err(|err| format!("保存文件失败: {err}"))?;
  let file_hash = compute_file_hash(&bytes);
  update_message_local_path(
    &state.db_path,
    &endpoint.id,
    &filename,
    &final_path,
    bytes.len() as i64,
    Some(file_hash),
  )?;

  Ok(DownloadResult {
    status: "saved".to_string(),
    path: Some(final_path.to_string_lossy().to_string()),
    suggested_path: None,
  })
}

#[tauri::command]
async fn open_message_file(
  app: AppHandle,
  state: State<'_, AppState>,
  filename: String,
  original_name: String,
) -> Result<(), String> {
  if filename.trim().is_empty() {
    return Err("文件名为空".to_string());
  }
  let settings = current_settings(&state)?;
  let endpoint = resolve_active_endpoint(&settings)?;
  let base_dir = resolve_download_dir(&state, &settings);
  let sanitized_name = sanitize_filename(&original_name);
  let download_path = base_dir.join(&sanitized_name);
  if download_path.is_file() {
    app
      .opener()
      .open_path(download_path.to_string_lossy().to_string(), None::<&str>)
      .map_err(|err| format!("打开文件失败: {err}"))?;
    return Ok(());
  }

  let message = db::get_message(&state.db_path, &endpoint.id, &filename)
    .map_err(|err| format!("读取消息失败: {err}"))?;
  let local_path = message
    .and_then(|entry| entry.local_path)
    .filter(|path| !path.trim().is_empty())
    .map(PathBuf::from);

  if let Some(local_path) = local_path {
    if local_path.is_file() {
      let local_has_ext = local_path.extension().is_some();
      let wanted_has_ext = Path::new(&sanitized_name).extension().is_some();
      if local_has_ext || !wanted_has_ext {
        app
          .opener()
          .open_path(local_path.to_string_lossy().to_string(), None::<&str>)
          .map_err(|err| format!("打开文件失败: {err}"))?;
        return Ok(());
      }

      let open_dir = endpoint_files_dir(&state, &endpoint.id).join("open");
      fs::create_dir_all(&open_dir).map_err(|err| format!("创建打开目录失败: {err}"))?;
      let safe_prefix = filename.replace('%', "_");
      let safe_name = sanitized_name.replace('%', "_");
      let open_path = open_dir.join(format!("{}__{}", safe_prefix, safe_name));
      if !open_path.is_file() {
        fs::copy(&local_path, &open_path).map_err(|err| format!("准备打开文件失败: {err}"))?;
      }
      app
        .opener()
        .open_path(open_path.to_string_lossy().to_string(), None::<&str>)
        .map_err(|err| format!("打开文件失败: {err}"))?;
      return Ok(());
    }
  }

  Err("文件尚未下载".to_string())
}

#[tauri::command]
async fn open_download_dir(
  app: AppHandle,
  state: State<'_, AppState>,
) -> Result<(), String> {
  let settings = current_settings(&state)?;
  let base_dir = resolve_download_dir(&state, &settings);
  fs::create_dir_all(&base_dir).map_err(|err| format!("创建下载目录失败: {err}"))?;
  app
    .opener()
    .open_path(base_dir.to_string_lossy().to_string(), None::<&str>)
    .map_err(|err| format!("打开下载目录失败: {err}"))?;
  Ok(())
}

#[tauri::command]
async fn open_url(app: AppHandle, url: String) -> Result<(), String> {
  if url.trim().is_empty() {
    return Err("URL 为空".to_string());
  }
  // Validate URL format
  if !url.starts_with("http://") && !url.starts_with("https://") {
    return Err("URL 必须以 http:// 或 https:// 开头".to_string());
  }
  // Use opener plugin to open URL in system browser
  // The opener plugin should handle URLs automatically
  app
    .opener()
    .open_path(url, None::<&str>)
    .map_err(|err| format!("打开链接失败: {err}"))?;
  Ok(())
}

#[tauri::command]
async fn save_local_data(
  path: String,
  data: Vec<u8>,
) -> Result<(), String> {
  if path.trim().is_empty() {
    return Err("路径为空".to_string());
  }
  let target = PathBuf::from(path);
  if let Some(parent) = target.parent() {
    fs::create_dir_all(parent).map_err(|err| format!("创建目录失败: {err}"))?;
  }
  fs::write(&target, data).map_err(|err| format!("保存文件失败: {err}"))?;
  Ok(())
}

#[tauri::command]
fn open_log_dir(app: AppHandle) -> Result<(), String> {
  let log_dir = app
    .path()
    .app_log_dir()
    .map_err(|e| format!("无法解析日志目录: {}", e))?;

  app
    .opener()
    .open_path(log_dir.to_string_lossy(), None::<&str>)
    .map_err(|e| e.to_string())
}

#[tauri::command]
fn open_data_dir(app: AppHandle) -> Result<(), String> {
  let data_dir = app
    .path()
    .app_data_dir()
    .map_err(|e| format!("无法解析数据目录: {}", e))?;

  app
    .opener()
    .open_path(data_dir.to_string_lossy(), None::<&str>)
    .map_err(|e| e.to_string())
}

#[tauri::command]
fn minimize_window(app: AppHandle, window: Window) -> Result<(), String> {
  window
    .hide()
    .map_err(|err| format!("隐藏窗口失败: {err}"))?;
  #[cfg(not(target_os = "macos"))]
  let _ = &app;
  #[cfg(target_os = "macos")]
  sync_dock_visibility_window(&app, &window);
  Ok(())
}

#[tauri::command]
async fn fetch_image_preview(state: State<'_, AppState>, filename: String) -> Result<String, String> {
  let settings = current_settings(&state)?;
  let endpoint = resolve_active_endpoint(&settings)?;

  if filename.contains('/') || filename.contains('\\') {
    return Err("非法文件名".to_string());
  }

  let preview_dir = endpoint_files_dir(&state, &endpoint.id).join("previews");
  fs::create_dir_all(&preview_dir).map_err(|err| format!("创建预览目录失败: {err}"))?;

  let target_path = preview_dir.join(&filename);
  if target_path.exists() {
    return Ok(target_path.to_string_lossy().to_string());
  }

  let remote_path = format!("files/{}", filename);
  let bytes = webdav::download_file(&state.http, &endpoint, &remote_path).await?;
  fs::write(&target_path, &bytes).map_err(|err| format!("保存预览失败: {err}"))?;
  Ok(target_path.to_string_lossy().to_string())
}

#[tauri::command]
async fn delete_messages(
  state: State<'_, AppState>,
  filenames: Vec<String>,
  delete_remote: bool,
) -> Result<DeleteSummary, String> {
  let mut unique = HashSet::new();
  let mut targets: Vec<String> = Vec::new();
  for name in filenames {
    let trimmed = name.trim();
    if trimmed.is_empty() {
      continue;
    }
    if unique.insert(trimmed.to_string()) {
      targets.push(trimmed.to_string());
    }
  }
  if targets.is_empty() {
    return Ok(DeleteSummary {
      deleted: 0,
      failed: Vec::new(),
    });
  }

  let settings = current_settings(&state)?;
  let endpoint = resolve_active_endpoint(&settings)?;
  if delete_remote {
    // resolved above
  }

  let mut failed: Vec<String> = Vec::new();
  let mut succeeded: Vec<String> = targets.clone();
  if delete_remote {
    succeeded.clear();
    for filename in &targets {
      let remote_path = format!("files/{}", filename);
      match webdav::delete_file(&state.http, &endpoint, &remote_path, true).await {
        Ok(_) => succeeded.push(filename.clone()),
        Err(_) => failed.push(filename.clone()),
      }
    }
    if !succeeded.is_empty() {
      let success_set: HashSet<String> = succeeded.iter().cloned().collect();
      remove_history_entries(&state, &endpoint, &success_set).await?;
    }
  }

  if delete_remote {
    // 删除远程和本地：删除本地文件并删除消息记录
    let deletable = succeeded;
    if deletable.is_empty() {
      return Ok(DeleteSummary {
        deleted: 0,
        failed,
      });
    }

    let mut messages = Vec::new();
    for filename in &deletable {
      if let Some(message) = db::get_message(&state.db_path, &endpoint.id, filename)
        .map_err(|err| err.to_string())?
      {
        messages.push(message);
      }
    }

    for message in &messages {
      delete_local_files_for_entry(
        &state,
        &settings,
        &message.kind,
        &message.original_name,
        message.local_path.as_deref(),
      )?;
    }

    let deleted = db::delete_messages(&state.db_path, &endpoint.id, &deletable)
      .map_err(|err| err.to_string())?;
    Ok(DeleteSummary { deleted, failed })
  } else {
    // 仅本地删除：只删除本地文件，保留消息记录（清空 local_path 和 file_hash）
    let mut messages = Vec::new();
    for filename in &targets {
      if let Some(message) = db::get_message(&state.db_path, &endpoint.id, filename)
        .map_err(|err| err.to_string())?
      {
        messages.push(message);
      }
    }

    for message in &messages {
      delete_local_files_for_entry(
        &state,
        &settings,
        &message.kind,
        &message.original_name,
        message.local_path.as_deref(),
      )?;
      clear_message_local_path(&state.db_path, &endpoint.id, &message.filename)?;
    }

    Ok(DeleteSummary {
      deleted: targets.len(),
      failed: Vec::new(),
    })
  }
}

#[tauri::command]
async fn cleanup_messages(
  state: State<'_, AppState>,
  range: CleanupRange,
  scope: CleanupScope,
) -> Result<DeleteSummary, String> {
  let settings = current_settings(&state)?;
  let endpoint = resolve_active_endpoint(&settings)?;

  let cutoff_ms = match range {
    CleanupRange::All => None,
    CleanupRange::Before7Days => Some(now_ms() - 7_i64 * 24 * 60 * 60 * 1000),
  };
  let messages =
    db::list_messages(&state.db_path, &endpoint.id).map_err(|err| err.to_string())?;
  let candidates: Vec<Message> = messages
    .into_iter()
    .filter(|message| match cutoff_ms {
      Some(cutoff) => message.timestamp_ms < cutoff,
      None => true,
    })
    .collect();

  if candidates.is_empty() {
    return Ok(DeleteSummary {
      deleted: 0,
      failed: Vec::new(),
    });
  }

  match scope {
    CleanupScope::LocalOnly => {
      for message in &candidates {
        delete_local_files_for_entry(
          &state,
          &settings,
          &message.kind,
          &message.original_name,
          message.local_path.as_deref(),
        )?;
      }
      let filenames: Vec<String> = candidates.iter().map(|message| message.filename.clone()).collect();
      let deleted = db::delete_messages(&state.db_path, &endpoint.id, &filenames)
        .map_err(|err| err.to_string())?;
      Ok(DeleteSummary {
        deleted,
        failed: Vec::new(),
      })
    }
    CleanupScope::WithRemote => {
      let mut failed: Vec<String> = Vec::new();
      let mut succeeded: Vec<String> = Vec::new();
      for message in &candidates {
        let remote_path = format!("files/{}", message.filename);
        match webdav::delete_file(&state.http, &endpoint, &remote_path, true).await {
          Ok(_) => succeeded.push(message.filename.clone()),
          Err(_) => failed.push(message.filename.clone()),
        }
      }

      if !succeeded.is_empty() {
        let success_set: HashSet<String> = succeeded.iter().cloned().collect();
        remove_history_entries(&state, &endpoint, &success_set).await?;
      }

      let success_set: HashSet<String> = succeeded.iter().cloned().collect();
      for message in &candidates {
        if !success_set.contains(&message.filename) {
          continue;
        }
        delete_local_files_for_entry(
          &state,
          &settings,
          &message.kind,
          &message.original_name,
          message.local_path.as_deref(),
        )?;
      }

      let deleted = db::delete_messages(&state.db_path, &endpoint.id, &succeeded)
        .map_err(|err| err.to_string())?;
      Ok(DeleteSummary { deleted, failed })
    }
  }
}

#[tauri::command]
async fn manual_refresh(state: State<'_, AppState>) -> Result<SyncStatus, String> {
  run_sync(&state, "手动刷新", true).await
}

#[tauri::command]
fn cancel_manual_refresh(state: State<'_, AppState>) -> Result<(), String> {
  let cancel_tx = {
    let mut sync_cancel = state
      .sync_cancel
      .lock()
      .map_err(|_| "取消刷新失败".to_string())?;
    sync_cancel.take()
  };
  if let Some(tx) = cancel_tx {
    let _ = tx.send(());
  }
  Ok(())
}

#[tauri::command]
fn get_sync_status(state: State<'_, AppState>) -> Result<SyncStatus, String> {
  let status = state
    .sync_status
    .lock()
    .map_err(|_| "读取同步状态失败".to_string())?;
  Ok(status.clone())
}

#[derive(Serialize)]
pub struct SpeedTestResult {
  upload_speed_mbps: f64,
  download_speed_mbps: f64,
}

#[tauri::command]
async fn test_webdav_speed(
  state: State<'_, AppState>,
  endpoint: WebDavEndpoint,
) -> Result<SpeedTestResult, String> {
  use crate::webdav;
  use std::time::Instant;

  // 创建 1MB 的测试数据
  const TEST_SIZE: usize = 1024 * 1024; // 1MB
  let test_data: Vec<u8> = (0..TEST_SIZE).map(|i| (i % 256) as u8).collect();
  const ROUNDS: usize = 3; // 测试3轮并取平均值

  let mut upload_speeds = Vec::new();
  let mut download_speeds = Vec::new();

  // 进行多轮测试
  for round in 0..ROUNDS {
    let test_filename = format!("_speed_test_{}_{}.tmp", now_ms(), round);

    // 测试上传速度
    let upload_start = Instant::now();
    webdav::upload_file(&state.http, &endpoint, &test_filename, test_data.clone())
      .await
      .map_err(|err| format!("上传测试失败（第{}轮）: {err}", round + 1))?;
    let upload_duration = upload_start.elapsed();
    let upload_seconds = upload_duration.as_secs_f64();
    if upload_seconds > 0.0 {
      let speed = (TEST_SIZE as f64 / upload_seconds) / (1024.0 * 1024.0);
      upload_speeds.push(speed);
    }

    // 测试下载速度
    let download_start = Instant::now();
    let _downloaded = webdav::download_file(&state.http, &endpoint, &test_filename)
      .await
      .map_err(|err| format!("下载测试失败（第{}轮）: {err}", round + 1))?;
    let download_duration = download_start.elapsed();
    let download_seconds = download_duration.as_secs_f64();
    if download_seconds > 0.0 {
      let speed = (TEST_SIZE as f64 / download_seconds) / (1024.0 * 1024.0);
      download_speeds.push(speed);
    }

    // 清理测试文件
    let _ = webdav::delete_file(&state.http, &endpoint, &test_filename, true).await;
  }

  // 计算平均值
  let upload_speed_mbps = if !upload_speeds.is_empty() {
    upload_speeds.iter().sum::<f64>() / upload_speeds.len() as f64
  } else {
    0.0
  };

  let download_speed_mbps = if !download_speeds.is_empty() {
    download_speeds.iter().sum::<f64>() / download_speeds.len() as f64
  } else {
    0.0
  };

  Ok(SpeedTestResult {
    upload_speed_mbps,
    download_speed_mbps,
  })
}

// Helper function to recursively list all entries because the server does not support Depth: infinity.
async fn recursive_list_webdav(
    http: &Client,
    endpoint: &WebDavEndpoint,
    path: &str,
) -> Result<Vec<crate::types::DavEntry>, String> {
    let mut all_entries = Vec::new();
    let mut dirs_to_visit = vec![path.to_string()];
    let mut visited_dirs = std::collections::HashSet::new();

    while let Some(dir_path) = dirs_to_visit.pop() {
        if !visited_dirs.insert(dir_path.clone()) {
            continue;
        }

        let list_path = if dir_path.is_empty() { None } else { Some(dir_path.as_str()) };
        
        info!("WebDAV backup: Listing contents of '/'{}", &dir_path);
        let entries = match webdav::list_entries(http, endpoint, list_path, true).await {
            Ok(entries) => entries,
            Err(e) => {
                info!("WebDAV backup: Failed to list directory '{}': {}", &dir_path, e);
                continue;
            }
        };

        for entry in entries {
            if entry.remote_path == dir_path {
                continue;
            }

            if entry.is_collection {
                // The list_entries logic ensures remote_path is clean and relative to root.
                // We just need to make sure we don't infinitely recurse if the server returns "."
                if entry.remote_path != dir_path {
                    dirs_to_visit.push(entry.remote_path.clone());
                }
            }
            all_entries.push(entry);
        }
    }
    Ok(all_entries)
}

#[tauri::command]
async fn backup_webdav(window: Window, state: State<'_, AppState>, path: String) -> Result<(), String> {
    use std::io::Write;
    use zip::write::FileOptions;
    use futures_util::StreamExt;

    let settings = current_settings(&state)?;
    let endpoint = resolve_active_endpoint(&settings)?;

    info!("--- Starting WebDAV Backup ---");
    emit_backup_restore_progress(&window, "webdav-backup-progress", "", 0, 0, "scanning");

    // 1. Scanning
    let entries = recursive_list_webdav(&state.http, &endpoint, "").await?;
    let total_entries = entries.len() as u64;

    if total_entries == 0 {
        emit_backup_restore_progress(&window, "webdav-backup-progress", "", 0, 0, "finished");
        return Ok(());
    }

    // 2. Preparing Zip
    let file = std::fs::File::create(&path).map_err(|e| format!("创建备份文件失败: {}", e))?;
    let mut zip = zip::ZipWriter::new(file);
    let options: FileOptions<'_, ()> = FileOptions::default().compression_method(zip::CompressionMethod::Deflated);

    // 3. Process Entries
    let temp_dir = state.files_base_dir.join("temp_backup");
    if !temp_dir.exists() {
        fs::create_dir_all(&temp_dir).map_err(|e| format!("无法创建临时目录: {}", e))?;
    }

    for (index, entry) in entries.iter().enumerate() {
        let current_progress = (index + 1) as u64;
        emit_backup_restore_progress(&window, "webdav-backup-progress", &entry.filename, current_progress, total_entries, "downloading");

        if entry.is_collection {
            if !entry.remote_path.is_empty() {
                if let Err(e) = zip.add_directory(&entry.remote_path, options) {
                     log::warn!("Failed to add directory '{}': {}", &entry.remote_path, e);
                }
            }
            continue;
        }

        let remote_path = &entry.remote_path;
        if remote_path.is_empty() {
            continue;
        }

        // Stream download to temp file
        let temp_file_path = temp_dir.join(format!("backup_{}.tmp", index));
        
        let download_result = webdav::download_file_stream(&state.http, &endpoint, remote_path).await;
        match download_result {
            Ok((mut stream, _)) => {
                // Use std::fs::File (Blocking write) as tokio::fs is not enabled
                let mut temp_file = std::fs::File::create(&temp_file_path).map_err(|e| format!("创���临时文件失败: {}", e))?;
                while let Some(chunk) = stream.next().await {
                    let chunk = chunk.map_err(|e| format!("下载流中断: {}", e))?;
                    temp_file.write_all(&chunk).map_err(|e| format!("写入临时文件失败: {}", e))?;
                }
                temp_file.flush().map_err(|e| format!("刷新临时文件失败: {}", e))?;
                drop(temp_file); 

                // Write to Zip (Sync)
                let mut input_file = std::fs::File::open(&temp_file_path).map_err(|e| format!("读取临时文件失败: {}", e))?;
                if let Err(e) = zip.start_file(remote_path, options) {
                    let _ = std::fs::remove_file(&temp_file_path);
                    return Err(format!("Zip start_file failed: {}", e));
                }
                if let Err(e) = std::io::copy(&mut input_file, &mut zip) {
                    let _ = std::fs::remove_file(&temp_file_path);
                    return Err(format!("写入 Zip 失败: {}", e));
                }
                let _ = std::fs::remove_file(&temp_file_path);
            },
            Err(e) => {
                log::warn!("Skipping file '{}' due to download error: {}", remote_path, e);
            }
        }
    }

    zip.finish().map_err(|e| format!("完成 zip 文件失败: {}", e))?;
    let _ = std::fs::remove_dir_all(&temp_dir);

    emit_backup_restore_progress(&window, "webdav-backup-progress", "", total_entries, total_entries, "finished");
    Ok(())
}

#[tauri::command]
async fn restore_webdav(window: Window, state: State<'_, AppState>, path: String) -> Result<(), String> {
    
    use zip::ZipArchive;
    use std::io::Read;
    
    use bytes::Bytes;

    let settings = current_settings(&state)?;
    let endpoint = resolve_active_endpoint(&settings)?;
    
    emit_backup_restore_progress(&window, "webdav-restore-progress", "", 0, 0, "scanning");

    // 清理远程 files 目录 (递归删除所有一级子项)
    let existing_files = webdav::list_entries(&state.http, &endpoint, Some("files"), true).await?;
    for entry in existing_files {
        // remote_path is relative to root, e.g. "files/foo.txt" or "files/subdir"
        let remote_path = entry.remote_path;
        // Skip if it's "files" itself (though list_entries filters usually)
        if remote_path == "files" || remote_path == "files/" {
            continue;
        }
        let _ = webdav::delete_file(&state.http, &endpoint, &remote_path, true).await;
    }
    let _ = webdav::delete_file(&state.http, &endpoint, "history.json", true).await;

    // 收集所有文件数据
    let file = std::fs::File::open(&path).map_err(|e| format!("读取备份文件失败: {}", e))?;
    let mut archive = ZipArchive::new(file).map_err(|e| format!("解析备份文件失败: {}", e))?;
    let len = archive.len();

    // 验证 history.json 是否存在
    archive.by_name("history.json").map_err(|_| "备份文件无效: 缺少 history.json".to_string())?;
    
    // 确保目录存在 (只做一次)
    webdav::ensure_directory(&state.http, &endpoint, "files").await?;
    
    let temp_dir = state.files_base_dir.join("temp_restore");
    if !temp_dir.exists() {
        fs::create_dir_all(&temp_dir).map_err(|e| format!("无法创建临时目录: {}", e))?;
    }

    for i in 0..len {
        let current_progress = (i + 1) as u64;
         // Block to read zip entry info
        let (filename, is_dir, size) = {
             let file = archive.by_index(i).map_err(|e| format!("读取 zip entry 失败: {}", e))?;
             (file.name().to_string(), file.is_dir(), file.size())
        };
        
        emit_backup_restore_progress(&window, "webdav-restore-progress", &filename, current_progress, len as u64, "uploading");

        if is_dir {
             if !filename.is_empty() {
                 let _ = webdav::ensure_directory(&state.http, &endpoint, &filename).await;
             }
             continue;
        }

        // Extract to temp file
        let temp_file_path = temp_dir.join(format!("restore_{}.tmp", i));
        {
            let mut z_file = archive.by_index(i).unwrap();
            let mut t_file = std::fs::File::create(&temp_file_path).map_err(|e| format!("创建临时文件失败: {}", e))?;
            std::io::copy(&mut z_file, &mut t_file).map_err(|e| format!("解压文件失败: {}", e))?;
        }

        // Create a channel-based stream
        let (tx, rx) = tokio::sync::mpsc::channel::<Result<Bytes, String>>(2);
        let path_clone = temp_file_path.clone();
        
        // Spawn blocking read thread
        std::thread::spawn(move || {
            let mut file = match std::fs::File::open(&path_clone) {
                Ok(f) => f,
                Err(e) => {
                    let _ = tx.blocking_send(Err(e.to_string()));
                    return;
                }
            };
            let mut buf = [0u8; 64 * 1024];
            loop {
                match file.read(&mut buf) {
                    Ok(0) => break,
                    Ok(n) => {
                        let bytes = Bytes::copy_from_slice(&buf[..n]);
                        if tx.blocking_send(Ok(bytes)).is_err() {
                            break;
                        }
                    }
                    Err(e) => {
                        let _ = tx.blocking_send(Err(e.to_string()));
                        break;
                    }
                }
            }
        });
        
        let stream = futures_util::stream::unfold(rx, |mut rx| async move {
            match rx.recv().await {
                Some(item) => Some((item, rx)),
                None => None,
            }
        });

        // Upload
        if let Err(e) = webdav::upload_file_stream(&state.http, &endpoint, &filename, stream, size).await {
             let _ = std::fs::remove_file(&temp_file_path);
             return Err(format!("上传失败 {}: {}", filename, e));
        }
        let _ = std::fs::remove_file(&temp_file_path);
    }
    
    let _ = std::fs::remove_dir_all(&temp_dir);

    emit_backup_restore_progress(&window, "webdav-restore-progress", "", len as u64, len as u64, "finished");
    Ok(())
}

fn current_settings(state: &AppState) -> Result<Settings, String> {
  let settings = state
    .settings
    .lock()
    .map_err(|_| "读取设置失败".to_string())?;
  Ok(settings.clone())
}

fn now_ms() -> i64 {
  let duration = SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .unwrap_or_else(|_| Duration::from_secs(0));
  duration.as_millis() as i64
}

fn random_sender_name() -> String {
  let mut rng = rand::thread_rng();
  let value: u32 = rng.gen();
  format!("Device-{value:06x}")
}

fn normalize_device_name(raw: &str) -> Option<String> {
  let trimmed = raw.trim().trim_matches('\0').to_string();
  if trimmed.is_empty() {
    return None;
  }
  Some(trimmed)
}

fn resolve_device_name() -> String {
  #[cfg(target_os = "windows")]
  {
    if let Ok(name) = env::var("COMPUTERNAME") {
      if let Some(valid) = normalize_device_name(&name) {
        return valid;
      }
    }
  }

  if let Ok(name) = env::var("HOSTNAME") {
    if let Some(valid) = normalize_device_name(&name) {
      return valid;
    }
  }

  #[cfg(not(target_os = "windows"))]
  {
    if let Ok(name) = fs::read_to_string("/etc/hostname") {
      if let Some(valid) = normalize_device_name(&name) {
        return valid;
      }
    }
  }

  #[cfg(target_os = "macos")]
  {
    for key in ["ComputerName", "LocalHostName", "HostName"] {
      if let Ok(output) = std::process::Command::new("scutil")
        .args(["--get", key])
        .output()
      {
        if output.status.success() {
          let value = String::from_utf8_lossy(&output.stdout);
          if let Some(valid) = normalize_device_name(&value) {
            return valid;
          }
        }
      }
    }
  }

  "Unknown".to_string()
}

fn generate_endpoint_id() -> String {
  let mut rng = rand::thread_rng();
  let value: u64 = rng.gen();
  format!("endpoint-{value:016x}")
}

fn normalize_global_hotkey(raw: &str) -> Option<String> {
  let trimmed = raw.trim().to_lowercase();
  if trimmed.is_empty() {
    return None;
  }
  let parts: Vec<String> = trimmed
    .split('+')
    .map(str::trim)
    .filter(|part| !part.is_empty())
    .map(|part| part.to_string())
    .collect();
  if parts.len() < 2 {
    return None;
  }
  let has_modifier = parts.iter().any(|part| {
    matches!(
      part.as_str(),
      "ctrl" | "control" | "cmd" | "command" | "super" | "win" | "meta" | "alt" | "shift"
    )
  });
  if !has_modifier {
    return None;
  }
  Some(parts.join("+"))
}

fn is_valid_endpoint_id(value: &str) -> bool {
  let trimmed = value.trim();
  !(trimmed.is_empty()
    || trimmed.contains('/')
    || trimmed.contains('\\')
    || trimmed.contains(".."))
}

fn normalize_settings(
  mut settings: Settings,
  default_download_dir: &Path,
) -> Result<Settings, String> {
  if settings.refresh_interval_secs == 0 {
    settings.refresh_interval_secs = 5;
  }
  if settings.sender_name.trim().is_empty() {
    settings.sender_name = random_sender_name();
  }
  let normalized_hotkey = normalize_global_hotkey(&settings.global_hotkey);
  if settings.global_hotkey_enabled {
    let Some(hotkey) = normalized_hotkey else {
      return Err("全局快捷键格式无效，需要包含修饰键（如 Ctrl+Alt+T）".to_string());
    };
    settings.global_hotkey = hotkey;
  } else {
    settings.global_hotkey = normalized_hotkey.unwrap_or_else(|| DEFAULT_GLOBAL_HOTKEY.to_string());
  }
  let hotkey_raw = settings.send_hotkey.trim().to_lowercase();
  settings.send_hotkey = match hotkey_raw.as_str() {
    DEFAULT_SEND_HOTKEY => DEFAULT_SEND_HOTKEY.to_string(),
    SEND_HOTKEY_CTRL_ENTER => SEND_HOTKEY_CTRL_ENTER.to_string(),
    "ctrl+enter" => SEND_HOTKEY_CTRL_ENTER.to_string(),
    _ => DEFAULT_SEND_HOTKEY.to_string(),
  };
  settings.download_dir =
    normalize_download_dir(&settings.download_dir, default_download_dir);

  let mut seen_ids = HashSet::new();
  for endpoint in settings.webdav_endpoints.iter_mut() {
    endpoint.url = endpoint.url.trim().to_string();
    endpoint.username = endpoint.username.trim().to_string();
    endpoint.name = endpoint.name.trim().to_string();
    if !is_valid_endpoint_id(&endpoint.id) {
      return Err("端点 ID 无效".to_string());
    }
    if !seen_ids.insert(endpoint.id.clone()) {
      return Err("端点 ID 重复".to_string());
    }
    if endpoint.enabled && endpoint.url.is_empty() {
      return Err("启用的 WebDAV 端点必须填写 URL".to_string());
    }
  }

  let active_id = settings
    .active_webdav_id
    .as_deref()
    .unwrap_or("")
    .trim()
    .to_string();
  if active_id.is_empty() {
    settings.active_webdav_id = None;
  } else {
    let active_ok = settings.webdav_endpoints.iter().any(|endpoint| {
      endpoint.id == active_id && endpoint.enabled && !endpoint.url.is_empty()
    });
    settings.active_webdav_id = if active_ok {
      Some(active_id)
    } else {
      None
    };
  }
  Ok(settings)
}

fn extract_export_secrets(settings: &Settings) -> ExportSecrets {
  let endpoints = settings
    .webdav_endpoints
    .iter()
    .map(|endpoint| EndpointSecret {
      id: endpoint.id.clone(),
      username: endpoint.username.clone(),
      password: endpoint.password.clone(),
    })
    .collect();
  ExportSecrets { endpoints }
}

fn encrypt_export_secrets(password: &str, secrets: &ExportSecrets) -> Result<CryptoPayload, String> {
  if password.trim().is_empty() {
    return Err("密码不能为空".to_string());
  }
  let payload = serde_json::to_vec(secrets)
    .map_err(|err| format!("序列化配置凭据失败: {err}"))?;

  let mut salt = [0u8; 16];
  OsRng.fill_bytes(&mut salt);
  let mut nonce_bytes = [0u8; 12];
  OsRng.fill_bytes(&mut nonce_bytes);

  let key = derive_export_key(password, &salt, EXPORT_KDF_ITERATIONS)?;
  let cipher =
    Aes256Gcm::new_from_slice(&key).map_err(|_| "生成加密密钥失败".to_string())?;
  let nonce = Nonce::from_slice(&nonce_bytes);
  let ciphertext = cipher
    .encrypt(nonce, payload.as_ref())
    .map_err(|_| "加密失败".to_string())?;

  Ok(CryptoPayload {
    kdf: "pbkdf2-sha256".to_string(),
    cipher: "aes-256-gcm".to_string(),
    iterations: EXPORT_KDF_ITERATIONS,
    salt: BASE64.encode(salt),
    nonce: BASE64.encode(nonce_bytes),
    ciphertext: BASE64.encode(ciphertext),
  })
}

fn decrypt_export_secrets(password: &str, crypto: &CryptoPayload) -> Result<Vec<u8>, String> {
  if password.trim().is_empty() {
    return Err("密码不能为空".to_string());
  }
  if crypto.kdf != "pbkdf2-sha256" || crypto.cipher != "aes-256-gcm" {
    return Err("不支持的加密格式".to_string());
  }
  if crypto.iterations == 0 {
    return Err("配置文件迭代次数无效".to_string());
  }

  let salt = decode_export_base64("salt", &crypto.salt)?;
  let nonce_bytes = decode_export_base64("nonce", &crypto.nonce)?;
  let ciphertext = decode_export_base64("ciphertext", &crypto.ciphertext)?;
  if nonce_bytes.len() != 12 {
    return Err("配置文件 nonce 无效".to_string());
  }

  let key = derive_export_key(password, &salt, crypto.iterations)?;
  let cipher =
    Aes256Gcm::new_from_slice(&key).map_err(|_| "生成解密密钥失败".to_string())?;
  let nonce = Nonce::from_slice(&nonce_bytes);
  cipher
    .decrypt(nonce, ciphertext.as_ref())
    .map_err(|_| "解密失败，请检查密码".to_string())
}

fn apply_export_secrets(settings: &mut Settings, secrets: ExportSecrets) -> Result<(), String> {
  let mut map: HashMap<String, EndpointSecret> = HashMap::new();
  for secret in secrets.endpoints {
    let id = secret.id.trim();
    if id.is_empty() {
      return Err("配置文件端点缺少 ID".to_string());
    }
    if map.insert(secret.id.clone(), secret).is_some() {
      return Err("配置文件端点凭据重复".to_string());
    }
  }

  for endpoint in settings.webdav_endpoints.iter_mut() {
    let secret = map.get(&endpoint.id).ok_or_else(|| {
      format!("配置文件缺少端点凭据: {}", endpoint.id)
    })?;
    endpoint.username = secret.username.clone();
    endpoint.password = secret.password.clone();
  }
  Ok(())
}

fn derive_export_key(
  password: &str,
  salt: &[u8],
  iterations: u32,
) -> Result<[u8; 32], String> {
  if iterations == 0 {
    return Err("配置文件迭代次数无效".to_string());
  }
  let mut key = [0u8; 32];
  pbkdf2_hmac::<Sha256>(password.as_bytes(), salt, iterations, &mut key);
  Ok(key)
}

fn decode_export_base64(label: &str, value: &str) -> Result<Vec<u8>, String> {
  BASE64
    .decode(value.as_bytes())
    .map_err(|_| format!("配置文件 {label} 无效"))
}

fn resolve_active_endpoint(settings: &Settings) -> Result<WebDavEndpoint, String> {
  let active_id = settings
    .active_webdav_id
    .as_deref()
    .unwrap_or("")
    .trim()
    .to_string();
  if active_id.is_empty() {
    return Err("请先选择 WebDAV 端点".to_string());
  }
  let endpoint = settings
    .webdav_endpoints
    .iter()
    .find(|item| item.id == active_id)
    .ok_or_else(|| "当前 WebDAV 端点不存在".to_string())?;
  if !endpoint.enabled {
    return Err("当前 WebDAV 端点已禁用".to_string());
  }
  if endpoint.url.trim().is_empty() {
    return Err("当前 WebDAV 地址为空".to_string());
  }
  Ok(endpoint.clone())
}

fn settings_path(app_handle: &AppHandle) -> Result<PathBuf, String> {
  let base = app_handle
    .path()
    .app_data_dir()
    .map_err(|err| format!("无法定位应用数据目录: {err}"))?;
  Ok(base.join("settings.json"))
}

fn db_path(app_handle: &AppHandle) -> Result<PathBuf, String> {
  let base = app_handle
    .path()
    .app_data_dir()
    .map_err(|err| format!("无法定位应用数据目录: {err}"))?;
  Ok(base.join("messages.sqlite"))
}

fn files_base_dir(app_handle: &AppHandle) -> Result<PathBuf, String> {
  let base = app_handle
    .path()
    .app_data_dir()
    .map_err(|err| format!("无法定位应用数据目录: {err}"))?;
  Ok(base.join("files"))
}

fn default_download_dir(app_handle: &AppHandle) -> Result<PathBuf, String> {
  app_handle
    .path()
    .download_dir()
    .or_else(|_| app_handle.path().app_data_dir())
    .map_err(|err| format!("无法定位系统下载目录: {err}"))
}

fn normalize_download_dir(raw: &str, fallback: &Path) -> String {
  let trimmed = raw.trim();
  if trimmed.is_empty() {
    fallback.to_string_lossy().to_string()
  } else {
    trimmed.to_string()
  }
}

fn endpoint_files_dir(state: &AppState, endpoint_id: &str) -> PathBuf {
  state.files_base_dir.join(endpoint_id)
}

fn load_settings(path: &Path, fallback_download_dir: &Path) -> Result<Settings, String> {
  if path.exists() {
    let data = fs::read_to_string(path).map_err(|err| format!("读取设置失败: {err}"))?;
    let value =
      serde_json::from_str::<serde_json::Value>(&data).map_err(|err| format!("解析设置失败: {err}"))?;
    let settings = if value.get("webdav_endpoints").is_some() {
      serde_json::from_value::<Settings>(value).map_err(|err| format!("解析设置失败: {err}"))?
    } else {
      let legacy =
        serde_json::from_value::<LegacySettings>(value).map_err(|err| format!("解析设置失败: {err}"))?;
      let mut endpoints = Vec::new();
      let mut active_id = None;
      let url = legacy.webdav_url.trim().to_string();
      if !url.is_empty() {
        let id = generate_endpoint_id();
        endpoints.push(WebDavEndpoint {
          id: id.clone(),
          name: String::new(),
          url,
          username: legacy.username.trim().to_string(),
          password: legacy.password,
          enabled: true,
        });
        active_id = Some(id);
      }
      let sender_name = if legacy.sender_name.trim().is_empty() {
        random_sender_name()
      } else {
        legacy.sender_name
      };
      Settings {
        webdav_endpoints: endpoints,
        active_webdav_id: active_id,
        sender_name,
        refresh_interval_secs: legacy.refresh_interval_secs,
        download_dir: legacy.download_dir,
        global_hotkey_enabled: true,
        global_hotkey: DEFAULT_GLOBAL_HOTKEY.to_string(),
        send_hotkey: DEFAULT_SEND_HOTKEY.to_string(),
        auto_start: false,
      }
    };
    let normalized = normalize_settings(settings, fallback_download_dir)?;
    write_settings(path, &normalized)?;
    Ok(normalized)
  } else {
    let settings = Settings {
      webdav_endpoints: Vec::new(),
      active_webdav_id: None,
      sender_name: random_sender_name(),
      refresh_interval_secs: 5,
      download_dir: normalize_download_dir("", fallback_download_dir),
      global_hotkey_enabled: true,
      global_hotkey: DEFAULT_GLOBAL_HOTKEY.to_string(),
      send_hotkey: DEFAULT_SEND_HOTKEY.to_string(),
      auto_start: false,
    };
    write_settings(path, &settings)?;
    Ok(settings)
  }
}

fn write_settings(path: &Path, settings: &Settings) -> Result<(), String> {
  if let Some(parent) = path.parent() {
    fs::create_dir_all(parent).map_err(|err| format!("创建配置目录失败: {err}"))?;
  }
  let data = serde_json::to_string_pretty(settings)
    .map_err(|err| format!("序列化设置失败: {err}"))?;
  fs::write(path, data).map_err(|err| format!("写入设置失败: {err}"))?;
  Ok(())
}

enum ConflictAction {
  Prompt,
  Overwrite,
  Rename,
}

enum DownloadDecision {
  Ready(PathBuf),
  Conflict { suggested: PathBuf },
}

fn parse_conflict_action(raw: Option<String>) -> ConflictAction {
  match raw.as_deref() {
    Some("overwrite") => ConflictAction::Overwrite,
    Some("rename") => ConflictAction::Rename,
    _ => ConflictAction::Prompt,
  }
}

fn resolve_download_dir(state: &AppState, settings: &Settings) -> PathBuf {
  let trimmed = settings.download_dir.trim();
  if trimmed.is_empty() {
    state.default_download_dir.clone()
  } else {
    PathBuf::from(trimmed)
  }
}

fn sanitize_filename(name: &str) -> String {
  Path::new(name)
    .file_name()
    .and_then(|value| value.to_str())
    .filter(|value| !value.trim().is_empty())
    .unwrap_or("download.bin")
    .to_string()
}

fn compute_file_hash(data: &[u8]) -> String {
  let mut hasher = Sha256::new();
  hasher.update(data);
  let result = hasher.finalize();
  format!("{:x}", result)
}

fn compute_file_hash_from_path(path: &Path) -> Option<String> {
  fs::read(path).ok().map(|data| compute_file_hash(&data))
}

fn normalize_path(path: &Path) -> PathBuf {
  path.canonicalize().unwrap_or_else(|_| path.to_path_buf())
}

fn is_within_dir(path: &Path, base_dir: &Path) -> bool {
  let normalized_path = normalize_path(path);
  let normalized_base = normalize_path(base_dir);
  normalized_path.starts_with(&normalized_base)
}

fn delete_local_file(path: &Path, base_dir: &Path) -> Result<(), String> {
  if !path.exists() {
    return Ok(());
  }
  if !is_within_dir(path, base_dir) {
    return Ok(());
  }
  fs::remove_file(path).map_err(|err| format!("删除本地文件失败: {err}"))?;
  Ok(())
}

fn delete_local_files_for_entry(
  state: &AppState,
  settings: &Settings,
  kind: &str,
  original_name: &str,
  local_path: Option<&str>,
) -> Result<(), String> {
  if kind != MessageKind::File.as_str() {
    return Ok(());
  }
  let base_dir = resolve_download_dir(state, settings);
  let mut candidates: Vec<PathBuf> = Vec::new();
  if let Some(path) = local_path {
    if !path.trim().is_empty() {
      candidates.push(PathBuf::from(path));
    }
  }
  let default_path = base_dir.join(sanitize_filename(original_name));
  candidates.push(default_path);

  let mut seen: HashSet<PathBuf> = HashSet::new();
  for candidate in candidates {
    let normalized = normalize_path(&candidate);
    if !seen.insert(normalized.clone()) {
      continue;
    }
    delete_local_file(&normalized, &base_dir)?;
  }
  Ok(())
}

fn resolve_download_target(
  target_path: &Path,
  action: ConflictAction,
) -> Result<DownloadDecision, String> {
  if !target_path.exists() {
    return Ok(DownloadDecision::Ready(target_path.to_path_buf()));
  }

  if target_path.is_dir() && matches!(action, ConflictAction::Overwrite) {
    return Err("目标路径已存在且为目录".to_string());
  }

  match action {
    ConflictAction::Prompt => Ok(DownloadDecision::Conflict {
      suggested: build_renamed_path(target_path)?,
    }),
    ConflictAction::Overwrite => Ok(DownloadDecision::Ready(target_path.to_path_buf())),
    ConflictAction::Rename => Ok(DownloadDecision::Ready(build_renamed_path(target_path)?)),
  }
}

fn build_renamed_path(target_path: &Path) -> Result<PathBuf, String> {
  let parent = target_path
    .parent()
    .ok_or_else(|| "无法解析保存目录".to_string())?;
  let stem = target_path
    .file_stem()
    .and_then(|value| value.to_str())
    .unwrap_or("download");
  let extension = target_path
    .extension()
    .and_then(|value| value.to_str())
    .map(|value| format!(".{value}"))
    .unwrap_or_default();

  for index in 1..=9999 {
    let candidate = parent.join(format!("{stem} ({index}){extension}"));
    if !candidate.exists() {
      return Ok(candidate);
    }
  }
  Err("无法生成可用文件名".to_string())
}

fn ensure_parent_dir(path: &Path) -> Result<(), String> {
  if let Some(parent) = path.parent() {
    fs::create_dir_all(parent).map_err(|err| format!("创建目录失败: {err}"))?;
  }
  Ok(())
}

fn update_message_local_path(
  db_path: &Path,
  endpoint_id: &str,
  filename: &str,
  local_path: &Path,
  size: i64,
  file_hash: Option<String>,
) -> Result<(), String> {
  let existing =
    db::get_message(db_path, endpoint_id, filename).map_err(|err| err.to_string())?;
  let mut message = existing.ok_or_else(|| "未找到消息记录".to_string())?;
  message.local_path = Some(local_path.to_string_lossy().to_string());
  if size > 0 {
    message.size = size;
  }
  if file_hash.is_some() {
    message.file_hash = file_hash;
  }
  db::upsert_message(db_path, &message).map_err(|err| err.to_string())?;
  Ok(())
}

fn clear_message_local_path(
  db_path: &Path,
  endpoint_id: &str,
  filename: &str,
) -> Result<(), String> {
  let existing =
    db::get_message(db_path, endpoint_id, filename).map_err(|err| err.to_string())?;
  let mut message = existing.ok_or_else(|| "未找到消息记录".to_string())?;
  message.local_path = None;
  message.file_hash = None;
  db::upsert_message(db_path, &message).map_err(|err| err.to_string())?;
  Ok(())
}

fn emit_download_progress(
  window: &Window,
  filename: &str,
  received: u64,
  total: Option<u64>,
  status: &str,
  error: Option<String>,
) {
  let payload = DownloadProgress {
    filename: filename.to_string(),
    received,
    total,
    status: status.to_string(),
    error,
  };
  let _ = window.emit("download-progress", payload);
}

fn emit_upload_progress(
  window: &Window,
  client_id: &str,
  filename: Option<&str>,
  original_name: Option<&str>,
  received: u64,
  total: u64,
  status: &str,
  error: Option<String>,
) {
  let payload = UploadProgress {
    client_id: client_id.to_string(),
    filename: filename.map(|value| value.to_string()),
    original_name: original_name.map(|value| value.to_string()),
    received,
    total,
    status: status.to_string(),
    error,
  };
  let _ = window.emit("upload-progress", payload);
}

async fn run_sync(state: &AppState, source: &str, wait_for_turn: bool) -> Result<SyncStatus, String> {
  const SYNC_CANCELLED_SENTINEL: &str = "__sync_cancelled__";
  const SYNC_CANCELLED_MESSAGE: &str = "\u{5DF2}\u{53D6}\u{6D88}\u{5237}\u{65B0}";

  loop {
    let running_status = {
      let mut status = state
        .sync_status
        .lock()
        .map_err(|_| "\u{66F4}\u{65B0}\u{540C}\u{6B65}\u{72B6}\u{6001}\u{5931}\u{8D25}".to_string())?;
      if status.running {
        Some(status.clone())
      } else {
        status.running = true;
        status.last_error = None;
        status.last_result = Some(format!("\u{540C}\u{6B65}\u{4E2D}\u{FF1A}{source}..."));
        None
      }
    };

    if let Some(status) = running_status {
      if !wait_for_turn {
        return Ok(status);
      }
      tokio::time::sleep(Duration::from_millis(150)).await;
      continue;
    }

    break;
  }

  let (cancel_tx, cancel_rx) = oneshot::channel::<()>();
  {
    let mut sync_cancel = state
      .sync_cancel
      .lock()
      .map_err(|_| "\u{66F4}\u{65B0}\u{540C}\u{6B65}\u{72B6}\u{6001}\u{5931}\u{8D25}".to_string())?;
    *sync_cancel = Some(cancel_tx);
  }

  let result = tokio::select! {
    _ = cancel_rx => Err(SYNC_CANCELLED_SENTINEL.to_string()),
    timed = tokio::time::timeout(Duration::from_secs(SYNC_TIMEOUT_SECS), sync_once(state)) => {
      match timed {
        Ok(inner) => inner,
        Err(_) => Err(format!("\u{5237}\u{65B0}\u{8D85}\u{65F6}\u{FF08}\u{8D85}\u{8FC7} {} \u{79D2}\u{FF09}", SYNC_TIMEOUT_SECS)),
      }
    }
  };

  if let Ok(mut sync_cancel) = state.sync_cancel.lock() {
    sync_cancel.take();
  }

  let mut status = state
    .sync_status
    .lock()
    .map_err(|_| "\u{66F4}\u{65B0}\u{540C}\u{6B65}\u{72B6}\u{6001}\u{5931}\u{8D25}".to_string())?;
  status.running = false;
  status.last_run_ms = Some(now_ms());
  match result {
    Ok(count) => {
      status.last_error = None;
      status.last_result = Some(format!("\u{540C}\u{6B65}\u{5B8C}\u{6210}\u{FF0C}\u{65B0}\u{589E} {count} \u{6761}"));
      Ok(status.clone())
    }
    Err(err) => {
      if err == SYNC_CANCELLED_SENTINEL {
        status.last_error = None;
        status.last_result = Some(SYNC_CANCELLED_MESSAGE.to_string());
        Err(SYNC_CANCELLED_MESSAGE.to_string())
      } else {
        status.last_error = Some(err.clone());
        status.last_result = Some("\u{540C}\u{6B65}\u{5931}\u{8D25}".to_string());
        Err(err)
      }
    }
  }
}

async fn sync_once(state: &AppState) -> Result<usize, String> {
  let _guard = state.sync_guard.lock().await;
  let settings = {
    let settings = state
      .settings
      .lock()
      .map_err(|_| "读取设置失败".to_string())?;
    settings.clone()
  };

  let endpoint = resolve_active_endpoint(&settings)?;
  let endpoint_id = endpoint.id.clone();

  let history = load_history(state, &endpoint).await?;
  let mut history_map: HashMap<String, HistoryEntry> = history
    .into_iter()
    .map(|entry| (entry.filename.clone(), entry))
    .collect();

  let entries = webdav::list_entries(&state.http, &endpoint, Some("files"), true).await?;
  let mut files_map: HashMap<String, crate::types::DavEntry> = HashMap::new();
  for entry in entries {
    if entry.is_collection {
      continue;
    }
    files_map.insert(entry.filename.clone(), entry);
  }

  let mut all_filenames: HashSet<String> = HashSet::new();
  for name in history_map.keys() {
    all_filenames.insert(name.clone());
  }
  for name in files_map.keys() {
    all_filenames.insert(name.clone());
  }

  let keep_list: Vec<String> = all_filenames.iter().cloned().collect();
  db::prune_messages(&state.db_path, &endpoint_id, &keep_list).map_err(|err| err.to_string())?;

  let mut new_count = 0usize;
  let mut new_history_entries: Vec<HistoryEntry> = Vec::new();

  for filename in all_filenames {
    let file_entry = files_map.get(&filename);
    let history_entry = history_map.get(&filename);

    let parsed = parse_message_filename(&filename);
    let (sender, timestamp_ms, kind, original_name, size_hint, marked, format) = if let Some(history) = history_entry
    {
      (
        history.sender.clone(),
        history.timestamp_ms,
        history.kind.clone(),
        history.original_name.clone(),
        history.size,
        history.marked,
        history.format.clone(),
      )
    } else if let Some(parsed) = parsed.as_ref() {
      let format = if parsed.original_name.to_lowercase().ends_with(".md") {
        "markdown".to_string()
      } else {
        "text".to_string()
      };
      (
        parsed.sender.clone(),
        parsed.timestamp_ms,
        parsed.kind.as_str().to_string(),
        parsed.original_name.clone(),
        file_entry
          .and_then(|entry| entry.size)
          .unwrap_or(0) as i64,
        false,
        format,
      )
    } else {
      continue;
    };

    let existing =
      db::get_message(&state.db_path, &endpoint_id, &filename).map_err(|err| err.to_string())?;
    let mut message = existing.clone().unwrap_or(DbMessage {
      endpoint_id: endpoint_id.clone(),
      filename: filename.clone(),
      sender,
      timestamp_ms,
      size: size_hint,
      kind,
      original_name,
      etag: None,
      mtime: None,
      content: None,
      local_path: None,
      file_hash: None,
      marked,
      format,
    });

    if let Some(history) = history_entry {
      message.sender = history.sender.clone();
      message.timestamp_ms = history.timestamp_ms;
      message.kind = history.kind.clone();
      message.original_name = history.original_name.clone();
      if history.size > 0 {
        message.size = history.size;
      }
      message.marked = history.marked;
      message.format = history.format.clone();
    }

    if let Some(entry) = file_entry {
      message.etag = entry.etag.clone();
      message.mtime = entry.mtime.clone();
      if let Some(size) = entry.size {
        message.size = size as i64;
      }
    }

    let kind_enum = match message.kind.as_str() {
      "text" => MessageKind::Text,
      "file" => MessageKind::File,
      _ => parsed
        .as_ref()
        .map(|item| item.kind)
        .unwrap_or(MessageKind::File),
    };

    let remote_path = file_entry
      .map(|entry| entry.remote_path.clone())
      .unwrap_or_else(|| format!("files/{}", filename));

    let mut changed = false;

    match kind_enum {
      MessageKind::Text => {
        if message.content.is_none() {
          let bytes = if file_entry.is_some() {
            Some(webdav::download_file(&state.http, &endpoint, &remote_path).await?)
          } else {
            webdav::download_optional_file(&state.http, &endpoint, &remote_path).await?
          };
          if let Some(bytes) = bytes {
            let content = String::from_utf8_lossy(&bytes).to_string();
            message.content = Some(content);
            message.size = bytes.len() as i64;
            changed = true;
          }
        }
      }
      MessageKind::File => {
        // File downloads happen on demand.
      }
    }

    if history_entry.is_none() {
      new_history_entries.push(message_to_history(&message));
    }

    let mut should_upsert = existing.is_none() || changed;
    if let Some(existing) = existing.as_ref() {
      if existing.sender != message.sender
        || existing.timestamp_ms != message.timestamp_ms
        || existing.size != message.size
        || existing.kind != message.kind
        || existing.original_name != message.original_name
        || existing.content != message.content
        || existing.local_path != message.local_path
        || existing.marked != message.marked
      {
        should_upsert = true;
      }
    }

    if should_upsert {
      db::upsert_message(&state.db_path, &message).map_err(|err| err.to_string())?;
      if existing.is_none() {
        new_count += 1;
      }
    }
  }

  if !new_history_entries.is_empty() {
    for entry in new_history_entries {
      history_map.insert(entry.filename.clone(), entry);
    }
    let mut history: Vec<HistoryEntry> = history_map.into_values().collect();
    history.sort_by_key(|item| item.timestamp_ms);
    save_history(state, &endpoint, &history).await?;
  }

  Ok(new_count)
}

fn message_to_history(message: &DbMessage) -> HistoryEntry {
  HistoryEntry {
    filename: message.filename.clone(),
    sender: message.sender.clone(),
    timestamp_ms: message.timestamp_ms,
    size: message.size,
    kind: message.kind.clone(),
    original_name: message.original_name.clone(),
    marked: message.marked,
    format: message.format.clone(),
  }
}

async fn append_history(
  state: &AppState,
  endpoint: &WebDavEndpoint,
  entry: HistoryEntry,
) -> Result<(), String> {
  let mut history = load_history(state, endpoint).await?;
  if history.iter().any(|item| item.filename == entry.filename) {
    return Ok(());
  }
  history.push(entry);
  history.sort_by_key(|item| item.timestamp_ms);
  save_history(state, endpoint, &history).await
}

async fn load_history(
  state: &AppState,
  endpoint: &WebDavEndpoint,
) -> Result<Vec<HistoryEntry>, String> {
  let bytes = webdav::download_optional_file(&state.http, endpoint, "history.json").await?;
  match bytes {
    Some(data) => serde_json::from_slice::<Vec<HistoryEntry>>(&data)
      .map_err(|err| format!("解析历史记录失败: {err}")),
    None => Ok(Vec::new()),
  }
}

async fn save_history(
  state: &AppState,
  endpoint: &WebDavEndpoint,
  history: &[HistoryEntry],
) -> Result<(), String> {
  let data =
    serde_json::to_vec_pretty(history).map_err(|err| format!("序列化历史记录失败: {err}"))?;
  webdav::upload_file(&state.http, endpoint, "history.json", data).await
}

async fn remove_history_entries(
  state: &AppState,
  endpoint: &WebDavEndpoint,
  filenames: &HashSet<String>,
) -> Result<(), String> {
  if filenames.is_empty() {
    return Ok(());
  }
  let mut history = load_history(state, endpoint).await?;
  history.retain(|entry| !filenames.contains(&entry.filename));
  save_history(state, endpoint, &history).await
}

fn show_main_window(app: &AppHandle) {
  if let Some(window) = app.get_webview_window("main") {
    let _ = window.unminimize();
    let _ = window.show();
    let _ = window.set_focus();
    let _ = window.emit("trigger-show", ());
    #[cfg(target_os = "macos")]
    sync_dock_visibility_webview(app, &window);
  }
}

fn toggle_main_window(app: &AppHandle) {
  if let Some(window) = app.get_webview_window("main") {
    let is_visible = window.is_visible().unwrap_or(true);
    if is_visible {
      let _ = window.hide();
      #[cfg(target_os = "macos")]
      sync_dock_visibility_webview(app, &window);
    } else {
      let _ = window.unminimize();
      let _ = window.show();
      let _ = window.set_focus();
      let _ = window.emit("trigger-show", ());
      #[cfg(target_os = "macos")]
      sync_dock_visibility_webview(app, &window);
    }
  }
}

#[cfg(desktop)]
fn set_autostart(_app: &AppHandle, enabled: bool) -> Result<(), String> {
  let exe = env::current_exe().map_err(|err| format!("获取可执行文件路径失败: {err}"))?;
  let exe_str = exe.to_str().ok_or("可执行文件路径无效")?;

  #[cfg(target_os = "windows")]
  {
    use winreg::enums::*;
    use winreg::RegKey;

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let run = hkcu.open_subkey_with_flags("Software\\Microsoft\\Windows\\CurrentVersion\\Run", KEY_WRITE)
      .map_err(|err| format!("打开注册表失败: {err}"))?;

    if enabled {
      run.set_value("transfer-genie", &exe_str.to_string())
        .map_err(|err| format!("设置自启动失败: {err}"))?;
    } else {
      let _ = run.delete_value("transfer-genie");
    }
  }

  #[cfg(target_os = "macos")]
  {
    use std::process::Command;

    let home = env::var("HOME").map_err(|_| "无法获取 HOME 目录")?;
    let plist_path = format!("{}/Library/LaunchAgents/com.transfer-genie.plist", home);
    
    // 获取当前用户 ID
    let uid_output = Command::new("id")
      .args(&["-u"])
      .output()
      .map_err(|_| "无法获取用户 ID")?;
    let uid = String::from_utf8_lossy(&uid_output.stdout).trim().to_string();
    let domain_target = format!("gui/{}", uid);

    if enabled {
      let plist_content = format!(
        r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.transfer-genie</string>
  <key>ProgramArguments</key>
  <array>
    <string>{}</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
</dict>
</plist>"#,
        exe_str.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;")
      );

      fs::create_dir_all(Path::new(&plist_path).parent().unwrap())
        .map_err(|err| format!("创建目录失败: {err}"))?;
      fs::write(&plist_path, plist_content)
        .map_err(|err| format!("写入 plist 文件失败: {err}"))?;

      // 先尝试卸载（如果存在）
      let _ = Command::new("launchctl")
        .args(&["bootout", &domain_target, &plist_path])
        .output();
      
      // 使用 bootstrap 加载（macOS 10.11+ 推荐方式）
      let output = Command::new("launchctl")
        .args(&["bootstrap", &domain_target, &plist_path])
        .output()
        .map_err(|e| format!("无法执行 launchctl 命令: {e}"))?;
      
      if output.status.success() {
        // 成功
      } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        // 如果是因为已经存在，这不算错误（先卸载再加载可能仍然存在）
        if stderr.contains("Service is already bootstrapped") || stderr.is_empty() {
          // 服务已存在，视为成功
        } else {
          return Err(format!("设置自启动失败: {}", stderr));
        }
      }
    } else {
      // 使用 bootout 卸载
      let _ = Command::new("launchctl")
        .args(&["bootout", &domain_target, &plist_path])
        .output();
      let _ = fs::remove_file(&plist_path);
    }
  }

  #[cfg(target_os = "linux")]
  {
    use std::process::Command;

    let desktop_file = format!(
      "{}/.config/autostart/transfer-genie.desktop",
      env::var("HOME").map_err(|_| "无法获取 HOME 目录")?
    );

    if enabled {
      let desktop_content = format!(
        "[Desktop Entry]\nType=Application\nName=Transfer Genie\nExec={}\nHidden=false\nNoDisplay=false\nX-GNOME-Autostart-enabled=true\n",
        exe_str
      );

      fs::create_dir_all(Path::new(&desktop_file).parent().unwrap())
        .map_err(|err| format!("创建目录失败: {err}"))?;
      fs::write(&desktop_file, desktop_content)
        .map_err(|err| format!("写入 desktop 文件失败: {err}"))?;
    } else {
      let _ = fs::remove_file(&desktop_file);
    }
  }

  Ok(())
}

#[cfg(desktop)]
fn update_global_hotkey_registration(
  app: &AppHandle,
  state: &AppState,
  settings: &Settings,
) -> Result<(), String> {
  let mut current = state
    .registered_hotkey
    .lock()
    .map_err(|_| "更新全局快捷键失败".to_string())?;
  let manager = app.global_shortcut();

  if let Some(active) = current.clone() {
    if manager.is_registered(active.clone()) {
      manager
        .unregister(active)
        .map_err(|err| format!("注销全局快捷键失败: {err}"))?;
    }
  }

  if settings.global_hotkey_enabled {
    let hotkey = normalize_global_hotkey(&settings.global_hotkey)
      .ok_or_else(|| "全局快捷键格式无效，需要包含修饰键（如 Ctrl+Alt+T）".to_string())?;
    let shortcut = hotkey
      .parse::<Shortcut>()
      .map_err(|err| format!("快捷键解析失败: {err}"))?;
    manager
      .register(shortcut.clone())
      .map_err(|err| format!("注册全局快捷键失败: {err}"))?;
    *current = Some(shortcut);
  } else {
    *current = None;
  }

  Ok(())
}

#[cfg(target_os = "macos")]
fn sync_dock_visibility_webview(app: &AppHandle, window: &tauri::WebviewWindow) {
  let minimized = window.is_minimized().unwrap_or(false);
  let visible = window.is_visible().unwrap_or(true);
  let _ = app.set_dock_visibility(visible && !minimized);
}

#[cfg(target_os = "macos")]
fn sync_dock_visibility_window(app: &AppHandle, window: &Window) {
  let minimized = window.is_minimized().unwrap_or(false);
  let visible = window.is_visible().unwrap_or(true);
  let _ = app.set_dock_visibility(visible && !minimized);
}

fn start_sync_loop(app_handle: AppHandle) {
  tauri::async_runtime::spawn(async move {
    loop {
      let state = app_handle.state::<AppState>();
      let interval = match state.settings.lock() {
        Ok(settings) => {
          if settings.refresh_interval_secs == 0 {
            5
          } else {
            settings.refresh_interval_secs
          }
        }
        Err(_) => 5,
      };

      let _ = run_sync(&state, "定时同步", false).await;
      tokio::time::sleep(Duration::from_secs(interval)).await;
    }
  });
}

fn main() {
  let mut builder = tauri::Builder::default();

  #[cfg(desktop)]
  {
    builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
      show_main_window(app);
    }));
  }

  let app = builder
    .setup(|app| {
      let settings_path = settings_path(&app.handle())?;
      let db_path = db_path(&app.handle())?;
      let files_base_dir = files_base_dir(&app.handle())?;
      let default_download_dir = default_download_dir(&app.handle())?;

      let settings = load_settings(&settings_path, &default_download_dir)?;
      let migration_endpoint_id = settings
        .active_webdav_id
        .as_deref()
        .or_else(|| settings.webdav_endpoints.first().map(|endpoint| endpoint.id.as_str()));

      db::init_db(&db_path, migration_endpoint_id)?;
      fs::create_dir_all(&files_base_dir).map_err(|err| format!("创建文件目录失败: {err}"))?;

      app.manage(AppState {
        settings_path,
        db_path,
        files_base_dir,
        default_download_dir,
        settings: Mutex::new(settings),
        sync_status: Mutex::new(SyncStatus::idle()),
        sync_guard: AsyncMutex::new(()),
        sync_cancel: Mutex::new(None),
        http: Client::builder()
          .connect_timeout(Duration::from_secs(10))
          .timeout(Duration::from_secs(SYNC_TIMEOUT_SECS))
          .pool_idle_timeout(Duration::from_secs(30))
          .build()
          .map_err(|err| format!("创建 HTTP 客户端失败: {err}"))?,
        registered_hotkey: Mutex::new(None),
      });

      #[cfg(desktop)]
      {
        use tauri::menu::{Menu, MenuItem};
        use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
        use tauri_plugin_global_shortcut::ShortcutState;

        let show_item = MenuItem::with_id(app, "show", "显示窗口", true, None::<&str>)?;
        let initial_hotkey_label = {
          let state = app.state::<AppState>();
          state
            .settings
            .lock()
            .map(|settings| {
              if settings.global_hotkey_enabled {
                "禁用快捷键"
              } else {
                "启用快捷键"
              }
            })
            .unwrap_or("禁用快捷键")
        };
        let hotkey_item =
          MenuItem::with_id(app, HOTKEY_MENU_ID, initial_hotkey_label, true, None::<&str>)?;
        let quit_item = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
        let tray_menu = Menu::with_items(app, &[&show_item, &hotkey_item, &quit_item])?;
        let app_icon = load_app_icon().ok();

        let mut tray_builder = TrayIconBuilder::new().menu(&tray_menu);
        #[cfg(target_os = "macos")]
        {
          tray_builder = tray_builder.show_menu_on_left_click(false);
        }
        if let Some(icon) = app_icon.clone() {
          tray_builder = tray_builder.icon(icon);
        }
        tray_builder
          .on_menu_event(move |app, event: tauri::menu::MenuEvent| match event.id().as_ref() {
            "show" => show_main_window(app),
            "quit" => app.exit(0),
            HOTKEY_MENU_ID => {
              let state = app.state::<AppState>();
              let (mut settings_copy, settings_path) = {
                let Ok(settings) = state.settings.lock() else {
                  return;
                };
                (settings.clone(), state.settings_path.clone())
              };
              settings_copy.global_hotkey_enabled = !settings_copy.global_hotkey_enabled;

              if let Err(err) =
                update_global_hotkey_registration(app, &state, &settings_copy)
              {
                eprintln!("更新全局快捷键失败: {err}");
                return;
              };

              if let Err(err) = write_settings(&settings_path, &settings_copy) {
                eprintln!("写入快捷键设置失败: {err}");
              } else if let Ok(mut guard) = state.settings.lock() {
                *guard = settings_copy.clone();
              }

              let label = if settings_copy.global_hotkey_enabled {
                "禁用快捷键"
              } else {
                "启用快捷键"
              };
              let _ = hotkey_item.set_text(label);
            }
            _ => {}
          })
          .on_tray_icon_event(
            |tray: &tauri::tray::TrayIcon<_>, event: tauri::tray::TrayIconEvent| {
              if let TrayIconEvent::Click {
                button,
                button_state,
                ..
              } = event
              {
                let should_show = button == MouseButton::Left
                  && (cfg!(target_os = "macos") || button_state == MouseButtonState::Up);
                if should_show {
                  show_main_window(tray.app_handle());
                }
              }
            },
          )
          .build(app)?;

        app.handle().plugin(
          tauri_plugin_global_shortcut::Builder::new()
            .with_handler(|app, shortcut, event| {
              if event.state != ShortcutState::Pressed {
                return;
              }
              let state = app.state::<AppState>();
              let Ok(active) = state.registered_hotkey.lock() else {
                return;
              };
              if let Some(current) = active.as_ref() {
                if *shortcut == *current {
                  toggle_main_window(app);
                }
              }
            })
            .build(),
        )?;

        {
          let state = app.state::<AppState>();
          let settings = match state.settings.lock() {
            Ok(guard) => guard.clone(),
            Err(_) => return Ok(()),
          };
          if let Err(err) =
            update_global_hotkey_registration(&app.handle(), &state, &settings)
          {
            eprintln!("注册全局快捷键失败: {err}");
          }
        }

        if let Some(window) = app.get_webview_window("main") {
          if let Some(icon) = app_icon {
            let _ = window.set_icon(icon);
          }
          let event_window = window.clone();
          window.on_window_event(move |event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
              let _ = event_window.hide();
              api.prevent_close();
            }
            #[cfg(target_os = "macos")]
            sync_dock_visibility_webview(&event_window.app_handle(), &event_window);
          });
        }
      }

      start_sync_loop(app.handle().clone());
      Ok(())
    })
    .plugin(
      tauri_plugin_log::Builder::default()
        .targets([
          Target::new(TargetKind::Stdout),
          Target::new(TargetKind::Webview),
          Target::new(TargetKind::LogDir { file_name: Some("app.log".into()) }),
        ])
        .level(LevelFilter::Info)
        .build(),
    )
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_opener::init())
          .invoke_handler(tauri::generate_handler![
            get_settings,
            save_settings,
            save_send_hotkey,
            get_device_name,
            export_settings,
            import_settings,
            list_messages,
            send_text,
            send_file,
            send_file_data,
            get_thumbnail,
            download_message_file,
            save_message_file_as,
            save_local_data,
            open_message_file,
            open_download_dir,
            open_log_dir,
            open_data_dir,
            open_url,
            minimize_window,
            fetch_image_preview,
            delete_messages,
            cleanup_messages,
            manual_refresh,
            cancel_manual_refresh,
            get_sync_status,
            mark_message,
            unmark_message,
            test_webdav_speed,
            backup_webdav,
            restore_webdav
          ])    .build(tauri::generate_context!())
    .expect("error while building tauri application");

  app.run(|_app_handle, _event| {
    #[cfg(target_os = "macos")]
    if let tauri::RunEvent::Reopen { .. } = _event {
      show_main_window(_app_handle);
    }
  });
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn test_history_entry_serde() {
    let entry = HistoryEntry {
      filename: "test.txt".to_string(),
      sender: "me".to_string(),
      timestamp_ms: 1234567890,
      size: 100,
      kind: "text".to_string(),
      original_name: "test.txt".to_string(),
      marked: true,
    };
    
    let json = serde_json::to_string(&entry).unwrap();
    assert!(json.contains("\"marked\":true"));
    
    let deserialized: HistoryEntry = serde_json::from_str(&json).unwrap();
    assert_eq!(deserialized.marked, true);
    
    // Test default
    let json_old = r#"{"filename":"test.txt","sender":"me","timestamp_ms":1234567890,"size":100,"kind":"text","original_name":"test.txt"}"#;
    let deserialized_old: HistoryEntry = serde_json::from_str(json_old).unwrap();
    assert_eq!(deserialized_old.marked, false);
  }
}
