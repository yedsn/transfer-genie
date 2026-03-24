#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod db;
mod filenames;
mod history;
mod telegram_bridge;
mod types;
mod webdav;

use crate::db::{DbDownloadHistory, DbMessage, DbPartialDownload, DbUploadHistory};
use crate::filenames::{
    build_message_filename, message_remote_path, parse_message_filename, thumbnail_remote_path,
    MessageKind,
};
use crate::history::{HistoryEntry, HistoryLayout};
use crate::types::{
    DownloadHistoryRecord, Message, Settings, SyncStatus, TelegramBridgeSettings,
    UploadHistoryRecord, WebDavEndpoint,
};
use aes_gcm::aead::Aead;
use aes_gcm::{Aes256Gcm, KeyInit, Nonce};
use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use log::info;
use log::LevelFilter;
use pbkdf2::pbkdf2_hmac;
use rand::rngs::OsRng;
use rand::{Rng, RngCore};
use reqwest::{Client, Proxy};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::{HashMap, HashSet};
use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, ExitStatus, Stdio};
use std::sync::Mutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::Window;
use tauri::{AppHandle, Emitter, Manager, State};
#[cfg(desktop)]
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut};
use tauri_plugin_log::{Target, TargetKind};
use tauri_plugin_opener::OpenerExt;
use tokio::sync::{oneshot, watch, Mutex as AsyncMutex};

struct AppState {
    settings_path: PathBuf,
    db_path: PathBuf,
    files_base_dir: PathBuf,
    default_download_dir: PathBuf,
    settings: Mutex<Settings>,
    sync_status: Mutex<SyncStatus>,
    sync_guard: AsyncMutex<()>,
    sync_cancel: Mutex<Option<oneshot::Sender<()>>>,
    sync_loop_signal: watch::Sender<u64>,
    http: Client,
    registered_hotkey: Mutex<Option<Shortcut>>,
    telegram_bridge: Mutex<TelegramBridgeManager>,
}

const EXPORT_VERSION: u8 = 1;
const EXPORT_KDF_ITERATIONS: u32 = 100_000;
const DEFAULT_GLOBAL_HOTKEY: &str = "alt+t";
const HOTKEY_MENU_ID: &str = "toggle-hotkey";
const DEFAULT_SEND_HOTKEY: &str = "enter";
const SEND_HOTKEY_CTRL_ENTER: &str = "ctrl_enter";
const SYNC_TIMEOUT_SECS: u64 = 45;
const REFRESH_SYNC_SOURCE: &str = "正在刷新";
const AUTO_SYNC_SOURCE: &str = "定时同步";
const TELEGRAM_BRIDGE_ARG: &str = "--telegram-bridge";
const DEFAULT_TELEGRAM_POLL_INTERVAL_SECS: u64 = 5;

fn default_export_global_hotkey_enabled() -> bool {
    true
}

fn default_export_telegram_poll_interval_secs() -> u64 {
    DEFAULT_TELEGRAM_POLL_INTERVAL_SECS
}

#[cfg(desktop)]
fn load_app_icon() -> Result<tauri::image::Image<'static>, String> {
    tauri::image::Image::from_bytes(include_bytes!("../icons/icon.png"))
        .map(|image| image.to_owned())
        .map_err(|err| format!("加载图标失败: {err}"))
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
    #[serde(default)]
    telegram: ExportTelegramSettings,
}

#[derive(Default, Serialize, Deserialize)]
struct ExportTelegramSettings {
    #[serde(default)]
    enabled: bool,
    #[serde(default)]
    auto_start: bool,
    #[serde(default)]
    sender_name: String,
    #[serde(default)]
    proxy_enabled: bool,
    #[serde(default = "default_telegram_proxy_url")]
    proxy_url: String,
    #[serde(default = "default_export_telegram_poll_interval_secs")]
    poll_interval_secs: u64,
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
    #[serde(default, skip_serializing_if = "Option::is_none")]
    telegram: Option<ExportTelegramSecret>,
}

#[derive(Serialize, Deserialize)]
struct EndpointSecret {
    id: String,
    username: String,
    password: String,
}

#[derive(Serialize, Deserialize)]
struct ExportTelegramSecret {
    bot_token: String,
    chat_id: String,
}

#[derive(Clone, Serialize)]
struct TelegramBridgeStatus {
    running: bool,
    pid: Option<u32>,
    last_started_ms: Option<i64>,
    last_stopped_ms: Option<i64>,
    last_error: Option<String>,
}

#[derive(Clone, Serialize, Deserialize, Debug, PartialEq, Eq)]
struct TelegramChatCandidate {
    id: String,
    title: String,
    chat_type: String,
    sender_name: String,
}

#[derive(Serialize)]
struct TelegramBridgeRuntimeConfig {
    device_sender_name: String,
    telegram_sender_name: String,
    telegram_bot_token: String,
    allowed_chat_id: i64,
    proxy_url: String,
    webdav: WebDavEndpoint,
    poll_interval_secs: u64,
    state_path: String,
    temp_dir: String,
}

struct ManagedTelegramBridgeProcess {
    child: Child,
    runtime_config_path: PathBuf,
}

#[derive(Default)]
struct TelegramBridgeManager {
    process: Option<ManagedTelegramBridgeProcess>,
    last_started_ms: Option<i64>,
    last_stopped_ms: Option<i64>,
    last_error: Option<String>,
    last_pid: Option<u32>,
}

#[derive(Serialize)]
struct DownloadResult {
    status: String,
    path: Option<String>,
    suggested_path: Option<String>,
    transfer_mode: Option<String>,
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
    endpoint_id: String,
    filename: String,
    received: u64,
    total: Option<u64>,
    transfer_mode: Option<String>,
    range_start: Option<u64>,
    range_end: Option<u64>,
    status: String,
    error: Option<String>,
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum DownloadTransferMode {
    Fresh,
    Resumed,
    Restarted,
}

impl DownloadTransferMode {
    fn as_str(self) -> &'static str {
        match self {
            Self::Fresh => "fresh",
            Self::Resumed => "resumed",
            Self::Restarted => "restarted",
        }
    }
}

struct DownloadExecutionResult {
    final_path: PathBuf,
    file_size: i64,
    transfer_mode: DownloadTransferMode,
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

#[derive(Deserialize)]
struct TelegramDiscoveryResponse<T> {
    ok: bool,
    result: Option<T>,
    description: Option<String>,
}

#[derive(Deserialize)]
struct TelegramDiscoveryUpdate {
    update_id: i64,
    #[serde(default)]
    message: Option<TelegramDiscoveryMessage>,
    #[serde(default)]
    edited_message: Option<TelegramDiscoveryMessage>,
    #[serde(default)]
    channel_post: Option<TelegramDiscoveryMessage>,
    #[serde(default)]
    edited_channel_post: Option<TelegramDiscoveryMessage>,
}

#[derive(Deserialize)]
struct TelegramDiscoveryMessage {
    chat: TelegramDiscoveryChat,
    #[serde(default)]
    from: Option<TelegramDiscoveryUser>,
}

#[derive(Deserialize)]
struct TelegramDiscoveryChat {
    id: i64,
    #[serde(rename = "type")]
    chat_type: String,
    #[serde(default)]
    title: Option<String>,
    #[serde(default)]
    username: Option<String>,
    #[serde(default)]
    first_name: Option<String>,
    #[serde(default)]
    last_name: Option<String>,
}

#[derive(Deserialize)]
struct TelegramDiscoveryUser {
    #[allow(dead_code)]
    id: i64,
    #[serde(default)]
    username: Option<String>,
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
fn get_telegram_bridge_status(state: State<'_, AppState>) -> Result<TelegramBridgeStatus, String> {
    telegram_bridge_status(&state)
}

#[tauri::command]
async fn discover_telegram_chats(
    bot_token: String,
    proxy_url: Option<String>,
) -> Result<Vec<TelegramChatCandidate>, String> {
    discover_telegram_chats_impl(&bot_token, proxy_url.as_deref().unwrap_or("")).await
}

#[tauri::command]
async fn start_telegram_bridge(state: State<'_, AppState>) -> Result<TelegramBridgeStatus, String> {
    start_telegram_bridge_impl(&state).await
}

#[tauri::command]
fn stop_telegram_bridge(state: State<'_, AppState>) -> Result<TelegramBridgeStatus, String> {
    stop_telegram_bridge_impl(&state)
}

#[tauri::command]
async fn save_settings(
    app: AppHandle,
    state: State<'_, AppState>,
    settings: Settings,
) -> Result<Settings, String> {
    let previous = current_settings(&state)?;
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

    {
        let mut guard = state
            .settings
            .lock()
            .map_err(|_| "写入设置失败".to_string())?;
        *guard = normalized.clone();
    }

    if should_restart_telegram_bridge(&previous, &normalized) {
        restart_telegram_bridge_after_settings_change(&state, "settings update").await;
    }

    signal_sync_loop_reset(&state);

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
        telegram: ExportTelegramSettings {
            enabled: settings.telegram.enabled,
            auto_start: settings.telegram.auto_start,
            sender_name: settings.telegram.sender_name.clone(),
            proxy_enabled: settings.telegram.proxy_enabled,
            proxy_url: settings.telegram.proxy_url.clone(),
            poll_interval_secs: settings.telegram.poll_interval_secs,
        },
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

    let data =
        serde_json::to_string_pretty(&bundle).map_err(|err| format!("序列化配置失败: {err}"))?;
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
    let secrets: ExportSecrets =
        serde_json::from_slice(&secrets_bytes).map_err(|err| format!("解析配置凭据失败: {err}"))?;

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
        telegram: TelegramBridgeSettings {
            enabled: bundle.settings.telegram.enabled,
            auto_start: bundle.settings.telegram.auto_start,
            sender_name: bundle.settings.telegram.sender_name,
            bot_token: existing.telegram.bot_token,
            chat_id: existing.telegram.chat_id,
            proxy_enabled: bundle.settings.telegram.proxy_enabled,
            proxy_url: bundle.settings.telegram.proxy_url,
            poll_interval_secs: bundle.settings.telegram.poll_interval_secs,
        },
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
    signal_sync_loop_reset(&state);
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
    let existing =
        db::get_message(&state.db_path, &endpoint.id, &filename).map_err(|err| err.to_string())?;

    if let Some(mut message) = existing {
        message.marked = marked;
        db::upsert_message(&state.db_path, &message).map_err(|err| err.to_string())?;
    } else {
        return Err("未找到消息".to_string());
    }

    // 2. Update remote history.json
    let _guard = state.sync_guard.lock().await;

    let mut history = crate::history::load_history(&state.http, &endpoint).await?;
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
        crate::history::save_history(&state.http, &endpoint, &history).await?;
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
    let total = db::count_messages(&state.db_path, &endpoint.id, marked_filter)
        .map_err(|err| err.to_string())?;

    // Always get the total count of marked messages for the badge
    let marked_count = if marked_filter {
        total
    } else {
        db::count_messages(&state.db_path, &endpoint.id, true).map_err(|err| err.to_string())?
    };

    let messages =
        db::list_messages_paged(&state.db_path, &endpoint.id, limit, offset, marked_filter)
            .map_err(|err| err.to_string())?;

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
async fn send_text(
    state: State<'_, AppState>,
    text: String,
    format: Option<String>,
) -> Result<(), String> {
    let settings = current_settings(&state)?;
    let endpoint = resolve_active_endpoint(&settings)?;

    let format = format.unwrap_or_else(|| "text".to_string());
    let is_markdown = format == "markdown";
    let extension = if is_markdown {
        "message.md"
    } else {
        "message.txt"
    };

    let timestamp_ms = now_ms();
    let filename = build_message_filename(&settings.sender_name, extension, timestamp_ms);
    let remote_path = message_remote_path(&filename, timestamp_ms);
    let data = text.clone().into_bytes();

    webdav::ensure_parent_directories(&state.http, &endpoint, &remote_path).await?;
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
        remote_path: Some(remote_path),
        file_hash: None,
        marked: false,
        format,
    };

    db::upsert_message(&state.db_path, &message).map_err(|err| err.to_string())?;
    let _ =
        crate::history::append_history(&state.http, &endpoint, message_to_history(&message)).await;
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

fn cache_uploaded_file_from_path(source_path: &Path, target_path: &Path) -> Result<(), String> {
    if let Some(parent) = target_path.parent() {
        fs::create_dir_all(parent).map_err(|err| format!("创建目录失败: {err}"))?;
    }
    match fs::hard_link(source_path, target_path) {
        Ok(()) => Ok(()),
        Err(_) => {
            fs::copy(source_path, target_path).map_err(|err| format!("保存本地文件失败: {err}"))?;
            Ok(())
        }
    }
}

fn cache_uploaded_bytes(target_path: &Path, data: &[u8]) -> Result<(), String> {
    if let Some(parent) = target_path.parent() {
        fs::create_dir_all(parent).map_err(|err| format!("创建目录失败: {err}"))?;
    }
    fs::write(target_path, data).map_err(|err| format!("保存本地文件失败: {err}"))
}

fn spawn_thumbnail_upload(
    http: Client,
    endpoint: WebDavEndpoint,
    endpoint_dir: PathBuf,
    remote_path: String,
    filename: String,
    timestamp_ms: i64,
    original_name: String,
    data: Vec<u8>,
) {
    if !is_image_file(&original_name) {
        return;
    }
    tokio::spawn(async move {
        let thumb_data = match tokio::task::spawn_blocking(move || generate_thumbnail(&data)).await {
            Ok(Ok(bytes)) => bytes,
            _ => return,
        };
        let thumb_remote_path =
            resolved_thumbnail_remote_path(Some(&remote_path), &filename, Some(timestamp_ms));
        let _ = webdav::ensure_parent_directories(&http, &endpoint, &thumb_remote_path).await;
        let _ = webdav::upload_file(&http, &endpoint, &thumb_remote_path, thumb_data.clone()).await;

        let thumb_local_dir = endpoint_dir.join(".thumbs");
        let _ = fs::create_dir_all(&thumb_local_dir);
        let _ = fs::write(thumb_local_dir.join(&filename), thumb_data);
    });
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
    let remote_path = message_remote_path(&filename, timestamp_ms);

    let client_id = client_id
        .and_then(|value| {
            if value.trim().is_empty() {
                None
            } else {
                Some(value)
            }
        })
        .unwrap_or_else(|| filename.clone());

    webdav::ensure_parent_directories(&state.http, &endpoint, &remote_path).await?;
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
    cache_uploaded_file_from_path(&file_path, &local_path)?;

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
        remote_path: Some(remote_path),
        file_hash: Some(file_hash),
        marked: false,
        format: "text".to_string(),
    };

    db::upsert_message(&state.db_path, &message).map_err(|err| err.to_string())?;
    let _ =
        crate::history::append_history(&state.http, &endpoint, message_to_history(&message)).await;
    persist_upload_history(
        &state,
        &endpoint.id,
        &filename,
        &original_name,
        Some(&local_path),
        "complete",
        None,
        total_bytes as i64,
    )?;
    spawn_thumbnail_upload(
        state.http.clone(),
        endpoint.clone(),
        endpoint_dir,
        message.remote_path.clone().unwrap_or_default(),
        filename,
        timestamp_ms,
        original_name,
        data,
    );
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
    let remote_path = message_remote_path(&filename, timestamp_ms);

    let client_id = client_id
        .and_then(|value| {
            if value.trim().is_empty() {
                None
            } else {
                Some(value)
            }
        })
        .unwrap_or_else(|| filename.clone());

    webdav::ensure_parent_directories(&state.http, &endpoint, &remote_path).await?;
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
    cache_uploaded_bytes(&local_path, &data)?;

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
        remote_path: Some(remote_path),
        file_hash: Some(file_hash),
        marked: false,
        format: "text".to_string(),
    };

    db::upsert_message(&state.db_path, &message).map_err(|err| err.to_string())?;
    let _ =
        crate::history::append_history(&state.http, &endpoint, message_to_history(&message)).await;
    persist_upload_history(
        &state,
        &endpoint.id,
        &filename,
        &message.original_name,
        Some(&local_path),
        "complete",
        None,
        total_bytes as i64,
    )?;
    spawn_thumbnail_upload(
        state.http.clone(),
        endpoint.clone(),
        endpoint_dir,
        message.remote_path.clone().unwrap_or_default(),
        filename,
        timestamp_ms,
        message.original_name.clone(),
        data,
    );
    Ok(())
}

#[tauri::command]
async fn get_thumbnail(state: State<'_, AppState>, filename: String) -> Result<String, String> {
    let settings = current_settings(&state)?;
    let endpoint = resolve_active_endpoint(&settings)?;

    let endpoint_dir = endpoint_files_dir(&state, &endpoint.id);
    let thumb_local_path = endpoint_dir.join(".thumbs").join(&filename);

    if thumb_local_path.exists() {
        return Ok(thumb_local_path.to_string_lossy().to_string());
    }

    // Try to download from server
    let message = db::get_message(&state.db_path, &endpoint.id, &filename)
        .map_err(|err| format!("璇诲彇娑堟伅澶辫触: {err}"))?;
    let thumb_remote_path = resolved_thumbnail_remote_path(
        message
            .as_ref()
            .and_then(|item| item.remote_path.as_deref()),
        &filename,
        message.as_ref().map(|item| item.timestamp_ms),
    );
    match webdav::download_optional_file(&state.http, &endpoint, &thumb_remote_path).await? {
        Some(data) => {
            let thumb_local_dir = endpoint_dir.join(".thumbs");
            let _ = fs::create_dir_all(&thumb_local_dir);
            fs::write(&thumb_local_path, &data)
                .map_err(|e| format!("写入缩略图缓存失败: {}", e))?;
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
    fs::create_dir_all(&base_dir)
        .map_err(|err| format!("Failed to create download directory: {err}"))?;

    let file_name = sanitize_filename(&original_name);
    let target_path = base_dir.join(file_name);
    let action = parse_conflict_action(conflict_action);
    let final_path = match resolve_download_target(&target_path, action)? {
        DownloadDecision::Conflict { suggested } => {
            return Ok(DownloadResult {
                status: "conflict".to_string(),
                path: None,
                suggested_path: Some(suggested.to_string_lossy().to_string()),
                transfer_mode: None,
            });
        }
        DownloadDecision::Ready(path) => path,
    };

    let message = db::get_message(&state.db_path, &endpoint.id, &filename)
        .map_err(|err| format!("Failed to read message: {err}"))?;
    let remote_path = resolved_remote_path(
        message
            .as_ref()
            .and_then(|item| item.remote_path.as_deref()),
        &filename,
        message.as_ref().map(|item| item.timestamp_ms),
    );

    let download = match execute_streamed_download(
        &window,
        &state,
        &endpoint,
        &filename,
        &remote_path,
        &original_name,
        &final_path,
    )
    .await
    {
        Ok(result) => result,
        Err(err) => {
            let _ = persist_download_history(
                &state,
                &endpoint.id,
                &filename,
                &original_name,
                None,
                "error",
                Some(err.clone()),
                0,
            );
            return Err(err);
        }
    };

    persist_download_history(
        &state,
        &endpoint.id,
        &filename,
        &original_name,
        Some(&download.final_path),
        "complete",
        None,
        download.file_size,
    )?;

    Ok(DownloadResult {
        status: "saved".to_string(),
        path: Some(download.final_path.to_string_lossy().to_string()),
        suggested_path: None,
        transfer_mode: Some(download.transfer_mode.as_str().to_string()),
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
    let original_name = db::get_message(&state.db_path, &endpoint.id, &filename)
        .map_err(|err| format!("Failed to read message: {err}"))?
        .map(|message| message.original_name)
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| filename.clone());

    if target_path.trim().is_empty() {
        return Err("No save path selected".to_string());
    }

    let final_path = PathBuf::from(target_path);
    let message = db::get_message(&state.db_path, &endpoint.id, &filename)
        .map_err(|err| format!("Failed to read message: {err}"))?;
    let remote_path = resolved_remote_path(
        message
            .as_ref()
            .and_then(|item| item.remote_path.as_deref()),
        &filename,
        message.as_ref().map(|item| item.timestamp_ms),
    );
    let download = match execute_streamed_download(
        &window,
        &state,
        &endpoint,
        &filename,
        &remote_path,
        &original_name,
        &final_path,
    )
    .await
    {
        Ok(result) => result,
        Err(err) => {
            let _ = persist_download_history(
                &state,
                &endpoint.id,
                &filename,
                &original_name,
                None,
                "error",
                Some(err.clone()),
                0,
            );
            return Err(err);
        }
    };

    persist_download_history(
        &state,
        &endpoint.id,
        &filename,
        &original_name,
        Some(&download.final_path),
        "complete",
        None,
        download.file_size,
    )?;

    Ok(DownloadResult {
        status: "saved".to_string(),
        path: Some(download.final_path.to_string_lossy().to_string()),
        suggested_path: None,
        transfer_mode: Some(download.transfer_mode.as_str().to_string()),
    })
}

fn persist_download_history(
    state: &AppState,
    endpoint_id: &str,
    filename: &str,
    original_name: &str,
    saved_path: Option<&Path>,
    status: &str,
    error: Option<String>,
    file_size: i64,
) -> Result<(), String> {
    let timestamp = now_ms();
    let entry = DbDownloadHistory {
        id: 0,
        endpoint_id: endpoint_id.to_string(),
        filename: filename.to_string(),
        original_name: original_name.to_string(),
        saved_path: saved_path.map(|path| path.to_string_lossy().to_string()),
        status: status.to_string(),
        error,
        file_size,
        created_at_ms: timestamp,
        updated_at_ms: timestamp,
    };
    db::upsert_download_history(&state.db_path, &entry)
        .map(|_| ())
        .map_err(|err| format!("写入下载历史失败: {err}"))
}

fn persist_upload_history(
    state: &AppState,
    endpoint_id: &str,
    filename: &str,
    original_name: &str,
    local_path: Option<&Path>,
    status: &str,
    error: Option<String>,
    file_size: i64,
) -> Result<(), String> {
    let now = now_ms();
    let entry = DbUploadHistory {
        id: 0,
        endpoint_id: endpoint_id.to_string(),
        filename: filename.to_string(),
        original_name: original_name.to_string(),
        local_path: local_path.map(|path| path.to_string_lossy().to_string()),
        status: status.to_string(),
        error,
        file_size,
        created_at_ms: now,
        updated_at_ms: now,
    };
    db::upsert_upload_history(&state.db_path, &entry)
        .map(|_| ())
        .map_err(|err| format!("写入上传历史失败: {err}"))
}

fn require_download_history(state: &AppState, record_id: i64) -> Result<DbDownloadHistory, String> {
    db::get_download_history(&state.db_path, record_id)
        .map_err(|err| format!("读取下载记录失败: {err}"))?
        .ok_or_else(|| "下载记录不存在".to_string())
}

fn build_partial_download_path(final_path: &Path) -> PathBuf {
    let file_name = final_path
        .file_name()
        .and_then(|value| value.to_str())
        .filter(|value| !value.trim().is_empty())
        .unwrap_or("download.bin");
    final_path.with_file_name(format!("{file_name}.part"))
}

fn load_message_remote_metadata(
    db_path: &Path,
    endpoint_id: &str,
    filename: &str,
) -> Result<(Option<String>, Option<String>, i64), String> {
    let message = db::get_message(db_path, endpoint_id, filename).map_err(|err| err.to_string())?;
    Ok(message
        .map(|message| (message.etag, message.mtime, message.size.max(0)))
        .unwrap_or((None, None, 0)))
}

fn persist_partial_download(state: &AppState, entry: &DbPartialDownload) -> Result<(), String> {
    db::upsert_partial_download(&state.db_path, entry)
        .map_err(|err| format!("淇濆瓨涓嬭浇杩涘害澶辫触: {err}"))
}

fn clear_partial_download(
    state: &AppState,
    endpoint_id: &str,
    filename: &str,
) -> Result<(), String> {
    db::delete_partial_download(&state.db_path, endpoint_id, filename)
        .map(|_| ())
        .map_err(|err| format!("娓呯悊涓嬭浇杩涘害澶辫触: {err}"))
}

fn discard_partial_download(state: &AppState, partial: &DbPartialDownload) -> Result<(), String> {
    if !partial.temp_path.trim().is_empty() {
        let _ = fs::remove_file(&partial.temp_path);
    }
    clear_partial_download(state, &partial.endpoint_id, &partial.filename)
}

fn should_restart_after_range_error(error: &str) -> bool {
    ["HTTP 400", "HTTP 405", "HTTP 416", "HTTP 501"]
        .iter()
        .any(|status| error.contains(status))
}

fn resume_identity_matches(
    partial: &DbPartialDownload,
    response: &webdav::DownloadStreamResponse,
) -> bool {
    if let Some(expected_etag) = partial
        .etag
        .as_deref()
        .filter(|value| !value.trim().is_empty())
    {
        return response.etag.as_deref() == Some(expected_etag);
    }
    if let Some(expected_mtime) = partial
        .mtime
        .as_deref()
        .filter(|value| !value.trim().is_empty())
    {
        return response.last_modified.as_deref() == Some(expected_mtime);
    }
    if partial.total_bytes > 0 {
        return response.total_size == Some(partial.total_bytes as u64);
    }
    false
}

async fn write_download_stream_to_partial(
    window: &Window,
    state: &AppState,
    endpoint_id: &str,
    filename: &str,
    mut partial: DbPartialDownload,
    response: webdav::DownloadStreamResponse,
    resume_from: u64,
    transfer_mode: DownloadTransferMode,
) -> Result<i64, String> {
    use futures_util::StreamExt;
    use std::fs::OpenOptions;
    use std::io::Write;

    let mut stream = response.stream;
    let mut file = OpenOptions::new()
        .create(true)
        .write(true)
        .truncate(resume_from == 0)
        .append(resume_from > 0)
        .open(&partial.temp_path)
        .map_err(|err| format!("鍒涘缓涓嬭浇涓存椂鏂囦欢澶辫触: {err}"))?;
    let mut received = resume_from;
    let total = response
        .total_size
        .or_else(|| response.content_length.map(|length| length + resume_from));
    let range_start = Some(resume_from);
    let range_end = total.and_then(|size| size.checked_sub(1));
    partial.downloaded_bytes = received as i64;
    partial.total_bytes = total.unwrap_or_default() as i64;
    partial.etag = response.etag.or(partial.etag);
    partial.mtime = response.last_modified.or(partial.mtime);
    partial.updated_at_ms = now_ms();
    persist_partial_download(state, &partial)?;
    emit_download_progress(
        window,
        endpoint_id,
        filename,
        received,
        total,
        Some(transfer_mode),
        range_start,
        range_end,
        "progress",
        None,
    );

    let mut last_persisted = received;
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|err| format!("璇诲彇涓嬭浇鍐呭澶辫触: {err}"))?;
        file.write_all(&chunk)
            .map_err(|err| format!("鍐欏叆涓嬭浇涓存椂鏂囦欢澶辫触: {err}"))?;
        received += chunk.len() as u64;
        emit_download_progress(
            window,
            endpoint_id,
            filename,
            received,
            total,
            Some(transfer_mode),
            range_start,
            range_end,
            "progress",
            None,
        );
        if received.saturating_sub(last_persisted) >= 1024 * 1024 {
            partial.downloaded_bytes = received as i64;
            partial.updated_at_ms = now_ms();
            persist_partial_download(state, &partial)?;
            last_persisted = received;
        }
    }
    file.flush()
        .map_err(|err| format!("鍒锋柊涓嬭浇涓存椂鏂囦欢澶辫触: {err}"))?;
    partial.downloaded_bytes = received as i64;
    partial.total_bytes = total.unwrap_or(received) as i64;
    partial.updated_at_ms = now_ms();
    persist_partial_download(state, &partial)?;
    Ok(received as i64)
}

async fn execute_streamed_download(
    window: &Window,
    state: &AppState,
    endpoint: &WebDavEndpoint,
    filename: &str,
    remote_path: &str,
    original_name: &str,
    final_path: &Path,
) -> Result<DownloadExecutionResult, String> {
    ensure_parent_dir(final_path)?;
    let temp_path = build_partial_download_path(final_path);
    let final_path_string = final_path.to_string_lossy().to_string();
    let temp_path_string = temp_path.to_string_lossy().to_string();
    let (expected_etag, expected_mtime, expected_size) =
        load_message_remote_metadata(&state.db_path, &endpoint.id, filename)?;

    let existing_partial = db::get_partial_download(&state.db_path, &endpoint.id, filename)
        .map_err(|err| err.to_string())?;
    let transfer_mode = if existing_partial.is_some() {
        DownloadTransferMode::Restarted
    } else {
        DownloadTransferMode::Fresh
    };

    if let Some(partial) = existing_partial {
        let temp_file_size = fs::metadata(&partial.temp_path)
            .ok()
            .filter(|meta| meta.is_file())
            .map(|meta| meta.len())
            .unwrap_or(0);
        let partial_matches_target = partial.final_path == final_path_string
            && partial.temp_path == temp_path_string
            && partial.downloaded_bytes > 0
            && temp_file_size == partial.downloaded_bytes as u64;
        if partial_matches_target {
            match webdav::download_file_stream_with_range(
                &state.http,
                endpoint,
                remote_path,
                Some(partial.downloaded_bytes as u64),
            )
            .await
            {
                Ok(response)
                    if response.status_code == 206
                        && resume_identity_matches(&partial, &response) =>
                {
                    let resumed_size = write_download_stream_to_partial(
                        window,
                        state,
                        &endpoint.id,
                        filename,
                        DbPartialDownload {
                            endpoint_id: endpoint.id.clone(),
                            filename: filename.to_string(),
                            original_name: original_name.to_string(),
                            final_path: final_path_string.clone(),
                            temp_path: temp_path_string.clone(),
                            downloaded_bytes: partial.downloaded_bytes,
                            total_bytes: response
                                .total_size
                                .or_else(|| {
                                    if partial.total_bytes > 0 {
                                        Some(partial.total_bytes as u64)
                                    } else {
                                        None
                                    }
                                })
                                .unwrap_or_default()
                                as i64,
                            etag: response.etag.clone().or(partial.etag.clone()),
                            mtime: response.last_modified.clone().or(partial.mtime.clone()),
                            updated_at_ms: now_ms(),
                        },
                        response,
                        partial.downloaded_bytes as u64,
                        DownloadTransferMode::Resumed,
                    )
                    .await?;
                    if final_path.exists() {
                        fs::remove_file(final_path)
                            .map_err(|err| format!("鏇挎崲宸叉湁涓嬭浇鏂囦欢澶辫触: {err}"))?;
                    }
                    fs::rename(&temp_path, final_path)
                        .map_err(|err| format!("瀹屾垚涓嬭浇鏂囦欢澶辫触: {err}"))?;
                    clear_partial_download(state, &endpoint.id, filename)?;
                    let file_hash = compute_file_hash_from_path(final_path)?;
                    let _ = update_message_local_path(
                        &state.db_path,
                        &endpoint.id,
                        filename,
                        final_path,
                        resumed_size,
                        Some(file_hash),
                    );
                    emit_download_progress(
                        window,
                        &endpoint.id,
                        filename,
                        resumed_size as u64,
                        Some(resumed_size as u64),
                        Some(DownloadTransferMode::Resumed),
                        Some(partial.downloaded_bytes as u64),
                        resumed_size.checked_sub(1).map(|value| value as u64),
                        "complete",
                        None,
                    );
                    return Ok(DownloadExecutionResult {
                        final_path: final_path.to_path_buf(),
                        file_size: resumed_size,
                        transfer_mode: DownloadTransferMode::Resumed,
                    });
                }
                Ok(_) => {
                    discard_partial_download(state, &partial)?;
                }
                Err(err) if should_restart_after_range_error(&err) => {
                    discard_partial_download(state, &partial)?;
                }
                Err(err) => {
                    emit_download_progress(
                        window,
                        &endpoint.id,
                        filename,
                        partial.downloaded_bytes as u64,
                        if partial.total_bytes > 0 {
                            Some(partial.total_bytes as u64)
                        } else {
                            None
                        },
                        Some(DownloadTransferMode::Resumed),
                        Some(partial.downloaded_bytes as u64),
                        if partial.total_bytes > 0 {
                            Some(partial.total_bytes as u64 - 1)
                        } else {
                            None
                        },
                        "error",
                        Some(err.clone()),
                    );
                    return Err(err);
                }
            }
        } else {
            discard_partial_download(state, &partial)?;
        }
    }

    let response = webdav::download_file_stream(&state.http, endpoint, remote_path).await?;
    let downloaded_size = write_download_stream_to_partial(
        window,
        state,
        &endpoint.id,
        filename,
        DbPartialDownload {
            endpoint_id: endpoint.id.clone(),
            filename: filename.to_string(),
            original_name: original_name.to_string(),
            final_path: final_path_string,
            temp_path: temp_path_string,
            downloaded_bytes: 0,
            total_bytes: response
                .total_size
                .or_else(|| {
                    if expected_size > 0 {
                        Some(expected_size as u64)
                    } else {
                        None
                    }
                })
                .unwrap_or_default() as i64,
            etag: response.etag.clone().or(expected_etag),
            mtime: response.last_modified.clone().or(expected_mtime),
            updated_at_ms: now_ms(),
        },
        response,
        0,
        transfer_mode,
    )
    .await?;
    if final_path.exists() {
        fs::remove_file(final_path)
            .map_err(|err| format!("Failed to replace existing downloaded file: {err}"))?;
    }
    fs::rename(&temp_path, final_path)
        .map_err(|err| format!("Failed to finalize downloaded file: {err}"))?;
    clear_partial_download(state, &endpoint.id, filename)?;
    let file_hash = compute_file_hash_from_path(final_path)?;
    let _ = update_message_local_path(
        &state.db_path,
        &endpoint.id,
        filename,
        final_path,
        downloaded_size,
        Some(file_hash),
    );
    emit_download_progress(
        window,
        &endpoint.id,
        filename,
        downloaded_size as u64,
        Some(downloaded_size as u64),
        Some(transfer_mode),
        Some(0),
        downloaded_size.checked_sub(1).map(|value| value as u64),
        "complete",
        None,
    );
    Ok(DownloadExecutionResult {
        final_path: final_path.to_path_buf(),
        file_size: downloaded_size,
        transfer_mode,
    })
}

#[tauri::command]

fn list_download_history(state: State<'_, AppState>) -> Result<Vec<DownloadHistoryRecord>, String> {
    db::list_download_history(&state.db_path).map_err(|err| format!("读取下载历史失败: {err}"))
}

#[tauri::command]
fn list_upload_history(state: State<'_, AppState>) -> Result<Vec<UploadHistoryRecord>, String> {
    db::list_upload_history(&state.db_path).map_err(|err| format!("读取上传历史失败: {err}"))
}

#[tauri::command]
async fn save_download_history_as(
    window: Window,
    state: State<'_, AppState>,
    record_id: i64,
    target_path: String,
) -> Result<DownloadResult, String> {
    if target_path.trim().is_empty() {
        return Err("No save path selected".to_string());
    }

    let record = require_download_history(&state, record_id)?;
    let final_path = PathBuf::from(target_path);
    ensure_parent_dir(&final_path)?;

    if let Some(saved_path) = record
        .saved_path
        .as_deref()
        .filter(|value| !value.trim().is_empty())
        .map(PathBuf::from)
        .filter(|path| path.is_file())
    {
        if saved_path != final_path {
            fs::copy(&saved_path, &final_path).map_err(|err| format!("Save-as failed: {err}"))?;
        }
        return Ok(DownloadResult {
            status: "saved".to_string(),
            path: Some(final_path.to_string_lossy().to_string()),
            suggested_path: None,
            transfer_mode: None,
        });
    }

    let settings = current_settings(&state)?;
    let endpoint = resolve_endpoint_by_id(&settings, &record.endpoint_id)?;
    let message = db::get_message(&state.db_path, &endpoint.id, &record.filename)
        .map_err(|err| format!("Failed to read message: {err}"))?;
    let remote_path = resolved_remote_path(
        message
            .as_ref()
            .and_then(|item| item.remote_path.as_deref()),
        &record.filename,
        message.as_ref().map(|item| item.timestamp_ms),
    );
    let download = execute_streamed_download(
        &window,
        &state,
        &endpoint,
        &record.filename,
        &remote_path,
        &record.original_name,
        &final_path,
    )
    .await?;

    Ok(DownloadResult {
        status: "saved".to_string(),
        path: Some(download.final_path.to_string_lossy().to_string()),
        suggested_path: None,
        transfer_mode: Some(download.transfer_mode.as_str().to_string()),
    })
}

#[tauri::command]
async fn redownload_download_history(
    window: Window,
    state: State<'_, AppState>,
    record_id: i64,
) -> Result<DownloadResult, String> {
    let record = require_download_history(&state, record_id)?;
    let settings = current_settings(&state)?;
    let endpoint = resolve_endpoint_by_id(&settings, &record.endpoint_id)?;
    let final_path = if let Some(saved_path) = record
        .saved_path
        .as_deref()
        .filter(|value| !value.trim().is_empty())
    {
        PathBuf::from(saved_path)
    } else {
        let base_dir = resolve_download_dir(&state, &settings);
        fs::create_dir_all(&base_dir)
            .map_err(|err| format!("Failed to create download directory: {err}"))?;
        base_dir.join(sanitize_filename(&record.original_name))
    };

    if final_path.is_dir() {
        return Err("Target path is a directory and cannot be redownloaded".to_string());
    }

    let message = db::get_message(&state.db_path, &record.endpoint_id, &record.filename)
        .map_err(|err| format!("Failed to read message: {err}"))?;
    let remote_path = resolved_remote_path(
        message
            .as_ref()
            .and_then(|item| item.remote_path.as_deref()),
        &record.filename,
        message.as_ref().map(|item| item.timestamp_ms),
    );

    let download = match execute_streamed_download(
        &window,
        &state,
        &endpoint,
        &record.filename,
        &remote_path,
        &record.original_name,
        &final_path,
    )
    .await
    {
        Ok(result) => result,
        Err(err) => {
            let _ = persist_download_history(
                &state,
                &record.endpoint_id,
                &record.filename,
                &record.original_name,
                None,
                "error",
                Some(err.clone()),
                0,
            );
            return Err(err);
        }
    };

    persist_download_history(
        &state,
        &record.endpoint_id,
        &record.filename,
        &record.original_name,
        Some(&download.final_path),
        "complete",
        None,
        download.file_size,
    )?;

    Ok(DownloadResult {
        status: "saved".to_string(),
        path: Some(download.final_path.to_string_lossy().to_string()),
        suggested_path: None,
        transfer_mode: Some(download.transfer_mode.as_str().to_string()),
    })
}

#[tauri::command]
fn delete_download_history(
    state: State<'_, AppState>,
    record_id: i64,
    delete_local_file: bool,
) -> Result<(), String> {
    let record = require_download_history(&state, record_id)?;
    if delete_local_file {
        delete_recorded_download_file(record.saved_path.as_deref())?;
        clear_message_local_path(&state.db_path, &record.endpoint_id, &record.filename)?;
    }
    db::delete_download_history(&state.db_path, record_id)
        .map_err(|err| format!("删除下载记录失败: {err}"))?;
    Ok(())
}

#[tauri::command]
fn clear_download_history_records(
    state: State<'_, AppState>,
    record_ids: Vec<i64>,
) -> Result<usize, String> {
    db::delete_download_history_many(&state.db_path, &record_ids)
        .map_err(|err| format!("清空下载记录失败: {err}"))
}

#[tauri::command]
fn clear_upload_history_records(
    state: State<'_, AppState>,
    record_ids: Vec<i64>,
) -> Result<usize, String> {
    db::delete_upload_history_many(&state.db_path, &record_ids)
        .map_err(|err| format!("清空上传记录失败: {err}"))
}

#[tauri::command]
fn open_download_history_dir(
    app: AppHandle,
    state: State<'_, AppState>,
    record_id: i64,
) -> Result<(), String> {
    let record = require_download_history(&state, record_id)?;
    let saved_path = record
        .saved_path
        .as_deref()
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| "下载记录没有本地文件路径".to_string())?;
    let file_path = PathBuf::from(saved_path);
    if !file_path.is_file() {
        return Err("本地文件不存在".to_string());
    }
    let dir = file_path
        .parent()
        .ok_or_else(|| "无法解析下载目录".to_string())?;
    app.opener()
        .open_path(dir.to_string_lossy().to_string(), None::<&str>)
        .map_err(|err| format!("打开下载目录失败: {err}"))?;
    Ok(())
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
        app.opener()
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
                app.opener()
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
                fs::copy(&local_path, &open_path)
                    .map_err(|err| format!("准备打开文件失败: {err}"))?;
            }
            app.opener()
                .open_path(open_path.to_string_lossy().to_string(), None::<&str>)
                .map_err(|err| format!("打开文件失败: {err}"))?;
            return Ok(());
        }
    }

    Err("文件尚未下载".to_string())
}

#[tauri::command]
async fn open_download_dir(app: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    let settings = current_settings(&state)?;
    let base_dir = resolve_download_dir(&state, &settings);
    fs::create_dir_all(&base_dir).map_err(|err| format!("创建下载目录失败: {err}"))?;
    app.opener()
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
    app.opener()
        .open_path(url, None::<&str>)
        .map_err(|err| format!("打开链接失败: {err}"))?;
    Ok(())
}

#[tauri::command]
async fn save_local_data(path: String, data: Vec<u8>) -> Result<(), String> {
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

    app.opener()
        .open_path(log_dir.to_string_lossy(), None::<&str>)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn open_data_dir(app: AppHandle) -> Result<(), String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("无法解析数据目录: {}", e))?;

    app.opener()
        .open_path(data_dir.to_string_lossy(), None::<&str>)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn minimize_window(app: AppHandle, window: Window) -> Result<(), String> {
    let _ = window.emit("trigger-hide", ());
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
async fn fetch_image_preview(
    state: State<'_, AppState>,
    filename: String,
) -> Result<String, String> {
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

    let message = db::get_message(&state.db_path, &endpoint.id, &filename)
        .map_err(|err| format!("璇诲彇娑堟伅澶辫触: {err}"))?;
    let remote_path = resolved_remote_path(
        message
            .as_ref()
            .and_then(|item| item.remote_path.as_deref()),
        &filename,
        message.as_ref().map(|item| item.timestamp_ms),
    );
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
            let message = db::get_message(&state.db_path, &endpoint.id, filename)
                .map_err(|err| err.to_string())?;
            let remote_path = resolved_remote_path(
                message
                    .as_ref()
                    .and_then(|item| item.remote_path.as_deref()),
                filename,
                message.as_ref().map(|item| item.timestamp_ms),
            );
            match webdav::delete_file(&state.http, &endpoint, &remote_path, true).await {
                Ok(_) => succeeded.push(filename.clone()),
                Err(_) => failed.push(filename.clone()),
            }
        }
        if !succeeded.is_empty() {
            let success_set: HashSet<String> = succeeded.iter().cloned().collect();
            crate::history::remove_history_entries(&state.http, &endpoint, &success_set).await?;
        }
    }

    if delete_remote {
        // 删除远程和本地：删除本地文件并删除消息记录
        let deletable = succeeded;
        if deletable.is_empty() {
            return Ok(DeleteSummary { deleted: 0, failed });
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
    let candidates = collect_cleanup_candidates(messages, cutoff_ms);

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
            let filenames: Vec<String> = candidates
                .iter()
                .map(|message| message.filename.clone())
                .collect();
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
                let remote_path = resolved_remote_path(
                    message.remote_path.as_deref(),
                    &message.filename,
                    Some(message.timestamp_ms),
                );
                match webdav::delete_file(&state.http, &endpoint, &remote_path, true).await {
                    Ok(_) => succeeded.push(message.filename.clone()),
                    Err(_) => failed.push(message.filename.clone()),
                }
            }

            if !succeeded.is_empty() {
                let success_set: HashSet<String> = succeeded.iter().cloned().collect();
                crate::history::remove_history_entries(&state.http, &endpoint, &success_set)
                    .await?;
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
async fn refresh(state: State<'_, AppState>) -> Result<SyncStatus, String> {
    if is_sync_running_from(&state, AUTO_SYNC_SOURCE)? {
        cancel_active_sync(&state)?;
    }

    let result = run_sync(&state, REFRESH_SYNC_SOURCE, true).await;
    signal_sync_loop_reset(&state);
    result
}

#[tauri::command]
fn cancel_refresh(state: State<'_, AppState>) -> Result<(), String> {
    cancel_active_sync(&state)
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

        let list_path = if dir_path.is_empty() {
            None
        } else {
            Some(dir_path.as_str())
        };

        info!("WebDAV backup: Listing contents of '/'{}", &dir_path);
        let entries = match webdav::list_entries(http, endpoint, list_path, true).await {
            Ok(entries) => entries,
            Err(e) => {
                info!(
                    "WebDAV backup: Failed to list directory '{}': {}",
                    &dir_path, e
                );
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
async fn backup_webdav(
    window: Window,
    state: State<'_, AppState>,
    path: String,
) -> Result<(), String> {
    use futures_util::StreamExt;
    use std::io::Write;
    use zip::write::FileOptions;

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
    let options: FileOptions<'_, ()> =
        FileOptions::default().compression_method(zip::CompressionMethod::Deflated);

    // 3. Process Entries
    let temp_dir = state.files_base_dir.join("temp_backup");
    if !temp_dir.exists() {
        fs::create_dir_all(&temp_dir).map_err(|e| format!("无法创建临时目录: {}", e))?;
    }

    for (index, entry) in entries.iter().enumerate() {
        let current_progress = (index + 1) as u64;
        emit_backup_restore_progress(
            &window,
            "webdav-backup-progress",
            &entry.filename,
            current_progress,
            total_entries,
            "downloading",
        );

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

        let download_result =
            webdav::download_file_stream(&state.http, &endpoint, remote_path).await;
        match download_result {
            Ok(response) => {
                let mut stream = response.stream;
                // Use std::fs::File (Blocking write) as tokio::fs is not enabled
                let mut temp_file = std::fs::File::create(&temp_file_path)
                    .map_err(|e| format!("创���临时文件失败: {}", e))?;
                while let Some(chunk) = stream.next().await {
                    let chunk = chunk.map_err(|e| format!("下载流中断: {}", e))?;
                    temp_file
                        .write_all(&chunk)
                        .map_err(|e| format!("写入临时文件失败: {}", e))?;
                }
                temp_file
                    .flush()
                    .map_err(|e| format!("刷新临时文件失败: {}", e))?;
                drop(temp_file);

                // Write to Zip (Sync)
                let mut input_file = std::fs::File::open(&temp_file_path)
                    .map_err(|e| format!("读取临时文件失败: {}", e))?;
                if let Err(e) = zip.start_file(remote_path, options) {
                    let _ = std::fs::remove_file(&temp_file_path);
                    return Err(format!("Zip start_file failed: {}", e));
                }
                if let Err(e) = std::io::copy(&mut input_file, &mut zip) {
                    let _ = std::fs::remove_file(&temp_file_path);
                    return Err(format!("写入 Zip 失败: {}", e));
                }
                let _ = std::fs::remove_file(&temp_file_path);
            }
            Err(e) => {
                log::warn!(
                    "Skipping file '{}' due to download error: {}",
                    remote_path,
                    e
                );
            }
        }
    }

    zip.finish()
        .map_err(|e| format!("完成 zip 文件失败: {}", e))?;
    let _ = std::fs::remove_dir_all(&temp_dir);

    emit_backup_restore_progress(
        &window,
        "webdav-backup-progress",
        "",
        total_entries,
        total_entries,
        "finished",
    );
    Ok(())
}

#[tauri::command]
async fn restore_webdav(
    window: Window,
    state: State<'_, AppState>,
    path: String,
) -> Result<(), String> {
    use std::io::Read;
    use zip::ZipArchive;

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
    let existing_history =
        webdav::list_entries(&state.http, &endpoint, Some("history"), true).await?;
    for entry in existing_history {
        let remote_path = entry.remote_path;
        if remote_path == "history" || remote_path == "history/" {
            continue;
        }
        let _ = webdav::delete_file(&state.http, &endpoint, &remote_path, true).await;
    }
    let _ = webdav::delete_file(&state.http, &endpoint, "history", true).await;
    let _ = webdav::delete_file(&state.http, &endpoint, "history.json", true).await;

    // 收集所有文件数据
    let file = std::fs::File::open(&path).map_err(|e| format!("读取备份文件失败: {}", e))?;
    let mut archive = ZipArchive::new(file).map_err(|e| format!("解析备份文件失败: {}", e))?;
    let len = archive.len();

    // 验证历史索引是否存在
    let has_legacy_history = archive.by_name("history.json").is_ok();
    let has_manifest_history = archive.by_name("history/index.json").is_ok();
    if !has_legacy_history && !has_manifest_history {
        return Err("备份文件无效: 缺少 history.json 或 history/index.json".to_string());
    }

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
            let file = archive
                .by_index(i)
                .map_err(|e| format!("读取 zip entry 失败: {}", e))?;
            (file.name().to_string(), file.is_dir(), file.size())
        };

        emit_backup_restore_progress(
            &window,
            "webdav-restore-progress",
            &filename,
            current_progress,
            len as u64,
            "uploading",
        );

        if is_dir {
            if !filename.is_empty() {
                let _ = webdav::ensure_directory(&state.http, &endpoint, &filename).await;
            }
            continue;
        }

        webdav::ensure_parent_directories(&state.http, &endpoint, &filename).await?;

        // Extract to temp file
        let temp_file_path = temp_dir.join(format!("restore_{}.tmp", i));
        {
            let mut z_file = archive.by_index(i).unwrap();
            let mut t_file = std::fs::File::create(&temp_file_path)
                .map_err(|e| format!("创建临时文件失败: {}", e))?;
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
        if let Err(e) =
            webdav::upload_file_stream(&state.http, &endpoint, &filename, stream, size).await
        {
            let _ = std::fs::remove_file(&temp_file_path);
            return Err(format!("上传失败 {}: {}", filename, e));
        }
        let _ = std::fs::remove_file(&temp_file_path);
    }

    let _ = std::fs::remove_dir_all(&temp_dir);

    emit_backup_restore_progress(
        &window,
        "webdav-restore-progress",
        "",
        len as u64,
        len as u64,
        "finished",
    );
    Ok(())
}

fn current_settings(state: &AppState) -> Result<Settings, String> {
    let settings = state
        .settings
        .lock()
        .map_err(|_| "读取设置失败".to_string())?;
    Ok(settings.clone())
}

fn signal_sync_loop_reset(state: &AppState) {
    let next = (*state.sync_loop_signal.borrow()).wrapping_add(1);
    let _ = state.sync_loop_signal.send(next);
}

fn cancel_active_sync(state: &AppState) -> Result<(), String> {
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

fn is_sync_running_from(state: &AppState, source: &str) -> Result<bool, String> {
    let status = state
        .sync_status
        .lock()
        .map_err(|_| "读取同步状态失败".to_string())?;
    Ok(status.running && status.current_source.as_deref() == Some(source))
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

fn default_telegram_proxy_url() -> String {
    "http://127.0.0.1:7890".to_string()
}

fn normalize_telegram_proxy_url(raw: &str) -> Result<String, String> {
    let trimmed = raw.trim();
    let normalized = if trimmed.is_empty() {
        default_telegram_proxy_url()
    } else {
        trimmed.to_string()
    };
    Proxy::all(&normalized).map_err(|err| format!("Telegram 代理地址无效: {err}"))?;
    Ok(normalized)
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
            return Err("全局快捷键格式无效，需要包含修饰键，例如 Ctrl+Alt+T".to_string());
        };
        settings.global_hotkey = hotkey;
    } else {
        settings.global_hotkey =
            normalized_hotkey.unwrap_or_else(|| DEFAULT_GLOBAL_HOTKEY.to_string());
    }
    let hotkey_raw = settings.send_hotkey.trim().to_lowercase();
    settings.send_hotkey = match hotkey_raw.as_str() {
        DEFAULT_SEND_HOTKEY => DEFAULT_SEND_HOTKEY.to_string(),
        SEND_HOTKEY_CTRL_ENTER => SEND_HOTKEY_CTRL_ENTER.to_string(),
        "ctrl+enter" => SEND_HOTKEY_CTRL_ENTER.to_string(),
        _ => DEFAULT_SEND_HOTKEY.to_string(),
    };
    settings.download_dir = normalize_download_dir(&settings.download_dir, default_download_dir);

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
        settings.active_webdav_id = if active_ok { Some(active_id) } else { None };
    }

    settings.telegram.bot_token = settings.telegram.bot_token.trim().to_string();
    settings.telegram.chat_id = settings.telegram.chat_id.trim().to_string();
    settings.telegram.sender_name = settings.telegram.sender_name.trim().to_string();
    settings.telegram.proxy_url = if settings.telegram.proxy_enabled {
        normalize_telegram_proxy_url(&settings.telegram.proxy_url)?
    } else {
        let trimmed = settings.telegram.proxy_url.trim();
        if trimmed.is_empty() {
            default_telegram_proxy_url()
        } else {
            trimmed.to_string()
        }
    };
    settings.telegram.poll_interval_secs = settings
        .telegram
        .poll_interval_secs
        .max(DEFAULT_TELEGRAM_POLL_INTERVAL_SECS);

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
    let telegram = if settings.telegram.bot_token.is_empty() && settings.telegram.chat_id.is_empty()
    {
        None
    } else {
        Some(ExportTelegramSecret {
            bot_token: settings.telegram.bot_token.clone(),
            chat_id: settings.telegram.chat_id.clone(),
        })
    };
    ExportSecrets {
        endpoints,
        telegram,
    }
}

fn encrypt_export_secrets(
    password: &str,
    secrets: &ExportSecrets,
) -> Result<CryptoPayload, String> {
    if password.trim().is_empty() {
        return Err("密码不能为空".to_string());
    }
    let payload =
        serde_json::to_vec(secrets).map_err(|err| format!("序列化配置凭据失败: {err}"))?;

    let mut salt = [0u8; 16];
    OsRng.fill_bytes(&mut salt);
    let mut nonce_bytes = [0u8; 12];
    OsRng.fill_bytes(&mut nonce_bytes);

    let key = derive_export_key(password, &salt, EXPORT_KDF_ITERATIONS)?;
    let cipher = Aes256Gcm::new_from_slice(&key).map_err(|_| "生成加密密钥失败".to_string())?;
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
    let cipher = Aes256Gcm::new_from_slice(&key).map_err(|_| "生成解密密钥失败".to_string())?;
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
        let secret = map
            .get(&endpoint.id)
            .ok_or_else(|| format!("配置文件缺少端点凭据: {}", endpoint.id))?;
        endpoint.username = secret.username.clone();
        endpoint.password = secret.password.clone();
    }
    if let Some(telegram) = secrets.telegram {
        settings.telegram.bot_token = telegram.bot_token;
        settings.telegram.chat_id = telegram.chat_id;
    }
    Ok(())
}

fn derive_export_key(password: &str, salt: &[u8], iterations: u32) -> Result<[u8; 32], String> {
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

fn resolve_endpoint_by_id(
    settings: &Settings,
    endpoint_id: &str,
) -> Result<WebDavEndpoint, String> {
    let trimmed = endpoint_id.trim();
    if trimmed.is_empty() {
        return Err("下载记录缺少 WebDAV 端点".to_string());
    }
    let endpoint = settings
        .webdav_endpoints
        .iter()
        .find(|item| item.id == trimmed)
        .ok_or_else(|| format!("下载记录关联的 WebDAV 端点不存在: {trimmed}"))?;
    if !endpoint.enabled {
        return Err(format!("下载记录关联的 WebDAV 端点已禁用: {trimmed}"));
    }
    if endpoint.url.trim().is_empty() {
        return Err(format!("下载记录关联的 WebDAV 地址为空: {trimmed}"));
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

fn history_cache_dir(state: &AppState, endpoint_id: &str) -> PathBuf {
    endpoint_files_dir(state, endpoint_id).join("history-cache")
}

fn resolved_remote_path(
    stored_remote_path: Option<&str>,
    filename: &str,
    timestamp_ms: Option<i64>,
) -> String {
    stored_remote_path
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
        .or_else(|| {
            timestamp_ms
                .filter(|timestamp| *timestamp > 0)
                .map(|timestamp| message_remote_path(filename, timestamp))
        })
        .unwrap_or_else(|| format!("files/{filename}"))
}

fn resolved_thumbnail_remote_path(
    stored_remote_path: Option<&str>,
    filename: &str,
    timestamp_ms: Option<i64>,
) -> String {
    if let Some(remote_path) = stored_remote_path
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        if let Some(suffix) = remote_path.strip_prefix("files/") {
            return format!("files/.thumbs/{suffix}");
        }
    }
    timestamp_ms
        .filter(|timestamp| *timestamp > 0)
        .map(|timestamp| thumbnail_remote_path(filename, timestamp))
        .unwrap_or_else(|| format!("files/.thumbs/{filename}"))
}

fn load_settings(path: &Path, fallback_download_dir: &Path) -> Result<Settings, String> {
    if path.exists() {
        let data = fs::read_to_string(path).map_err(|err| format!("读取设置失败: {err}"))?;
        let value = serde_json::from_str::<serde_json::Value>(&data)
            .map_err(|err| format!("解析设置失败: {err}"))?;
        let settings = if value.get("webdav_endpoints").is_some() {
            serde_json::from_value::<Settings>(value)
                .map_err(|err| format!("解析设置失败: {err}"))?
        } else {
            let legacy = serde_json::from_value::<LegacySettings>(value)
                .map_err(|err| format!("解析设置失败: {err}"))?;
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
                telegram: TelegramBridgeSettings::default(),
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
            telegram: TelegramBridgeSettings::default(),
        };
        write_settings(path, &settings)?;
        Ok(settings)
    }
}

fn write_settings(path: &Path, settings: &Settings) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|err| format!("创建配置目录失败: {err}"))?;
    }
    let data =
        serde_json::to_string_pretty(settings).map_err(|err| format!("序列化设置失败: {err}"))?;
    fs::write(path, data).map_err(|err| format!("写入设置失败: {err}"))?;
    Ok(())
}

fn telegram_api_url(token: &str, method: &str) -> String {
    format!("https://api.telegram.org/bot{token}/{method}")
}

fn build_telegram_http_client(proxy_url: &str, timeout: Duration) -> Result<Client, String> {
    let mut builder = Client::builder().timeout(timeout);
    let proxy_url = proxy_url.trim();
    if !proxy_url.is_empty() {
        let proxy = Proxy::all(proxy_url).map_err(|err| format!("Telegram 代理地址无效: {err}"))?;
        builder = builder.proxy(proxy);
    }
    builder
        .build()
        .map_err(|err| format!("创建 Telegram HTTP 客户端失败: {err}"))
}

fn telegram_chat_candidate_from_message(
    message: TelegramDiscoveryMessage,
) -> TelegramChatCandidate {
    let TelegramDiscoveryMessage { chat, from } = message;
    let sender_name = telegram_candidate_sender_name(&chat, from.as_ref());
    let title = if let Some(title) = chat.title.as_deref() {
        let title = title.trim().to_string();
        if !title.is_empty() {
            title
        } else {
            format_telegram_chat_fallback_title(&chat)
        }
    } else {
        format_telegram_chat_fallback_title(&chat)
    };
    TelegramChatCandidate {
        id: chat.id.to_string(),
        title,
        chat_type: chat.chat_type,
        sender_name,
    }
}

fn telegram_candidate_sender_name(
    chat: &TelegramDiscoveryChat,
    from: Option<&TelegramDiscoveryUser>,
) -> String {
    if let Some(from) = from {
        if let Some(username) = from.username.as_deref() {
            let username = username.trim();
            if !username.is_empty() {
                return username.to_string();
            }
        }
    }

    if let Some(username) = chat.username.as_deref() {
        let username = username.trim();
        if !username.is_empty() {
            return username.to_string();
        }
    }

    String::new()
}

fn format_telegram_chat_fallback_title(chat: &TelegramDiscoveryChat) -> String {
    if let Some(username) = chat.username.as_deref() {
        let username = username.trim();
        if !username.is_empty() {
            return format!("@{username}");
        }
    }

    let mut parts = Vec::new();
    if let Some(first_name) = chat.first_name.as_deref() {
        let first_name = first_name.trim();
        if !first_name.is_empty() {
            parts.push(first_name.to_string());
        }
    }
    if let Some(last_name) = chat.last_name.as_deref() {
        let last_name = last_name.trim();
        if !last_name.is_empty() {
            parts.push(last_name.to_string());
        }
    }
    if !parts.is_empty() {
        return parts.join(" ");
    }

    match chat.chat_type.as_str() {
        "private" => "Private Chat".to_string(),
        "group" => "Group".to_string(),
        "supergroup" => "Supergroup".to_string(),
        "channel" => "Channel".to_string(),
        other => format!("Chat ({other})"),
    }
}

fn collect_telegram_chat_candidates(
    updates: Vec<TelegramDiscoveryUpdate>,
) -> Vec<TelegramChatCandidate> {
    let mut ordered = Vec::new();
    let mut seen = HashSet::new();

    for update in updates.into_iter().rev() {
        let _ = update.update_id;
        let message = update
            .edited_message
            .or(update.message)
            .or(update.edited_channel_post)
            .or(update.channel_post);
        let Some(message) = message else {
            continue;
        };
        let chat_id = message.chat.id.to_string();
        if seen.insert(chat_id) {
            ordered.push(telegram_chat_candidate_from_message(message));
        }
    }

    ordered
}

async fn discover_telegram_chats_impl(
    bot_token: &str,
    proxy_url: &str,
) -> Result<Vec<TelegramChatCandidate>, String> {
    let bot_token = bot_token.trim();
    if bot_token.is_empty() {
        return Err("请先填写 Telegram Bot Token".to_string());
    }

    let http = build_telegram_http_client(proxy_url, Duration::from_secs(20))?;

    let response = http
        .post(telegram_api_url(bot_token, "getUpdates"))
        .json(&serde_json::json!({
          "offset": 0,
          "limit": 100,
          "timeout": 1,
          "allowed_updates": ["message", "edited_message", "channel_post", "edited_channel_post"],
        }))
        .send()
        .await
        .map_err(|err| format!("请求 Telegram 更新失败: {err}"))?;

    let status = response.status();
    let body = response
        .text()
        .await
        .map_err(|err| format!("读取 Telegram 响应失败: {err}"))?;
    let parsed: TelegramDiscoveryResponse<Vec<TelegramDiscoveryUpdate>> =
        serde_json::from_str(&body).map_err(|err| format!("解析 Telegram 响应失败: {err}"))?;
    if !status.is_success() || !parsed.ok {
        return Err(parsed
            .description
            .unwrap_or_else(|| format!("Telegram API 错误: HTTP {status}")));
    }

    let updates = parsed.result.unwrap_or_default();
    let candidates = collect_telegram_chat_candidates(updates);
    if candidates.is_empty() {
        return Err(
            "没有发现可用的 Chat ID。请先给 bot 发送一条消息，或在群/频道里发一条新消息。"
                .to_string(),
        );
    }

    Ok(candidates)
}

fn should_auto_start_telegram_bridge(settings: &Settings) -> bool {
    settings.telegram.auto_start && resolve_telegram_bridge_launch_config(settings).is_ok()
}

fn is_telegram_bridge_running(state: &AppState) -> Result<bool, String> {
    let mut manager = state
        .telegram_bridge
        .lock()
        .map_err(|_| "读取 Telegram bridge 状态失败".to_string())?;
    refresh_telegram_bridge_manager(&mut manager);
    Ok(manager.process.is_some())
}

fn record_telegram_bridge_restart_failure(state: &AppState, err: String) {
    if let Ok(mut manager) = state.telegram_bridge.lock() {
        manager.last_error = Some(err);
        manager.last_stopped_ms = Some(now_ms());
    }
}

fn active_endpoint_for_settings(settings: &Settings) -> Option<&WebDavEndpoint> {
    let active_id = settings.active_webdav_id.as_deref()?;
    settings
        .webdav_endpoints
        .iter()
        .find(|endpoint| endpoint.id == active_id)
}

fn should_restart_telegram_bridge(previous: &Settings, normalized: &Settings) -> bool {
    previous.sender_name != normalized.sender_name
        || previous.active_webdav_id != normalized.active_webdav_id
        || active_endpoint_for_settings(previous) != active_endpoint_for_settings(normalized)
        || previous.telegram.sender_name != normalized.telegram.sender_name
        || previous.telegram.bot_token != normalized.telegram.bot_token
        || previous.telegram.chat_id != normalized.telegram.chat_id
        || previous.telegram.proxy_enabled != normalized.telegram.proxy_enabled
        || previous.telegram.proxy_url != normalized.telegram.proxy_url
        || previous.telegram.poll_interval_secs != normalized.telegram.poll_interval_secs
}

async fn restart_telegram_bridge_after_settings_change(state: &AppState, reason: &str) {
    let Ok(running) = is_telegram_bridge_running(state) else {
        return;
    };
    if !running {
        return;
    }

    let _ = stop_telegram_bridge_impl(state);
    if let Err(err) = start_telegram_bridge_impl(state).await {
        record_telegram_bridge_restart_failure(state, err.clone());
        eprintln!("Telegram bridge restart after {reason} failed: {err}");
    }
}

fn telegram_bridge_dir(state: &AppState) -> PathBuf {
    state
        .settings_path
        .parent()
        .unwrap_or_else(|| Path::new("."))
        .join("telegram-bridge")
}

fn telegram_bridge_status_from_manager(manager: &TelegramBridgeManager) -> TelegramBridgeStatus {
    TelegramBridgeStatus {
        running: manager.process.is_some(),
        pid: manager
            .process
            .as_ref()
            .map(|process| process.child.id())
            .or(manager.last_pid),
        last_started_ms: manager.last_started_ms,
        last_stopped_ms: manager.last_stopped_ms,
        last_error: manager.last_error.clone(),
    }
}

fn telegram_bridge_exit_message(status: ExitStatus) -> Option<String> {
    if status.success() {
        None
    } else if let Some(code) = status.code() {
        Some(format!("Telegram bridge 已退出，退出码 {code}"))
    } else {
        Some("Telegram bridge 已异常退出".to_string())
    }
}

fn finish_telegram_bridge_process(
    manager: &mut TelegramBridgeManager,
    mut process: ManagedTelegramBridgeProcess,
    last_error: Option<String>,
) {
    let pid = process.child.id();
    let _ = process.child.wait();
    let _ = fs::remove_file(&process.runtime_config_path);
    manager.last_pid = Some(pid);
    manager.last_stopped_ms = Some(now_ms());
    if let Some(error) = last_error {
        manager.last_error = Some(error);
    }
}

fn refresh_telegram_bridge_manager(manager: &mut TelegramBridgeManager) {
    let outcome = match manager.process.as_mut() {
        Some(process) => match process.child.try_wait() {
            Ok(Some(status)) => Some(Ok(status)),
            Ok(None) => None,
            Err(err) => Some(Err(format!("检查 Telegram bridge 状态失败: {err}"))),
        },
        None => None,
    };

    let Some(outcome) = outcome else {
        return;
    };

    if let Some(process) = manager.process.take() {
        let last_error = match outcome {
            Ok(status) => telegram_bridge_exit_message(status),
            Err(err) => Some(err),
        };
        finish_telegram_bridge_process(manager, process, last_error);
    }
}

fn telegram_bridge_status(state: &AppState) -> Result<TelegramBridgeStatus, String> {
    let mut manager = state
        .telegram_bridge
        .lock()
        .map_err(|_| "读取 Telegram bridge 状态失败".to_string())?;
    refresh_telegram_bridge_manager(&mut manager);
    Ok(telegram_bridge_status_from_manager(&manager))
}

#[allow(dead_code)]
fn resolve_telegram_bridge_endpoint(
    settings: &Settings,
) -> Result<(TelegramBridgeSettings, WebDavEndpoint, i64), String> {
    let telegram = settings.telegram.clone();
    if !telegram.enabled {
        return Err("Telegram bridge 当前未启用".to_string());
    }
    if telegram.bot_token.is_empty() {
        return Err("请先填写 Telegram Bot Token".to_string());
    }
    if telegram.chat_id.is_empty() {
        return Err("请先填写 Telegram Chat ID".to_string());
    }
    let chat_id = telegram
        .chat_id
        .parse::<i64>()
        .map_err(|_| "Telegram Chat ID 格式无效".to_string())?;
    if chat_id == 0 {
        return Err("Telegram Chat ID 不能为 0".to_string());
    }
    let endpoint = resolve_active_endpoint(settings)
        .map_err(|_| "请先选择当前可用的 WebDAV 端点".to_string())?;
    Ok((telegram, endpoint, chat_id))
}

fn resolve_telegram_bridge_launch_config(
    settings: &Settings,
) -> Result<(TelegramBridgeSettings, WebDavEndpoint, i64), String> {
    let telegram = settings.telegram.clone();
    if telegram.bot_token.is_empty() {
        return Err("请先填写 Telegram Bot Token".to_string());
    }
    if telegram.chat_id.is_empty() {
        return Err("请先填写 Telegram Chat ID".to_string());
    }
    let chat_id = telegram
        .chat_id
        .parse::<i64>()
        .map_err(|_| "Telegram Chat ID 格式无效".to_string())?;
    if chat_id == 0 {
        return Err("Telegram Chat ID 不能为 0".to_string());
    }
    let endpoint = resolve_active_endpoint(settings)
        .map_err(|_| "请先选择当前可用的 WebDAV 端点".to_string())?;
    Ok((telegram, endpoint, chat_id))
}

struct PreparedTelegramBridgeLaunch {
    runtime_config_path: PathBuf,
    runtime_config_data: String,
}

async fn prepare_telegram_bridge_launch(
    state: &AppState,
) -> Result<PreparedTelegramBridgeLaunch, String> {
    let settings = current_settings(state)?;
    let (telegram, endpoint, chat_id) = resolve_telegram_bridge_launch_config(&settings)?;
    webdav::ensure_directory(&state.http, &endpoint, "files").await?;

    let bridge_dir = telegram_bridge_dir(state);
    let runtime_config_path = bridge_dir.join("runtime.json");
    let state_path = bridge_dir.join("state.json");
    let temp_dir = bridge_dir.join("tmp");
    let runtime_config = TelegramBridgeRuntimeConfig {
        device_sender_name: settings.sender_name.clone(),
        telegram_sender_name: telegram.sender_name,
        telegram_bot_token: telegram.bot_token,
        allowed_chat_id: chat_id,
        proxy_url: if telegram.proxy_enabled {
            telegram.proxy_url
        } else {
            String::new()
        },
        webdav: endpoint,
        poll_interval_secs: telegram.poll_interval_secs,
        state_path: state_path.to_string_lossy().to_string(),
        temp_dir: temp_dir.to_string_lossy().to_string(),
    };
    let runtime_config_data = serde_json::to_string_pretty(&runtime_config)
        .map_err(|err| format!("序列化 Telegram bridge 运行配置失败: {err}"))?;

    Ok(PreparedTelegramBridgeLaunch {
        runtime_config_path,
        runtime_config_data,
    })
}

fn write_telegram_bridge_runtime_config(
    launch: &PreparedTelegramBridgeLaunch,
) -> Result<(), String> {
    ensure_parent_dir(&launch.runtime_config_path)?;
    fs::write(&launch.runtime_config_path, &launch.runtime_config_data)
        .map_err(|err| format!("写入 Telegram bridge 运行配置失败: {err}"))
}

fn spawn_telegram_bridge_process(
    runtime_config_path: &Path,
) -> Result<ManagedTelegramBridgeProcess, String> {
    let current_exe =
        env::current_exe().map_err(|err| format!("定位主程序可执行文件失败: {err}"))?;
    let child = Command::new(&current_exe)
        .arg(TELEGRAM_BRIDGE_ARG)
        .arg(runtime_config_path)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|err| format!("启动 Telegram bridge 失败: {err}"))?;

    Ok(ManagedTelegramBridgeProcess {
        child,
        runtime_config_path: runtime_config_path.to_path_buf(),
    })
}

async fn start_telegram_bridge_impl(state: &AppState) -> Result<TelegramBridgeStatus, String> {
    let launch = prepare_telegram_bridge_launch(state).await?;
    let mut manager = state
        .telegram_bridge
        .lock()
        .map_err(|_| "更新 Telegram bridge 状态失败".to_string())?;
    refresh_telegram_bridge_manager(&mut manager);
    if manager.process.is_some() {
        return Ok(telegram_bridge_status_from_manager(&manager));
    }

    write_telegram_bridge_runtime_config(&launch)?;
    let process = match spawn_telegram_bridge_process(&launch.runtime_config_path) {
        Ok(process) => process,
        Err(err) => {
            let _ = fs::remove_file(&launch.runtime_config_path);
            manager.last_error = Some(err.clone());
            manager.last_stopped_ms = Some(now_ms());
            return Err(err);
        }
    };

    manager.last_started_ms = Some(now_ms());
    manager.last_error = None;
    manager.last_pid = Some(process.child.id());
    manager.process = Some(process);
    std::thread::sleep(Duration::from_millis(350));
    refresh_telegram_bridge_manager(&mut manager);
    if manager.process.is_none() {
        let err = manager
            .last_error
            .clone()
            .unwrap_or_else(|| "Telegram bridge 启动失败".to_string());
        return Err(err);
    }
    Ok(telegram_bridge_status_from_manager(&manager))
}

fn stop_telegram_bridge_impl(state: &AppState) -> Result<TelegramBridgeStatus, String> {
    let mut manager = state
        .telegram_bridge
        .lock()
        .map_err(|_| "更新 Telegram bridge 状态失败".to_string())?;
    refresh_telegram_bridge_manager(&mut manager);
    if let Some(mut process) = manager.process.take() {
        let _ = process.child.kill();
        finish_telegram_bridge_process(&mut manager, process, None);
    }
    Ok(telegram_bridge_status_from_manager(&manager))
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

fn compute_file_hash_from_path(path: &Path) -> Result<String, String> {
    use std::io::Read;

    let mut file = std::fs::File::open(path).map_err(|err| format!("读取已下载文件失败: {err}"))?;
    let mut hasher = Sha256::new();
    let mut buffer = [0u8; 64 * 1024];
    loop {
        let read = file
            .read(&mut buffer)
            .map_err(|err| format!("读取已下载文件失败: {err}"))?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    Ok(format!("{:x}", hasher.finalize()))
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
    let Some(mut message) = existing else {
        return Ok(());
    };
    message.local_path = None;
    message.file_hash = None;
    db::upsert_message(db_path, &message).map_err(|err| err.to_string())?;
    Ok(())
}

fn delete_recorded_download_file(saved_path: Option<&str>) -> Result<(), String> {
    let Some(saved_path) = saved_path.map(str::trim).filter(|value| !value.is_empty()) else {
        return Ok(());
    };
    let file_path = PathBuf::from(saved_path);
    if !file_path.exists() {
        return Ok(());
    }
    if !file_path.is_file() {
        return Err("下载记录的本地路径不是文件".to_string());
    }
    fs::remove_file(&file_path).map_err(|err| format!("删除本地文件失败: {err}"))?;
    Ok(())
}

fn emit_download_progress(
    window: &Window,
    endpoint_id: &str,
    filename: &str,
    received: u64,
    total: Option<u64>,
    transfer_mode: Option<DownloadTransferMode>,
    range_start: Option<u64>,
    range_end: Option<u64>,
    status: &str,
    error: Option<String>,
) {
    let payload = DownloadProgress {
        endpoint_id: endpoint_id.to_string(),
        filename: filename.to_string(),
        received,
        total,
        transfer_mode: transfer_mode.map(|value| value.as_str().to_string()),
        range_start,
        range_end,
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

async fn run_sync(
    state: &AppState,
    source: &str,
    wait_for_turn: bool,
) -> Result<SyncStatus, String> {
    const SYNC_CANCELLED_SENTINEL: &str = "__sync_cancelled__";
    const SYNC_CANCELLED_MESSAGE: &str = "\u{5DF2}\u{53D6}\u{6D88}\u{5237}\u{65B0}";

    loop {
        let running_status = {
            let mut status = state.sync_status.lock().map_err(|_| {
                "\u{66F4}\u{65B0}\u{540C}\u{6B65}\u{72B6}\u{6001}\u{5931}\u{8D25}".to_string()
            })?;
            if status.running {
                Some(status.clone())
            } else {
                status.running = true;
                status.last_error = None;
                status.last_result = Some(format!("\u{540C}\u{6B65}\u{4E2D}\u{FF1A}{source}..."));
                status.current_source = Some(source.to_string());
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
        let mut sync_cancel = state.sync_cancel.lock().map_err(|_| {
            "\u{66F4}\u{65B0}\u{540C}\u{6B65}\u{72B6}\u{6001}\u{5931}\u{8D25}".to_string()
        })?;
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

    let mut status = state.sync_status.lock().map_err(|_| {
        "\u{66F4}\u{65B0}\u{540C}\u{6B65}\u{72B6}\u{6001}\u{5931}\u{8D25}".to_string()
    })?;
    status.running = false;
    status.last_run_ms = Some(now_ms());
    status.current_source = None;
    match result {
        Ok(count) => {
            status.last_error = None;
            status.last_result = Some(format!(
                "\u{540C}\u{6B65}\u{5B8C}\u{6210}\u{FF0C}\u{65B0}\u{589E} {count} \u{6761}"
            ));
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

    let history = crate::history::load_history_for_sync(
        &state.http,
        &endpoint,
        &history_cache_dir(state, &endpoint_id),
    )
    .await?;
    let mut history_map: HashMap<String, HistoryEntry> = history
        .entries
        .into_iter()
        .map(|entry| (entry.filename.clone(), entry))
        .collect();

    let mut files_map: HashMap<String, crate::types::DavEntry> = HashMap::new();
    if history.layout != HistoryLayout::Manifest {
        let entries = webdav::list_entries(&state.http, &endpoint, Some("files"), true).await?;
        for entry in entries {
            if entry.is_collection {
                continue;
            }
            files_map.insert(entry.filename.clone(), entry);
        }
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
        let (
            sender,
            timestamp_ms,
            kind,
            original_name,
            size_hint,
            remote_path_hint,
            marked,
            format,
        ) = if let Some(history) = history_entry {
            (
                history.sender.clone(),
                history.timestamp_ms,
                history.kind.clone(),
                history.original_name.clone(),
                history.size,
                history.remote_path.clone(),
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
                file_entry.and_then(|entry| entry.size).unwrap_or(0) as i64,
                None,
                false,
                format,
            )
        } else {
            continue;
        };

        let existing = db::get_message(&state.db_path, &endpoint_id, &filename)
            .map_err(|err| err.to_string())?;
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
            remote_path: remote_path_hint,
            file_hash: None,
            marked,
            format,
        });

        if let Some(history) = history_entry {
            message.sender = history.sender.clone();
            message.timestamp_ms = history.timestamp_ms;
            message.kind = history.kind.clone();
            message.original_name = history.original_name.clone();
            message.remote_path = history.remote_path.clone();
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
            message.remote_path = Some(entry.remote_path.clone());
        }

        let kind_enum = match message.kind.as_str() {
            "text" => MessageKind::Text,
            "file" => MessageKind::File,
            _ => parsed
                .as_ref()
                .map(|item| item.kind)
                .unwrap_or(MessageKind::File),
        };

        let remote_path = resolved_remote_path(
            message.remote_path.as_deref(),
            &filename,
            Some(message.timestamp_ms),
        );
        message.remote_path = Some(remote_path.clone());

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
                || existing.remote_path != message.remote_path
                || existing.marked != message.marked
                || existing.etag != message.etag
                || existing.mtime != message.mtime
                || existing.format != message.format
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
        crate::history::save_history(&state.http, &endpoint, &history).await?;
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
        remote_path: message.remote_path.clone(),
        marked: message.marked,
        format: message.format.clone(),
    }
}

fn collect_cleanup_candidates(messages: Vec<Message>, cutoff_ms: Option<i64>) -> Vec<Message> {
    messages
        .into_iter()
        .filter(|message| !message.marked)
        .filter(|message| match cutoff_ms {
            Some(cutoff) => message.timestamp_ms < cutoff,
            None => true,
        })
        .collect()
}

#[allow(dead_code)]
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

#[allow(dead_code)]
async fn save_history(
    state: &AppState,
    endpoint: &WebDavEndpoint,
    history: &[HistoryEntry],
) -> Result<(), String> {
    let data =
        serde_json::to_vec_pretty(history).map_err(|err| format!("序列化历史记录失败: {err}"))?;
    webdav::upload_file(&state.http, endpoint, "history.json", data).await
}

#[allow(dead_code)]
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
            let _ = window.emit("trigger-hide", ());
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
        let run = hkcu
            .open_subkey_with_flags(
                "Software\\Microsoft\\Windows\\CurrentVersion\\Run",
                KEY_WRITE,
            )
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
        let uid = String::from_utf8_lossy(&uid_output.stdout)
            .trim()
            .to_string();
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
                exe_str
                    .replace('&', "&amp;")
                    .replace('<', "&lt;")
                    .replace('>', "&gt;")
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

fn start_sync_loop(_app_handle: AppHandle) {}

fn is_telegram_bridge_mode() -> bool {
    env::args_os()
        .nth(1)
        .map(|arg| arg.to_string_lossy() == TELEGRAM_BRIDGE_ARG)
        .unwrap_or(false)
}

fn run_telegram_bridge_mode() {
    let runtime = tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()
        .expect("failed to build telegram bridge runtime");
    if let Err(err) = runtime.block_on(telegram_bridge::run()) {
        eprintln!("{err}");
        std::process::exit(1);
    }
}

fn main() {
    if is_telegram_bridge_mode() {
        run_telegram_bridge_mode();
        return;
    }

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
            let migration_endpoint_id = settings.active_webdav_id.as_deref().or_else(|| {
                settings
                    .webdav_endpoints
                    .first()
                    .map(|endpoint| endpoint.id.as_str())
            });

            db::init_db(&db_path, migration_endpoint_id)?;
            fs::create_dir_all(&files_base_dir)
                .map_err(|err| format!("创建文件目录失败: {err}"))?;

            let (sync_loop_signal, _) = watch::channel(0_u64);

            app.manage(AppState {
                settings_path,
                db_path,
                files_base_dir,
                default_download_dir,
                settings: Mutex::new(settings),
                sync_status: Mutex::new(SyncStatus::idle()),
                sync_guard: AsyncMutex::new(()),
                sync_cancel: Mutex::new(None),
                sync_loop_signal,
                http: Client::builder()
                    .connect_timeout(Duration::from_secs(10))
                    .pool_idle_timeout(Duration::from_secs(30))
                    .build()
                    .map_err(|err| format!("创建 HTTP 客户端失败: {err}"))?,
                registered_hotkey: Mutex::new(None),
                telegram_bridge: Mutex::new(TelegramBridgeManager::default()),
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
                let hotkey_item = MenuItem::with_id(
                    app,
                    HOTKEY_MENU_ID,
                    initial_hotkey_label,
                    true,
                    None::<&str>,
                )?;
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
                    .on_menu_event(move |app, event: tauri::menu::MenuEvent| {
                        match event.id().as_ref() {
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
                                settings_copy.global_hotkey_enabled =
                                    !settings_copy.global_hotkey_enabled;

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
                        }
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
                                    && (cfg!(target_os = "macos")
                                        || button_state == MouseButtonState::Up);
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
                            let _ = event_window.emit("trigger-hide", ());
                            let _ = event_window.hide();
                            api.prevent_close();
                        }
                        #[cfg(target_os = "macos")]
                        sync_dock_visibility_webview(&event_window.app_handle(), &event_window);
                    });
                }
            }

            {
                let app_handle = app.handle().clone();
                tauri::async_runtime::spawn(async move {
                    let state = app_handle.state::<AppState>();
                    let should_start = current_settings(&state)
                        .map(|settings| should_auto_start_telegram_bridge(&settings))
                        .unwrap_or(false);
                    if should_start {
                        if let Err(err) = start_telegram_bridge_impl(&state).await {
                            if let Ok(mut manager) = state.telegram_bridge.lock() {
                                manager.last_error = Some(err.clone());
                                manager.last_stopped_ms = Some(now_ms());
                            }
                            eprintln!("Telegram bridge auto start failed: {err}");
                        }
                    }
                });
            }

            start_sync_loop(app.handle().clone());
            Ok(())
        })
        .plugin(
            tauri_plugin_log::Builder::default()
                .targets([
                    Target::new(TargetKind::Stdout),
                    Target::new(TargetKind::Webview),
                    Target::new(TargetKind::LogDir {
                        file_name: Some("app.log".into()),
                    }),
                ])
                .level(LevelFilter::Info)
                .build(),
        )
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            get_settings,
            get_telegram_bridge_status,
            discover_telegram_chats,
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
            list_upload_history,
            list_download_history,
            save_download_history_as,
            redownload_download_history,
            delete_download_history,
            clear_download_history_records,
            clear_upload_history_records,
            open_download_history_dir,
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
            refresh,
            cancel_refresh,
            get_sync_status,
            start_telegram_bridge,
            stop_telegram_bridge,
            mark_message,
            unmark_message,
            test_webdav_speed,
            backup_webdav,
            restore_webdav
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app_handle, event| {
        if matches!(
            event,
            tauri::RunEvent::Exit | tauri::RunEvent::ExitRequested { .. }
        ) {
            let state = app_handle.state::<AppState>();
            let _ = stop_telegram_bridge_impl(&state);
        }

        #[cfg(target_os = "macos")]
        if let tauri::RunEvent::Reopen { .. } = event {
            show_main_window(app_handle);
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn test_settings() -> Settings {
        Settings {
            webdav_endpoints: vec![WebDavEndpoint {
                id: "endpoint-1".to_string(),
                name: "Primary".to_string(),
                url: "https://example.com/dav".to_string(),
                username: "user".to_string(),
                password: "pass".to_string(),
                enabled: true,
            }],
            active_webdav_id: Some("endpoint-1".to_string()),
            sender_name: "tester".to_string(),
            refresh_interval_secs: 5,
            download_dir: String::new(),
            send_hotkey: DEFAULT_SEND_HOTKEY.to_string(),
            global_hotkey_enabled: false,
            global_hotkey: DEFAULT_GLOBAL_HOTKEY.to_string(),
            auto_start: false,
            telegram: TelegramBridgeSettings::default(),
        }
    }

    #[cfg(target_os = "windows")]
    fn spawn_sleeping_process() -> Child {
        Command::new("powershell")
            .args(["-NoProfile", "-Command", "Start-Sleep -Seconds 5"])
            .spawn()
            .expect("spawn sleeping process")
    }

    #[cfg(not(target_os = "windows"))]
    fn spawn_sleeping_process() -> Child {
        Command::new("sh")
            .args(["-c", "sleep 5"])
            .spawn()
            .expect("spawn sleeping process")
    }

    #[cfg(target_os = "windows")]
    fn spawn_quick_exit_process() -> Child {
        Command::new("cmd")
            .args(["/C", "exit 0"])
            .spawn()
            .expect("spawn quick exit process")
    }

    #[cfg(not(target_os = "windows"))]
    fn spawn_quick_exit_process() -> Child {
        Command::new("sh")
            .args(["-c", "true"])
            .spawn()
            .expect("spawn quick exit process")
    }

    #[test]
    fn test_history_entry_serde() {
        let entry = HistoryEntry {
            filename: "test.txt".to_string(),
            sender: "me".to_string(),
            timestamp_ms: 1234567890,
            size: 100,
            kind: "text".to_string(),
            original_name: "test.txt".to_string(),
            remote_path: Some("files/test.txt".to_string()),
            marked: true,
            format: "text".to_string(),
        };

        let json = serde_json::to_string(&entry).unwrap();
        assert!(json.contains("\"marked\":true"));

        let deserialized: HistoryEntry = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.marked, true);
        assert_eq!(deserialized.format, "text");

        // Test default
        let json_old = r#"{"filename":"test.txt","sender":"me","timestamp_ms":1234567890,"size":100,"kind":"text","original_name":"test.txt"}"#;
        let deserialized_old: HistoryEntry = serde_json::from_str(json_old).unwrap();
        assert_eq!(deserialized_old.marked, false);
        assert_eq!(deserialized_old.format, "");
    }

    #[test]
    fn collect_cleanup_candidates_skips_marked_messages() {
        let messages = vec![
            Message {
                filename: "old-unmarked.txt".to_string(),
                sender: "tester".to_string(),
                timestamp_ms: 10,
                size: 1,
                kind: "text".to_string(),
                original_name: "old-unmarked.txt".to_string(),
                content: None,
                local_path: None,
                remote_path: None,
                file_hash: None,
                download_exists: false,
                marked: false,
                format: "text".to_string(),
            },
            Message {
                filename: "old-marked.txt".to_string(),
                sender: "tester".to_string(),
                timestamp_ms: 10,
                size: 1,
                kind: "text".to_string(),
                original_name: "old-marked.txt".to_string(),
                content: None,
                local_path: None,
                remote_path: None,
                file_hash: None,
                download_exists: false,
                marked: true,
                format: "text".to_string(),
            },
            Message {
                filename: "new-unmarked.txt".to_string(),
                sender: "tester".to_string(),
                timestamp_ms: 100,
                size: 1,
                kind: "text".to_string(),
                original_name: "new-unmarked.txt".to_string(),
                content: None,
                local_path: None,
                remote_path: None,
                file_hash: None,
                download_exists: false,
                marked: false,
                format: "text".to_string(),
            },
        ];

        let candidates = collect_cleanup_candidates(messages, Some(50));
        assert_eq!(candidates.len(), 1);
        assert_eq!(candidates[0].filename, "old-unmarked.txt");
    }

    #[test]
    fn normalize_settings_applies_telegram_defaults() {
        let mut settings = test_settings();
        settings.telegram.enabled = false;
        settings.telegram.auto_start = true;
        settings.telegram.poll_interval_secs = 0;
        settings.telegram.proxy_url.clear();
        let download_dir = std::env::temp_dir().join("transfer-genie-settings-test");

        let normalized = normalize_settings(settings, &download_dir).unwrap();

        assert_eq!(
            normalized.telegram.poll_interval_secs,
            DEFAULT_TELEGRAM_POLL_INTERVAL_SECS
        );
        assert!(normalized.telegram.auto_start);
        assert!(!normalized.telegram.proxy_enabled);
        assert_eq!(normalized.telegram.proxy_url, "http://127.0.0.1:7890");
    }

    #[test]
    fn should_auto_start_telegram_bridge_requires_valid_config_and_auto_start() {
        let mut settings = test_settings();
        assert!(!should_auto_start_telegram_bridge(&settings));

        settings.telegram.auto_start = true;
        assert!(!should_auto_start_telegram_bridge(&settings));

        settings.telegram.bot_token = "123456:test".to_string();
        settings.telegram.chat_id = "-100123".to_string();
        assert!(should_auto_start_telegram_bridge(&settings));
    }

    #[test]
    fn should_auto_start_telegram_bridge_requires_active_endpoint() {
        let mut settings = test_settings();
        settings.telegram.auto_start = true;
        settings.telegram.bot_token = "123456:test".to_string();
        settings.telegram.chat_id = "-100123".to_string();
        settings.active_webdav_id = None;

        assert!(!should_auto_start_telegram_bridge(&settings));
    }

    #[test]
    fn should_restart_telegram_bridge_when_runtime_telegram_settings_change() {
        let previous = test_settings();
        let mut normalized = test_settings();
        normalized.telegram.sender_name = "tg-alias".to_string();

        assert!(should_restart_telegram_bridge(&previous, &normalized));
    }

    #[test]
    fn should_not_restart_telegram_bridge_for_auto_start_only_change() {
        let previous = test_settings();
        let mut normalized = test_settings();
        normalized.telegram.auto_start = true;

        assert!(!should_restart_telegram_bridge(&previous, &normalized));
    }

    #[test]
    fn finish_telegram_bridge_process_cleans_runtime_config() {
        let runtime_config_path =
            std::env::temp_dir().join(format!("transfer-genie-telegram-runtime-{}.json", now_ms()));
        fs::write(&runtime_config_path, "{}").unwrap();

        let mut child = spawn_sleeping_process();
        let _ = child.kill();
        let process = ManagedTelegramBridgeProcess {
            child,
            runtime_config_path: runtime_config_path.clone(),
        };
        let mut manager = TelegramBridgeManager::default();

        finish_telegram_bridge_process(&mut manager, process, None);

        assert!(!runtime_config_path.exists());
        assert!(manager.last_pid.is_some());
        assert!(manager.last_stopped_ms.is_some());
    }

    #[test]
    fn refresh_telegram_bridge_manager_clears_finished_process() {
        let runtime_config_path = std::env::temp_dir().join(format!(
            "transfer-genie-telegram-runtime-refresh-{}.json",
            now_ms()
        ));
        fs::write(&runtime_config_path, "{}").unwrap();

        let child = spawn_quick_exit_process();
        let process = ManagedTelegramBridgeProcess {
            child,
            runtime_config_path: runtime_config_path.clone(),
        };
        let mut manager = TelegramBridgeManager {
            process: Some(process),
            ..Default::default()
        };

        std::thread::sleep(Duration::from_millis(150));

        refresh_telegram_bridge_manager(&mut manager);

        assert!(manager.process.is_none());
        assert!(!runtime_config_path.exists());
        assert!(manager.last_stopped_ms.is_some());
    }

    #[test]
    fn collect_telegram_chat_candidates_deduplicates_and_formats_titles() {
        let updates = vec![
            TelegramDiscoveryUpdate {
                update_id: 1,
                message: Some(TelegramDiscoveryMessage {
                    chat: TelegramDiscoveryChat {
                        id: 1,
                        chat_type: "private".to_string(),
                        title: None,
                        username: Some("alice".to_string()),
                        first_name: Some("Alice".to_string()),
                        last_name: None,
                    },
                    from: Some(TelegramDiscoveryUser {
                        id: 10,
                        username: Some("alice_sender".to_string()),
                    }),
                }),
                edited_message: None,
                channel_post: None,
                edited_channel_post: None,
            },
            TelegramDiscoveryUpdate {
                update_id: 2,
                message: Some(TelegramDiscoveryMessage {
                    chat: TelegramDiscoveryChat {
                        id: -100123,
                        chat_type: "supergroup".to_string(),
                        title: Some("Team Chat".to_string()),
                        username: None,
                        first_name: None,
                        last_name: None,
                    },
                    from: None,
                }),
                edited_message: None,
                channel_post: None,
                edited_channel_post: None,
            },
            TelegramDiscoveryUpdate {
                update_id: 3,
                message: Some(TelegramDiscoveryMessage {
                    chat: TelegramDiscoveryChat {
                        id: 1,
                        chat_type: "private".to_string(),
                        title: None,
                        username: Some("alice".to_string()),
                        first_name: Some("Alice".to_string()),
                        last_name: None,
                    },
                    from: Some(TelegramDiscoveryUser {
                        id: 10,
                        username: Some("alice_sender".to_string()),
                    }),
                }),
                edited_message: None,
                channel_post: None,
                edited_channel_post: None,
            },
        ];

        let candidates = collect_telegram_chat_candidates(updates);

        assert_eq!(candidates.len(), 2);
        assert_eq!(candidates[0].id, "1");
        assert_eq!(candidates[0].title, "@alice");
        assert_eq!(candidates[0].sender_name, "alice_sender");
        assert_eq!(candidates[1].id, "-100123");
        assert_eq!(candidates[1].title, "Team Chat");
        assert_eq!(candidates[1].sender_name, "");
    }

    #[tokio::test]
    async fn discover_telegram_chats_requires_bot_token() {
        let error = discover_telegram_chats_impl("   ", "").await.unwrap_err();
        assert!(error.contains("Bot Token"));
    }

    #[test]
    fn normalize_telegram_proxy_url_accepts_empty_value() {
        let value = normalize_telegram_proxy_url("   ").expect("empty proxy should use default");
        assert_eq!(value, "http://127.0.0.1:7890");
    }

    #[test]
    fn normalize_telegram_proxy_url_accepts_valid_http_proxy() {
        let value = normalize_telegram_proxy_url(" http://127.0.0.1:7890 ")
            .expect("http proxy should be accepted");
        assert_eq!(value, "http://127.0.0.1:7890");
    }

    #[test]
    fn normalize_telegram_proxy_url_rejects_invalid_value() {
        let error = normalize_telegram_proxy_url("not a proxy").unwrap_err();
        assert!(error.contains("代理"));
    }

    #[test]
    fn normalize_settings_rejects_invalid_proxy_when_enabled() {
        let mut settings = test_settings();
        settings.telegram.proxy_enabled = true;
        settings.telegram.proxy_url = "not a proxy".to_string();

        let download_dir = std::env::temp_dir().join("transfer-genie-settings-test-invalid-proxy");
        let error = match normalize_settings(settings, &download_dir) {
            Ok(_) => panic!("expected invalid proxy to be rejected when enabled"),
            Err(error) => error,
        };

        assert!(error.contains("代理"));
    }

    #[test]
    fn normalize_settings_keeps_proxy_disabled_without_validation() {
        let mut settings = test_settings();
        settings.telegram.proxy_enabled = false;
        settings.telegram.proxy_url = "not a proxy".to_string();

        let download_dir = std::env::temp_dir().join("transfer-genie-settings-test-disabled-proxy");
        let normalized = normalize_settings(settings, &download_dir).unwrap();

        assert!(!normalized.telegram.proxy_enabled);
        assert_eq!(normalized.telegram.proxy_url, "not a proxy");
    }

    #[test]
    fn build_telegram_http_client_supports_empty_or_valid_proxy() {
        build_telegram_http_client("", Duration::from_secs(5)).expect("direct Telegram client");
        build_telegram_http_client("http://127.0.0.1:7890", Duration::from_secs(5))
            .expect("proxy Telegram client");
    }
}
