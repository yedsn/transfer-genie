#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod db;
mod filenames;
mod history;
mod integration_runtime;
mod telegram_bridge;
mod telegram_bridge_runtime;
mod types;
mod webdav;
mod webdav_sync_runtime;
mod workspace;

use crate::db::{
    DbDownloadHistory, DbMessage, DbPartialDownload, DbUploadHistory, PendingMarkedSync,
};
use crate::filenames::{
    build_message_filename, message_remote_path, parse_message_filename, thumbnail_remote_path,
    MessageKind,
};
use crate::history::{HistoryEntry, HistoryLayout};
use crate::integration_runtime::{
    builtin_module_statuses, persist_module_statuses, IntegrationModuleStatus,
    ModuleRuntimeStateSnapshot,
};
#[cfg(test)]
use crate::telegram_bridge_runtime::ManagedTelegramBridgeProcess;
use crate::telegram_bridge_runtime::{TelegramBridgeManager, TelegramBridgeStatus};
use crate::types::{
    AiProviderSettings, AiSettings, AiTextAction, BackupSettings, DownloadHistoryRecord,
    LocalHttpApiSettings, MarkedTag, Message, SendSettings, Settings, SpeechToTextSettings,
    SyncStatus, TelegramBridgeSettings, UploadHistoryRecord, WebDavConflict, WebDavEndpoint,
    DEFAULT_LOCAL_HTTP_API_BIND_ADDRESS, DEFAULT_LOCAL_HTTP_API_BIND_PORT,
};
use crate::webdav_sync_runtime::WebDavSyncRuntimeAdapter;
use crate::workspace::WorkspaceLayout;
use aes_gcm::aead::Aead;
use aes_gcm::{Aes256Gcm, KeyInit, Nonce};
use axum::body::Bytes;
use axum::extract::{DefaultBodyLimit, Multipart, State as AxumState};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::{Json, Router};
use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use flate2::read::GzDecoder;
use flate2::write::GzEncoder;
use flate2::Compression;
use futures_util::{SinkExt, StreamExt};
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
use std::io::{Read, Write};
use std::net::{IpAddr, SocketAddr};
use std::path::{Path, PathBuf};
#[cfg(test)]
use std::process::Child;
#[cfg(test)]
use std::process::Command;
use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::Window;
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, State, WebviewUrl, WebviewWindowBuilder};
#[cfg(desktop)]
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut};
use tauri_plugin_log::{Target, TargetKind};
use tauri_plugin_opener::OpenerExt;
#[cfg(desktop)]
use tauri_plugin_updater::UpdaterExt;
use time::OffsetDateTime;
use tokio::sync::{oneshot, watch, Mutex as AsyncMutex};
use tokio_tungstenite::connect_async;
use tokio_tungstenite::tungstenite::client::IntoClientRequest;
use tokio_tungstenite::tungstenite::Message as WsMessage;

#[cfg(target_os = "windows")]
static SYSTEM_DICTATION_SIDE_ALT_HOOK_STARTED: std::sync::atomic::AtomicBool =
    std::sync::atomic::AtomicBool::new(false);
#[cfg(target_os = "windows")]
static SYSTEM_DICTATION_SIDE_ALT_CONFIG: std::sync::atomic::AtomicU8 =
    std::sync::atomic::AtomicU8::new(0);
#[cfg(target_os = "windows")]
static SYSTEM_DICTATION_SIDE_ALT_TOGGLE_TX: std::sync::OnceLock<std::sync::mpsc::Sender<()>> =
    std::sync::OnceLock::new();

struct AppState {
    settings_path: PathBuf,
    db_path: PathBuf,
    files_base_dir: PathBuf,
    default_download_dir: PathBuf,
    settings: Mutex<Settings>,
    sync_status: Mutex<SyncStatus>,
    sync_guard: Arc<AsyncMutex<()>>,
    sync_cancel: Mutex<Option<oneshot::Sender<()>>>,
    sync_loop_signal: watch::Sender<u64>,
    http: Client,
    registered_hotkey: Mutex<Option<Shortcut>>,
    registered_system_dictation_hotkey: Mutex<Option<Shortcut>>,
    telegram_bridge: Mutex<TelegramBridgeManager>,
    local_http_api: Mutex<LocalHttpApiManager>,
    update_guard: AsyncMutex<()>,
    auto_backup_guard: AsyncMutex<()>,
    pending_webdav_conflict: Mutex<Option<WebDavConflict>>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LocalBackupRecord {
    endpoint_id: String,
    backup_path: String,
    created_at_ms: i64,
    source: String,
    #[serde(default)]
    manual: bool,
    #[serde(default)]
    name: String,
    #[serde(default)]
    note: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct LocalSnapshotRecord {
    path: String,
    category: String,
    target_path: String,
    file_name: String,
    size_bytes: u64,
    created_at_ms: Option<i64>,
    manual: bool,
    name: String,
    note: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct LocalBackupArchiveRecord {
    endpoint_id: String,
    backup_path: String,
    created_at_ms: i64,
    source: String,
    file_name: String,
    size_bytes: u64,
    exists: bool,
    manual: bool,
    name: String,
    note: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct LocalDataBackupResult {
    path: String,
    file_name: String,
    size_bytes: u64,
    created_at_ms: i64,
    manual: bool,
    name: String,
    note: String,
}

#[derive(Default, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BackupManualMetadata {
    #[serde(default)]
    manual: bool,
    #[serde(default)]
    name: String,
    #[serde(default)]
    note: String,
    #[serde(default)]
    created_at_ms: Option<i64>,
    #[serde(default)]
    kind: String,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LocalDataBackupManifest {
    version: u8,
    created_at_ms: i64,
    app_version: String,
    includes: Vec<String>,
}

#[derive(Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AutoBackupStateRecord {
    last_run_ms: Option<i64>,
    last_success_ms: Option<i64>,
    last_error: Option<String>,
    last_backup_path: Option<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct AutoBackupStatus {
    enabled: bool,
    interval_minutes: u64,
    retain_count: u32,
    settings_snapshot_retain_count: u32,
    directory: String,
    keep_all_days: u32,
    keep_daily_days: u32,
    has_active_endpoint: bool,
    last_run_ms: Option<i64>,
    last_success_ms: Option<i64>,
    last_error: Option<String>,
    last_backup_path: Option<String>,
}

const EXPORT_VERSION: u8 = 1;
const EXPORT_KDF_ITERATIONS: u32 = 100_000;
const DEFAULT_GLOBAL_HOTKEY: &str = "alt+t";
const HOTKEY_MENU_ID: &str = "toggle-hotkey";
const CHECK_UPDATE_MENU_ID: &str = "check-update";
const DEFAULT_SEND_HOTKEY: &str = "enter";
const SEND_HOTKEY_CTRL_ENTER: &str = "ctrl_enter";
const SYNC_TIMEOUT_SECS: u64 = 45;
const REFRESH_SYNC_SOURCE: &str = "正在刷新";
const AUTO_SYNC_SOURCE: &str = "定时同步";
const TELEGRAM_BRIDGE_ARG: &str = "--telegram-bridge";
const DEFAULT_TELEGRAM_POLL_INTERVAL_SECS: u64 = 5;
const LOCAL_HTTP_API_ROUTE: &str = "/api/send-file";
const LOCAL_HTTP_TEXT_API_ROUTE: &str = "/api/send-text";
const APP_UPDATE_EVENT: &str = "app-update-event";
const TRAY_CHECK_UPDATE_EVENT: &str = "tray-check-update";
const SYSTEM_DICTATION_WINDOW_LABEL: &str = "system-dictation";
const SYSTEM_DICTATION_WINDOW_WIDTH: f64 = 340.0;
const SYSTEM_DICTATION_WINDOW_HEIGHT: f64 = 108.0;
const SYSTEM_DICTATION_WINDOW_BOTTOM_MARGIN: i32 = 88;
const DEFAULT_UPDATER_ENDPOINT: &str =
    "https://github.com/OWNER/REPO/releases/latest/download/latest.json";
const DEFAULT_UPDATER_PUBKEY: &str = "REPLACE_WITH_TAURI_UPDATER_PUBLIC_KEY";

fn default_export_global_hotkey_enabled() -> bool {
    true
}

fn default_export_auto_update_enabled() -> bool {
    false
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
    #[serde(default = "crate::types::default_save_filename_rule")]
    save_filename_rule: String,
    #[serde(default = "default_export_global_hotkey_enabled")]
    global_hotkey_enabled: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    global_hotkey: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    send_hotkey: Option<String>,
    #[serde(default = "default_export_auto_update_enabled")]
    auto_update_enabled: bool,
    #[serde(default)]
    local_http_api: LocalHttpApiSettings,
    #[serde(default)]
    send: SendSettings,
    #[serde(default)]
    telegram: ExportTelegramSettings,
    #[serde(default)]
    ai: AiSettings,
    #[serde(default)]
    speech_to_text: SpeechToTextSettings,
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
    #[serde(default, skip_serializing_if = "Option::is_none")]
    ai: Option<ExportAiSecret>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    speech_to_text: Option<ExportSpeechToTextSecret>,
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

#[derive(Serialize, Deserialize)]
struct ExportAiSecret {
    api_key: String,
}

#[derive(Serialize, Deserialize)]
struct ExportSpeechToTextSecret {
    api_key: String,
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

#[derive(Clone, Copy, Serialize)]
#[serde(rename_all = "snake_case")]
enum LocalHttpApiState {
    Disabled,
    Running,
    StartFailed,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct LocalHttpApiStatus {
    state: LocalHttpApiState,
    address: Option<String>,
    last_error: Option<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct AppUpdateSummary {
    version: String,
    current_version: String,
    notes: Option<String>,
    pub_date: Option<String>,
    target: String,
    download_url: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct AppUpdateCheckResult {
    available: bool,
    current_version: String,
    update: Option<AppUpdateSummary>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct AppUpdateEventPayload {
    stage: String,
    downloaded_bytes: Option<u64>,
    chunk_length: Option<u64>,
    content_length: Option<u64>,
    message: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct AiTextProcessRequest {
    #[serde(default)]
    action_id: Option<String>,
    text: String,
    #[serde(default)]
    format: Option<String>,
    #[serde(default)]
    temporary_prompt: Option<AiTemporaryPrompt>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct AiTemporaryPrompt {
    #[serde(default)]
    name: Option<String>,
    #[serde(default)]
    category: Option<String>,
    #[serde(default)]
    system_prompt: Option<String>,
    user_prompt: String,
    #[serde(default)]
    output_mode: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct AiTextProcessResult {
    action_id: String,
    action_name: String,
    output_text: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    reasoning_text: Option<String>,
    output_mode: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct AiTextStreamEvent {
    request_id: String,
    event_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    action_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    action_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    output_mode: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    delta: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SpeechToTextRequest {
    audio_data: Vec<u8>,
    #[serde(default)]
    format: Option<String>,
    #[serde(default)]
    mime_type: Option<String>,
    #[serde(default)]
    sample_rate: Option<u32>,
    #[serde(default)]
    channels: Option<u16>,
    #[serde(default)]
    bits_per_sample: Option<u16>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SpeechToTextResult {
    text: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    log_id: Option<String>,
    timing: SpeechToTextTiming,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SpeechToTextTiming {
    total_ms: u128,
    connect_ms: u128,
    send_config_ms: u128,
    send_audio_ms: u128,
    wait_result_ms: u128,
    audio_bytes: usize,
}

#[derive(Debug)]
struct AsrServerFrame {
    message_type: u8,
    flags: u8,
    sequence: Option<i32>,
    payload: Option<serde_json::Value>,
    error_code: Option<i32>,
    error_text: Option<String>,
}

const ASR_PROTOCOL_VERSION: u8 = 0b0001;
const ASR_HEADER_SIZE_WORDS: u8 = 0b0001;
const ASR_CLIENT_FULL_REQUEST: u8 = 0b0001;
const ASR_CLIENT_AUDIO_ONLY_REQUEST: u8 = 0b0010;
const ASR_SERVER_ERROR_RESPONSE: u8 = 0b1111;
const ASR_FLAG_POS_SEQUENCE: u8 = 0b0001;
const ASR_FLAG_NEG_WITH_SEQUENCE: u8 = 0b0011;
const ASR_SERIALIZATION_NONE: u8 = 0b0000;
const ASR_SERIALIZATION_JSON: u8 = 0b0001;
const ASR_COMPRESSION_GZIP: u8 = 0b0001;

#[derive(Serialize)]
struct OpenAiCompatibleRequestMessage {
    role: String,
    content: String,
}

#[derive(Serialize)]
struct OpenAiCompatibleRequest {
    model: String,
    messages: Vec<OpenAiCompatibleRequestMessage>,
    temperature: f32,
    #[serde(skip_serializing_if = "Option::is_none")]
    stream: Option<bool>,
}

#[derive(Deserialize)]
struct OpenAiCompatibleResponse {
    choices: Vec<OpenAiCompatibleChoice>,
}

#[derive(Deserialize)]
struct OpenAiCompatibleChoice {
    message: OpenAiCompatibleResponseMessage,
}

#[derive(Deserialize)]
struct OpenAiCompatibleResponseMessage {
    content: Option<String>,
}

#[derive(Deserialize)]
struct OpenAiCompatibleStreamResponse {
    choices: Vec<OpenAiCompatibleStreamChoice>,
}

#[derive(Deserialize)]
struct OpenAiCompatibleStreamChoice {
    delta: OpenAiCompatibleStreamDelta,
}

#[derive(Deserialize)]
struct OpenAiCompatibleStreamDelta {
    content: Option<String>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdaterPluginRuntimeConfig {
    #[serde(default)]
    endpoints: Vec<String>,
    #[serde(default)]
    pubkey: String,
}

struct LocalHttpApiManager {
    state: LocalHttpApiState,
    last_error: Option<String>,
    bind_address: String,
    bind_port: u16,
    shutdown_tx: Option<oneshot::Sender<()>>,
    task: Option<tauri::async_runtime::JoinHandle<()>>,
}

impl Default for LocalHttpApiManager {
    fn default() -> Self {
        Self {
            state: LocalHttpApiState::Disabled,
            last_error: None,
            bind_address: DEFAULT_LOCAL_HTTP_API_BIND_ADDRESS.to_string(),
            bind_port: DEFAULT_LOCAL_HTTP_API_BIND_PORT,
            shutdown_tx: None,
            task: None,
        }
    }
}

#[derive(Clone)]
struct LocalHttpApiContext {
    app_handle: AppHandle,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LocalHttpApiSendTextRequest {
    text: String,
    #[serde(default)]
    format: Option<String>,
    #[serde(default)]
    marked_options: Option<LocalHttpApiMarkedOptionsInput>,
}

#[derive(Clone, Default, Deserialize, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct LocalHttpApiMarkedOptionsInput {
    #[serde(default)]
    marked: bool,
    #[serde(default)]
    tag_names: Vec<String>,
    #[serde(default)]
    due_date: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct LocalHttpApiSendResponse {
    status: &'static str,
    result: SendMessageResult,
}

#[derive(Serialize)]
struct LocalHttpApiErrorResponse {
    error: String,
}

struct LocalHttpApiError {
    status: StatusCode,
    message: String,
}

impl LocalHttpApiError {
    fn bad_request(message: impl Into<String>) -> Self {
        Self {
            status: StatusCode::BAD_REQUEST,
            message: message.into(),
        }
    }

    fn internal(message: impl Into<String>) -> Self {
        Self {
            status: StatusCode::INTERNAL_SERVER_ERROR,
            message: message.into(),
        }
    }
}

impl IntoResponse for LocalHttpApiError {
    fn into_response(self) -> Response {
        (
            self.status,
            Json(LocalHttpApiErrorResponse {
                error: self.message,
            }),
        )
            .into_response()
    }
}

#[derive(Serialize)]
struct DownloadResult {
    status: String,
    path: Option<String>,
    suggested_path: Option<String>,
    transfer_mode: Option<String>,
}

#[derive(Clone, Default, Deserialize, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct PendingCreatedTagInput {
    name: String,
    #[serde(default)]
    selected: bool,
}

#[derive(Clone, Default, Deserialize, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct SendMarkedOptionsInput {
    #[serde(default)]
    marked: bool,
    #[serde(default)]
    selected_tag_ids: Vec<String>,
    #[serde(default)]
    due_date: Option<String>,
    #[serde(default)]
    created_tags: Vec<PendingCreatedTagInput>,
    #[serde(default)]
    deleted_tag_ids: Vec<String>,
}

struct AppliedSendMarkedOptions {
    marked: bool,
    tag_ids: Vec<String>,
    due_date: Option<String>,
    tags: Vec<MarkedTag>,
    tags_changed: bool,
    cleanup_targets: Vec<crate::history::HistoryEntryTarget>,
}

#[derive(Default, Serialize)]
#[serde(rename_all = "camelCase")]
struct SendMessageResult {
    marked_tag_ids: Vec<String>,
    filename: String,
    original_name: String,
    endpoint_id: String,
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
    TelegramBridgeRuntimeAdapter::new(&state).status()
}

/*
#[allow(dead_code)]
impl<'a> TelegramBridgeRuntimeAdapter<'a> {
    fn new(state: &'a AppState) -> Self {
        Self { state }
    }

    fn status(&self) -> Result<SyncStatus, String> {
        let status = self
            .state
            .sync_status
            .lock()
            .map_err(|_| "读取同步状态失败".to_string())?;
        Ok(status.clone())
    }

    fn status_snapshot(&self, settings: &Settings) -> Result<ModuleRuntimeStateSnapshot, String> {
        let sync_status = self
            .state
            .sync_status
            .lock()
            .map_err(|_| "读取同步状态失败".to_string())?;
        Ok(ModuleRuntimeStateSnapshot {
            enabled: settings.webdav_endpoints.iter().any(|endpoint| endpoint.enabled),
            running: sync_status.running,
            last_error: sync_status.last_error.clone(),
            last_started_ms: None,
            last_stopped_ms: sync_status.last_run_ms,
        })
    }

    fn cancel(&self) -> Result<(), String> {
        cancel_active_sync(self.state)
    }

    async fn refresh(&self) -> Result<SyncStatus, String> {
        if is_sync_running_from(self.state, AUTO_SYNC_SOURCE)? {
            self.cancel()?;
        }

        let result = run_sync(self.state, REFRESH_SYNC_SOURCE, true).await;
        signal_sync_loop_reset(self.state);
        result
    }
}
*/

struct TelegramBridgeRuntimeAdapter<'a> {
    state: &'a AppState,
}

impl<'a> TelegramBridgeRuntimeAdapter<'a> {
    fn new(state: &'a AppState) -> Self {
        Self { state }
    }

    fn status_snapshot(&self, settings: &Settings) -> Result<ModuleRuntimeStateSnapshot, String> {
        let telegram_manager = self
            .state
            .telegram_bridge
            .lock()
            .map_err(|_| "读取 Telegram Bridge 状态失败".to_string())?;
        Ok(
            crate::telegram_bridge_runtime::telegram_bridge_runtime_snapshot(
                &telegram_manager,
                settings.telegram.enabled,
            ),
        )
    }

    fn status(&self) -> Result<TelegramBridgeStatus, String> {
        telegram_bridge_status(self.state)
    }

    async fn start(&self) -> Result<TelegramBridgeStatus, String> {
        start_telegram_bridge_impl(self.state).await
    }

    fn stop(&self) -> Result<TelegramBridgeStatus, String> {
        stop_telegram_bridge_impl(self.state)
    }

    async fn restart_after_settings_change(&self, reason: &str) {
        restart_telegram_bridge_after_settings_change(self.state, reason).await;
    }
}

fn current_integration_module_statuses(
    state: &AppState,
) -> Result<Vec<IntegrationModuleStatus>, String> {
    let settings = current_settings(state)?;
    let webdav_runtime = WebDavSyncRuntimeAdapter::new(state);
    let telegram_runtime = TelegramBridgeRuntimeAdapter::new(state);

    Ok(builtin_module_statuses(
        webdav_runtime.status_snapshot(&settings)?,
        telegram_runtime.status_snapshot(&settings)?,
    ))
}

fn parse_snapshot_created_at_ms(path: &Path) -> Option<i64> {
    path.file_name()
        .and_then(|value| value.to_str())
        .and_then(|name| name.split_once('-').map(|(prefix, _)| prefix))
        .and_then(|prefix| prefix.parse::<i64>().ok())
}

fn normalize_manual_text(value: Option<String>) -> String {
    value.unwrap_or_default().trim().to_string()
}

fn backup_metadata_path(path: &Path) -> PathBuf {
    PathBuf::from(format!("{}.manual.json", path.to_string_lossy()))
}

fn load_backup_manual_metadata(path: &Path) -> BackupManualMetadata {
    let metadata_path = backup_metadata_path(path);
    if !metadata_path.is_file() {
        return BackupManualMetadata::default();
    }
    fs::read_to_string(metadata_path)
        .ok()
        .and_then(|content| serde_json::from_str::<BackupManualMetadata>(&content).ok())
        .unwrap_or_default()
}

fn save_backup_manual_metadata(
    path: &Path,
    metadata: &BackupManualMetadata,
    audit_root: Option<&Path>,
    category: &str,
    operation: &str,
) -> Result<(), String> {
    workspace::write_json_with_audit_at(
        &backup_metadata_path(path),
        metadata,
        audit_root,
        category,
        operation,
    )
}

fn remove_backup_file_with_metadata(path: &Path) -> Result<(), String> {
    fs::remove_file(path).map_err(|err| format!("删除过期备份失败 {}: {err}", path.display()))?;
    let metadata_path = backup_metadata_path(path);
    if metadata_path.is_file() {
        fs::remove_file(&metadata_path)
            .map_err(|err| format!("删除备份元数据失败 {}: {err}", metadata_path.display()))?;
    }
    Ok(())
}

fn list_settings_snapshots_for_state(state: &AppState) -> Result<Vec<LocalSnapshotRecord>, String> {
    let workspace_root = workspace_root_for_state(state);
    let snapshots =
        workspace::list_snapshots_for_target(&workspace_root, &state.settings_path, "settings")?;
    Ok(snapshots
        .into_iter()
        .filter_map(|path| {
            let metadata = fs::metadata(&path).ok()?;
            let manual_metadata = load_backup_manual_metadata(&path);
            Some(LocalSnapshotRecord {
                path: path.to_string_lossy().to_string(),
                category: "settings".to_string(),
                target_path: state.settings_path.to_string_lossy().to_string(),
                file_name: path
                    .file_name()
                    .and_then(|value| value.to_str())
                    .unwrap_or("snapshot.json")
                    .to_string(),
                size_bytes: metadata.len(),
                created_at_ms: parse_snapshot_created_at_ms(&path),
                manual: manual_metadata.manual,
                name: manual_metadata.name,
                note: manual_metadata.note,
            })
        })
        .collect())
}

fn list_local_backup_archives_for_state(
    state: &AppState,
) -> Result<Vec<LocalBackupArchiveRecord>, String> {
    let backups_dir = workspace_root_for_state(state).join("backups");
    if !backups_dir.is_dir() {
        return Ok(Vec::new());
    }

    let mut records = fs::read_dir(&backups_dir)
        .map_err(|err| format!("读取本地备份记录失败 {}: {err}", backups_dir.display()))?
        .filter_map(Result::ok)
        .filter(|entry| entry.path().is_file())
        .filter(|entry| entry.path().extension().and_then(|value| value.to_str()) == Some("json"))
        .filter(|entry| entry.file_name().to_string_lossy() != "auto-backup-state.json")
        .filter_map(|entry| {
            let content = fs::read_to_string(entry.path()).ok()?;
            let record = serde_json::from_str::<LocalBackupRecord>(&content).ok()?;
            let archive_path = PathBuf::from(&record.backup_path);
            let metadata = fs::metadata(&archive_path).ok();
            Some(LocalBackupArchiveRecord {
                endpoint_id: record.endpoint_id,
                backup_path: record.backup_path,
                created_at_ms: record.created_at_ms,
                source: record.source,
                file_name: archive_path
                    .file_name()
                    .and_then(|value| value.to_str())
                    .unwrap_or("backup.zip")
                    .to_string(),
                size_bytes: metadata.as_ref().map(|value| value.len()).unwrap_or(0),
                exists: metadata.is_some(),
                manual: record.manual,
                name: record.name,
                note: record.note,
            })
        })
        .collect::<Vec<_>>();

    records.sort_by(|left, right| right.created_at_ms.cmp(&left.created_at_ms));
    Ok(records)
}

fn clear_local_backup_archives_for_state(state: &AppState) -> Result<usize, String> {
    let mut removed = 0;
    let workspace_backups_dir = workspace_root_for_state(state).join("backups");
    if workspace_backups_dir.is_dir() {
        for entry in fs::read_dir(&workspace_backups_dir).map_err(|err| {
            format!(
                "读取本地备份记录失败 {}: {err}",
                workspace_backups_dir.display()
            )
        })? {
            let entry = entry.map_err(|err| format!("读取本地备份记录失败: {err}"))?;
            let record_path = entry.path();
            if !record_path.is_file()
                || record_path.extension().and_then(|value| value.to_str()) != Some("json")
                || entry.file_name().to_string_lossy() == "auto-backup-state.json"
            {
                continue;
            }
            if let Ok(content) = fs::read_to_string(&record_path) {
                if let Ok(record) = serde_json::from_str::<LocalBackupRecord>(&content) {
                    let archive_path = PathBuf::from(record.backup_path);
                    if archive_path.is_file() {
                        remove_backup_file_with_metadata(&archive_path)?;
                        removed += 1;
                    }
                }
            }
            fs::remove_file(&record_path)
                .map_err(|err| format!("删除本地备份记录失败 {}: {err}", record_path.display()))?;
        }
    }

    let settings = current_settings(state)?;
    let backup_dir = configured_backup_dir(&settings);
    if backup_dir.is_dir() {
        for entry in fs::read_dir(&backup_dir)
            .map_err(|err| format!("读取本地备份目录失败 {}: {err}", backup_dir.display()))?
        {
            let entry = entry.map_err(|err| format!("读取本地备份目录失败: {err}"))?;
            let path = entry.path();
            if !path.is_file()
                || path.extension().and_then(|value| value.to_str()) != Some("zip")
                || !is_listed_local_data_backup_path(&path)
            {
                continue;
            }
            remove_backup_file_with_metadata(&path)?;
            removed += 1;
        }
    }
    Ok(removed)
}

fn is_listed_local_data_backup_path(path: &Path) -> bool {
    path.file_name()
        .and_then(|value| value.to_str())
        .map(|name| {
            name.starts_with("transfer-genie-local-data-")
                || name.starts_with("transfer-genie-rollback-")
        })
        .unwrap_or(false)
}

fn persist_integration_module_statuses(state: &AppState) -> Result<(), String> {
    let workspace_root = workspace_root_for_state(state);
    let statuses = current_integration_module_statuses(state)?;
    persist_module_statuses(&workspace_root, &statuses)
}

#[tauri::command]
fn list_integration_modules(
    state: State<'_, AppState>,
) -> Result<Vec<IntegrationModuleStatus>, String> {
    let statuses = current_integration_module_statuses(&state)?;
    persist_integration_module_statuses(&state)?;
    Ok(statuses)
}

#[tauri::command]
fn list_settings_snapshots(state: State<'_, AppState>) -> Result<Vec<LocalSnapshotRecord>, String> {
    list_settings_snapshots_for_state(&state)
}

#[tauri::command]
fn clear_settings_snapshots(state: State<'_, AppState>) -> Result<usize, String> {
    let workspace_root = workspace_root_for_state(&state);
    workspace::clear_snapshots_for_target(&workspace_root, &state.settings_path, "settings")
}

#[tauri::command]
fn list_local_backup_archives(
    state: State<'_, AppState>,
) -> Result<Vec<LocalBackupArchiveRecord>, String> {
    list_local_backup_archives_for_state(&state)
}

#[tauri::command]
fn clear_local_backup_archives(state: State<'_, AppState>) -> Result<usize, String> {
    clear_local_backup_archives_for_state(&state)
}

#[tauri::command]
fn list_local_data_backups(
    state: State<'_, AppState>,
) -> Result<Vec<LocalBackupArchiveRecord>, String> {
    let settings = current_settings(&state)?;
    let backup_dir = configured_backup_dir(&settings);
    if !backup_dir.is_dir() {
        return Ok(Vec::new());
    }
    let mut records = fs::read_dir(&backup_dir)
        .map_err(|err| format!("读取本地备份目录失败 {}: {err}", backup_dir.display()))?
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|path| path.is_file())
        .filter(|path| path.extension().and_then(|value| value.to_str()) == Some("zip"))
        .filter(|path| is_listed_local_data_backup_path(path))
        .map(|path| {
            let metadata = fs::metadata(&path).ok();
            let manual_metadata = load_backup_manual_metadata(&path);
            LocalBackupArchiveRecord {
                endpoint_id: "local".to_string(),
                backup_path: path.to_string_lossy().to_string(),
                created_at_ms: file_modified_ms(&path),
                source: "local-data".to_string(),
                file_name: path
                    .file_name()
                    .and_then(|value| value.to_str())
                    .unwrap_or("transfer-genie-local-data.zip")
                    .to_string(),
                size_bytes: metadata.as_ref().map(|value| value.len()).unwrap_or(0),
                exists: metadata.is_some(),
                manual: manual_metadata.manual,
                name: manual_metadata.name,
                note: manual_metadata.note,
            }
        })
        .collect::<Vec<_>>();
    records.sort_by(|left, right| right.created_at_ms.cmp(&left.created_at_ms));
    Ok(records)
}

#[tauri::command]
async fn create_local_data_backup(
    state: State<'_, AppState>,
) -> Result<LocalDataBackupResult, String> {
    let _guard = state.sync_guard.lock().await;
    let settings = current_settings(&state)?;
    let path = local_data_backup_path(&settings, now_ms());
    let result = create_local_data_backup_to_path(&state, &path)?;
    cleanup_backup_snapshots_by_retention(
        &configured_backup_dir(&settings),
        settings.backup.keep_all_days,
        settings.backup.keep_daily_days,
        now_ms(),
    )?;
    Ok(result)
}

#[tauri::command]
async fn create_manual_local_data_backup(
    state: State<'_, AppState>,
    name: Option<String>,
    note: Option<String>,
) -> Result<LocalDataBackupResult, String> {
    let _guard = state.sync_guard.lock().await;
    let settings = current_settings(&state)?;
    let path = local_data_backup_path(&settings, now_ms())
        .with_file_name(format!("transfer-genie-local-data-manual-{}.zip", now_ms()));
    let mut result = create_local_data_backup_to_path(&state, &path)?;
    let manual_name = normalize_manual_text(name);
    let manual_note = normalize_manual_text(note);
    let metadata = BackupManualMetadata {
        manual: true,
        name: manual_name.clone(),
        note: manual_note.clone(),
        created_at_ms: Some(result.created_at_ms),
        kind: "local-data".to_string(),
    };
    save_backup_manual_metadata(
        &path,
        &metadata,
        Some(&workspace_root_for_state(&state)),
        "backup-metadata",
        "manual-local-data-backup",
    )?;
    result.manual = true;
    result.name = manual_name;
    result.note = manual_note;
    Ok(result)
}

#[tauri::command]
fn create_manual_settings_snapshot(
    state: State<'_, AppState>,
    name: Option<String>,
    note: Option<String>,
) -> Result<LocalSnapshotRecord, String> {
    let workspace_root = workspace_root_for_state(&state);
    let snapshot_dir =
        workspace::snapshot_dir_for_target(&workspace_root, &state.settings_path, "settings");
    fs::create_dir_all(&snapshot_dir)
        .map_err(|err| format!("创建设置快照目录失败 {}: {err}", snapshot_dir.display()))?;
    let file_name = state
        .settings_path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("settings.json");
    let created_at_ms = now_ms();
    let snapshot_path = snapshot_dir.join(format!("{}-{}", created_at_ms, file_name));
    fs::copy(&state.settings_path, &snapshot_path).map_err(|err| {
        format!(
            "创建手动设置快照失败 {} -> {}: {err}",
            state.settings_path.display(),
            snapshot_path.display()
        )
    })?;
    let manual_name = normalize_manual_text(name);
    let manual_note = normalize_manual_text(note);
    let metadata = BackupManualMetadata {
        manual: true,
        name: manual_name.clone(),
        note: manual_note.clone(),
        created_at_ms: Some(created_at_ms),
        kind: "settings-snapshot".to_string(),
    };
    save_backup_manual_metadata(
        &snapshot_path,
        &metadata,
        Some(&workspace_root),
        "backup-metadata",
        "manual-settings-snapshot",
    )?;
    let file_metadata = fs::metadata(&snapshot_path)
        .map_err(|err| format!("读取设置快照信息失败 {}: {err}", snapshot_path.display()))?;
    Ok(LocalSnapshotRecord {
        path: snapshot_path.to_string_lossy().to_string(),
        category: "settings".to_string(),
        target_path: state.settings_path.to_string_lossy().to_string(),
        file_name: snapshot_path
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or("snapshot.json")
            .to_string(),
        size_bytes: file_metadata.len(),
        created_at_ms: Some(created_at_ms),
        manual: true,
        name: manual_name,
        note: manual_note,
    })
}

#[tauri::command]
async fn restore_local_data_backup(
    state: State<'_, AppState>,
    path: String,
    confirmed: bool,
) -> Result<Settings, String> {
    if !confirmed {
        return Err("恢复本地数据需要二次确认".to_string());
    }
    cancel_active_sync(&state)?;
    let _guard = state.sync_guard.lock().await;
    restore_local_data_backup_from_path(&state, Path::new(&path))?;
    let restored = load_settings(&state.settings_path, &state.default_download_dir)?;
    {
        let mut current = state
            .settings
            .lock()
            .map_err(|_| "更新内存设置失败".to_string())?;
        *current = restored.clone();
    }
    Ok(restored)
}

#[tauri::command]
fn get_auto_backup_status(state: State<'_, AppState>) -> Result<AutoBackupStatus, String> {
    auto_backup_status_for_state(&state)
}

#[tauri::command]
fn get_local_http_api_status(state: State<'_, AppState>) -> Result<LocalHttpApiStatus, String> {
    local_http_api_status(&state)
}

#[tauri::command]
fn get_app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

#[tauri::command]
async fn check_app_update(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<AppUpdateCheckResult, String> {
    let _guard = state
        .update_guard
        .try_lock()
        .map_err(|_| "已有更新检查正在进行，请稍后再试".to_string())?;
    check_app_update_impl(&app).await
}

#[tauri::command]
async fn download_and_install_update(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let _guard = state
        .update_guard
        .try_lock()
        .map_err(|_| "已有更新任务正在进行，请稍后再试".to_string())?;
    download_and_install_update_impl(&app).await
}

#[tauri::command]
fn restart_app(app: AppHandle) -> Result<(), String> {
    app.request_restart();
    Ok(())
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
    TelegramBridgeRuntimeAdapter::new(&state).start().await
}

#[tauri::command]
fn stop_telegram_bridge(state: State<'_, AppState>) -> Result<TelegramBridgeStatus, String> {
    TelegramBridgeRuntimeAdapter::new(&state).stop()
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
    update_hotkey_registrations(&app, &state, &normalized)?;

    write_settings_audited(&state.settings_path, &normalized)?;

    {
        // 设置开机自启动
        #[cfg(desktop)]
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
        TelegramBridgeRuntimeAdapter::new(&state)
            .restart_after_settings_change("settings update")
            .await;
    }
    if let Err(err) = ensure_local_http_api_state(&app, &state).await {
        eprintln!("Local HTTP API apply settings failed: {err}");
    }

    signal_sync_loop_reset(&state);
    let _ = persist_integration_module_statuses(&state);

    Ok(normalized)
}

#[tauri::command]
async fn restore_settings_snapshot(
    app: AppHandle,
    state: State<'_, AppState>,
    snapshot_path: String,
) -> Result<Settings, String> {
    if snapshot_path.trim().is_empty() {
        return Err("未选择设置快照".to_string());
    }

    let snapshot = PathBuf::from(snapshot_path.trim());
    let workspace_root = workspace_root_for_state(&state);
    let snapshots_root = workspace_root.join("snapshots");
    if !is_within_dir(&snapshot, &snapshots_root) {
        return Err("设置快照路径无效".to_string());
    }
    if !snapshot.is_file() {
        return Err("设置快照不存在".to_string());
    }

    let previous = current_settings(&state)?;
    workspace::restore_snapshot_to_target(
        &snapshot,
        &state.settings_path,
        Some(&workspace_root),
        "settings",
        "restore-settings-snapshot",
    )?;

    let restored = load_settings(&state.settings_path, &state.default_download_dir)?;

    #[cfg(desktop)]
    update_hotkey_registrations(&app, &state, &restored)?;

    #[cfg(desktop)]
    if let Err(err) = set_autostart(&app, restored.auto_start) {
        return Err(format!("恢复设置快照后设置开机自启动失败: {err}"));
    }

    {
        let mut guard = state
            .settings
            .lock()
            .map_err(|_| "写入设置失败".to_string())?;
        *guard = restored.clone();
    }

    if should_restart_telegram_bridge(&previous, &restored) {
        TelegramBridgeRuntimeAdapter::new(&state)
            .restart_after_settings_change("settings snapshot restore")
            .await;
    }
    if let Err(err) = ensure_local_http_api_state(&app, &state).await {
        eprintln!("Local HTTP API apply restored settings failed: {err}");
    }

    signal_sync_loop_reset(&state);
    let _ = persist_integration_module_statuses(&state);
    Ok(restored)
}

#[tauri::command]
fn save_send_hotkey(state: State<'_, AppState>, send_hotkey: String) -> Result<String, String> {
    let mut settings = current_settings(&state)?;
    settings.send_hotkey = send_hotkey;
    let normalized = normalize_settings(settings, &state.default_download_dir)?;
    write_settings_audited(&state.settings_path, &normalized)?;
    let persisted = normalized.send_hotkey.clone();
    let mut guard = state
        .settings
        .lock()
        .map_err(|_| "写入设置失败".to_string())?;
    *guard = normalized;
    Ok(persisted)
}

#[tauri::command]
async fn process_text_with_ai(
    state: State<'_, AppState>,
    request: AiTextProcessRequest,
) -> Result<AiTextProcessResult, String> {
    let settings = current_settings(&state)?;
    process_text_with_ai_impl(&state.http, &settings, request).await
}

#[tauri::command]
async fn process_text_with_ai_stream(
    app: AppHandle,
    state: State<'_, AppState>,
    request_id: String,
    request: AiTextProcessRequest,
) -> Result<(), String> {
    let text = request.text.trim();
    if text.is_empty() {
        return Err("请先输入或选中需要处理的文本".to_string());
    }
    let settings = current_settings(&state)?;
    if !settings.ai.enabled {
        return Err("AI 功能未启用，请先在设置中开启".to_string());
    }
    let mut ai_settings = settings.ai.clone();
    normalize_ai_settings(&mut ai_settings)?;
    let action = resolve_ai_request_action(&ai_settings, &request)?;
    let format = normalize_draft_format(request.format.as_deref());
    emit_ai_stream_event(
        &app,
        AiTextStreamEvent {
            request_id: request_id.clone(),
            event_type: "start".to_string(),
            action_id: Some(action.id.clone()),
            action_name: Some(action.name.clone()),
            output_mode: Some(action.output_mode.clone()),
            delta: None,
            error: None,
        },
    );
    let result = match ai_settings.provider.kind.as_str() {
        "openai_compatible" => {
            stream_openai_compatible_text_action(
                &app,
                &state.http,
                &ai_settings,
                &action,
                &request_id,
                text,
                &format,
            )
            .await
        }
        other => Err(format!("不支持的 AI Provider: {other}")),
    };
    match result {
        Ok(()) => {
            emit_ai_stream_event(
                &app,
                AiTextStreamEvent {
                    request_id,
                    event_type: "done".to_string(),
                    action_id: None,
                    action_name: None,
                    output_mode: None,
                    delta: None,
                    error: None,
                },
            );
            Ok(())
        }
        Err(err) => {
            emit_ai_stream_event(
                &app,
                AiTextStreamEvent {
                    request_id,
                    event_type: "error".to_string(),
                    action_id: None,
                    action_name: None,
                    output_mode: None,
                    delta: None,
                    error: Some(err.clone()),
                },
            );
            Err(err)
        }
    }
}

#[tauri::command]
async fn transcribe_speech(
    state: State<'_, AppState>,
    request: SpeechToTextRequest,
) -> Result<SpeechToTextResult, String> {
    eprintln!(
        "[speech-to-text] command entered audio_bytes={} sample_rate={} channels={} bits={}",
        request.audio_data.len(),
        request.sample_rate.unwrap_or(0),
        request.channels.unwrap_or(0),
        request.bits_per_sample.unwrap_or(0),
    );
    let settings = current_settings(&state)?;
    transcribe_speech_impl(&settings, request).await
}

#[tauri::command]
fn paste_dictation_text(text: String) -> Result<(), String> {
    let value = text.trim().to_string();
    if value.is_empty() {
        eprintln!("[system-dictation] paste skipped: empty text");
        return Ok(());
    }
    eprintln!("[system-dictation] paste command received: text_chars={}", value.chars().count());
    write_system_clipboard(&value)?;
    eprintln!("[system-dictation] clipboard write done");
    dispatch_system_paste_shortcut()
}

fn write_system_clipboard(text: &str) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        write_windows_clipboard(text)
    }
    #[cfg(target_os = "macos")]
    {
        let mut child = std::process::Command::new("pbcopy")
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::piped())
            .spawn()
            .map_err(|err| format!("写入剪贴板失败: {err}"))?;
        if let Some(mut stdin) = child.stdin.take() {
            stdin
                .write_all(text.as_bytes())
                .map_err(|err| format!("写入剪贴板内容失败: {err}"))?;
        }
        let output = child
            .wait_with_output()
            .map_err(|err| format!("等待剪贴板写入失败: {err}"))?;
        if !output.status.success() {
            return Err("写入剪贴板失败".to_string());
        }
        Ok(())
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        let mut child = std::process::Command::new("sh")
            .args(["-c", "command -v wl-copy >/dev/null 2>&1 && wl-copy || xclip -selection clipboard"])
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::piped())
            .spawn()
            .map_err(|err| format!("写入剪贴板失败: {err}"))?;
        if let Some(mut stdin) = child.stdin.take() {
            stdin
                .write_all(text.as_bytes())
                .map_err(|err| format!("写入剪贴板内容失败: {err}"))?;
        }
        let output = child
            .wait_with_output()
            .map_err(|err| format!("等待剪贴板写入失败: {err}"))?;
        if !output.status.success() {
            return Err("写入剪贴板失败，需要 wl-copy 或 xclip".to_string());
        }
        Ok(())
    }
}

#[cfg(target_os = "windows")]
fn write_windows_clipboard(text: &str) -> Result<(), String> {
    use std::ptr::{copy_nonoverlapping, null_mut};
    use windows_sys::Win32::System::DataExchange::{
        CloseClipboard, EmptyClipboard, OpenClipboard, SetClipboardData,
    };
    use windows_sys::Win32::System::Memory::{GlobalAlloc, GlobalLock, GlobalUnlock, GMEM_MOVEABLE};
    use windows_sys::Win32::System::Ole::CF_UNICODETEXT;

    let mut wide: Vec<u16> = text.encode_utf16().collect();
    wide.push(0);
    let byte_len = wide.len() * std::mem::size_of::<u16>();

    unsafe {
        if OpenClipboard(null_mut()) == 0 {
            return Err("打开剪贴板失败".to_string());
        }
        let clipboard_guard = ClipboardCloseGuard;
        if EmptyClipboard() == 0 {
            return Err("清空剪贴板失败".to_string());
        }
        let handle = GlobalAlloc(GMEM_MOVEABLE, byte_len);
        if handle.is_null() {
            return Err("分配剪贴板内存失败".to_string());
        }
        let locked = GlobalLock(handle) as *mut u8;
        if locked.is_null() {
            return Err("锁定剪贴板内存失败".to_string());
        }
        copy_nonoverlapping(wide.as_ptr() as *const u8, locked, byte_len);
        GlobalUnlock(handle);
        if SetClipboardData(CF_UNICODETEXT.into(), handle).is_null() {
            return Err("写入剪贴板失败".to_string());
        }
        std::mem::forget(clipboard_guard);
        let _ = CloseClipboard();
    }
    Ok(())
}

#[cfg(target_os = "windows")]
struct ClipboardCloseGuard;

#[cfg(target_os = "windows")]
impl Drop for ClipboardCloseGuard {
    fn drop(&mut self) {
        unsafe {
            let _ = windows_sys::Win32::System::DataExchange::CloseClipboard();
        }
    }
}

fn dispatch_system_paste_shortcut() -> Result<(), String> {
    std::thread::sleep(Duration::from_millis(90));
    #[cfg(target_os = "windows")]
    {
        dispatch_windows_paste_shortcut()
    }
    #[cfg(target_os = "macos")]
    {
        let output = std::process::Command::new("osascript")
            .args(["-e", "tell application \"System Events\" to keystroke \"v\" using command down"])
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::piped())
            .output()
            .map_err(|err| format!("触发粘贴失败: {err}"))?;
        if !output.status.success() {
            return Err("触发粘贴失败，请检查辅助功能权限".to_string());
        }
        Ok(())
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        let output = std::process::Command::new("xdotool")
            .args(["key", "ctrl+v"])
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::piped())
            .output()
            .map_err(|err| format!("触发粘贴失败，需要 xdotool: {err}"))?;
        if !output.status.success() {
            return Err("触发粘贴失败，需要 xdotool".to_string());
        }
        Ok(())
    }
}

#[cfg(target_os = "windows")]
fn dispatch_windows_paste_shortcut() -> Result<(), String> {
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::{
        SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT, KEYEVENTF_KEYUP, VIRTUAL_KEY,
        VK_CONTROL, VK_V,
    };

    if !windows_has_text_input_focus() {
        eprintln!("[system-dictation] paste shortcut skipped: no text input focus");
        return Ok(());
    }
    eprintln!("[system-dictation] paste shortcut dispatching: ctrl+v");

    fn keyboard_input(vk: VIRTUAL_KEY, flags: u32) -> INPUT {
        INPUT {
            r#type: INPUT_KEYBOARD,
            Anonymous: INPUT_0 {
                ki: KEYBDINPUT {
                    wVk: vk,
                    wScan: 0,
                    dwFlags: flags,
                    time: 0,
                    dwExtraInfo: 0,
                },
            },
        }
    }

    let inputs = [
        keyboard_input(VK_CONTROL, 0),
        keyboard_input(VK_V, 0),
        keyboard_input(VK_V, KEYEVENTF_KEYUP),
        keyboard_input(VK_CONTROL, KEYEVENTF_KEYUP),
    ];
    let sent = unsafe {
        SendInput(
            inputs.len() as u32,
            inputs.as_ptr(),
            std::mem::size_of::<INPUT>() as i32,
        )
    };
    if sent != inputs.len() as u32 {
        return Err("触发粘贴失败".to_string());
    }
    eprintln!("[system-dictation] paste shortcut dispatched: inputs={sent}");
    Ok(())
}

#[cfg(target_os = "windows")]
fn windows_has_text_input_focus() -> bool {
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        GetForegroundWindow, GetGUIThreadInfo, GetWindowThreadProcessId, GUITHREADINFO,
    };

    unsafe {
        let foreground = GetForegroundWindow();
        if foreground.is_null() {
            eprintln!("[system-dictation] input focus check: no foreground window");
            return false;
        }
        let thread_id = GetWindowThreadProcessId(foreground, std::ptr::null_mut());
        if thread_id == 0 {
            eprintln!("[system-dictation] input focus check: no foreground thread");
            return false;
        }
        let mut info = GUITHREADINFO::default();
        info.cbSize = std::mem::size_of::<GUITHREADINFO>() as u32;
        if GetGUIThreadInfo(thread_id, &mut info) == 0 {
            eprintln!("[system-dictation] input focus check: GetGUIThreadInfo failed");
            return false;
        }
        let has_focus = !info.hwndFocus.is_null() || !info.hwndCaret.is_null();
        eprintln!(
            "[system-dictation] input focus check: has_focus={} has_caret={}",
            !info.hwndFocus.is_null(),
            !info.hwndCaret.is_null()
        );
        has_focus
    }
}

#[tauri::command]
fn show_system_dictation_window(app: AppHandle) -> Result<(), String> {
    eprintln!("[system-dictation] show window command received");
    let app_for_task = app.clone();
    app.run_on_main_thread(move || {
        if let Err(err) = show_system_dictation_window_impl(&app_for_task) {
            eprintln!("[system-dictation] show window failed: {err}");
        }
    })
    .map_err(|err| format!("调度系统听写窗口显示失败: {err}"))
}

#[tauri::command]
fn hide_system_dictation_window(app: AppHandle) -> Result<(), String> {
    eprintln!("[system-dictation] hide window command received");
    let app_for_task = app.clone();
    app.run_on_main_thread(move || {
        hide_system_dictation_window_impl(&app_for_task);
    })
    .map_err(|err| format!("调度系统听写窗口隐藏失败: {err}"))
}

#[tauri::command]
fn set_system_dictation_level(app: AppHandle, level: f64) {
    let normalized = level.clamp(0.0, 1.0);
    let app_for_task = app.clone();
    let _ = app.run_on_main_thread(move || {
        emit_system_dictation_overlay_level(&app_for_task, normalized);
    });
}

#[tauri::command]
fn system_dictation_action(app: AppHandle, action: String) -> Result<(), String> {
    let normalized = action.trim().to_lowercase();
    match normalized.as_str() {
        "confirm" => {
            let _ = app.emit("system-dictation-confirm", ());
            Ok(())
        }
        "cancel" => {
            let _ = app.emit("system-dictation-cancel", ());
            Ok(())
        }
        _ => Err("无效的系统听写操作".to_string()),
    }
}

fn system_dictation_window_url() -> WebviewUrl {
    WebviewUrl::App("system-dictation.html".into())
}

fn ensure_system_dictation_window_impl(app: &AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(SYSTEM_DICTATION_WINDOW_LABEL) {
        eprintln!("[system-dictation] ensure window existing");
        let _ = window.set_focusable(false);
        let _ = window.set_always_on_top(true);
        let _ = window.set_skip_taskbar(true);
        return Ok(());
    }

    eprintln!("[system-dictation] ensure window building");
    let window = WebviewWindowBuilder::new(
        app,
        SYSTEM_DICTATION_WINDOW_LABEL,
        system_dictation_window_url(),
    )
    .title("Transfer Genie")
    .inner_size(
        SYSTEM_DICTATION_WINDOW_WIDTH,
        SYSTEM_DICTATION_WINDOW_HEIGHT,
    )
    .resizable(false)
    .decorations(false)
    .shadow(false)
    .transparent(true)
    .skip_taskbar(true)
    .always_on_top(true)
    .focusable(false)
    .visible(false)
    .build()
    .map_err(|err| format!("创建系统听写窗口失败: {err}"))?;

    let _ = window.set_focusable(false);
    let _ = window.set_shadow(false);
    let _ = window.set_always_on_top(true);
    let _ = window.set_skip_taskbar(true);
    eprintln!("[system-dictation] ensure window built");
    Ok(())
}

fn show_system_dictation_window_impl(app: &AppHandle) -> Result<(), String> {
    eprintln!("[system-dictation] show window start");
    ensure_system_dictation_window_impl(app)?;
    if let Some(window) = app.get_webview_window(SYSTEM_DICTATION_WINDOW_LABEL) {
        position_system_dictation_window(app, &window);
        let _ = window.show();
        let _ = window.emit("system-dictation-show", ());
        let _ = window.set_focusable(false);
        let _ = window.set_shadow(false);
        let _ = window.set_always_on_top(true);
        let _ = window.set_skip_taskbar(true);
    }
    eprintln!("[system-dictation] show window done");
    Ok(())
}

fn position_system_dictation_window(app: &AppHandle, window: &tauri::WebviewWindow) {
    let monitor = window
        .current_monitor()
        .ok()
        .flatten()
        .or_else(|| app.primary_monitor().ok().flatten());
    let Some(monitor) = monitor else {
        eprintln!("[system-dictation] position skipped: no monitor");
        return;
    };
    let monitor_position = monitor.position();
    let monitor_size = monitor.size();
    let scale_factor = monitor.scale_factor();
    let window_width = (SYSTEM_DICTATION_WINDOW_WIDTH * scale_factor).round() as i32;
    let window_height = (SYSTEM_DICTATION_WINDOW_HEIGHT * scale_factor).round() as i32;
    let x = monitor_position.x + ((monitor_size.width as i32 - window_width) / 2);
    let y = monitor_position.y
        + monitor_size.height as i32
        - window_height
        - SYSTEM_DICTATION_WINDOW_BOTTOM_MARGIN;
    let _ = window.set_position(PhysicalPosition::new(x.max(monitor_position.x), y));
    eprintln!("[system-dictation] positioned window x={x} y={y}");
}

fn hide_system_dictation_window_impl(app: &AppHandle) {
    eprintln!("[system-dictation] hide window start");
    if let Some(window) = app.get_webview_window(SYSTEM_DICTATION_WINDOW_LABEL) {
        let _ = window.emit("system-dictation-hide", ());
        let app_for_hide = app.clone();
        std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(180));
            let app_for_lookup = app_for_hide.clone();
            let _ = app_for_hide.run_on_main_thread(move || {
                if let Some(window) = app_for_lookup.get_webview_window(SYSTEM_DICTATION_WINDOW_LABEL) {
                    let _ = window.hide();
                }
            });
        });
    }
    eprintln!("[system-dictation] hide window done");
}

fn emit_system_dictation_overlay_level(app: &AppHandle, level: f64) {
    if let Some(window) = app.get_webview_window(SYSTEM_DICTATION_WINDOW_LABEL) {
        let normalized = level.clamp(0.0, 1.0);
        let _ = window.emit("system-dictation-level", normalized);
        let _ = window.eval(format!(
            "window.__transferGenieSetDictationLevel?.({normalized});"
        ));
    }
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
        save_filename_rule: settings.save_filename_rule.clone(),
        global_hotkey_enabled: settings.global_hotkey_enabled,
        global_hotkey: Some(settings.global_hotkey.clone()),
        send_hotkey: Some(settings.send_hotkey.clone()),
        auto_update_enabled: settings.auto_update_enabled,
        local_http_api: settings.local_http_api.clone(),
        send: settings.send.clone(),
        telegram: ExportTelegramSettings {
            enabled: settings.telegram.enabled,
            auto_start: settings.telegram.auto_start,
            sender_name: settings.telegram.sender_name.clone(),
            proxy_enabled: settings.telegram.proxy_enabled,
            proxy_url: settings.telegram.proxy_url.clone(),
            poll_interval_secs: settings.telegram.poll_interval_secs,
        },
        ai: settings.ai.clone(),
        speech_to_text: settings.speech_to_text.clone(),
    };
    for endpoint in export_settings.webdav_endpoints.iter_mut() {
        endpoint.username.clear();
        endpoint.password.clear();
    }
    export_settings.ai.provider.api_key.clear();
    export_settings.speech_to_text.api_key.clear();

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
async fn import_settings(
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
        save_filename_rule: bundle.settings.save_filename_rule,
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
        auto_update_enabled: bundle.settings.auto_update_enabled,
        local_http_api: bundle.settings.local_http_api,
        send: bundle.settings.send,
        backup: existing.backup.clone(),
        ai: bundle.settings.ai,
        speech_to_text: bundle.settings.speech_to_text,
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
    update_hotkey_registrations(&app, &state, &normalized)?;

    write_settings_audited(&state.settings_path, &normalized)?;
    {
        let mut guard = state
            .settings
            .lock()
            .map_err(|_| "写入设置失败".to_string())?;
        *guard = normalized.clone();
    }
    if let Err(err) = ensure_local_http_api_state(&app, &state).await {
        eprintln!("Local HTTP API apply imported settings failed: {err}");
    }
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

#[derive(Serialize)]
struct DownloadHistoryResult {
    records: Vec<DownloadHistoryRecord>,
    total: i64,
    has_more: bool,
}

#[derive(Serialize)]
struct UploadHistoryResult {
    records: Vec<UploadHistoryRecord>,
    total: i64,
    has_more: bool,
}

#[derive(Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ListMessagesWindowInput {
    #[serde(default)]
    limit: Option<i64>,
    #[serde(default)]
    before_timestamp_ms: Option<i64>,
    #[serde(default)]
    before_filename: Option<String>,
    #[serde(default)]
    after_timestamp_ms: Option<i64>,
    #[serde(default)]
    after_filename: Option<String>,
    #[serde(default)]
    only_marked: Option<bool>,
}

#[derive(Serialize)]
struct MessagesWindowResult {
    messages: Vec<Message>,
    total: i64,
    #[serde(rename = "hasMoreBefore")]
    has_more_before: bool,
    marked_count: i64,
}

fn generate_marked_tag_id() -> String {
    format!("tag-{}-{}", now_ms(), OsRng.gen::<u32>())
}

fn normalize_marked_tag_name(name: &str) -> Result<String, String> {
    let normalized = name.trim();
    if normalized.is_empty() {
        return Err("标签名不能为空".to_string());
    }
    Ok(normalized.to_string())
}

fn ensure_unique_marked_tag_name(
    tags: &[MarkedTag],
    name: &str,
    excluding_id: Option<&str>,
) -> Result<(), String> {
    let target = name.trim().to_lowercase();
    let duplicated = tags.iter().any(|tag| {
        if excluding_id.is_some() && excluding_id == Some(tag.id.as_str()) {
            return false;
        }
        tag.name.trim().to_lowercase() == target
    });
    if duplicated {
        return Err("标签名已存在".to_string());
    }
    Ok(())
}

fn sanitize_marked_tag_ids(tags: &[MarkedTag], tag_ids: Vec<String>) -> Vec<String> {
    let mut valid_tag_ids: Vec<String> = tag_ids
        .into_iter()
        .filter(|tag_id| tags.iter().any(|tag| tag.id == *tag_id))
        .collect();
    valid_tag_ids.sort();
    valid_tag_ids.dedup();
    valid_tag_ids
}

fn sanitize_existing_marked_tag_ids(tags: &[MarkedTag], tag_ids: Vec<String>) -> Vec<String> {
    sanitize_marked_tag_ids(tags, tag_ids)
}

fn sanitize_deleted_marked_tag_ids(tags: &[MarkedTag], tag_ids: Vec<String>) -> Vec<String> {
    sanitize_marked_tag_ids(tags, tag_ids)
}

fn normalize_marked_due_date(value: Option<String>) -> Result<Option<String>, String> {
    let Some(value) = value else {
        return Ok(None);
    };
    let value = value.trim().to_string();
    if value.is_empty() {
        return Ok(None);
    }
    if is_valid_marked_due_date(&value) {
        Ok(Some(value))
    } else {
        Err("处理日期格式必须为 YYYY-MM-DD".to_string())
    }
}

fn is_valid_marked_due_date(value: &str) -> bool {
    let bytes = value.as_bytes();
    bytes.len() == 10
        && bytes[4] == b'-'
        && bytes[7] == b'-'
        && bytes
            .iter()
            .enumerate()
            .all(|(index, byte)| index == 4 || index == 7 || byte.is_ascii_digit())
}

fn today_due_date_string() -> String {
    let date = OffsetDateTime::now_local()
        .unwrap_or_else(|_| OffsetDateTime::now_utc())
        .date();
    format!(
        "{:04}-{:02}-{:02}",
        date.year(),
        u8::from(date.month()),
        date.day()
    )
}

fn count_unfinished_marked_messages(state: &AppState, endpoint_id: &str) -> Result<i64, String> {
    let today = today_due_date_string();
    db::count_unfinished_marked_messages(&state.db_path, endpoint_id, &today)
        .map_err(|err| err.to_string())
}

async fn load_and_apply_send_marked_options(
    state: &AppState,
    endpoint: &WebDavEndpoint,
    options: SendMarkedOptionsInput,
) -> Result<AppliedSendMarkedOptions, String> {
    let mut tags =
        db::list_marked_tags(&state.db_path, &endpoint.id).map_err(|err| err.to_string())?;
    let deleted_tag_ids = sanitize_deleted_marked_tag_ids(&tags, options.deleted_tag_ids);
    let deleted_set: HashSet<&str> = deleted_tag_ids.iter().map(String::as_str).collect();
    let mut cleanup_targets = Vec::new();
    let tags_changed = !deleted_set.is_empty() || !options.created_tags.is_empty();
    if !deleted_set.is_empty() {
        tags.retain(|tag| !deleted_set.contains(tag.id.as_str()));
        let marked_messages = db::list_marked_messages(&state.db_path, &endpoint.id, None, None)
            .map_err(|err| err.to_string())?;
        for message in marked_messages {
            if !message
                .marked_tag_ids
                .iter()
                .any(|tag_id| deleted_set.contains(tag_id.as_str()))
            {
                continue;
            }
            let mut db_message = db::get_message(&state.db_path, &endpoint.id, &message.filename)
                .map_err(|err| err.to_string())?
                .ok_or_else(|| "未找到消息".to_string())?;
            db_message
                .marked_tag_ids
                .retain(|tag_id| !deleted_set.contains(tag_id.as_str()));
            db::upsert_message(&state.db_path, &db_message).map_err(|err| err.to_string())?;
            cleanup_targets.push((db_message.filename.clone(), db_message.timestamp_ms));
        }
    }

    let mut selected_created_tag_ids = Vec::new();
    for created_tag in options.created_tags {
        let normalized = normalize_marked_tag_name(&created_tag.name)?;
        ensure_unique_marked_tag_name(&tags, &normalized, None)?;
        let tag = MarkedTag {
            id: generate_marked_tag_id(),
            name: normalized,
        };
        if created_tag.selected {
            selected_created_tag_ids.push(tag.id.clone());
        }
        tags.push(tag);
    }
    tags.sort_by(|left, right| left.name.cmp(&right.name));

    let mut final_tag_ids = sanitize_existing_marked_tag_ids(&tags, options.selected_tag_ids);
    final_tag_ids.extend(selected_created_tag_ids);
    final_tag_ids.sort();
    final_tag_ids.dedup();
    if !options.marked {
        final_tag_ids.clear();
    }
    let due_date = if options.marked {
        normalize_marked_due_date(options.due_date)?
    } else {
        None
    };

    Ok(AppliedSendMarkedOptions {
        marked: options.marked,
        tag_ids: final_tag_ids,
        due_date,
        tags,
        tags_changed,
        cleanup_targets,
    })
}

async fn persist_sent_message_with_marked_options(
    state: &AppState,
    endpoint: &WebDavEndpoint,
    message: &mut DbMessage,
    marked_options: Option<SendMarkedOptionsInput>,
) -> Result<SendMessageResult, String> {
    let _guard = state.sync_guard.lock().await;
    let applied_options =
        load_and_apply_send_marked_options(state, endpoint, marked_options.unwrap_or_default())
            .await?;

    message.marked = applied_options.marked;
    message.marked_tag_ids = applied_options.tag_ids.clone();
    message.marked_pinned = false;
    message.marked_due_date = applied_options.due_date.clone();

    db::upsert_message(&state.db_path, message).map_err(|err| err.to_string())?;
    let history_result = crate::history::upsert_history_entries(
        &state.http,
        endpoint,
        vec![message_to_history(message)],
    )
    .await?;
    invalidate_history_cache_for_paths(state, &endpoint.id, &history_result.touched_paths)?;
    if applied_options.tags_changed {
        crate::history::save_marked_tags(&state.http, endpoint, &applied_options.tags).await?;
        invalidate_history_cache_for_paths(
            state,
            &endpoint.id,
            &[crate::history::HISTORY_TAGS_PATH.to_string()],
        )?;
        db::replace_marked_tags(&state.db_path, &endpoint.id, &applied_options.tags)
            .map_err(|err| err.to_string())?;
    }
    if !applied_options.cleanup_targets.is_empty() {
        let history_result = crate::history::mutate_history_entries_by_targets(
            &state.http,
            endpoint,
            &applied_options.cleanup_targets,
            |entry| {
                let before_len = entry.marked_tag_ids.len();
                entry
                    .marked_tag_ids
                    .retain(|tag_id| applied_options.tags.iter().any(|tag| tag.id == *tag_id));
                before_len != entry.marked_tag_ids.len()
            },
        )
        .await?;
        invalidate_history_cache_for_paths(state, &endpoint.id, &history_result.touched_paths)?;
    }

    Ok(SendMessageResult {
        marked_tag_ids: applied_options.tag_ids,
        filename: message.filename.clone(),
        original_name: message.original_name.clone(),
        endpoint_id: endpoint.id.clone(),
    })
}

#[cfg(test)]
fn apply_marked_tag_ids_to_entries(
    history_entries: &mut [HistoryEntry],
    filenames: &[String],
    tag_ids: &[String],
) -> usize {
    if filenames.is_empty() {
        return 0;
    }

    let filename_set: HashSet<&str> = filenames.iter().map(String::as_str).collect();
    let mut changed = 0;

    for entry in history_entries.iter_mut() {
        if !entry.marked || !filename_set.contains(entry.filename.as_str()) {
            continue;
        }
        if entry.marked_tag_ids == tag_ids {
            continue;
        }
        entry.marked_tag_ids = tag_ids.to_vec();
        changed += 1;
    }

    changed
}

fn apply_marked_state(
    marked_flag: &mut bool,
    marked_tag_ids: &mut Vec<String>,
    marked_pinned: &mut bool,
    marked_due_date: &mut Option<String>,
    marked: bool,
    tag_ids: &[String],
    due_date: Option<String>,
) {
    *marked_flag = marked;
    if marked {
        *marked_tag_ids = tag_ids.to_vec();
        *marked_due_date = due_date;
    } else {
        marked_tag_ids.clear();
        *marked_pinned = false;
        *marked_due_date = None;
    }
}

#[tauri::command]
async fn mark_message(
    state: State<'_, AppState>,
    filename: String,
    tag_ids: Option<Vec<String>>,
    due_date: Option<String>,
) -> Result<(), String> {
    set_message_marked(
        &state,
        filename,
        true,
        tag_ids.unwrap_or_default(),
        due_date,
    )
    .await
}

#[tauri::command]
async fn unmark_message(state: State<'_, AppState>, filename: String) -> Result<(), String> {
    set_message_marked(&state, filename, false, Vec::new(), None).await
}

async fn set_message_marked(
    state: &AppState,
    filename: String,
    marked: bool,
    tag_ids: Vec<String>,
    due_date: Option<String>,
) -> Result<(), String> {
    let settings = current_settings(state)?;
    let endpoint = resolve_active_endpoint(&settings)?;
    let _guard = state.sync_guard.lock().await;
    let tags = db::list_marked_tags(&state.db_path, &endpoint.id).map_err(|err| err.to_string())?;
    let valid_tag_ids = sanitize_marked_tag_ids(&tags, tag_ids);
    let valid_due_date = if marked {
        normalize_marked_due_date(due_date)?
    } else {
        None
    };

    let mut changed = false;
    let existing =
        db::get_message(&state.db_path, &endpoint.id, &filename).map_err(|err| err.to_string())?;
    let mut local_message = existing.ok_or_else(|| "未找到消息".to_string())?;

    if local_message.marked != marked
        || local_message.marked_tag_ids != valid_tag_ids
        || local_message.marked_pinned
            != (if marked {
                local_message.marked_pinned
            } else {
                false
            })
        || local_message.marked_due_date != valid_due_date
    {
        apply_marked_state(
            &mut local_message.marked,
            &mut local_message.marked_tag_ids,
            &mut local_message.marked_pinned,
            &mut local_message.marked_due_date,
            marked,
            &valid_tag_ids,
            valid_due_date,
        );
        db::upsert_message(&state.db_path, &local_message).map_err(|err| err.to_string())?;
        changed = true;
    }

    if changed {
        let pending = PendingMarkedSync {
            endpoint_id: local_message.endpoint_id.clone(),
            filename: local_message.filename.clone(),
            timestamp_ms: local_message.timestamp_ms,
            marked: local_message.marked,
            marked_tag_ids: local_message.marked_tag_ids.clone(),
            marked_pinned: local_message.marked_pinned,
            marked_due_date: local_message.marked_due_date.clone(),
            updated_at_ms: now_ms(),
        };
        db::upsert_pending_marked_sync(&state.db_path, &pending).map_err(|err| err.to_string())?;
        schedule_marked_history_sync(state, endpoint, pending);
    }

    Ok(())
}

fn schedule_marked_history_sync(
    state: &AppState,
    endpoint: WebDavEndpoint,
    pending: PendingMarkedSync,
) {
    let http = state.http.clone();
    let db_path = state.db_path.clone();
    let cache_dir = history_cache_dir(state, &endpoint.id);
    let sync_guard = Arc::clone(&state.sync_guard);
    tauri::async_runtime::spawn(async move {
        let _guard = sync_guard.lock().await;
        if let Err(err) =
            flush_marked_history_entries(&http, &endpoint, &db_path, &cache_dir, &[pending.clone()])
                .await
        {
            log::warn!(
                "后台同步标记状态失败 endpoint={} filename={}: {}",
                pending.endpoint_id,
                pending.filename,
                err
            );
        }
    });
}

async fn flush_marked_history_entries(
    http: &Client,
    endpoint: &WebDavEndpoint,
    db_path: &Path,
    cache_dir: &Path,
    pending_entries: &[PendingMarkedSync],
) -> Result<(), String> {
    if pending_entries.is_empty() {
        return Ok(());
    }
    let targets: Vec<crate::history::HistoryEntryTarget> = pending_entries
        .iter()
        .map(|pending| (pending.filename.clone(), pending.timestamp_ms))
        .collect();
    let by_filename: HashMap<String, PendingMarkedSync> = pending_entries
        .iter()
        .cloned()
        .map(|pending| (pending.filename.clone(), pending))
        .collect();

    let history_result =
        crate::history::mutate_history_entries_by_targets(http, endpoint, &targets, |entry| {
            let Some(pending) = by_filename.get(&entry.filename) else {
                return false;
            };
            let before = (
                entry.marked,
                entry.marked_tag_ids.clone(),
                entry.marked_pinned,
                entry.marked_due_date.clone(),
            );
            entry.marked = pending.marked;
            entry.marked_tag_ids = pending.marked_tag_ids.clone();
            entry.marked_tag_ids.sort();
            entry.marked_pinned = pending.marked_pinned;
            entry.marked_due_date = pending.marked_due_date.clone();
            before
                != (
                    entry.marked,
                    entry.marked_tag_ids.clone(),
                    entry.marked_pinned,
                    entry.marked_due_date.clone(),
                )
        })
        .await?;
    crate::history::invalidate_history_cache_paths(cache_dir, &history_result.touched_paths)?;
    let cleared: Vec<(String, i64, i64)> = pending_entries
        .iter()
        .map(|pending| {
            (
                pending.filename.clone(),
                pending.timestamp_ms,
                pending.updated_at_ms,
            )
        })
        .collect();
    db::clear_pending_marked_sync_exact(db_path, &endpoint.id, &cleared)
        .map_err(|err| err.to_string())
}

fn apply_pending_marked_sync_to_message(message: &mut DbMessage, pending: &PendingMarkedSync) {
    message.marked = pending.marked;
    message.marked_tag_ids = pending.marked_tag_ids.clone();
    message.marked_pinned = pending.marked_pinned;
    message.marked_due_date = pending.marked_due_date.clone();
}

fn apply_pending_marked_sync_to_history(history: &mut HistoryEntry, pending: &PendingMarkedSync) {
    history.marked = pending.marked;
    history.marked_tag_ids = pending.marked_tag_ids.clone();
    history.marked_tag_ids.sort();
    history.marked_pinned = pending.marked_pinned;
    history.marked_due_date = pending.marked_due_date.clone();
}

fn pending_marked_sync_map(pending: &[PendingMarkedSync]) -> HashMap<String, PendingMarkedSync> {
    pending
        .iter()
        .cloned()
        .map(|entry| (entry.filename.clone(), entry))
        .collect()
}

#[tauri::command]
async fn set_marked_messages_tags(
    state: State<'_, AppState>,
    filenames: Vec<String>,
    tag_ids: Vec<String>,
) -> Result<usize, String> {
    let settings = current_settings(&state)?;
    let endpoint = resolve_active_endpoint(&settings)?;
    let _guard = state.sync_guard.lock().await;

    let mut unique_filenames: Vec<String> = filenames
        .into_iter()
        .map(|filename| filename.trim().to_string())
        .filter(|filename| !filename.is_empty())
        .collect();
    unique_filenames.sort();
    unique_filenames.dedup();
    if unique_filenames.is_empty() {
        return Ok(0);
    }

    let tags = db::list_marked_tags(&state.db_path, &endpoint.id).map_err(|err| err.to_string())?;
    let valid_tag_ids = sanitize_marked_tag_ids(&tags, tag_ids);
    let mut pending_entries = Vec::new();
    for filename in &unique_filenames {
        if let Some(mut message) = db::get_message(&state.db_path, &endpoint.id, filename)
            .map_err(|err| err.to_string())?
        {
            if !message.marked || message.marked_tag_ids == valid_tag_ids {
                continue;
            }
            message.marked_tag_ids = valid_tag_ids.clone();
            db::upsert_message(&state.db_path, &message).map_err(|err| err.to_string())?;
            let pending = PendingMarkedSync {
                endpoint_id: message.endpoint_id.clone(),
                filename: message.filename.clone(),
                timestamp_ms: message.timestamp_ms,
                marked: message.marked,
                marked_tag_ids: message.marked_tag_ids.clone(),
                marked_pinned: message.marked_pinned,
                marked_due_date: message.marked_due_date.clone(),
                updated_at_ms: now_ms(),
            };
            db::upsert_pending_marked_sync(&state.db_path, &pending)
                .map_err(|err| err.to_string())?;
            pending_entries.push(pending);
        }
    }

    if pending_entries.is_empty() {
        return Ok(0);
    }
    for pending in pending_entries.iter().cloned() {
        schedule_marked_history_sync(state.inner(), endpoint.clone(), pending);
    }
    Ok(pending_entries.len())
}

#[tauri::command]
fn list_marked_tags(state: State<'_, AppState>) -> Result<Vec<MarkedTag>, String> {
    let settings = current_settings(&state)?;
    let endpoint = resolve_active_endpoint(&settings)?;
    db::list_marked_tags(&state.db_path, &endpoint.id).map_err(|err| err.to_string())
}

#[tauri::command]
async fn create_marked_tag(state: State<'_, AppState>, name: String) -> Result<MarkedTag, String> {
    let settings = current_settings(&state)?;
    let endpoint = resolve_active_endpoint(&settings)?;
    let _guard = state.sync_guard.lock().await;
    let mut tags =
        db::list_marked_tags(&state.db_path, &endpoint.id).map_err(|err| err.to_string())?;
    let normalized = normalize_marked_tag_name(&name)?;
    ensure_unique_marked_tag_name(&tags, &normalized, None)?;
    let tag = MarkedTag {
        id: generate_marked_tag_id(),
        name: normalized,
    };
    tags.push(tag.clone());
    tags.sort_by(|left, right| left.name.cmp(&right.name));
    crate::history::save_marked_tags(&state.http, &endpoint, &tags).await?;
    invalidate_history_cache_for_paths(
        state.inner(),
        &endpoint.id,
        &[crate::history::HISTORY_TAGS_PATH.to_string()],
    )?;
    db::replace_marked_tags(&state.db_path, &endpoint.id, &tags).map_err(|err| err.to_string())?;
    Ok(tag)
}

#[tauri::command]
async fn delete_marked_tag(state: State<'_, AppState>, tag_id: String) -> Result<(), String> {
    let settings = current_settings(&state)?;
    let endpoint = resolve_active_endpoint(&settings)?;
    let _guard = state.sync_guard.lock().await;
    let mut tags =
        db::list_marked_tags(&state.db_path, &endpoint.id).map_err(|err| err.to_string())?;
    let before = tags.len();
    tags.retain(|tag| tag.id != tag_id);
    if before == tags.len() {
        return Err("未找到标签".to_string());
    }
    let mut targets = Vec::new();
    let marked_messages =
        db::list_marked_messages(&state.db_path, &endpoint.id, Some(&tag_id), None)
            .map_err(|err| err.to_string())?;
    for message in marked_messages {
        if let Some(mut db_message) =
            db::get_message(&state.db_path, &endpoint.id, &message.filename)
                .map_err(|err| err.to_string())?
        {
            db_message
                .marked_tag_ids
                .retain(|entry_tag_id| entry_tag_id != &tag_id);
            db::upsert_message(&state.db_path, &db_message).map_err(|err| err.to_string())?;
            targets.push((db_message.filename.clone(), db_message.timestamp_ms));
        }
    }
    crate::history::save_marked_tags(&state.http, &endpoint, &tags).await?;
    invalidate_history_cache_for_paths(
        state.inner(),
        &endpoint.id,
        &[crate::history::HISTORY_TAGS_PATH.to_string()],
    )?;
    db::replace_marked_tags(&state.db_path, &endpoint.id, &tags).map_err(|err| err.to_string())?;
    if !targets.is_empty() {
        let history_result = crate::history::mutate_history_entries_by_targets(
            &state.http,
            &endpoint,
            &targets,
            |entry| {
                let before_len = entry.marked_tag_ids.len();
                entry
                    .marked_tag_ids
                    .retain(|entry_tag_id| entry_tag_id != &tag_id);
                before_len != entry.marked_tag_ids.len()
            },
        )
        .await?;
        invalidate_history_cache_for_paths(
            state.inner(),
            &endpoint.id,
            &history_result.touched_paths,
        )?;
    }
    Ok(())
}

#[tauri::command]
async fn rename_marked_tag(
    state: State<'_, AppState>,
    tag_id: String,
    name: String,
) -> Result<(), String> {
    let settings = current_settings(&state)?;
    let endpoint = resolve_active_endpoint(&settings)?;
    let _guard = state.sync_guard.lock().await;
    let mut tags =
        db::list_marked_tags(&state.db_path, &endpoint.id).map_err(|err| err.to_string())?;
    let normalized = normalize_marked_tag_name(&name)?;
    ensure_unique_marked_tag_name(&tags, &normalized, Some(&tag_id))?;
    let mut found = false;
    for tag in tags.iter_mut() {
        if tag.id == tag_id {
            tag.name = normalized.clone();
            found = true;
            break;
        }
    }
    if !found {
        return Err("未找到标签".to_string());
    }
    tags.sort_by(|left, right| left.name.cmp(&right.name));
    crate::history::save_marked_tags(&state.http, &endpoint, &tags).await?;
    invalidate_history_cache_for_paths(
        state.inner(),
        &endpoint.id,
        &[crate::history::HISTORY_TAGS_PATH.to_string()],
    )?;
    db::replace_marked_tags(&state.db_path, &endpoint.id, &tags).map_err(|err| err.to_string())?;
    Ok(())
}

#[tauri::command]
async fn toggle_marked_message_pin(
    state: State<'_, AppState>,
    filename: String,
) -> Result<bool, String> {
    let settings = current_settings(&state)?;
    let endpoint = resolve_active_endpoint(&settings)?;
    let _guard = state.sync_guard.lock().await;
    let mut message = db::get_message(&state.db_path, &endpoint.id, &filename)
        .map_err(|err| err.to_string())?
        .ok_or_else(|| "未找到消息".to_string())?;
    if !message.marked {
        return Err("未标记消息不能置顶".to_string());
    }
    message.marked_pinned = !message.marked_pinned;
    let pinned = message.marked_pinned;
    db::upsert_message(&state.db_path, &message).map_err(|err| err.to_string())?;
    let pending = PendingMarkedSync {
        endpoint_id: message.endpoint_id.clone(),
        filename: message.filename.clone(),
        timestamp_ms: message.timestamp_ms,
        marked: message.marked,
        marked_tag_ids: message.marked_tag_ids.clone(),
        marked_pinned: message.marked_pinned,
        marked_due_date: message.marked_due_date.clone(),
        updated_at_ms: now_ms(),
    };
    db::upsert_pending_marked_sync(&state.db_path, &pending).map_err(|err| err.to_string())?;
    schedule_marked_history_sync(state.inner(), endpoint, pending);
    Ok(pinned)
}

#[tauri::command]
fn list_marked_messages(
    state: State<'_, AppState>,
    tag_id: Option<String>,
    search_query: Option<String>,
    limit: Option<i64>,
    offset: Option<i64>,
    pending_only: Option<bool>,
) -> Result<MessagesResult, String> {
    let settings = current_settings(&state)?;
    let endpoint = resolve_active_endpoint(&settings)?;
    let marked_count = count_unfinished_marked_messages(&state, &endpoint.id)?;
    let today = today_due_date_string();
    let pending_due_date = pending_only.unwrap_or(false).then_some(today.as_str());
    let total = db::count_marked_messages(
        &state.db_path,
        &endpoint.id,
        tag_id.as_deref(),
        search_query.as_deref(),
        pending_due_date,
    )
    .map_err(|err| err.to_string())?;
    let messages = db::list_marked_messages_paged(
        &state.db_path,
        &endpoint.id,
        tag_id.as_deref(),
        search_query.as_deref(),
        limit,
        offset,
        pending_due_date,
    )
    .map_err(|err| err.to_string())?;
    let current_offset = offset.unwrap_or(0).max(0);
    let current_limit = limit.unwrap_or(total).max(0);
    Ok(MessagesResult {
        messages,
        total,
        has_more: current_offset + current_limit < total,
        marked_count,
    })
}

#[tauri::command]
fn list_messages(
    state: State<'_, AppState>,
    limit: Option<i64>,
    offset: Option<i64>,
    only_marked: Option<bool>,
    search_query: Option<String>,
) -> Result<MessagesResult, String> {
    let settings = current_settings(&state)?;
    let endpoint = resolve_active_endpoint(&settings)?;

    let marked_filter = only_marked.unwrap_or(false);
    let total = db::count_messages(&state.db_path, &endpoint.id, marked_filter)
        .map_err(|err| err.to_string())?;

    let marked_count = count_unfinished_marked_messages(&state, &endpoint.id)?;

    let messages = db::list_messages_paged(
        &state.db_path,
        &endpoint.id,
        limit,
        offset,
        marked_filter,
        search_query.as_deref(),
    )
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
fn list_messages_window(
    state: State<'_, AppState>,
    input: Option<ListMessagesWindowInput>,
) -> Result<MessagesWindowResult, String> {
    let settings = current_settings(&state)?;
    let endpoint = resolve_active_endpoint(&settings)?;
    let input = input.unwrap_or_default();
    let marked_filter = input.only_marked.unwrap_or(false);
    let limit = input.limit.unwrap_or(50).clamp(1, 200);

    let total = db::count_messages(&state.db_path, &endpoint.id, marked_filter)
        .map_err(|err| err.to_string())?;
    let marked_count = count_unfinished_marked_messages(&state, &endpoint.id)?;

    let messages = if let (Some(after_timestamp_ms), Some(after_filename)) =
        (input.after_timestamp_ms, input.after_filename.as_deref())
    {
        db::list_messages_after(
            &state.db_path,
            &endpoint.id,
            after_timestamp_ms,
            after_filename,
            limit,
            marked_filter,
        )
        .map_err(|err| err.to_string())?
    } else if let (Some(before_timestamp_ms), Some(before_filename)) =
        (input.before_timestamp_ms, input.before_filename.as_deref())
    {
        db::list_messages_before(
            &state.db_path,
            &endpoint.id,
            before_timestamp_ms,
            before_filename,
            limit,
            marked_filter,
        )
        .map_err(|err| err.to_string())?
    } else {
        db::list_latest_messages_window(&state.db_path, &endpoint.id, limit, marked_filter)
            .map_err(|err| err.to_string())?
    };

    let has_more_before = if let Some(first) = messages.first() {
        db::count_messages_before(
            &state.db_path,
            &endpoint.id,
            first.timestamp_ms,
            &first.filename,
            marked_filter,
        )
        .map_err(|err| err.to_string())?
            > 0
    } else {
        false
    };

    Ok(MessagesWindowResult {
        messages,
        total,
        has_more_before,
        marked_count,
    })
}

#[tauri::command]
async fn send_text(
    state: State<'_, AppState>,
    text: String,
    format: Option<String>,
    marked_options: Option<SendMarkedOptionsInput>,
) -> Result<SendMessageResult, String> {
    send_text_impl(&state, text, format, marked_options).await
}

fn normalize_send_text_format(format: Option<String>) -> Result<String, String> {
    let normalized = format
        .unwrap_or_else(|| "text".to_string())
        .trim()
        .to_lowercase();
    match normalized.as_str() {
        "" | "text" => Ok("text".to_string()),
        "markdown" => Ok("markdown".to_string()),
        _ => Err("文本格式仅支持 text 或 markdown".to_string()),
    }
}

fn reject_legacy_local_http_marked_option_fields(value: &serde_json::Value) -> Result<(), String> {
    let Some(object) = value.as_object() else {
        return Ok(());
    };
    for legacy_field in ["selectedTagIds", "createdTags", "deletedTagIds"] {
        if object.contains_key(legacy_field) {
            return Err(format!(
                "markedOptions 不再支持 {legacy_field}，请改用 tagNames"
            ));
        }
    }
    Ok(())
}

fn normalize_local_http_tag_names(tag_names: Vec<String>) -> Result<Vec<String>, String> {
    let mut normalized_tag_names = Vec::new();
    let mut seen_names = HashSet::new();

    for tag_name in tag_names {
        let normalized = normalize_marked_tag_name(&tag_name)?;
        let dedupe_key = normalized.to_lowercase();
        if seen_names.insert(dedupe_key) {
            normalized_tag_names.push(normalized);
        }
    }

    Ok(normalized_tag_names)
}

fn build_local_http_marked_options(
    tags: &[MarkedTag],
    options: LocalHttpApiMarkedOptionsInput,
) -> Result<SendMarkedOptionsInput, String> {
    let normalized_tag_names = normalize_local_http_tag_names(options.tag_names)?;
    let due_date = normalize_marked_due_date(options.due_date)?;
    let marked = options.marked || !normalized_tag_names.is_empty();
    let mut selected_tag_ids = Vec::new();
    let mut created_tags = Vec::new();

    for tag_name in normalized_tag_names {
        if let Some(existing_tag) = tags
            .iter()
            .find(|tag| tag.name.trim().to_lowercase() == tag_name.to_lowercase())
        {
            selected_tag_ids.push(existing_tag.id.clone());
        } else {
            created_tags.push(PendingCreatedTagInput {
                name: tag_name,
                selected: true,
            });
        }
    }

    Ok(SendMarkedOptionsInput {
        marked,
        selected_tag_ids,
        due_date: marked.then_some(due_date).flatten(),
        created_tags,
        deleted_tag_ids: Vec::new(),
    })
}

fn parse_local_http_marked_options_json(
    raw: &str,
) -> Result<LocalHttpApiMarkedOptionsInput, String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err("markedOptions 不能为空".to_string());
    }
    let value: serde_json::Value = serde_json::from_str(trimmed)
        .map_err(|err| format!("markedOptions 必须是合法 JSON: {err}"))?;
    reject_legacy_local_http_marked_option_fields(&value)?;
    serde_json::from_value(value).map_err(|err| format!("markedOptions 格式不正确: {err}"))
}

fn parse_local_http_send_text_request_json(
    raw: &[u8],
) -> Result<LocalHttpApiSendTextRequest, String> {
    let value: serde_json::Value =
        serde_json::from_slice(raw).map_err(|err| format!("请求体必须是合法 JSON: {err}"))?;
    if let Some(marked_options) = value.get("markedOptions") {
        reject_legacy_local_http_marked_option_fields(marked_options)?;
    }
    serde_json::from_value(value).map_err(|err| format!("请求体格式不正确: {err}"))
}

async fn resolve_local_http_marked_options(
    state: &AppState,
    marked_options: Option<LocalHttpApiMarkedOptionsInput>,
) -> Result<Option<SendMarkedOptionsInput>, String> {
    let Some(marked_options) = marked_options else {
        return Ok(None);
    };

    let settings = current_settings(state)?;
    let endpoint = resolve_active_endpoint(&settings)?;
    let tags = db::list_marked_tags(&state.db_path, &endpoint.id).map_err(|err| err.to_string())?;
    let resolved = build_local_http_marked_options(&tags, marked_options)?;
    Ok(Some(resolved))
}

async fn send_text_impl(
    state: &AppState,
    text: String,
    format: Option<String>,
    marked_options: Option<SendMarkedOptionsInput>,
) -> Result<SendMessageResult, String> {
    let settings = current_settings(&state)?;
    let endpoint = resolve_active_endpoint(&settings)?;

    let format = normalize_send_text_format(format)?;
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

    webdav::upload_file_ensuring_parent(&state.http, &endpoint, &remote_path, data.clone()).await?;

    let mut message = DbMessage {
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
        marked_tag_ids: Vec::new(),
        marked_pinned: false,
        marked_due_date: None,
        format,
    };

    persist_sent_message_with_marked_options(state, &endpoint, &mut message, marked_options).await
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

fn cache_uploaded_bytes(target_path: &Path, data: &[u8]) -> Result<(), String> {
    if let Some(parent) = target_path.parent() {
        fs::create_dir_all(parent).map_err(|err| format!("??????: {err}"))?;
    }
    fs::write(target_path, data).map_err(|err| format!("????????: {err}"))
}

fn cache_uploaded_file(source_path: &Path, target_path: &Path) -> Result<(), String> {
    if let Some(parent) = target_path.parent() {
        fs::create_dir_all(parent).map_err(|err| format!("??????: {err}"))?;
    }
    fs::copy(source_path, target_path).map_err(|err| format!("????????: {err}"))?;
    Ok(())
}

fn create_upload_temp_path(original_name: &str) -> Result<PathBuf, String> {
    let mut rng = rand::thread_rng();
    let temp_dir = std::env::temp_dir().join(format!(
        "transfer-genie-upload-{}-{:016x}",
        now_ms(),
        rng.gen::<u64>()
    ));
    fs::create_dir_all(&temp_dir).map_err(|err| format!("????????: {err}"))?;
    Ok(temp_dir.join(sanitize_filename(original_name)))
}

fn cleanup_upload_temp_path(path: &Path) {
    let _ = fs::remove_file(path);
    if let Some(parent) = path.parent() {
        let _ = fs::remove_dir(parent);
    }
}

fn generate_thumbnail_from_path(path: &Path) -> Result<Vec<u8>, String> {
    let data = fs::read(path).map_err(|err| format!("????????: {err}"))?;
    generate_thumbnail(&data)
}

fn spawn_thumbnail_upload(
    http: Client,
    endpoint: WebDavEndpoint,
    endpoint_dir: PathBuf,
    remote_path: String,
    filename: String,
    timestamp_ms: i64,
    original_name: String,
    source_path: PathBuf,
) {
    if !is_image_file(&original_name) {
        return;
    }
    tokio::spawn(async move {
        let thumb_data =
            match tokio::task::spawn_blocking(move || generate_thumbnail_from_path(&source_path))
                .await
            {
                Ok(Ok(bytes)) => bytes,
                _ => return,
            };
        let thumb_remote_path =
            resolved_thumbnail_remote_path(Some(&remote_path), &filename, Some(timestamp_ms));
        let _ = webdav::upload_file_ensuring_parent(
            &http,
            &endpoint,
            &thumb_remote_path,
            thumb_data.clone(),
        )
        .await;

        let thumb_local_dir = endpoint_dir.join(".thumbs");
        let _ = fs::create_dir_all(&thumb_local_dir);
        let _ = fs::write(thumb_local_dir.join(&filename), thumb_data);
    });
}

async fn send_file_data_impl(
    state: &AppState,
    window: Option<&Window>,
    data: Vec<u8>,
    original_name: String,
    client_id: Option<String>,
    marked_options: Option<SendMarkedOptionsInput>,
) -> Result<SendMessageResult, String> {
    let temp_path = create_upload_temp_path(&original_name)?;
    cache_uploaded_bytes(&temp_path, &data)?;
    let result = send_file_path_impl(
        state,
        window,
        &temp_path,
        original_name,
        client_id,
        marked_options,
    )
    .await;
    cleanup_upload_temp_path(&temp_path);
    result
}

async fn send_file_path_impl(
    state: &AppState,
    window: Option<&Window>,
    source_path: &Path,
    original_name: String,
    client_id: Option<String>,
    marked_options: Option<SendMarkedOptionsInput>,
) -> Result<SendMessageResult, String> {
    let settings = current_settings(state)?;
    let endpoint = resolve_active_endpoint(&settings)?;
    let original_name = original_name.trim().to_string();
    if original_name.is_empty() {
        return Err("???????".to_string());
    }

    let source_path = source_path.to_path_buf();
    let total_bytes = fs::metadata(&source_path)
        .map_err(|err| format!("????????: {err}"))?
        .len();
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
    if let Some(window) = window {
        emit_upload_progress(
            window,
            &client_id,
            Some(&filename),
            Some(&original_name),
            0,
            total_bytes,
            "progress",
            None,
        );
    }

    let progress_window = window.cloned();
    let progress_client_id = client_id.clone();
    let progress_filename = filename.clone();
    let progress_original_name = original_name.clone();
    let upload_result = webdav::upload_file_path_with_progress(
        &state.http,
        &endpoint,
        &remote_path,
        &source_path,
        move |sent, total| {
            if let Some(progress_window) = progress_window.as_ref() {
                emit_upload_progress(
                    progress_window,
                    &progress_client_id,
                    Some(&progress_filename),
                    Some(&progress_original_name),
                    sent,
                    total,
                    "progress",
                    None,
                );
            }
        },
    )
    .await;

    if let Err(err) = upload_result {
        let _ = persist_upload_history(
            state,
            &endpoint.id,
            &filename,
            &original_name,
            None,
            "error",
            Some(err.clone()),
            total_bytes as i64,
        );
        if let Some(window) = window {
            emit_upload_progress(
                window,
                &client_id,
                Some(&filename),
                Some(&original_name),
                0,
                total_bytes,
                "error",
                Some(err.clone()),
            );
        }
        return Err(err);
    }

    let endpoint_dir = endpoint_files_dir(state, &endpoint.id);
    let local_path = endpoint_dir.join(&filename);
    cache_uploaded_file(&source_path, &local_path)?;
    let hash_path = source_path.clone();
    let file_hash = tokio::task::spawn_blocking(move || compute_file_hash_from_path(&hash_path))
        .await
        .map_err(|err| format!("????????: {err}"))??;

    let mut message = DbMessage {
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
        marked_tag_ids: Vec::new(),
        marked_pinned: false,
        marked_due_date: None,
        format: "text".to_string(),
    };

    let result =
        persist_sent_message_with_marked_options(state, &endpoint, &mut message, marked_options)
            .await?;
    persist_upload_history(
        state,
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
        source_path,
    );
    if let Some(window) = window {
        emit_upload_progress(
            window,
            &client_id,
            Some(&message.filename),
            Some(&message.original_name),
            total_bytes,
            total_bytes,
            "complete",
            None,
        );
    }
    Ok(result)
}

#[tauri::command]
async fn send_file(
    window: Window,
    state: State<'_, AppState>,
    path: String,
    client_id: Option<String>,
    marked_options: Option<SendMarkedOptionsInput>,
) -> Result<SendMessageResult, String> {
    let file_path = PathBuf::from(path);
    let original_name = file_path
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| "???????".to_string())?
        .to_string();
    send_file_path_impl(
        state.inner(),
        Some(&window),
        &file_path,
        original_name,
        client_id,
        marked_options,
    )
    .await
}

#[tauri::command]
async fn send_file_data(
    window: Window,
    state: State<'_, AppState>,
    data: Vec<u8>,
    original_name: String,
    client_id: Option<String>,
    marked_options: Option<SendMarkedOptionsInput>,
) -> Result<SendMessageResult, String> {
    send_file_data_impl(
        state.inner(),
        Some(&window),
        data,
        original_name,
        client_id,
        marked_options,
    )
    .await
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

    let message = db::get_message(&state.db_path, &endpoint.id, &filename)
        .map_err(|err| format!("Failed to read message: {err}"))?;
    let target_path = build_download_target_path(
        &state,
        &settings,
        &original_name,
        message
            .as_ref()
            .map(|item| item.timestamp_ms)
            .unwrap_or_else(now_ms),
    );
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
        .map_err(|err| format!("Failed to open file: {}", err))?;
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
        let chunk = chunk.map_err(|err| format!("Failed to read download content: {}", err))?;
        file.write_all(&chunk)
            .map_err(|err| format!("Failed to write to temporary download file: {}", err))?;
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
        .map_err(|err| format!("Failed to flush temporary download file: {}", err))?;
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
                        fs::remove_file(final_path).map_err(|err| {
                            format!("Failed to replace existing download file: {}", err)
                        })?;
                    }
                    fs::rename(&temp_path, final_path)
                        .map_err(|err| format!("Failed to complete download file: {}", err))?;
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

fn list_download_history(
    state: State<'_, AppState>,
    limit: Option<i64>,
    offset: Option<i64>,
) -> Result<DownloadHistoryResult, String> {
    let total = db::count_download_history(&state.db_path)
        .map_err(|err| format!("读取下载历史失败: {err}"))?;
    let records = db::list_download_history_paged(&state.db_path, limit, offset)
        .map_err(|err| format!("读取下载历史失败: {err}"))?;
    let current_offset = offset.unwrap_or(0).max(0);
    let current_limit = limit.unwrap_or(total).max(0);
    Ok(DownloadHistoryResult {
        records,
        total,
        has_more: current_offset + current_limit < total,
    })
}

#[tauri::command]
fn list_upload_history(
    state: State<'_, AppState>,
    limit: Option<i64>,
    offset: Option<i64>,
) -> Result<UploadHistoryResult, String> {
    let total = db::count_upload_history(&state.db_path)
        .map_err(|err| format!("读取上传历史失败: {err}"))?;
    let records = db::list_upload_history_paged(&state.db_path, limit, offset)
        .map_err(|err| format!("读取上传历史失败: {err}"))?;
    let current_offset = offset.unwrap_or(0).max(0);
    let current_limit = limit.unwrap_or(total).max(0);
    Ok(UploadHistoryResult {
        records,
        total,
        has_more: current_offset + current_limit < total,
    })
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
        build_download_target_path(
            &state,
            &settings,
            &record.original_name,
            record.created_at_ms,
        )
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
fn open_download_history_file(
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
    app.opener()
        .open_path(file_path.to_string_lossy().to_string(), None::<&str>)
        .map_err(|err| format!("打开文件失败: {err}"))?;
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
    let message = db::get_message(&state.db_path, &endpoint.id, &filename)
        .map_err(|err| format!("读取消息失败: {err}"))?;
    let download_path = base_dir.join(build_save_filename(
        &settings.save_filename_rule,
        &original_name,
        message
            .as_ref()
            .map(|entry| entry.timestamp_ms)
            .unwrap_or_else(now_ms),
    ));
    if download_path.is_file() {
        app.opener()
            .open_path(download_path.to_string_lossy().to_string(), None::<&str>)
            .map_err(|err| format!("打开文件失败: {err}"))?;
        return Ok(());
    }

    let local_path = message
        .and_then(|entry| entry.local_path)
        .filter(|path| !path.trim().is_empty())
        .map(PathBuf::from);

    if let Some(local_path) = local_path {
        if local_path.is_file() {
            let local_has_ext = local_path.extension().is_some();
            let wanted_has_ext = download_path.extension().is_some();
            if local_has_ext || !wanted_has_ext {
                app.opener()
                    .open_path(local_path.to_string_lossy().to_string(), None::<&str>)
                    .map_err(|err| format!("打开文件失败: {err}"))?;
                return Ok(());
            }

            let open_dir = endpoint_files_dir(&state, &endpoint.id).join("open");
            fs::create_dir_all(&open_dir).map_err(|err| format!("创建打开目录失败: {err}"))?;
            let safe_prefix = filename.replace('%', "_");
            let safe_name = download_path
                .file_name()
                .and_then(|value| value.to_str())
                .unwrap_or("download.bin")
                .replace('%', "_");
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
    let mut succeeded_targets: Vec<crate::history::HistoryEntryTarget> = Vec::new();
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
                Ok(_) => {
                    succeeded.push(filename.clone());
                    if let Some(message) = message {
                        succeeded_targets.push((filename.clone(), message.timestamp_ms));
                    }
                }
                Err(_) => failed.push(filename.clone()),
            }
        }
        if !succeeded_targets.is_empty() {
            let history_result = crate::history::remove_history_entry_targets(
                &state.http,
                &endpoint,
                &succeeded_targets,
            )
            .await?;
            invalidate_history_cache_for_paths(
                &state,
                &endpoint.id,
                &history_result.touched_paths,
            )?;
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
                message.timestamp_ms,
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
                message.timestamp_ms,
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
    let candidates = db::list_cleanup_candidates(&state.db_path, &endpoint.id, cutoff_ms)
        .map_err(|err| err.to_string())?;

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
                    message.timestamp_ms,
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
            let mut succeeded_targets: Vec<crate::history::HistoryEntryTarget> = Vec::new();
            for message in &candidates {
                let remote_path = resolved_remote_path(
                    message.remote_path.as_deref(),
                    &message.filename,
                    Some(message.timestamp_ms),
                );
                match webdav::delete_file(&state.http, &endpoint, &remote_path, true).await {
                    Ok(_) => {
                        succeeded.push(message.filename.clone());
                        succeeded_targets.push((message.filename.clone(), message.timestamp_ms));
                    }
                    Err(_) => failed.push(message.filename.clone()),
                }
            }

            if !succeeded_targets.is_empty() {
                let history_result = crate::history::remove_history_entry_targets(
                    &state.http,
                    &endpoint,
                    &succeeded_targets,
                )
                .await?;
                invalidate_history_cache_for_paths(
                    &state,
                    &endpoint.id,
                    &history_result.touched_paths,
                )?;
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
                    message.timestamp_ms,
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
    WebDavSyncRuntimeAdapter::new(&state).refresh().await
}

#[tauri::command]
fn cancel_refresh(state: State<'_, AppState>) -> Result<(), String> {
    WebDavSyncRuntimeAdapter::new(&state).cancel()
}

#[tauri::command]
fn get_sync_status(state: State<'_, AppState>) -> Result<SyncStatus, String> {
    WebDavSyncRuntimeAdapter::new(&state).status()
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

fn workspace_root_for_state(state: &AppState) -> PathBuf {
    state
        .files_base_dir
        .parent()
        .unwrap_or_else(|| Path::new("."))
        .to_path_buf()
}

fn backup_runtime_dir(state: &AppState) -> PathBuf {
    workspace_root_for_state(state).join("runtime")
}

fn configured_backup_dir(settings: &Settings) -> PathBuf {
    let trimmed = settings.backup.directory.trim();
    if trimmed.is_empty() {
        PathBuf::from(BackupSettings::default().directory)
    } else {
        PathBuf::from(trimmed)
    }
}

fn local_data_backup_path(settings: &Settings, now: i64) -> PathBuf {
    configured_backup_dir(settings).join(format!("transfer-genie-local-data-{now}.zip"))
}

fn zip_add_file(
    zip: &mut zip::ZipWriter<std::fs::File>,
    source: &Path,
    archive_name: &str,
    options: zip::write::FileOptions<'_, ()>,
) -> Result<(), String> {
    let mut input = std::fs::File::open(source)
        .map_err(|err| format!("读取备份源文件失败 {}: {err}", source.display()))?;
    zip.start_file(archive_name.replace('\\', "/"), options)
        .map_err(|err| format!("写入备份条目失败 {archive_name}: {err}"))?;
    std::io::copy(&mut input, zip)
        .map_err(|err| format!("写入备份文件失败 {}: {err}", source.display()))?;
    Ok(())
}

fn zip_add_dir_recursive(
    zip: &mut zip::ZipWriter<std::fs::File>,
    source_dir: &Path,
    archive_root: &str,
    options: zip::write::FileOptions<'_, ()>,
) -> Result<(), String> {
    if !source_dir.is_dir() {
        return Ok(());
    }
    let mut stack = vec![source_dir.to_path_buf()];
    while let Some(dir) = stack.pop() {
        for entry in fs::read_dir(&dir)
            .map_err(|err| format!("读取备份目录失败 {}: {err}", dir.display()))?
        {
            let entry = entry.map_err(|err| format!("读取备份目录项失败: {err}"))?;
            let path = entry.path();
            let relative = path
                .strip_prefix(source_dir)
                .map_err(|err| format!("计算备份路径失败: {err}"))?;
            let archive_name = Path::new(archive_root).join(relative);
            let archive_name = archive_name.to_string_lossy().replace('\\', "/");
            if path.is_dir() {
                zip.add_directory(format!("{archive_name}/"), options)
                    .map_err(|err| format!("写入备份目录失败 {archive_name}: {err}"))?;
                stack.push(path);
            } else if path.is_file() {
                zip_add_file(zip, &path, &archive_name, options)?;
            }
        }
    }
    Ok(())
}

fn create_local_data_backup_to_path(
    state: &AppState,
    path: &Path,
) -> Result<LocalDataBackupResult, String> {
    use std::io::Write;
    use zip::write::FileOptions;

    ensure_parent_dir(path)?;
    let created_at_ms = now_ms();
    let file = std::fs::File::create(path)
        .map_err(|err| format!("创建本地数据备份失败 {}: {err}", path.display()))?;
    let mut zip = zip::ZipWriter::new(file);
    let options: FileOptions<'_, ()> =
        FileOptions::default().compression_method(zip::CompressionMethod::Deflated);
    let mut includes = Vec::new();

    let manifest = LocalDataBackupManifest {
        version: 1,
        created_at_ms,
        app_version: env!("CARGO_PKG_VERSION").to_string(),
        includes: vec![
            "settings.json".to_string(),
            "messages.sqlite".to_string(),
            "workspace/endpoints".to_string(),
            "workspace/mirrors".to_string(),
            "workspace/plugins".to_string(),
        ],
    };
    let manifest_data = serde_json::to_vec_pretty(&manifest)
        .map_err(|err| format!("序列化本地备份清单失败: {err}"))?;
    zip.start_file("manifest.json", options)
        .map_err(|err| format!("写入本地备份清单失败: {err}"))?;
    zip.write_all(&manifest_data)
        .map_err(|err| format!("写入本地备份清单失败: {err}"))?;

    if state.settings_path.is_file() {
        zip_add_file(&mut zip, &state.settings_path, "settings.json", options)?;
        includes.push("settings.json".to_string());
    }
    if state.db_path.is_file() {
        zip_add_file(&mut zip, &state.db_path, "messages.sqlite", options)?;
        includes.push("messages.sqlite".to_string());
    }
    let workspace_root = workspace_root_for_state(state);
    for name in ["endpoints", "mirrors", "plugins"] {
        let dir = workspace_root.join(name);
        if dir.is_dir() {
            zip_add_dir_recursive(&mut zip, &dir, &format!("workspace/{name}"), options)?;
            includes.push(format!("workspace/{name}"));
        }
    }
    zip.finish()
        .map_err(|err| format!("完成本地数据备份失败: {err}"))?;

    let metadata = fs::metadata(path)
        .map_err(|err| format!("读取本地数据备份信息失败 {}: {err}", path.display()))?;
    Ok(LocalDataBackupResult {
        path: path.to_string_lossy().to_string(),
        file_name: path
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or("transfer-genie-local-data.zip")
            .to_string(),
        size_bytes: metadata.len(),
        created_at_ms,
        manual: false,
        name: String::new(),
        note: String::new(),
    })
}

fn safe_restore_archive_path(name: &str) -> Option<PathBuf> {
    let path = Path::new(name);
    if path.is_absolute() {
        return None;
    }
    if path
        .components()
        .any(|component| matches!(component, std::path::Component::ParentDir))
    {
        return None;
    }
    Some(path.to_path_buf())
}

fn restore_local_data_backup_from_path(state: &AppState, path: &Path) -> Result<(), String> {
    use zip::ZipArchive;

    let file = std::fs::File::open(path)
        .map_err(|err| format!("读取本地数据备份失败 {}: {err}", path.display()))?;
    let mut archive = ZipArchive::new(file)
        .map_err(|err| format!("解析本地数据备份失败 {}: {err}", path.display()))?;
    let manifest_data = {
        let mut manifest_file = archive
            .by_name("manifest.json")
            .map_err(|_| "本地数据备份无效: 缺少 manifest.json".to_string())?;
        let mut data = Vec::new();
        std::io::copy(&mut manifest_file, &mut data)
            .map_err(|err| format!("读取本地数据备份清单失败: {err}"))?;
        data
    };
    let manifest: LocalDataBackupManifest = serde_json::from_slice(&manifest_data)
        .map_err(|err| format!("解析本地数据备份清单失败: {err}"))?;
    if manifest.version != 1 {
        return Err(format!("不支持的本地数据备份版本: {}", manifest.version));
    }

    let rollback_settings = current_settings(state)?;
    let rollback_path = local_data_backup_path(&rollback_settings, now_ms())
        .with_file_name(format!("transfer-genie-rollback-{}.zip", now_ms()));
    let _ = create_local_data_backup_to_path(state, &rollback_path)?;

    let temp_dir = backup_runtime_dir(state).join(format!("local_restore_{}", now_ms()));
    fs::create_dir_all(&temp_dir)
        .map_err(|err| format!("创建本地恢复临时目录失败 {}: {err}", temp_dir.display()))?;
    for index in 0..archive.len() {
        let mut file = archive
            .by_index(index)
            .map_err(|err| format!("读取本地备份条目失败: {err}"))?;
        if file.is_dir() {
            continue;
        }
        let Some(relative) = safe_restore_archive_path(file.name()) else {
            continue;
        };
        let target = temp_dir.join(relative);
        ensure_parent_dir(&target)?;
        let mut output = std::fs::File::create(&target)
            .map_err(|err| format!("创建本地恢复临时文件失败 {}: {err}", target.display()))?;
        std::io::copy(&mut file, &mut output)
            .map_err(|err| format!("解压本地备份条目失败 {}: {err}", file.name()))?;
    }

    let workspace_root = workspace_root_for_state(state);
    let replacements = [
        (temp_dir.join("settings.json"), state.settings_path.clone()),
        (temp_dir.join("messages.sqlite"), state.db_path.clone()),
    ];
    for (source, target) in replacements {
        if source.is_file() {
            ensure_parent_dir(&target)?;
            fs::copy(&source, &target).map_err(|err| {
                format!(
                    "恢复本地文件失败 {} -> {}: {err}",
                    source.display(),
                    target.display()
                )
            })?;
        }
    }
    for name in ["endpoints", "mirrors", "plugins"] {
        let source = temp_dir.join("workspace").join(name);
        let target = workspace_root.join(name);
        if source.is_dir() {
            if target.exists() {
                fs::remove_dir_all(&target)
                    .map_err(|err| format!("清理本地目录失败 {}: {err}", target.display()))?;
            }
            copy_dir_recursive(&source, &target)?;
        }
    }
    let _ = fs::remove_dir_all(&temp_dir);
    Ok(())
}

fn copy_dir_recursive(source: &Path, target: &Path) -> Result<(), String> {
    fs::create_dir_all(target)
        .map_err(|err| format!("创建目录失败 {}: {err}", target.display()))?;
    for entry in
        fs::read_dir(source).map_err(|err| format!("读取目录失败 {}: {err}", source.display()))?
    {
        let entry = entry.map_err(|err| format!("读取目录项失败: {err}"))?;
        let source_path = entry.path();
        let target_path = target.join(entry.file_name());
        if source_path.is_dir() {
            copy_dir_recursive(&source_path, &target_path)?;
        } else if source_path.is_file() {
            ensure_parent_dir(&target_path)?;
            fs::copy(&source_path, &target_path).map_err(|err| {
                format!(
                    "复制文件失败 {} -> {}: {err}",
                    source_path.display(),
                    target_path.display()
                )
            })?;
        }
    }
    Ok(())
}

fn record_local_backup_event(
    state: &AppState,
    endpoint: &WebDavEndpoint,
    backup_path: &str,
    source: &str,
) -> Result<(), String> {
    let workspace_root = workspace_root_for_state(state);
    let filename = format!("{}-{}.json", endpoint.id, now_ms());
    let target = workspace_root.join("backups").join(filename);
    let record = LocalBackupRecord {
        endpoint_id: endpoint.id.clone(),
        backup_path: backup_path.to_string(),
        created_at_ms: now_ms(),
        source: source.to_string(),
        manual: false,
        name: String::new(),
        note: String::new(),
    };
    workspace::write_json_with_audit_at(
        &target,
        &record,
        Some(&workspace_root),
        "backup-record",
        source,
    )
}

fn auto_backup_state_path(state: &AppState) -> PathBuf {
    workspace_root_for_state(state)
        .join("backups")
        .join("auto-backup-state.json")
}

fn load_auto_backup_state(state: &AppState) -> AutoBackupStateRecord {
    let path = auto_backup_state_path(state);
    if !path.is_file() {
        return AutoBackupStateRecord::default();
    }
    fs::read_to_string(&path)
        .ok()
        .and_then(|content| serde_json::from_str::<AutoBackupStateRecord>(&content).ok())
        .unwrap_or_default()
}

fn auto_backup_status_for_state(state: &AppState) -> Result<AutoBackupStatus, String> {
    let settings = current_settings(state)?;
    let persisted = load_auto_backup_state(state);
    Ok(AutoBackupStatus {
        enabled: settings.backup.enabled,
        interval_minutes: settings.backup.interval_minutes,
        retain_count: settings.backup.retain_count,
        settings_snapshot_retain_count: settings.backup.settings_snapshot_retain_count,
        directory: settings.backup.directory.clone(),
        keep_all_days: settings.backup.keep_all_days,
        keep_daily_days: settings.backup.keep_daily_days,
        has_active_endpoint: resolve_active_endpoint(&settings).is_ok(),
        last_run_ms: persisted.last_run_ms,
        last_success_ms: persisted.last_success_ms,
        last_error: persisted.last_error,
        last_backup_path: persisted.last_backup_path,
    })
}

fn save_auto_backup_state(state: &AppState, record: &AutoBackupStateRecord) -> Result<(), String> {
    let workspace_root = workspace_root_for_state(state);
    workspace::write_json_with_audit_at(
        &auto_backup_state_path(state),
        record,
        Some(&workspace_root),
        "backup-schedule",
        "save-state",
    )
}

fn prune_auto_backup_archives(dir: &Path, retain_count: u32) -> Result<(), String> {
    if !dir.is_dir() {
        return Ok(());
    }

    let mut entries = fs::read_dir(dir)
        .map_err(|err| format!("读取备份目录失败 {}: {err}", dir.display()))?
        .filter_map(Result::ok)
        .filter(|entry| entry.path().is_file())
        .filter(|entry| {
            entry
                .path()
                .file_name()
                .and_then(|value| value.to_str())
                .map(|name| !name.ends_with(".manual.json"))
                .unwrap_or(true)
        })
        .filter(|entry| !load_backup_manual_metadata(&entry.path()).manual)
        .collect::<Vec<_>>();
    entries.sort_by_key(|entry| entry.file_name());

    let keep = retain_count.max(1) as usize;
    if entries.len() <= keep {
        return Ok(());
    }

    let remove_count = entries.len() - keep;
    for entry in entries.into_iter().take(remove_count) {
        remove_backup_file_with_metadata(&entry.path())?;
    }

    Ok(())
}

fn snapshot_day_bucket(timestamp_ms: i64) -> i64 {
    timestamp_ms / (24 * 60 * 60 * 1000)
}

fn file_modified_ms(path: &Path) -> i64 {
    fs::metadata(path)
        .and_then(|metadata| metadata.modified())
        .ok()
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or_else(now_ms)
}

fn select_retained_snapshot_paths(
    mut entries: Vec<(PathBuf, i64)>,
    now_ms_value: i64,
    keep_all_days: u32,
    keep_daily_days: u32,
) -> HashSet<PathBuf> {
    let day_ms = 24 * 60 * 60 * 1000_i64;
    let keep_all_ms = keep_all_days.max(1) as i64 * day_ms;
    let keep_daily_ms = keep_daily_days.max(keep_all_days.max(1)) as i64 * day_ms;
    entries.sort_by(|left, right| right.1.cmp(&left.1));

    let mut retained = HashSet::new();
    let mut daily_seen = HashSet::new();
    for (path, created_ms) in entries {
        let age_ms = now_ms_value.saturating_sub(created_ms);
        if age_ms <= keep_all_ms {
            retained.insert(path);
            continue;
        }
        if age_ms <= keep_daily_ms {
            let bucket = snapshot_day_bucket(created_ms);
            if daily_seen.insert(bucket) {
                retained.insert(path);
            }
        }
    }
    retained
}

fn cleanup_backup_snapshots_by_retention(
    dir: &Path,
    keep_all_days: u32,
    keep_daily_days: u32,
    now_ms_value: i64,
) -> Result<(), String> {
    if !dir.is_dir() {
        return Ok(());
    }
    let entries = fs::read_dir(dir)
        .map_err(|err| format!("读取备份目录失败 {}: {err}", dir.display()))?
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|path| path.is_file())
        .filter(|path| path.extension().and_then(|value| value.to_str()) == Some("zip"))
        .filter(|path| !load_backup_manual_metadata(path).manual)
        .map(|path| {
            let modified = file_modified_ms(&path);
            (path, modified)
        })
        .collect::<Vec<_>>();
    let retained = select_retained_snapshot_paths(
        entries.clone(),
        now_ms_value,
        keep_all_days,
        keep_daily_days,
    );
    for (path, _) in entries {
        if !retained.contains(&path) {
            remove_backup_file_with_metadata(&path)?;
        }
    }
    Ok(())
}

fn should_run_auto_backup(
    settings: &Settings,
    last_run_ms: Option<i64>,
    now_ms_value: i64,
) -> bool {
    if !settings.backup.enabled || resolve_active_endpoint(settings).is_err() {
        return false;
    }

    match last_run_ms {
        Some(last_run_ms) => {
            let interval_ms = (settings.backup.interval_minutes.max(5) as i64) * 60 * 1000;
            now_ms_value.saturating_sub(last_run_ms) >= interval_ms
        }
        None => true,
    }
}

async fn backup_webdav_to_path(
    state: &AppState,
    endpoint: &WebDavEndpoint,
    path: &Path,
    window: Option<&Window>,
) -> Result<(), String> {
    use futures_util::StreamExt;
    use std::io::Write;
    use zip::write::FileOptions;

    info!("--- Starting WebDAV Backup ---");
    if let Some(window) = window {
        emit_backup_restore_progress(window, "webdav-backup-progress", "", 0, 0, "scanning");
    }

    let entries = recursive_list_webdav(&state.http, endpoint, "").await?;
    let total_entries = entries.len() as u64;

    if total_entries == 0 {
        if let Some(window) = window {
            emit_backup_restore_progress(window, "webdav-backup-progress", "", 0, 0, "finished");
        }
        return Ok(());
    }

    let file = std::fs::File::create(path).map_err(|e| format!("创建备份文件失败: {e}"))?;
    let mut zip = zip::ZipWriter::new(file);
    let options: FileOptions<'_, ()> =
        FileOptions::default().compression_method(zip::CompressionMethod::Deflated);

    let temp_dir = backup_runtime_dir(state).join(format!("temp_backup_{}", now_ms()));
    fs::create_dir_all(&temp_dir).map_err(|e| format!("无法创建临时目录: {e}"))?;

    for (index, entry) in entries.iter().enumerate() {
        let current_progress = (index + 1) as u64;
        if let Some(window) = window {
            emit_backup_restore_progress(
                window,
                "webdav-backup-progress",
                &entry.filename,
                current_progress,
                total_entries,
                "downloading",
            );
        }

        if entry.is_collection {
            if !entry.remote_path.is_empty() {
                let _ = zip.add_directory(&entry.remote_path, options);
            }
            continue;
        }

        if entry.remote_path.is_empty() {
            continue;
        }

        let temp_file_path = temp_dir.join(format!("backup_{}.tmp", index));
        match webdav::download_file_stream(&state.http, endpoint, &entry.remote_path).await {
            Ok(response) => {
                let mut stream = response.stream;
                let mut temp_file =
                    std::fs::File::create(&temp_file_path).map_err(|e| format!("操作失败: {e}"))?;
                while let Some(chunk) = stream.next().await {
                    let chunk = chunk.map_err(|e| format!("操作失败: {e}"))?;
                    temp_file
                        .write_all(&chunk)
                        .map_err(|e| format!("操作失败: {e}"))?;
                }
                temp_file.flush().map_err(|e| format!("操作失败: {e}"))?;
                drop(temp_file);

                let mut input_file =
                    std::fs::File::open(&temp_file_path).map_err(|e| format!("操作失败: {e}"))?;
                if let Err(err) = zip.start_file(&entry.remote_path, options) {
                    let _ = std::fs::remove_file(&temp_file_path);
                    return Err(format!("Zip start_file failed: {err}"));
                }
                if let Err(err) = std::io::copy(&mut input_file, &mut zip) {
                    let _ = std::fs::remove_file(&temp_file_path);
                    return Err(format!("写入 Zip 失败: {err}"));
                }
                let _ = std::fs::remove_file(&temp_file_path);
            }
            Err(err) => {
                log::warn!(
                    "Skipping file '{}' due to download error: {}",
                    entry.remote_path,
                    err
                );
            }
        }
    }

    zip.finish()
        .map_err(|e| format!("完成 zip 文件失败: {e}"))?;
    let _ = std::fs::remove_dir_all(&temp_dir);
    record_local_backup_event(state, endpoint, &path.to_string_lossy(), "backup-webdav")?;

    if let Some(window) = window {
        emit_backup_restore_progress(
            window,
            "webdav-backup-progress",
            "",
            total_entries,
            total_entries,
            "finished",
        );
    }

    Ok(())
}

async fn maybe_run_scheduled_backup(
    app_handle: &AppHandle,
    state: &AppState,
) -> Result<(), String> {
    let _guard = match state.auto_backup_guard.try_lock() {
        Ok(guard) => guard,
        Err(_) => return Ok(()),
    };

    let settings = current_settings(state)?;
    let now = now_ms();
    let status = load_auto_backup_state(state);
    if !should_run_auto_backup(&settings, status.last_run_ms, now) {
        return Ok(());
    }

    let endpoint = resolve_active_endpoint(&settings)?;
    let archive_dir = configured_backup_dir(&settings)
        .join("webdav")
        .join(&endpoint.id);
    fs::create_dir_all(&archive_dir)
        .map_err(|err| format!("创建自动备份目录失败 {}: {err}", archive_dir.display()))?;
    let backup_path = archive_dir.join(format!("{}-{}.zip", endpoint.id, now));

    let result = backup_webdav_to_path(state, &endpoint, &backup_path, None).await;
    let next_state = match result.as_ref() {
        Ok(()) => {
            prune_auto_backup_archives(&archive_dir, settings.backup.retain_count)?;
            cleanup_backup_snapshots_by_retention(
                &configured_backup_dir(&settings),
                settings.backup.keep_all_days,
                settings.backup.keep_daily_days,
                now,
            )?;
            AutoBackupStateRecord {
                last_run_ms: Some(now),
                last_success_ms: Some(now),
                last_error: None,
                last_backup_path: Some(backup_path.to_string_lossy().to_string()),
            }
        }
        Err(err) => AutoBackupStateRecord {
            last_run_ms: Some(now),
            last_success_ms: status.last_success_ms,
            last_error: Some(err.clone()),
            last_backup_path: status.last_backup_path,
        },
    };
    save_auto_backup_state(state, &next_state)?;

    if let Some(window) = app_handle.get_webview_window("main") {
        let _ = window.emit(
            "auto-backup-status",
            serde_json::json!({
                "lastRunMs": next_state.last_run_ms,
                "lastSuccessMs": next_state.last_success_ms,
                "lastError": next_state.last_error,
                "lastBackupPath": next_state.last_backup_path,
            }),
        );
    }

    result
}

#[tauri::command]
#[allow(unreachable_code)]
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
    return backup_webdav_to_path(&state, &endpoint, Path::new(&path), Some(&window)).await;

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
                    .map_err(|e| format!("创建临时文件失败: {}", e))?;
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

fn restore_archive_has_history_entries<R: std::io::Read + std::io::Seek>(
    archive: &mut zip::ZipArchive<R>,
) -> bool {
    let has_legacy_history = archive.by_name("history.json").is_ok();
    let has_manifest_history = archive.by_name("history/index.json").is_ok();
    has_legacy_history || has_manifest_history
}

fn validate_restore_archive_history_entries<R: std::io::Read + std::io::Seek>(
    archive: &mut zip::ZipArchive<R>,
) -> Result<(), String> {
    if restore_archive_has_history_entries(archive) {
        Ok(())
    } else {
        Err("备份文件无效: 缺少 history.json 或 history/index.json".to_string())
    }
}

fn restore_archive_target_path(filename: &str) -> Option<&str> {
    let trimmed = filename.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed)
    }
}

enum RestoreArchiveEntryKind<'a> {
    Skip,
    Directory(&'a str),
    File(&'a str),
}

fn classify_restore_archive_entry(filename: &str, is_dir: bool) -> RestoreArchiveEntryKind<'_> {
    match restore_archive_target_path(filename) {
        Some(path) if is_dir => RestoreArchiveEntryKind::Directory(path),
        Some(path) => RestoreArchiveEntryKind::File(path),
        None => RestoreArchiveEntryKind::Skip,
    }
}

fn should_skip_restore_cleanup_path(remote_path: &str, root_name: &str) -> bool {
    remote_path == root_name || remote_path == format!("{root_name}/")
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
        if should_skip_restore_cleanup_path(&remote_path, "files") {
            continue;
        }
        let _ = webdav::delete_file(&state.http, &endpoint, &remote_path, true).await;
    }
    let existing_history =
        webdav::list_entries(&state.http, &endpoint, Some("history"), true).await?;
    for entry in existing_history {
        let remote_path = entry.remote_path;
        if should_skip_restore_cleanup_path(&remote_path, "history") {
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
    validate_restore_archive_history_entries(&mut archive)?;

    // 确保目录存在 (只做一次)
    webdav::ensure_directory(&state.http, &endpoint, "files").await?;

    let temp_dir = backup_runtime_dir(&state).join(format!("temp_restore_{}", now_ms()));
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

        let target_path = match classify_restore_archive_entry(&filename, is_dir) {
            RestoreArchiveEntryKind::Skip => continue,
            RestoreArchiveEntryKind::Directory(path) => {
                let _ = webdav::ensure_directory(&state.http, &endpoint, path).await;
                continue;
            }
            RestoreArchiveEntryKind::File(path) => path,
        };

        webdav::ensure_parent_directories(&state.http, &endpoint, target_path).await?;

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
            webdav::upload_file_stream(&state.http, &endpoint, target_path, stream, size).await
        {
            let _ = std::fs::remove_file(&temp_file_path);
            return Err(format!("上传失败 {}: {}", filename, e));
        }
        let _ = std::fs::remove_file(&temp_file_path);
    }

    let _ = std::fs::remove_dir_all(&temp_dir);
    record_local_backup_event(&state, &endpoint, &path, "restore-webdav")?;

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

fn normalize_speech_hotkey(raw: &str) -> Option<String> {
    let compact = raw.trim().to_lowercase().replace([' ', '_'], "");
    if matches!(
        compact.as_str(),
        "rightalt" | "right-alt" | "altright" | "alt-right"
    ) {
        return Some("right-alt".to_string());
    }
    if matches!(
        compact.as_str(),
        "leftalt" | "left-alt" | "altleft" | "alt-left"
    ) {
        return Some("left-alt".to_string());
    }
    normalize_global_hotkey(raw)
}

fn is_side_alt_hotkey(raw: &str) -> bool {
    matches!(
        normalize_speech_hotkey(raw).as_deref(),
        Some("right-alt" | "left-alt")
    )
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

fn normalize_local_http_api_bind_address(raw: &str) -> Result<String, String> {
    let normalized = if raw.trim().is_empty() {
        DEFAULT_LOCAL_HTTP_API_BIND_ADDRESS.to_string()
    } else {
        raw.trim().to_string()
    };
    normalized
        .parse::<IpAddr>()
        .map(|ip| ip.to_string())
        .map_err(|err| format!("HTTP API 监听地址无效: {err}"))
}

fn normalize_local_http_api_bind_port(port: u16) -> u16 {
    if port == 0 {
        DEFAULT_LOCAL_HTTP_API_BIND_PORT
    } else {
        port
    }
}

fn is_valid_ai_action_id(value: &str) -> bool {
    let trimmed = value.trim();
    !trimmed.is_empty()
        && trimmed
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || ch == '-' || ch == '_')
}

fn normalize_ai_settings(ai: &mut AiSettings) -> Result<(), String> {
    ai.provider.kind = match ai.provider.kind.trim() {
        "" => "openai_compatible".to_string(),
        "openai_compatible" => "openai_compatible".to_string(),
        other => return Err(format!("不支持的 AI Provider: {other}")),
    };
    ai.provider.base_url = ai
        .provider
        .base_url
        .trim()
        .trim_end_matches('/')
        .to_string();
    ai.provider.api_key = ai.provider.api_key.trim().to_string();
    ai.provider.model = ai.provider.model.trim().to_string();
    if !ai.provider.temperature.is_finite() {
        ai.provider.temperature = AiProviderSettings::default().temperature;
    }
    ai.provider.temperature = ai.provider.temperature.clamp(0.0, 2.0);
    if ai.provider.timeout_secs == 0 {
        ai.provider.timeout_secs = AiProviderSettings::default().timeout_secs;
    }
    ai.provider.timeout_secs = ai.provider.timeout_secs.clamp(5, 300);

    let builtin_actions = AiSettings::default().actions;
    let builtin_ids: HashSet<String> = builtin_actions
        .iter()
        .map(|action| action.id.clone())
        .collect();
    if ai.actions.is_empty() {
        ai.actions = builtin_actions;
    } else {
        let existing_ids: HashSet<String> =
            ai.actions.iter().map(|action| action.id.clone()).collect();
        ai.actions.extend(
            builtin_actions
                .iter()
                .cloned()
                .filter(|action| !existing_ids.contains(&action.id)),
        );
    }
    let mut seen_ids = HashSet::new();
    for action in ai.actions.iter_mut() {
        action.id = action.id.trim().to_string();
        if !is_valid_ai_action_id(&action.id) {
            return Err("AI 动作 ID 无效，只能包含字母、数字、下划线或短横线".to_string());
        }
        if !seen_ids.insert(action.id.clone()) {
            return Err("AI 动作 ID 重复".to_string());
        }
        if builtin_ids.contains(&action.id) {
            action.builtin = true;
        }
        action.name = action.name.trim().to_string();
        if action.name.is_empty() {
            action.name = action.id.clone();
        }
        action.category = action.category.trim().to_string();
        if action.category.is_empty() {
            action.category = "通用".to_string();
        }
        if action.user_prompt.trim().is_empty() {
            return Err(format!("AI 动作 {} 必须填写用户提示词", action.name));
        }
        action.output_mode = match action.output_mode.trim() {
            "" => "preview_replace".to_string(),
            "preview_replace" => "preview_replace".to_string(),
            "preview_insert" => "preview_insert".to_string(),
            other => return Err(format!("不支持的 AI 输出模式: {other}")),
        };
    }
    let default_id = ai.default_action_id.trim().to_string();
    ai.default_action_id = if seen_ids.contains(&default_id) {
        default_id
    } else {
        ai.actions
            .first()
            .map(|action| action.id.clone())
            .unwrap_or_else(|| "polish".to_string())
    };
    Ok(())
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
    let normalized_system_dictation_hotkey =
        normalize_speech_hotkey(&settings.speech_to_text.system_dictation_shortcut);
    if settings.speech_to_text.system_dictation_enabled {
        let Some(hotkey) = normalized_system_dictation_hotkey else {
            return Err("系统听写快捷键格式无效，可填写 right-alt、left-alt 或 Alt+D".to_string());
        };
        if settings.global_hotkey_enabled && hotkey == settings.global_hotkey {
            return Err("系统听写快捷键不能和显示窗口快捷键相同".to_string());
        }
        settings.speech_to_text.system_dictation_shortcut = hotkey;
    } else {
        settings.speech_to_text.system_dictation_shortcut = normalized_system_dictation_hotkey
            .unwrap_or_else(crate::types::default_system_dictation_shortcut);
    }
    let hotkey_raw = settings.send_hotkey.trim().to_lowercase();
    settings.send_hotkey = match hotkey_raw.as_str() {
        DEFAULT_SEND_HOTKEY => DEFAULT_SEND_HOTKEY.to_string(),
        SEND_HOTKEY_CTRL_ENTER => SEND_HOTKEY_CTRL_ENTER.to_string(),
        "ctrl+enter" => SEND_HOTKEY_CTRL_ENTER.to_string(),
        _ => DEFAULT_SEND_HOTKEY.to_string(),
    };
    settings.download_dir = normalize_download_dir(&settings.download_dir, default_download_dir);
    settings.save_filename_rule = normalize_save_filename_rule(&settings.save_filename_rule);

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

    settings.local_http_api.bind_address =
        normalize_local_http_api_bind_address(&settings.local_http_api.bind_address)?;
    settings.local_http_api.bind_port =
        normalize_local_http_api_bind_port(settings.local_http_api.bind_port);

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
    normalize_speech_to_text_settings(&mut settings.speech_to_text)?;
    settings.backup.interval_minutes = settings.backup.interval_minutes.max(5);
    settings.backup.retain_count = settings.backup.retain_count.max(1);
    settings.backup.settings_snapshot_retain_count =
        settings.backup.settings_snapshot_retain_count.max(1);
    if settings.backup.directory.trim().is_empty() {
        settings.backup.directory = BackupSettings::default().directory;
    } else {
        settings.backup.directory = settings.backup.directory.trim().to_string();
    }
    settings.backup.keep_all_days = settings.backup.keep_all_days.max(1);
    settings.backup.keep_daily_days = settings
        .backup
        .keep_daily_days
        .max(settings.backup.keep_all_days);

    normalize_ai_settings(&mut settings.ai)?;

    Ok(settings)
}

fn render_ai_prompt(template: &str, text: &str, format: &str) -> String {
    template
        .replace("{{text}}", text)
        .replace("{{format}}", format)
}

fn split_ai_think_blocks(output: &str) -> (String, Option<String>) {
    let mut rest = output;
    let mut visible = String::new();
    let mut thoughts: Vec<String> = Vec::new();
    loop {
        let lower = rest.to_lowercase();
        let Some(start) = lower.find("<think>") else {
            visible.push_str(rest);
            break;
        };
        visible.push_str(&rest[..start]);
        let content_start = start + "<think>".len();
        let after_start = &rest[content_start..];
        let after_lower = after_start.to_lowercase();
        let Some(end_rel) = after_lower.find("</think>") else {
            thoughts.push(after_start.trim().to_string());
            break;
        };
        let thought = after_start[..end_rel].trim();
        if !thought.is_empty() {
            thoughts.push(thought.to_string());
        }
        rest = &after_start[end_rel + "</think>".len()..];
    }
    let cleaned = visible.trim().to_string();
    let reasoning = thoughts
        .into_iter()
        .filter(|item| !item.trim().is_empty())
        .collect::<Vec<_>>()
        .join("\n\n")
        .trim()
        .to_string();
    let reasoning = if reasoning.is_empty() {
        None
    } else {
        Some(reasoning)
    };
    (cleaned, reasoning)
}

fn normalize_draft_format(format: Option<&str>) -> String {
    match format.unwrap_or("text").trim().to_lowercase().as_str() {
        "markdown" => "markdown".to_string(),
        _ => "text".to_string(),
    }
}

fn chat_completions_url(base_url: &str) -> Result<String, String> {
    let trimmed = base_url.trim().trim_end_matches('/');
    if trimmed.is_empty() {
        return Err("请先填写 AI Provider Base URL".to_string());
    }
    if trimmed.ends_with("/chat/completions") {
        Ok(trimmed.to_string())
    } else {
        Ok(format!("{trimmed}/chat/completions"))
    }
}

fn find_ai_action<'a>(
    settings: &'a AiSettings,
    action_id: &str,
) -> Result<&'a AiTextAction, String> {
    let target_id = action_id.trim();
    settings
        .actions
        .iter()
        .find(|action| action.id == target_id)
        .ok_or_else(|| "AI 动作不存在".to_string())
}

fn resolve_ai_request_action(
    settings: &AiSettings,
    request: &AiTextProcessRequest,
) -> Result<AiTextAction, String> {
    if let Some(prompt) = &request.temporary_prompt {
        let user_prompt = prompt.user_prompt.trim();
        if user_prompt.is_empty() {
            return Err("请先输入提示词".to_string());
        }
        let output_mode = prompt
            .output_mode
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .unwrap_or("preview_replace");
        return Ok(AiTextAction {
            id: "temporary-prompt".to_string(),
            name: prompt
                .name
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .unwrap_or("临时提示词")
                .to_string(),
            category: prompt
                .category
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .unwrap_or("临时")
                .to_string(),
            builtin: false,
            favorite: false,
            enabled: true,
            system_prompt: prompt
                .system_prompt
                .as_deref()
                .map(str::trim)
                .unwrap_or("")
                .to_string(),
            user_prompt: user_prompt.to_string(),
            output_mode: output_mode.to_string(),
        });
    }

    let action_id = request
        .action_id
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "AI 动作不存在".to_string())?;
    let action = find_ai_action(settings, action_id)?.clone();
    if !action.enabled {
        return Err("该 AI 动作已禁用".to_string());
    }
    Ok(action)
}

fn validate_ai_provider(provider: &AiProviderSettings) -> Result<(), String> {
    if provider.base_url.trim().is_empty() {
        return Err("请先填写 AI Provider Base URL".to_string());
    }
    if provider.api_key.trim().is_empty() {
        return Err("请先填写 AI API Key".to_string());
    }
    if provider.model.trim().is_empty() {
        return Err("请先填写 AI 模型".to_string());
    }
    Ok(())
}

fn build_ai_request_messages(
    action: &AiTextAction,
    text: &str,
    format: &str,
) -> Vec<OpenAiCompatibleRequestMessage> {
    let mut messages = Vec::new();
    if !action.system_prompt.trim().is_empty() {
        messages.push(OpenAiCompatibleRequestMessage {
            role: "system".to_string(),
            content: render_ai_prompt(&action.system_prompt, text, format),
        });
    }
    messages.push(OpenAiCompatibleRequestMessage {
        role: "user".to_string(),
        content: render_ai_prompt(&action.user_prompt, text, format),
    });
    messages
}

fn emit_ai_stream_event(app: &AppHandle, payload: AiTextStreamEvent) {
    if let Err(err) = app.emit("ai-text-stream", payload) {
        eprintln!("emit ai text stream event failed: {err}");
    }
}

#[derive(Default)]
struct AiThinkStreamSplitter {
    in_think: bool,
    pending: String,
}

impl AiThinkStreamSplitter {
    fn push(&mut self, delta: &str) -> Vec<(String, String)> {
        split_stream_delta(delta, self)
    }

    fn finish(&mut self) -> Vec<(String, String)> {
        if self.pending.is_empty() {
            return Vec::new();
        }
        let event_type = if self.in_think {
            "reasoning_delta"
        } else {
            "output_delta"
        };
        let delta = std::mem::take(&mut self.pending);
        vec![(event_type.to_string(), delta)]
    }
}

fn trailing_tag_prefix_len(text: &str, tag: &str) -> usize {
    let lower = text.to_lowercase();
    let tag = tag.to_lowercase();
    let max_len = tag.len().saturating_sub(1).min(lower.len());
    (1..=max_len)
        .rev()
        .find(|len| lower.ends_with(&tag[..*len]))
        .unwrap_or(0)
}

fn split_stream_delta(delta: &str, splitter: &mut AiThinkStreamSplitter) -> Vec<(String, String)> {
    let mut combined = String::new();
    combined.push_str(&splitter.pending);
    combined.push_str(delta);
    splitter.pending.clear();

    let mut rest = combined.as_str();
    let mut events = Vec::new();
    while !rest.is_empty() {
        let lower = rest.to_lowercase();
        if splitter.in_think {
            if let Some(end) = lower.find("</think>") {
                let part = &rest[..end];
                if !part.is_empty() {
                    events.push(("reasoning_delta".to_string(), part.to_string()));
                }
                rest = &rest[end + "</think>".len()..];
                splitter.in_think = false;
            } else {
                let pending_len = trailing_tag_prefix_len(rest, "</think>");
                let emit_len = rest.len() - pending_len;
                if emit_len > 0 {
                    events.push(("reasoning_delta".to_string(), rest[..emit_len].to_string()));
                }
                splitter.pending.push_str(&rest[emit_len..]);
                break;
            }
        } else if let Some(start) = lower.find("<think>") {
            let part = &rest[..start];
            if !part.is_empty() {
                events.push(("output_delta".to_string(), part.to_string()));
            }
            rest = &rest[start + "<think>".len()..];
            splitter.in_think = true;
        } else {
            let pending_len = trailing_tag_prefix_len(rest, "<think>");
            let emit_len = rest.len() - pending_len;
            if emit_len > 0 {
                events.push(("output_delta".to_string(), rest[..emit_len].to_string()));
            }
            splitter.pending.push_str(&rest[emit_len..]);
            break;
        }
    }
    events
}

fn emit_ai_stream_deltas(app: &AppHandle, request_id: &str, events: Vec<(String, String)>) {
    for (event_type, delta) in events {
        if delta.is_empty() {
            continue;
        }
        emit_ai_stream_event(
            app,
            AiTextStreamEvent {
                request_id: request_id.to_string(),
                event_type,
                action_id: None,
                action_name: None,
                output_mode: None,
                delta: Some(delta),
                error: None,
            },
        );
    }
}

async fn stream_openai_compatible_text_action(
    app: &AppHandle,
    http: &Client,
    settings: &AiSettings,
    action: &AiTextAction,
    request_id: &str,
    text: &str,
    format: &str,
) -> Result<(), String> {
    use futures_util::StreamExt;

    let provider = &settings.provider;
    validate_ai_provider(provider)?;
    let request = OpenAiCompatibleRequest {
        model: provider.model.clone(),
        messages: build_ai_request_messages(action, text, format),
        temperature: provider.temperature,
        stream: Some(true),
    };
    let url = chat_completions_url(&provider.base_url)?;
    let response = http
        .post(url)
        .bearer_auth(&provider.api_key)
        .timeout(Duration::from_secs(provider.timeout_secs))
        .json(&request)
        .send()
        .await
        .map_err(|err| {
            if err.is_timeout() {
                "AI 请求超时".to_string()
            } else {
                format!("AI 请求失败: {err}")
            }
        })?;
    let status = response.status();
    if !status.is_success() {
        let body = response.text().await.unwrap_or_default();
        let detail = body.trim();
        if detail.is_empty() {
            return Err(format!("AI Provider 返回错误: HTTP {status}"));
        }
        return Err(format!("AI Provider 返回错误: HTTP {status}: {detail}"));
    }

    let mut stream = response.bytes_stream();
    let mut buffer: Vec<u8> = Vec::new();
    let mut splitter = AiThinkStreamSplitter::default();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|err| format!("AI 响应流中断: {err}"))?;
        buffer.extend_from_slice(&chunk);
        while let Some(index) = buffer.iter().position(|byte| *byte == b'\n') {
            let mut line_bytes: Vec<u8> = buffer.drain(..=index).collect();
            line_bytes.pop();
            if line_bytes.last() == Some(&b'\r') {
                line_bytes.pop();
            }
            let line = String::from_utf8(line_bytes)
                .map_err(|err| format!("解析 AI 流式响应编码失败: {err}"))?;
            let line = line.trim();
            if line.is_empty() || line.starts_with(':') {
                continue;
            }
            let Some(data) = line.strip_prefix("data:") else {
                continue;
            };
            let data = data.trim();
            if data == "[DONE]" {
                emit_ai_stream_deltas(app, request_id, splitter.finish());
                return Ok(());
            }
            let parsed: OpenAiCompatibleStreamResponse =
                serde_json::from_str(data).map_err(|err| format!("解析 AI 流式响应失败: {err}"))?;
            for choice in parsed.choices {
                let Some(delta) = choice.delta.content else {
                    continue;
                };
                emit_ai_stream_deltas(app, request_id, splitter.push(&delta));
            }
        }
    }
    emit_ai_stream_deltas(app, request_id, splitter.finish());
    Ok(())
}

async fn call_openai_compatible_text_action(
    http: &Client,
    settings: &AiSettings,
    action: &AiTextAction,
    text: &str,
    format: &str,
) -> Result<String, String> {
    let provider = &settings.provider;
    validate_ai_provider(provider)?;

    let request = OpenAiCompatibleRequest {
        model: provider.model.clone(),
        messages: build_ai_request_messages(action, text, format),
        temperature: provider.temperature,
        stream: None,
    };
    let url = chat_completions_url(&provider.base_url)?;
    let response = http
        .post(url)
        .bearer_auth(&provider.api_key)
        .timeout(Duration::from_secs(provider.timeout_secs))
        .json(&request)
        .send()
        .await
        .map_err(|err| {
            if err.is_timeout() {
                "AI 请求超时".to_string()
            } else {
                format!("AI 请求失败: {err}")
            }
        })?;
    let status = response.status();
    if !status.is_success() {
        let body = response.text().await.unwrap_or_default();
        let detail = body.trim();
        if detail.is_empty() {
            return Err(format!("AI Provider 返回错误: HTTP {status}"));
        }
        return Err(format!("AI Provider 返回错误: HTTP {status}: {detail}"));
    }
    let parsed: OpenAiCompatibleResponse = response
        .json()
        .await
        .map_err(|err| format!("解析 AI 响应失败: {err}"))?;
    let output = parsed
        .choices
        .into_iter()
        .find_map(|choice| choice.message.content)
        .unwrap_or_default()
        .trim()
        .to_string();
    if output.is_empty() {
        return Err("AI 响应为空".to_string());
    }
    Ok(output)
}

async fn process_text_with_ai_impl(
    http: &Client,
    settings: &Settings,
    request: AiTextProcessRequest,
) -> Result<AiTextProcessResult, String> {
    let text = request.text.trim();
    if text.is_empty() {
        return Err("请先输入或选中需要处理的文本".to_string());
    }
    if !settings.ai.enabled {
        return Err("AI 功能未启用，请先在设置中开启".to_string());
    }
    let mut ai_settings = settings.ai.clone();
    normalize_ai_settings(&mut ai_settings)?;
    let action = resolve_ai_request_action(&ai_settings, &request)?;
    let format = normalize_draft_format(request.format.as_deref());
    let raw_output_text = match ai_settings.provider.kind.as_str() {
        "openai_compatible" => {
            call_openai_compatible_text_action(http, &ai_settings, &action, text, &format).await?
        }
        other => return Err(format!("不支持的 AI Provider: {other}")),
    };
    let (output_text, reasoning_text) = split_ai_think_blocks(&raw_output_text);
    if output_text.is_empty() {
        return Err("AI 响应只包含思考过程，没有可应用的正文".to_string());
    }
    Ok(AiTextProcessResult {
        action_id: action.id,
        action_name: action.name,
        output_text,
        reasoning_text,
        output_mode: action.output_mode,
    })
}

fn asr_header(message_type: u8, flags: u8, serialization: u8, compression: u8) -> [u8; 4] {
    [
        (ASR_PROTOCOL_VERSION << 4) | ASR_HEADER_SIZE_WORDS,
        (message_type << 4) | flags,
        (serialization << 4) | compression,
        0,
    ]
}

fn gzip_bytes(data: &[u8]) -> Result<Vec<u8>, String> {
    let mut encoder = GzEncoder::new(Vec::new(), Compression::default());
    encoder
        .write_all(data)
        .map_err(|err| format!("压缩 ASR 数据失败: {err}"))?;
    encoder
        .finish()
        .map_err(|err| format!("结束 ASR 压缩失败: {err}"))
}

fn gunzip_bytes(data: &[u8]) -> Result<Vec<u8>, String> {
    let mut decoder = GzDecoder::new(data);
    let mut decoded = Vec::new();
    decoder
        .read_to_end(&mut decoded)
        .map_err(|err| format!("解压 ASR 响应失败: {err}"))?;
    Ok(decoded)
}

fn build_asr_full_request(sequence: i32, payload: &serde_json::Value) -> Result<Vec<u8>, String> {
    let payload_data =
        serde_json::to_vec(payload).map_err(|err| format!("序列化 ASR 请求失败: {err}"))?;
    let compressed = gzip_bytes(&payload_data)?;
    let mut frame = Vec::with_capacity(12 + compressed.len());
    frame.extend_from_slice(&asr_header(
        ASR_CLIENT_FULL_REQUEST,
        ASR_FLAG_POS_SEQUENCE,
        ASR_SERIALIZATION_JSON,
        ASR_COMPRESSION_GZIP,
    ));
    frame.extend_from_slice(&sequence.to_be_bytes());
    frame.extend_from_slice(&(compressed.len() as u32).to_be_bytes());
    frame.extend_from_slice(&compressed);
    Ok(frame)
}

fn build_asr_audio_request(sequence: i32, audio: &[u8], last: bool) -> Result<Vec<u8>, String> {
    let compressed = gzip_bytes(audio)?;
    let mut frame = Vec::with_capacity(12 + compressed.len());
    frame.extend_from_slice(&asr_header(
        ASR_CLIENT_AUDIO_ONLY_REQUEST,
        if last {
            ASR_FLAG_NEG_WITH_SEQUENCE
        } else {
            ASR_FLAG_POS_SEQUENCE
        },
        ASR_SERIALIZATION_NONE,
        ASR_COMPRESSION_GZIP,
    ));
    let send_sequence = if last {
        -sequence.abs()
    } else {
        sequence.abs()
    };
    frame.extend_from_slice(&send_sequence.to_be_bytes());
    frame.extend_from_slice(&(compressed.len() as u32).to_be_bytes());
    frame.extend_from_slice(&compressed);
    Ok(frame)
}

fn parse_asr_server_frame(data: &[u8]) -> Result<AsrServerFrame, String> {
    if data.len() < 8 {
        return Err("ASR 响应帧过短".to_string());
    }
    let header_size = ((data[0] & 0x0f) as usize) * 4;
    if data.len() < header_size + 4 {
        return Err("ASR 响应头无效".to_string());
    }
    let message_type = data[1] >> 4;
    let flags = data[1] & 0x0f;
    let serialization = data[2] >> 4;
    let compression = data[2] & 0x0f;
    let mut offset = header_size;
    let sequence = if flags == ASR_FLAG_POS_SEQUENCE || flags == ASR_FLAG_NEG_WITH_SEQUENCE {
        if data.len() < offset + 4 {
            return Err("ASR 响应序号缺失".to_string());
        }
        let seq = i32::from_be_bytes(data[offset..offset + 4].try_into().unwrap());
        offset += 4;
        Some(seq)
    } else {
        None
    };
    let error_code = if message_type == ASR_SERVER_ERROR_RESPONSE {
        if data.len() < offset + 4 {
            return Err("ASR 错误响应缺少错误码".to_string());
        }
        let code = i32::from_be_bytes(data[offset..offset + 4].try_into().unwrap());
        offset += 4;
        Some(code)
    } else {
        None
    };
    if data.len() < offset + 4 {
        return Err("ASR 响应缺少 payload 长度".to_string());
    }
    let payload_size = u32::from_be_bytes(data[offset..offset + 4].try_into().unwrap()) as usize;
    offset += 4;
    if data.len() < offset + payload_size {
        return Err("ASR 响应 payload 不完整".to_string());
    }
    let mut payload = data[offset..offset + payload_size].to_vec();
    if compression == ASR_COMPRESSION_GZIP && !payload.is_empty() {
        payload = gunzip_bytes(&payload)?;
    }
    let (payload_json, error_text) =
        if serialization == ASR_SERIALIZATION_JSON && !payload.is_empty() {
            let json: serde_json::Value = serde_json::from_slice(&payload)
                .map_err(|err| format!("解析 ASR JSON 响应失败: {err}"))?;
            let text = if message_type == ASR_SERVER_ERROR_RESPONSE {
                Some(json.to_string())
            } else {
                None
            };
            (Some(json), text)
        } else if !payload.is_empty() {
            (None, Some(String::from_utf8_lossy(&payload).to_string()))
        } else {
            (None, None)
        };
    Ok(AsrServerFrame {
        message_type,
        flags,
        sequence,
        payload: payload_json,
        error_code,
        error_text,
    })
}

fn speech_audio_format(request: &SpeechToTextRequest) -> String {
    if let Some(format) = request.format.as_deref() {
        let normalized = format.trim().to_lowercase();
        if !normalized.is_empty() {
            return normalized;
        }
    }
    let mime = request.mime_type.as_deref().unwrap_or("").to_lowercase();
    if mime.contains("wav") {
        "wav".to_string()
    } else if mime.contains("mpeg") || mime.contains("mp3") {
        "mp3".to_string()
    } else if mime.contains("ogg") {
        "ogg".to_string()
    } else {
        "webm".to_string()
    }
}

fn speech_audio_codec(request: &SpeechToTextRequest) -> String {
    let format = speech_audio_format(request);
    let mime = request.mime_type.as_deref().unwrap_or("").to_lowercase();
    if format == "ogg" || format == "webm" || mime.contains("opus") {
        "opus".to_string()
    } else {
        "raw".to_string()
    }
}

fn extract_asr_text(payload: &serde_json::Value) -> Option<String> {
    payload
        .get("result")
        .and_then(|result| result.get("text"))
        .and_then(|text| text.as_str())
        .map(|text| text.trim().to_string())
        .filter(|text| !text.is_empty())
}

fn extract_asr_log_id(payload: &serde_json::Value) -> Option<String> {
    payload
        .get("result")
        .and_then(|result| result.get("additions"))
        .and_then(|additions| additions.get("log_id"))
        .and_then(|value| value.as_str())
        .map(|value| value.to_string())
}

fn sanitize_speech_error(err: impl ToString, settings: &SpeechToTextSettings) -> String {
    let mut text = err.to_string();
    if !settings.api_key.is_empty() {
        text = text.replace(&settings.api_key, "[redacted]");
    }
    text
}

fn speech_log_text_preview(text: &str) -> String {
    const MAX_CHARS: usize = 120;
    let mut preview: String = text.chars().take(MAX_CHARS).collect();
    if text.chars().count() > MAX_CHARS {
        preview.push_str("...");
    }
    preview.replace('\n', "\\n")
}

async fn transcribe_speech_impl(
    settings: &Settings,
    request: SpeechToTextRequest,
) -> Result<SpeechToTextResult, String> {
    let total_started_at = std::time::Instant::now();
    let speech = &settings.speech_to_text;
    if !speech.enabled {
        return Err("语音转文字未启用，请先在设置中开启".to_string());
    }
    if request.audio_data.is_empty() {
        return Err("没有可识别的录音数据".to_string());
    }
    let mut speech_config = speech.clone();
    normalize_speech_to_text_settings(&mut speech_config)?;
    let request_audio_format = speech_audio_format(&request);
    let request_audio_codec = speech_audio_codec(&request);
    let request_sample_rate = request.sample_rate.unwrap_or(16000);
    let request_channels = request.channels.unwrap_or(1);
    let request_bits = request.bits_per_sample.unwrap_or(16);
    let estimated_audio_payload_bytes = if request_audio_format.eq_ignore_ascii_case("wav") {
        request.audio_data.len().saturating_sub(44)
    } else {
        request.audio_data.len()
    };
    let estimated_duration_ms = if request_sample_rate > 0 && request_bits > 0 && request_channels > 0 {
        let bytes_per_second = request_sample_rate as u64
            * request_channels as u64
            * request_bits as u64
            / 8;
        if bytes_per_second > 0 {
            Some((estimated_audio_payload_bytes as u64).saturating_mul(1000) / bytes_per_second)
        } else {
            None
        }
    } else {
        None
    };
    let mut ws_request = speech_config
        .endpoint
        .as_str()
        .into_client_request()
        .map_err(|err| {
            sanitize_speech_error(format!("创建 ASR 请求失败: {err}"), &speech_config)
        })?;
    let connect_id = format!("speech-{}", now_ms());
    ws_request.headers_mut().insert(
        "X-Api-Key",
        speech_config
            .api_key
            .parse()
            .map_err(|_| "语音 API Key 无效".to_string())?,
    );
    ws_request.headers_mut().insert(
        "X-Api-Resource-Id",
        speech_config
            .resource_id
            .parse()
            .map_err(|_| "语音 Resource ID 无效".to_string())?,
    );
    ws_request.headers_mut().insert(
        "X-Api-Connect-Id",
        connect_id
            .parse()
            .map_err(|_| "语音连接 ID 无效".to_string())?,
    );
    ws_request.headers_mut().insert(
        "X-Control-Require-Usage-Tokens-Return",
        "*".parse().unwrap(),
    );
    eprintln!(
        "[speech-to-text] start connect_id={} audio_bytes={} payload_bytes={} duration_ms={} format={} codec={} sample_rate={} channels={} bits={} mime_type={}",
        connect_id,
        request.audio_data.len(),
        estimated_audio_payload_bytes,
        estimated_duration_ms
            .map(|value| value.to_string())
            .unwrap_or_else(|| "unknown".to_string()),
        request_audio_format,
        request_audio_codec,
        request_sample_rate,
        request_channels,
        request_bits,
        request.mime_type.as_deref().unwrap_or(""),
    );
    let connect_started_at = std::time::Instant::now();
    let (mut websocket, response) = connect_async(ws_request).await.map_err(|err| {
        sanitize_speech_error(format!("连接 ASR 服务失败: {err}"), &speech_config)
    })?;
    let connect_ms = connect_started_at.elapsed().as_millis();
    eprintln!(
        "[speech-to-text] connected connect_id={} connect_ms={}",
        connect_id, connect_ms
    );
    let response_log_id = response
        .headers()
        .get("x-tt-logid")
        .and_then(|value| value.to_str().ok())
        .map(|value| value.to_string());

    let full_request = serde_json::json!({
        "user": { "uid": "transfer-genie" },
        "audio": {
            "format": request_audio_format,
            "codec": request_audio_codec,
            "rate": request_sample_rate,
            "bits": request_bits,
            "channel": request_channels,
            "language": "zh-CN"
        },
        "request": {
            "model_name": "bigmodel",
            "enable_itn": true,
            "enable_punc": true,
            "enable_ddc": false,
            "show_utterances": true,
            "result_type": "full"
        }
    });
    let send_config_started_at = std::time::Instant::now();
    websocket
        .send(WsMessage::Binary(build_asr_full_request(1, &full_request)?))
        .await
        .map_err(|err| {
            sanitize_speech_error(format!("发送 ASR 请求失败: {err}"), &speech_config)
        })?;
    let send_config_ms = send_config_started_at.elapsed().as_millis();
    eprintln!(
        "[speech-to-text] sent config connect_id={} send_config_ms={}",
        connect_id, send_config_ms
    );

    let chunk_size = 16 * 1024;
    let mut sequence = 2_i32;
    let audio_bytes = request.audio_data.len();
    let audio_frame_count = request.audio_data.chunks(chunk_size).count();
    let send_audio_started_at = std::time::Instant::now();
    for (index, chunk) in request.audio_data.chunks(chunk_size).enumerate() {
        let last = (index + 1) * chunk_size >= request.audio_data.len();
        websocket
            .send(WsMessage::Binary(build_asr_audio_request(
                sequence, chunk, last,
            )?))
            .await
            .map_err(|err| {
                sanitize_speech_error(format!("发送 ASR 音频失败: {err}"), &speech_config)
        })?;
        sequence += 1;
    }
    let send_audio_ms = send_audio_started_at.elapsed().as_millis();
    eprintln!(
        "[speech-to-text] sent audio connect_id={} frames={} send_audio_ms={}",
        connect_id, audio_frame_count, send_audio_ms
    );

    let mut final_text = String::new();
    let mut log_id = response_log_id;
    let wait_result_started_at = std::time::Instant::now();
    let mut response_frame_count = 0_u64;
    let asr_wait_timeout = Duration::from_secs(25);
    loop {
        let message = match tokio::time::timeout(asr_wait_timeout, websocket.next()).await {
            Ok(Some(message)) => message,
            Ok(None) => break,
            Err(_) => {
                eprintln!(
                    "[speech-to-text] wait result timeout connect_id={} response_frames={} wait_result_ms={}",
                    connect_id,
                    response_frame_count,
                    wait_result_started_at.elapsed().as_millis(),
                );
                return Err("ASR 等待结果超时，请稍后重试".to_string());
            }
        };
        let message = message.map_err(|err| {
            sanitize_speech_error(format!("读取 ASR 响应失败: {err}"), &speech_config)
        })?;
        match message {
            WsMessage::Binary(data) => {
                response_frame_count += 1;
                let frame = parse_asr_server_frame(&data)?;
                if frame.message_type == ASR_SERVER_ERROR_RESPONSE {
                    eprintln!(
                        "[speech-to-text] asr error connect_id={} code={} text={}",
                        connect_id,
                        frame
                            .error_code
                            .map(|code| code.to_string())
                            .unwrap_or_else(|| "unknown".to_string()),
                        frame
                            .error_text
                            .as_deref()
                            .map(speech_log_text_preview)
                            .unwrap_or_default(),
                    );
                    return Err(format!(
                        "ASR 服务返回错误{}{}",
                        frame
                            .error_code
                            .map(|code| format!(" {code}"))
                            .unwrap_or_default(),
                        frame
                            .error_text
                            .as_deref()
                            .map(|text| format!(": {text}"))
                            .unwrap_or_default()
                    ));
                }
                if let Some(payload) = frame.payload.as_ref() {
                    if log_id.is_none() {
                        log_id = extract_asr_log_id(payload);
                    }
                    if let Some(text) = extract_asr_text(payload) {
                        final_text = text;
                    }
                }
                if frame.flags == ASR_FLAG_NEG_WITH_SEQUENCE
                    || frame.sequence.is_some_and(|seq| seq < 0)
                {
                    break;
                }
            }
            WsMessage::Close(_) => break,
            _ => {}
        }
    }
    let wait_result_ms = wait_result_started_at.elapsed().as_millis();
    if final_text.trim().is_empty() {
        eprintln!(
            "[speech-to-text] empty result connect_id={} response_frames={} wait_result_ms={}",
            connect_id, response_frame_count, wait_result_ms
        );
        return Err("ASR 未返回可用文本".to_string());
    }
    eprintln!(
        "[speech-to-text] result connect_id={} response_frames={} total_ms={} connect_ms={} send_config_ms={} send_audio_ms={} wait_result_ms={} text_chars={} text_preview=\"{}\" log_id={}",
        connect_id,
        response_frame_count,
        total_started_at.elapsed().as_millis(),
        connect_ms,
        send_config_ms,
        send_audio_ms,
        wait_result_ms,
        final_text.chars().count(),
        speech_log_text_preview(&final_text),
        log_id.as_deref().unwrap_or(""),
    );
    Ok(SpeechToTextResult {
        text: final_text,
        log_id,
        timing: SpeechToTextTiming {
            total_ms: total_started_at.elapsed().as_millis(),
            connect_ms,
            send_config_ms,
            send_audio_ms,
            wait_result_ms,
            audio_bytes,
        },
    })
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
    let ai = if settings.ai.provider.api_key.is_empty() {
        None
    } else {
        Some(ExportAiSecret {
            api_key: settings.ai.provider.api_key.clone(),
        })
    };
    let speech_to_text = if settings.speech_to_text.api_key.is_empty() {
        None
    } else {
        Some(ExportSpeechToTextSecret {
            api_key: settings.speech_to_text.api_key.clone(),
        })
    };
    ExportSecrets {
        endpoints,
        telegram,
        ai,
        speech_to_text,
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
    if let Some(ai) = secrets.ai {
        settings.ai.provider.api_key = ai.api_key;
    }
    if let Some(speech_to_text) = secrets.speech_to_text {
        settings.speech_to_text.api_key = speech_to_text.api_key;
    }
    Ok(())
}

fn normalize_speech_to_text_settings(settings: &mut SpeechToTextSettings) -> Result<(), String> {
    settings.provider_kind = match settings.provider_kind.trim() {
        "" => "volcengine_agent_plan".to_string(),
        value => value.to_string(),
    };
    if settings.provider_kind != "volcengine_agent_plan" {
        return Err("语音转文字 Provider 类型无效".to_string());
    }
    settings.api_key = settings.api_key.trim().to_string();
    settings.resource_id = if settings.resource_id.trim().is_empty() {
        crate::types::default_speech_to_text_resource_id()
    } else {
        settings.resource_id.trim().to_string()
    };
    settings.endpoint = if settings.endpoint.trim().is_empty() {
        crate::types::default_speech_to_text_endpoint()
    } else {
        settings.endpoint.trim().to_string()
    };
    if !settings
        .endpoint
        .starts_with("wss://openspeech.bytedance.com/api/v3/plan/sauc/")
    {
        return Err("语音转文字接口地址无效，需要使用 Agent Plan ASR WebSocket 地址".to_string());
    }
    if settings.enabled {
        if settings.api_key.is_empty() {
            return Err("启用语音转文字前请先填写 API Key".to_string());
        }
        if settings.resource_id.is_empty() {
            return Err("启用语音转文字前请先填写 Resource ID".to_string());
        }
    }
    settings.shortcut_enabled = false;
    settings.shortcut = crate::types::default_speech_to_text_shortcut();
    if settings.max_duration_secs == 0 {
        settings.max_duration_secs = crate::types::default_speech_to_text_max_duration_secs();
    }
    settings.task_retention_count = settings.task_retention_count.clamp(1, 100);
    settings.cue_sound_kind = match settings.cue_sound_kind.trim() {
        "" => crate::types::default_speech_to_text_cue_sound_kind(),
        value => match value {
            "system" | "soft" | "none" => value.to_string(),
            _ => crate::types::default_speech_to_text_cue_sound_kind(),
        },
    };
    settings.microphone_device_id = settings.microphone_device_id.trim().to_string();
    settings.system_audio_device_id = settings.system_audio_device_id.trim().to_string();
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
    let layout = WorkspaceLayout::new(base.clone());
    Ok(layout.settings_path(&base))
}

fn db_path(app_handle: &AppHandle) -> Result<PathBuf, String> {
    let base = app_handle
        .path()
        .app_data_dir()
        .map_err(|err| format!("无法定位应用数据目录: {err}"))?;
    let layout = WorkspaceLayout::new(base.clone());
    Ok(layout.db_path(&base))
}

fn files_base_dir(app_handle: &AppHandle) -> Result<PathBuf, String> {
    let base = app_handle
        .path()
        .app_data_dir()
        .map_err(|err| format!("无法定位应用数据目录: {err}"))?;
    let layout = WorkspaceLayout::new(base);
    Ok(layout.endpoints_dir())
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

fn normalize_save_filename_rule(raw: &str) -> String {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        crate::types::default_save_filename_rule()
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
                save_filename_rule: crate::types::default_save_filename_rule(),
                global_hotkey_enabled: true,
                global_hotkey: DEFAULT_GLOBAL_HOTKEY.to_string(),
                send_hotkey: DEFAULT_SEND_HOTKEY.to_string(),
                auto_start: false,
                auto_update_enabled: false,
                local_http_api: LocalHttpApiSettings::default(),
                send: SendSettings::default(),
                backup: BackupSettings::default(),
                telegram: TelegramBridgeSettings::default(),
                ai: AiSettings::default(),
                speech_to_text: SpeechToTextSettings::default(),
            }
        };
        let normalized = normalize_settings(settings, fallback_download_dir)?;
        write_settings_audited(path, &normalized)?;
        Ok(normalized)
    } else {
        let settings = Settings {
            webdav_endpoints: Vec::new(),
            active_webdav_id: None,
            sender_name: random_sender_name(),
            refresh_interval_secs: 5,
            download_dir: normalize_download_dir("", fallback_download_dir),
            save_filename_rule: crate::types::default_save_filename_rule(),
            global_hotkey_enabled: true,
            global_hotkey: DEFAULT_GLOBAL_HOTKEY.to_string(),
            send_hotkey: DEFAULT_SEND_HOTKEY.to_string(),
            auto_start: false,
            auto_update_enabled: false,
            local_http_api: LocalHttpApiSettings::default(),
            send: SendSettings::default(),
            backup: BackupSettings::default(),
            telegram: TelegramBridgeSettings::default(),
            ai: AiSettings::default(),
            speech_to_text: SpeechToTextSettings::default(),
        };
        write_settings_audited(path, &settings)?;
        Ok(settings)
    }
}

fn write_settings_audited(path: &Path, settings: &Settings) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|err| format!("创建配置目录失败: {err}"))?;
    }
    let app_data_dir = path.parent().unwrap_or_else(|| Path::new("."));
    let audit_root = app_data_dir.join(workspace::WORKSPACE_DIR_NAME);
    workspace::write_json_with_audit_at(
        path,
        settings,
        Some(&audit_root),
        "settings",
        "write-settings",
    )?;
    workspace::prune_snapshots_for_target(
        &audit_root,
        path,
        "settings",
        settings.backup.settings_snapshot_retain_count as usize,
    )
}

#[allow(dead_code)]
fn write_settings(path: &Path, settings: &Settings) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|err| format!("创建配置目录失败: {err}"))?;
    }
    let data =
        serde_json::to_string_pretty(settings).map_err(|err| format!("序列化设置失败: {err}"))?;
    fs::write(path, data).map_err(|err| format!("写入设置失败: {err}"))?;
    Ok(())
}

fn updater_runtime_config(app: &AppHandle) -> Result<UpdaterPluginRuntimeConfig, String> {
    let value = app
        .config()
        .plugins
        .0
        .get("updater")
        .cloned()
        .ok_or_else(|| "未找到 updater 配置".to_string())?;
    serde_json::from_value(value).map_err(|err| format!("解析 updater 配置失败: {err}"))
}

fn ensure_updater_is_configured(app: &AppHandle) -> Result<(), String> {
    let config = updater_runtime_config(app)?;
    let endpoints_ready = !config.endpoints.is_empty()
        && config.endpoints.iter().all(|endpoint| {
            let trimmed = endpoint.trim();
            !trimmed.is_empty() && trimmed != DEFAULT_UPDATER_ENDPOINT
        });
    let pubkey_ready = {
        let trimmed = config.pubkey.trim();
        !trimmed.is_empty() && trimmed != DEFAULT_UPDATER_PUBKEY
    };
    if endpoints_ready && pubkey_ready {
        Ok(())
    } else {
        Err(
            "更新功能尚未完成发布配置，请先在 tauri.conf.json 中填写 GitHub Releases 地址和 updater 公钥。"
                .to_string(),
        )
    }
}

#[cfg(desktop)]
async fn check_app_update_impl(app: &AppHandle) -> Result<AppUpdateCheckResult, String> {
    use time::format_description::well_known::Rfc3339;

    ensure_updater_is_configured(app)?;

    let current_version = app.package_info().version.to_string();
    let updater = app
        .updater_builder()
        .build()
        .map_err(|err| format!("初始化更新器失败: {err}"))?;
    let update = updater
        .check()
        .await
        .map_err(|err| format!("检查更新失败: {err}"))?;

    let update = match update {
        Some(update) => {
            let pub_date = update
                .date
                .map(|date| {
                    date.format(&Rfc3339)
                        .map_err(|err| format!("格式化更新时间失败: {err}"))
                })
                .transpose()?;
            Some(AppUpdateSummary {
                version: update.version,
                current_version: update.current_version,
                notes: update.body,
                pub_date,
                target: update.target,
                download_url: update.download_url.to_string(),
            })
        }
        None => None,
    };

    Ok(AppUpdateCheckResult {
        available: update.is_some(),
        current_version,
        update,
    })
}

#[cfg(not(desktop))]
async fn check_app_update_impl(_app: &AppHandle) -> Result<AppUpdateCheckResult, String> {
    Err("当前平台不支持应用内更新".to_string())
}

fn emit_app_update_event(app: &AppHandle, payload: AppUpdateEventPayload) {
    if let Err(err) = app.emit(APP_UPDATE_EVENT, payload) {
        eprintln!("emit updater event failed: {err}");
    }
}

#[cfg(desktop)]
async fn download_and_install_update_impl(app: &AppHandle) -> Result<(), String> {
    ensure_updater_is_configured(app)?;

    let updater = app
        .updater_builder()
        .build()
        .map_err(|err| format!("初始化更新器失败: {err}"))?;
    let update = updater
        .check()
        .await
        .map_err(|err| format!("检查更新失败: {err}"))?
        .ok_or_else(|| "当前已是最新版本，无需更新".to_string())?;

    let mut first_chunk = true;
    let mut downloaded_bytes = 0_u64;
    let app_handle = app.clone();

    update
        .download_and_install(
            move |chunk_length, content_length| {
                downloaded_bytes = downloaded_bytes.saturating_add(chunk_length as u64);
                if first_chunk {
                    first_chunk = false;
                    emit_app_update_event(
                        &app_handle,
                        AppUpdateEventPayload {
                            stage: "download_started".to_string(),
                            downloaded_bytes: Some(0),
                            chunk_length: None,
                            content_length,
                            message: Some("开始下载更新".to_string()),
                        },
                    );
                }
                emit_app_update_event(
                    &app_handle,
                    AppUpdateEventPayload {
                        stage: "download_progress".to_string(),
                        downloaded_bytes: Some(downloaded_bytes),
                        chunk_length: Some(chunk_length as u64),
                        content_length,
                        message: None,
                    },
                );
            },
            {
                let app_handle = app.clone();
                move || {
                    emit_app_update_event(
                        &app_handle,
                        AppUpdateEventPayload {
                            stage: "download_finished".to_string(),
                            downloaded_bytes: None,
                            chunk_length: None,
                            content_length: None,
                            message: Some("下载完成，正在安装更新".to_string()),
                        },
                    );
                }
            },
        )
        .await
        .map_err(|err| {
            emit_app_update_event(
                app,
                AppUpdateEventPayload {
                    stage: "failed".to_string(),
                    downloaded_bytes: None,
                    chunk_length: None,
                    content_length: None,
                    message: Some(format!("安装更新失败: {err}")),
                },
            );
            format!("安装更新失败: {err}")
        })?;

    emit_app_update_event(
        app,
        AppUpdateEventPayload {
            stage: "installed".to_string(),
            downloaded_bytes: None,
            chunk_length: None,
            content_length: None,
            message: Some("更新已安装完成".to_string()),
        },
    );

    Ok(())
}

#[cfg(not(desktop))]
async fn download_and_install_update_impl(_app: &AppHandle) -> Result<(), String> {
    Err("当前平台不支持应用内更新".to_string())
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
    settings.telegram.auto_start
        && crate::telegram_bridge_runtime::telegram_bridge_launch_config_is_valid(settings)
}

fn is_telegram_bridge_running(state: &AppState) -> Result<bool, String> {
    let mut manager = state
        .telegram_bridge
        .lock()
        .map_err(|_| "读取 Telegram bridge 状态失败".to_string())?;
    crate::telegram_bridge_runtime::refresh_telegram_bridge_manager(&mut manager);
    Ok(crate::telegram_bridge_runtime::telegram_bridge_is_running(
        &manager,
    ))
}

fn record_telegram_bridge_restart_failure(state: &AppState, err: String) {
    if let Ok(mut manager) = state.telegram_bridge.lock() {
        crate::telegram_bridge_runtime::mark_start_failure(&mut manager, err);
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

/*
fn telegram_bridge_dir(state: &AppState) -> PathBuf {
    let app_data_dir = state
        .settings_path
        .parent()
        .unwrap_or_else(|| Path::new("."))
        .to_path_buf();
    WorkspaceLayout::new(app_data_dir).plugin_dir(MODULE_ID_TELEGRAM_BRIDGE)
}

#[allow(dead_code)]
fn telegram_bridge_exit_message(status: ExitStatus) -> Option<String> {
    if status.success() {
        None
    } else if let Some(code) = status.code() {
        Some(format!("Telegram bridge 已退出，退出码 {code}"))
    } else {
        Some("Telegram bridge 已异常退出".to_string())
    }
}

#[allow(unused_mut)]
#[allow(dead_code)]
fn finish_telegram_bridge_process(
    manager: &mut TelegramBridgeManager,
    mut process: ManagedTelegramBridgeProcess,
    last_error: Option<String>,
) {
    crate::telegram_bridge_runtime::finish_telegram_bridge_process(manager, process, last_error);
}

#[allow(unreachable_code)]
#[allow(dead_code)]
fn refresh_telegram_bridge_manager(manager: &mut TelegramBridgeManager) {
    crate::telegram_bridge_runtime::refresh_telegram_bridge_manager(manager);
    return;
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

*/
#[allow(unreachable_code)]
fn telegram_bridge_status(state: &AppState) -> Result<TelegramBridgeStatus, String> {
    return crate::telegram_bridge_runtime::telegram_bridge_status_for_state(state);
    /*
    let mut manager = state
        .telegram_bridge
        .lock()
        .map_err(|_| "读取 Telegram bridge 状态失败".to_string())?;
    crate::telegram_bridge_runtime::refresh_telegram_bridge_manager(&mut manager);
    let status = telegram_bridge_status_from_manager(&manager);
    drop(manager);
    let _ = persist_integration_module_statuses(state);
    Ok(status)
    */
}

async fn start_telegram_bridge_impl(state: &AppState) -> Result<TelegramBridgeStatus, String> {
    crate::telegram_bridge_runtime::start_telegram_bridge_for_state(state, TELEGRAM_BRIDGE_ARG)
        .await
}

fn stop_telegram_bridge_impl(state: &AppState) -> Result<TelegramBridgeStatus, String> {
    crate::telegram_bridge_runtime::stop_telegram_bridge_for_state(state)
}

/*
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

fn write_telegram_bridge_runtime_config_audited(
    launch: &PreparedTelegramBridgeLaunch,
) -> Result<(), String> {
    ensure_parent_dir(&launch.runtime_config_path)?;
    workspace::write_bytes_with_audit_at(
        &launch.runtime_config_path,
        launch.runtime_config_data.as_bytes(),
        None,
        "telegram-bridge-runtime",
        "write-runtime-config",
    )
}

#[allow(dead_code)]
fn write_telegram_bridge_runtime_config(
    launch: &PreparedTelegramBridgeLaunch,
) -> Result<(), String> {
    ensure_parent_dir(&launch.runtime_config_path)?;
    fs::write(&launch.runtime_config_path, &launch.runtime_config_data)
        .map_err(|err| format!("写入 Telegram bridge 运行配置失败: {err}"))
}

#[allow(dead_code, unreachable_code)]
fn spawn_telegram_bridge_process(
    runtime_config_path: &Path,
) -> Result<ManagedTelegramBridgeProcess, String> {
    return crate::telegram_bridge_runtime::spawn_telegram_bridge_process(
        TELEGRAM_BRIDGE_ARG,
        runtime_config_path,
    );
    let current_exe =
        env::current_exe().map_err(|err| format!("定位主程序可执行文件失败: {err}"))?;
    let child = Command::new(&current_exe)
        .arg(TELEGRAM_BRIDGE_ARG)
        .arg(runtime_config_path)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn()
        .map_err(|err| format!("启动 Telegram bridge 失败: {err}"))?;

    Ok(ManagedTelegramBridgeProcess {
        child,
        runtime_config_path: runtime_config_path.to_path_buf(),
    })
}

#[allow(unreachable_code)]
async fn start_telegram_bridge_impl(state: &AppState) -> Result<TelegramBridgeStatus, String> {
    return crate::telegram_bridge_runtime::start_telegram_bridge_for_state(
        state,
        TELEGRAM_BRIDGE_ARG,
    )
    .await;
    let launch = prepare_telegram_bridge_launch(state).await?;
    let mut manager = state
        .telegram_bridge
        .lock()
        .map_err(|_| "更新 Telegram bridge 状态失败".to_string())?;
    crate::telegram_bridge_runtime::refresh_telegram_bridge_manager(&mut manager);
    if crate::telegram_bridge_runtime::telegram_bridge_is_running(&manager) {
        return Ok(telegram_bridge_status_from_manager(&manager));
    }

    write_telegram_bridge_runtime_config_audited(&launch)?;
    let process = match crate::telegram_bridge_runtime::spawn_telegram_bridge_process(
        TELEGRAM_BRIDGE_ARG,
        &launch.runtime_config_path,
    ) {
        Ok(process) => process,
        Err(err) => {
            let _ = fs::remove_file(&launch.runtime_config_path);
            crate::telegram_bridge_runtime::mark_start_failure(&mut manager, err.clone());
            return Err(err);
        }
    };

    crate::telegram_bridge_runtime::attach_started_process(&mut manager, process);
    std::thread::sleep(Duration::from_millis(350));
    crate::telegram_bridge_runtime::refresh_telegram_bridge_manager(&mut manager);
    if !crate::telegram_bridge_runtime::telegram_bridge_is_running(&manager) {
        let err = manager
            .last_error
            .clone()
            .unwrap_or_else(|| "Telegram bridge 启动失败".to_string());
        return Err(err);
    }
    let status = telegram_bridge_status_from_manager(&manager);
    drop(manager);
    let _ = persist_integration_module_statuses(state);
    Ok(status)
}

#[allow(unreachable_code)]
fn stop_telegram_bridge_impl(state: &AppState) -> Result<TelegramBridgeStatus, String> {
    return crate::telegram_bridge_runtime::stop_telegram_bridge_for_state(state);
    let mut manager = state
        .telegram_bridge
        .lock()
        .map_err(|_| "更新 Telegram bridge 状态失败".to_string())?;
    crate::telegram_bridge_runtime::refresh_telegram_bridge_manager(&mut manager);
    crate::telegram_bridge_runtime::stop_active_process(&mut manager);
    let status = telegram_bridge_status_from_manager(&manager);
    drop(manager);
    let _ = persist_integration_module_statuses(state);
    Ok(status)
}

*/
fn local_http_api_socket_addr(settings: &LocalHttpApiSettings) -> Result<SocketAddr, String> {
    let bind_address = normalize_local_http_api_bind_address(&settings.bind_address)?;
    let bind_port = normalize_local_http_api_bind_port(settings.bind_port);
    let ip = bind_address
        .parse::<IpAddr>()
        .map_err(|err| format!("HTTP API 监听地址无效: {err}"))?;
    Ok(SocketAddr::new(ip, bind_port))
}

fn local_http_api_url(bind_address: &str, bind_port: u16) -> String {
    match bind_address.parse::<IpAddr>() {
        Ok(IpAddr::V6(_)) => format!("http://[{bind_address}]:{bind_port}{LOCAL_HTTP_API_ROUTE}"),
        _ => format!("http://{bind_address}:{bind_port}{LOCAL_HTTP_API_ROUTE}"),
    }
}

fn refresh_local_http_api_manager(manager: &mut LocalHttpApiManager) {
    if manager.task.is_none() {
        manager.shutdown_tx = None;
        if matches!(manager.state, LocalHttpApiState::Running) {
            manager.state = LocalHttpApiState::StartFailed;
            if manager.last_error.is_none() {
                manager.last_error = Some("本机 HTTP 接口已停止".to_string());
            }
        }
    }
}

fn local_http_api_status_from_manager(manager: &LocalHttpApiManager) -> LocalHttpApiStatus {
    LocalHttpApiStatus {
        state: manager.state.clone(),
        address: if matches!(manager.state, LocalHttpApiState::Running) {
            Some(local_http_api_url(&manager.bind_address, manager.bind_port))
        } else {
            None
        },
        last_error: manager.last_error.clone(),
    }
}

fn local_http_api_status(state: &AppState) -> Result<LocalHttpApiStatus, String> {
    let mut manager = state
        .local_http_api
        .lock()
        .map_err(|_| "读取本机 HTTP 接口状态失败".to_string())?;
    refresh_local_http_api_manager(&mut manager);
    Ok(local_http_api_status_from_manager(&manager))
}

fn should_auto_start_local_http_api(settings: &Settings) -> bool {
    settings.local_http_api.enabled
}

fn record_local_http_api_start_failure(state: &AppState, err: String) {
    if let Ok(mut manager) = state.local_http_api.lock() {
        manager.state = LocalHttpApiState::StartFailed;
        manager.last_error = Some(err);
        manager.shutdown_tx = None;
        manager.task = None;
    }
}

async fn local_http_api_send_file(
    AxumState(context): AxumState<LocalHttpApiContext>,
    mut multipart: Multipart,
) -> Result<Json<LocalHttpApiSendResponse>, LocalHttpApiError> {
    use std::io::Write;

    let mut uploaded_name = None;
    let mut uploaded_path = None;
    let mut marked_options = None;

    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|err| LocalHttpApiError::bad_request(format!("????????: {err}")))?
    {
        let field_name = field.name().map(str::to_owned);
        let file_name = field
            .file_name()
            .map(str::trim)
            .filter(|name| !name.is_empty())
            .map(ToOwned::to_owned);

        if field_name.as_deref() == Some("markedOptions") {
            let raw = field.text().await.map_err(|err| {
                LocalHttpApiError::bad_request(format!("?? markedOptions ??: {err}"))
            })?;
            marked_options = Some(
                parse_local_http_marked_options_json(&raw)
                    .map_err(LocalHttpApiError::bad_request)?,
            );
            continue;
        }

        if let Some(file_name) = file_name {
            if uploaded_name.is_some() {
                continue;
            }
            let temp_path =
                create_upload_temp_path(&file_name).map_err(LocalHttpApiError::internal)?;
            let mut temp_file = std::fs::File::create(&temp_path)
                .map_err(|err| LocalHttpApiError::internal(format!("??????????: {err}")))?;
            let mut field = field;
            while let Some(chunk) = field
                .chunk()
                .await
                .map_err(|err| LocalHttpApiError::bad_request(format!("????????: {err}")))?
            {
                temp_file
                    .write_all(&chunk)
                    .map_err(|err| LocalHttpApiError::internal(format!("??????????: {err}")))?;
            }
            uploaded_name = Some(file_name);
            uploaded_path = Some(temp_path);
        }
    }

    let original_name = uploaded_name.ok_or_else(|| LocalHttpApiError::bad_request("????????"))?;
    let temp_path = uploaded_path.ok_or_else(|| LocalHttpApiError::bad_request("????????"))?;

    let state = context.app_handle.state::<AppState>();
    let marked_options = resolve_local_http_marked_options(&state, marked_options)
        .await
        .map_err(LocalHttpApiError::bad_request)?;
    let result = send_file_path_impl(
        &state,
        None,
        &temp_path,
        original_name,
        None,
        marked_options,
    )
    .await;
    cleanup_upload_temp_path(&temp_path);
    let result = result.map_err(LocalHttpApiError::internal)?;

    Ok(Json(LocalHttpApiSendResponse {
        status: "ok",
        result,
    }))
}

async fn local_http_api_send_text(
    AxumState(context): AxumState<LocalHttpApiContext>,
    body: Bytes,
) -> Result<Json<LocalHttpApiSendResponse>, LocalHttpApiError> {
    let payload =
        parse_local_http_send_text_request_json(&body).map_err(LocalHttpApiError::bad_request)?;
    let format =
        normalize_send_text_format(payload.format).map_err(LocalHttpApiError::bad_request)?;
    let state = context.app_handle.state::<AppState>();
    let marked_options = resolve_local_http_marked_options(&state, payload.marked_options)
        .await
        .map_err(LocalHttpApiError::bad_request)?;
    let result = send_text_impl(&state, payload.text, Some(format), marked_options)
        .await
        .map_err(|err| LocalHttpApiError::internal(err))?;

    Ok(Json(LocalHttpApiSendResponse {
        status: "ok",
        result,
    }))
}

async fn start_local_http_api_impl(
    app_handle: &AppHandle,
    state: &AppState,
    settings: &LocalHttpApiSettings,
) -> Result<LocalHttpApiStatus, String> {
    let socket_addr = local_http_api_socket_addr(settings)?;
    let bind_address = normalize_local_http_api_bind_address(&settings.bind_address)?;
    let bind_port = normalize_local_http_api_bind_port(settings.bind_port);
    let mut previous_shutdown: Option<oneshot::Sender<()>> = None;
    let mut previous_task: Option<tauri::async_runtime::JoinHandle<()>> = None;
    {
        let mut manager = state
            .local_http_api
            .lock()
            .map_err(|_| "更新本机 HTTP 接口状态失败".to_string())?;
        refresh_local_http_api_manager(&mut manager);
        let same_binding = manager.bind_address == bind_address && manager.bind_port == bind_port;
        if matches!(manager.state, LocalHttpApiState::Running)
            && manager.task.is_some()
            && same_binding
        {
            return Ok(local_http_api_status_from_manager(&manager));
        }
        if manager.task.is_some() {
            previous_shutdown = manager.shutdown_tx.take();
            previous_task = manager.task.take();
            manager.state = LocalHttpApiState::Disabled;
        }
    }

    if let Some(shutdown_tx) = previous_shutdown {
        let _ = shutdown_tx.send(());
    }
    if let Some(task) = previous_task {
        let _ = task.await;
    }

    let listener = tokio::net::TcpListener::bind(socket_addr)
        .await
        .map_err(|err| format!("启动本机 HTTP 接口失败: {err}"))?;
    let (shutdown_tx, shutdown_rx) = oneshot::channel::<()>();
    let router = Router::new()
        .route(
            LOCAL_HTTP_API_ROUTE,
            axum::routing::post(local_http_api_send_file),
        )
        .route(
            LOCAL_HTTP_TEXT_API_ROUTE,
            axum::routing::post(local_http_api_send_text),
        )
        .layer(DefaultBodyLimit::disable())
        .with_state(LocalHttpApiContext {
            app_handle: app_handle.clone(),
        });
    let app_handle = app_handle.clone();
    let task = tauri::async_runtime::spawn(async move {
        let result = axum::serve(listener, router)
            .with_graceful_shutdown(async move {
                let _ = shutdown_rx.await;
            })
            .await;
        if let Err(err) = result {
            let state = app_handle.state::<AppState>();
            record_local_http_api_start_failure(&state, format!("本机 HTTP 接口运行失败: {err}"));
        }
    });

    let mut manager = state
        .local_http_api
        .lock()
        .map_err(|_| "更新本机 HTTP 接口状态失败".to_string())?;
    manager.state = LocalHttpApiState::Running;
    manager.last_error = None;
    manager.bind_address = bind_address;
    manager.bind_port = bind_port;
    manager.shutdown_tx = Some(shutdown_tx);
    manager.task = Some(task);
    Ok(local_http_api_status_from_manager(&manager))
}

fn stop_local_http_api_impl(state: &AppState) -> Result<LocalHttpApiStatus, String> {
    let mut manager = state
        .local_http_api
        .lock()
        .map_err(|_| "更新本机 HTTP 接口状态失败".to_string())?;
    refresh_local_http_api_manager(&mut manager);
    if let Some(shutdown_tx) = manager.shutdown_tx.take() {
        let _ = shutdown_tx.send(());
    }
    manager.task = None;
    manager.state = LocalHttpApiState::Disabled;
    manager.last_error = None;
    Ok(local_http_api_status_from_manager(&manager))
}

async fn ensure_local_http_api_state(
    app_handle: &AppHandle,
    state: &AppState,
) -> Result<(), String> {
    let settings = current_settings(state)?;
    if should_auto_start_local_http_api(&settings) {
        if let Err(err) =
            start_local_http_api_impl(app_handle, state, &settings.local_http_api).await
        {
            record_local_http_api_start_failure(state, err.clone());
            return Err(err);
        }
    } else {
        let _ = stop_local_http_api_impl(state);
    }
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

fn split_filename_parts(original_name: &str) -> (String, String) {
    let sanitized = sanitize_filename(original_name);
    let path = Path::new(&sanitized);
    let stem = path
        .file_stem()
        .and_then(|value| value.to_str())
        .filter(|value| !value.trim().is_empty())
        .unwrap_or("download")
        .to_string();
    let suffix = path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("")
        .to_string();
    (stem, suffix)
}

fn format_yyyymmdd(timestamp_ms: i64) -> String {
    let datetime = OffsetDateTime::from_unix_timestamp_nanos((timestamp_ms as i128) * 1_000_000)
        .unwrap_or_else(|_| OffsetDateTime::now_utc());
    format!(
        "{:04}{:02}{:02}",
        datetime.year(),
        u8::from(datetime.month()),
        datetime.day()
    )
}

fn build_save_filename(rule: &str, original_name: &str, timestamp_ms: i64) -> String {
    let normalized_rule = normalize_save_filename_rule(rule);
    let (name, suffix) = split_filename_parts(original_name);
    let rule_with_suffix = if suffix.is_empty() {
        normalized_rule.replace(".{file_suffix}", "")
    } else {
        normalized_rule
    };
    let rendered = rule_with_suffix
        .replace("{yyyymmdd}", &format_yyyymmdd(timestamp_ms))
        .replace("{filename}", &name)
        .replace("{file_suffix}", &suffix);

    sanitize_filename(&rendered)
}

fn build_download_target_path(
    state: &AppState,
    settings: &Settings,
    original_name: &str,
    timestamp_ms: i64,
) -> PathBuf {
    let base_dir = resolve_download_dir(state, settings);
    base_dir.join(build_save_filename(
        &settings.save_filename_rule,
        original_name,
        timestamp_ms,
    ))
}

fn sanitize_filename(name: &str) -> String {
    Path::new(name)
        .file_name()
        .and_then(|value| value.to_str())
        .filter(|value| !value.trim().is_empty())
        .unwrap_or("download.bin")
        .to_string()
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
    timestamp_ms: i64,
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
    let default_path = base_dir.join(build_save_filename(
        &settings.save_filename_rule,
        original_name,
        timestamp_ms,
    ));
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

fn build_webdav_conflict(
    endpoint_id: &str,
    filename: &str,
    existing: &DbMessage,
    remote: &crate::types::DavEntry,
) -> Option<WebDavConflict> {
    let has_local_remote_version = existing.etag.is_some() || existing.mtime.is_some();
    if !has_local_remote_version {
        return None;
    }
    let remote_size = remote.size.unwrap_or(0) as i64;
    let etag_diff =
        existing.etag.is_some() && remote.etag.is_some() && existing.etag != remote.etag;
    let mtime_diff =
        existing.mtime.is_some() && remote.mtime.is_some() && existing.mtime != remote.mtime;
    let size_diff = existing.size > 0 && remote_size > 0 && existing.size != remote_size;
    if !(etag_diff || mtime_diff || size_diff) {
        return None;
    }
    Some(WebDavConflict {
        endpoint_id: endpoint_id.to_string(),
        filename: filename.to_string(),
        remote_path: remote.remote_path.clone(),
        local_etag: existing.etag.clone(),
        remote_etag: remote.etag.clone(),
        local_mtime: existing.mtime.clone(),
        remote_mtime: remote.mtime.clone(),
        local_size: existing.size,
        remote_size,
    })
}

fn set_pending_webdav_conflict(state: &AppState, conflict: WebDavConflict) -> Result<(), String> {
    let mut pending = state
        .pending_webdav_conflict
        .lock()
        .map_err(|_| "更新 WebDAV 冲突状态失败".to_string())?;
    *pending = Some(conflict);
    Ok(())
}

fn clear_pending_webdav_conflict(state: &AppState) -> Result<(), String> {
    let mut pending = state
        .pending_webdav_conflict
        .lock()
        .map_err(|_| "更新 WebDAV 冲突状态失败".to_string())?;
    *pending = None;
    Ok(())
}

fn pending_webdav_conflict(state: &AppState) -> Option<WebDavConflict> {
    state
        .pending_webdav_conflict
        .lock()
        .ok()
        .and_then(|pending| pending.clone())
}

fn invalidate_history_cache_for_paths(
    state: &AppState,
    endpoint_id: &str,
    paths: &[String],
) -> Result<(), String> {
    crate::history::invalidate_history_cache_paths(&history_cache_dir(state, endpoint_id), paths)
}

async fn apply_remote_conflict_to_local(
    state: &AppState,
    endpoint: &WebDavEndpoint,
    conflict: &WebDavConflict,
) -> Result<(), String> {
    let entries = webdav::list_entries(&state.http, endpoint, Some("files"), true).await?;
    let remote = entries
        .into_iter()
        .find(|entry| !entry.is_collection && entry.remote_path == conflict.remote_path)
        .ok_or_else(|| "远端冲突文件不存在".to_string())?;
    let mut message = db::get_message(&state.db_path, &endpoint.id, &conflict.filename)
        .map_err(|err| err.to_string())?
        .ok_or_else(|| "本地冲突消息不存在".to_string())?;
    message.etag = remote.etag.clone();
    message.mtime = remote.mtime.clone();
    message.size = remote.size.unwrap_or(0) as i64;
    message.remote_path = Some(remote.remote_path.clone());
    if message.kind == MessageKind::Text.as_str() {
        let bytes = webdav::download_file(&state.http, endpoint, &remote.remote_path).await?;
        message.content = Some(String::from_utf8_lossy(&bytes).to_string());
        message.size = bytes.len() as i64;
    } else {
        message.local_path = None;
        message.file_hash = None;
    }
    db::upsert_message(&state.db_path, &message).map_err(|err| err.to_string())?;
    Ok(())
}

async fn apply_local_conflict_to_remote(
    state: &AppState,
    endpoint: &WebDavEndpoint,
    conflict: &WebDavConflict,
) -> Result<(), String> {
    let message = db::get_message(&state.db_path, &endpoint.id, &conflict.filename)
        .map_err(|err| err.to_string())?
        .ok_or_else(|| "本地冲突消息不存在".to_string())?;
    let remote_path = resolved_remote_path(
        message.remote_path.as_deref(),
        &message.filename,
        Some(message.timestamp_ms),
    );
    if message.kind == MessageKind::Text.as_str() {
        webdav::upload_file_ensuring_parent(
            &state.http,
            endpoint,
            &remote_path,
            message.content.clone().unwrap_or_default().into_bytes(),
        )
        .await?;
    } else {
        let local_path = message
            .local_path
            .as_deref()
            .filter(|value| !value.trim().is_empty())
            .ok_or_else(|| "上传本地覆盖远端需要本地文件存在".to_string())?;
        let source = PathBuf::from(local_path);
        let size = webdav::upload_file_path_with_progress(
            &state.http,
            endpoint,
            &remote_path,
            &source,
            |_sent, _total| {},
        )
        .await?;
        if size == 0 {
            return Err("上传本地文件失败".to_string());
        }
    }
    let mut prior = HashMap::new();
    prior.insert(message.filename.clone(), message.timestamp_ms);
    let history_result = crate::history::upsert_history_entries_with_prior(
        &state.http,
        endpoint,
        vec![message_to_history(&message)],
        &prior,
    )
    .await?;
    invalidate_history_cache_for_paths(state, &endpoint.id, &history_result.touched_paths)?;
    Ok(())
}

#[tauri::command]
async fn resolve_webdav_conflict(
    state: State<'_, AppState>,
    action: String,
) -> Result<SyncStatus, String> {
    let conflict =
        pending_webdav_conflict(&state).ok_or_else(|| "没有待处理的 WebDAV 冲突".to_string())?;
    let settings = current_settings(&state)?;
    let endpoint = resolve_endpoint_by_id(&settings, &conflict.endpoint_id)?;
    let _guard = state.sync_guard.lock().await;
    match action.as_str() {
        "remote-over-local" | "download-remote" => {
            apply_remote_conflict_to_local(&state, &endpoint, &conflict).await?;
        }
        "local-over-remote" | "upload-local" => {
            apply_local_conflict_to_remote(&state, &endpoint, &conflict).await?;
        }
        _ => return Err("未知的 WebDAV 冲突处理动作".to_string()),
    }
    clear_pending_webdav_conflict(&state)?;
    let mut status = state
        .sync_status
        .lock()
        .map_err(|_| "更新同步状态失败".to_string())?;
    status.conflict = None;
    status.last_error = None;
    status.last_result = Some("WebDAV 冲突已处理".to_string());
    Ok(status.clone())
}

async fn run_sync(
    state: &AppState,
    source: &str,
    wait_for_turn: bool,
) -> Result<SyncStatus, String> {
    const SYNC_CANCELLED_SENTINEL: &str = "__sync_cancelled__";
    const SYNC_CANCELLED_MESSAGE: &str = "\u{5DF2}\u{53D6}\u{6D88}\u{5237}\u{65B0}";
    let mut started_sync = false;

    loop {
        let running_status = {
            let mut status = state.sync_status.lock().map_err(|_| {
                "\u{66F4}\u{65B0}\u{540C}\u{6B65}\u{72B6}\u{6001}\u{5931}\u{8D25}".to_string()
            })?;
            if status.running {
                Some(status.clone())
            } else {
                started_sync = true;
                status.running = true;
                status.last_error = None;
                status.conflict = None;
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

    if started_sync {
        let _ = persist_integration_module_statuses(state);
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
    let final_result = match result {
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
            } else if err == "WebDAV_SYNC_CONFLICT" {
                let conflict = pending_webdav_conflict(state);
                status.conflict = conflict.clone();
                status.last_error = Some("WebDAV 同步冲突，需要选择覆盖方向".to_string());
                status.last_result = Some("发现 WebDAV 同步冲突".to_string());
                Err("WebDAV 同步冲突，需要选择覆盖方向".to_string())
            } else {
                status.last_error = Some(err.clone());
                status.last_result = Some("\u{540C}\u{6B65}\u{5931}\u{8D25}".to_string());
                Err(err)
            }
        }
    };
    drop(status);
    let _ = persist_integration_module_statuses(state);
    final_result
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

    let loaded_history = crate::history::load_history_for_sync(
        &state.http,
        &endpoint,
        &history_cache_dir(state, &endpoint_id),
    )
    .await?;
    let pending_marked_sync = db::list_pending_marked_sync(&state.db_path, &endpoint_id)
        .map_err(|err| err.to_string())?;
    let pending_marked_sync_by_filename = pending_marked_sync_map(&pending_marked_sync);
    let mut loaded_history = loaded_history;
    for entry in loaded_history.entries.iter_mut() {
        if let Some(pending) = pending_marked_sync_by_filename.get(&entry.filename) {
            apply_pending_marked_sync_to_history(entry, pending);
        }
    }
    db::replace_marked_tags(&state.db_path, &endpoint_id, &loaded_history.tags)
        .map_err(|err| err.to_string())?;
    let history_layout = loaded_history.layout;
    let history_map: HashMap<String, HistoryEntry> = loaded_history
        .entries
        .into_iter()
        .map(|entry| (entry.filename.clone(), entry))
        .collect();

    let mut files_map: HashMap<String, crate::types::DavEntry> = HashMap::new();
    if history_layout != HistoryLayout::Manifest {
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
            marked_tag_ids,
            marked_pinned,
            marked_due_date,
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
                history.marked_tag_ids.clone(),
                history.marked_pinned,
                history.marked_due_date.clone(),
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
                Vec::new(),
                false,
                None,
                format,
            )
        } else {
            continue;
        };

        let existing = db::get_message(&state.db_path, &endpoint_id, &filename)
            .map_err(|err| err.to_string())?;
        if let (Some(existing_message), Some(remote_entry)) = (existing.as_ref(), file_entry) {
            if let Some(conflict) =
                build_webdav_conflict(&endpoint_id, &filename, existing_message, remote_entry)
            {
                set_pending_webdav_conflict(state, conflict)?;
                return Err("WebDAV_SYNC_CONFLICT".to_string());
            }
        }
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
            marked_tag_ids,
            marked_pinned,
            marked_due_date,
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
            message.marked_tag_ids = history.marked_tag_ids.clone();
            message.marked_pinned = history.marked_pinned;
            message.marked_due_date = history.marked_due_date.clone();
            message.format = history.format.clone();
        }
        if let Some(pending) = pending_marked_sync_by_filename.get(&filename) {
            apply_pending_marked_sync_to_message(&mut message, pending);
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
            let mut history_entry = message_to_history(&message);
            if let Some(pending) = pending_marked_sync_by_filename.get(&filename) {
                apply_pending_marked_sync_to_history(&mut history_entry, pending);
            }
            new_history_entries.push(history_entry);
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
                || existing.marked_tag_ids != message.marked_tag_ids
                || existing.marked_pinned != message.marked_pinned
                || existing.marked_due_date != message.marked_due_date
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
        let mut prior = HashMap::new();
        for entry in &new_history_entries {
            prior.insert(entry.filename.clone(), entry.timestamp_ms);
        }
        let history_result = crate::history::upsert_history_entries_with_prior(
            &state.http,
            &endpoint,
            new_history_entries.clone(),
            &prior,
        )
        .await?;
        invalidate_history_cache_for_paths(state, &endpoint.id, &history_result.touched_paths)?;
    }
    if !pending_marked_sync.is_empty() {
        flush_marked_history_entries(
            &state.http,
            &endpoint,
            &state.db_path,
            &history_cache_dir(state, &endpoint.id),
            &pending_marked_sync,
        )
        .await?;
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
        marked_tag_ids: message.marked_tag_ids.clone(),
        marked_pinned: message.marked_pinned,
        marked_due_date: message.marked_due_date.clone(),
        format: message.format.clone(),
    }
}

#[cfg(test)]
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

fn show_main_window(app: &AppHandle) {
    show_main_window_with_event(app, None);
}

fn show_main_window_with_event(app: &AppHandle, event_name: Option<&str>) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
        let _ = window.emit("trigger-show", ());
        if let Some(event_name) = event_name {
            let _ = window.emit(event_name, ());
        }
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
fn refresh_autostart_registration(app: &AppHandle, state: &AppState) {
    match current_settings(state) {
        Ok(settings) => {
            if let Err(err) = set_autostart(app, settings.auto_start) {
                eprintln!("Refresh autostart registration failed: {err}");
            }
        }
        Err(err) => {
            eprintln!("Read settings for autostart refresh failed: {err}");
        }
    }
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

#[cfg(desktop)]
fn update_system_dictation_hotkey_registration(
    app: &AppHandle,
    state: &AppState,
    settings: &Settings,
) -> Result<(), String> {
    let mut current = state
        .registered_system_dictation_hotkey
        .lock()
        .map_err(|_| "更新系统听写快捷键失败".to_string())?;
    let manager = app.global_shortcut();

    if let Some(active) = current.clone() {
        if manager.is_registered(active.clone()) {
            manager
                .unregister(active)
                .map_err(|err| format!("注销系统听写快捷键失败: {err}"))?;
        }
    }

    #[cfg(target_os = "windows")]
    update_windows_side_alt_dictation_config(settings);

    if settings.speech_to_text.system_dictation_enabled {
        let hotkey = normalize_speech_hotkey(&settings.speech_to_text.system_dictation_shortcut)
            .ok_or_else(|| "系统听写快捷键格式无效，可填写 right-alt、left-alt 或 Alt+D".to_string())?;
        if is_side_alt_hotkey(&hotkey) {
            *current = None;
            return Ok(());
        }
        let shortcut = hotkey
            .parse::<Shortcut>()
            .map_err(|err| format!("系统听写快捷键解析失败: {err}"))?;
        manager
            .register(shortcut.clone())
            .map_err(|err| format!("注册系统听写快捷键失败: {err}"))?;
        *current = Some(shortcut);
    } else {
        *current = None;
    }

    Ok(())
}

#[cfg(desktop)]
fn update_hotkey_registrations(
    app: &AppHandle,
    state: &AppState,
    settings: &Settings,
) -> Result<(), String> {
    update_global_hotkey_registration(app, state, settings)?;
    update_system_dictation_hotkey_registration(app, state, settings)
}

#[cfg(target_os = "windows")]
fn start_system_dictation_side_alt_monitor(app: AppHandle) {
    use std::sync::atomic::Ordering;

    if SYSTEM_DICTATION_SIDE_ALT_HOOK_STARTED
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        eprintln!("[system-dictation] side-alt hook already started");
        return;
    }

    let (tx, rx) = std::sync::mpsc::channel::<()>();
    let _ = SYSTEM_DICTATION_SIDE_ALT_TOGGLE_TX.set(tx);

    {
        let app_for_events = app.clone();
        std::thread::spawn(move || {
            while rx.recv().is_ok() {
                eprintln!("[system-dictation] side-alt hook event: emitting toggle");
                if let Some(window) = app_for_events.get_webview_window("main") {
                    let _ = window.emit("system-dictation-toggle", ());
                } else {
                    eprintln!("[system-dictation] side-alt hook event: main window not found");
                }
            }
        });
    }

    std::thread::spawn(move || {
        use windows_sys::Win32::Foundation::{LPARAM, LRESULT, WPARAM};
        use windows_sys::Win32::UI::WindowsAndMessaging::{
            CallNextHookEx, DispatchMessageW, GetMessageW, SetWindowsHookExW,
            TranslateMessage, UnhookWindowsHookEx, HHOOK, KBDLLHOOKSTRUCT, MSG, WH_KEYBOARD_LL,
        };

        static RIGHT_ALT_DOWN: std::sync::atomic::AtomicBool =
            std::sync::atomic::AtomicBool::new(false);
        static LEFT_ALT_DOWN: std::sync::atomic::AtomicBool =
            std::sync::atomic::AtomicBool::new(false);

        unsafe extern "system" fn hook_proc(code: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
            use windows_sys::Win32::UI::Input::KeyboardAndMouse::{VK_LMENU, VK_RMENU};
            use windows_sys::Win32::UI::WindowsAndMessaging::{WM_KEYDOWN, WM_KEYUP, WM_SYSKEYDOWN, WM_SYSKEYUP};

            if code < 0 {
                return unsafe { CallNextHookEx(std::ptr::null_mut(), code, wparam, lparam) };
            }
            let event = wparam as u32;
            let is_down = event == WM_KEYDOWN || event == WM_SYSKEYDOWN;
            let is_up = event == WM_KEYUP || event == WM_SYSKEYUP;
            if !is_down && !is_up {
                return unsafe { CallNextHookEx(std::ptr::null_mut(), code, wparam, lparam) };
            }
            let key = unsafe { *(lparam as *const KBDLLHOOKSTRUCT) }.vkCode;
            let configured_key = current_windows_side_alt_dictation_key();
            let should_handle = match configured_key {
                Some("right-alt") => key == VK_RMENU as u32,
                Some("left-alt") => key == VK_LMENU as u32,
                _ => false,
            };
            if !should_handle {
                return unsafe { CallNextHookEx(std::ptr::null_mut(), code, wparam, lparam) };
            }

            let down_flag = if key == VK_RMENU as u32 {
                &RIGHT_ALT_DOWN
            } else {
                &LEFT_ALT_DOWN
            };
            if is_down {
                let was_down = down_flag.swap(true, Ordering::SeqCst);
                if !was_down {
                    eprintln!("[system-dictation] side-alt hook swallowed keydown");
                    if let Some(tx) = SYSTEM_DICTATION_SIDE_ALT_TOGGLE_TX.get() {
                        let _ = tx.send(());
                    }
                }
                return 1;
            }
            if is_up {
                down_flag.store(false, Ordering::SeqCst);
                eprintln!("[system-dictation] side-alt hook swallowed keyup");
                return 1;
            }

            unsafe { CallNextHookEx(std::ptr::null_mut(), code, wparam, lparam) }
        }

        let hook: HHOOK = unsafe { SetWindowsHookExW(WH_KEYBOARD_LL, Some(hook_proc), std::ptr::null_mut(), 0) };
        if hook.is_null() {
            eprintln!("[system-dictation] side-alt hook install failed");
            return;
        }
        eprintln!("[system-dictation] side-alt hook started");

        let mut message = MSG::default();
        while unsafe { GetMessageW(&mut message, std::ptr::null_mut(), 0, 0) } > 0 {
            unsafe {
                TranslateMessage(&message);
                DispatchMessageW(&message);
            }
        }
        let _ = unsafe { UnhookWindowsHookEx(hook) };
    });
}

#[cfg(target_os = "windows")]
fn update_windows_side_alt_dictation_config(settings: &Settings) {
    use std::sync::atomic::Ordering;

    let value = if settings.speech_to_text.system_dictation_enabled {
        match normalize_speech_hotkey(&settings.speech_to_text.system_dictation_shortcut).as_deref() {
            Some("left-alt") => 1,
            Some("right-alt") => 2,
            _ => 0,
        }
    } else {
        0
    };
    SYSTEM_DICTATION_SIDE_ALT_CONFIG.store(value, Ordering::SeqCst);
    eprintln!("[system-dictation] side-alt hook config={value}");
}

#[cfg(target_os = "windows")]
fn current_windows_side_alt_dictation_key() -> Option<&'static str> {
    use std::sync::atomic::Ordering;

    match SYSTEM_DICTATION_SIDE_ALT_CONFIG.load(Ordering::SeqCst) {
        1 => Some("left-alt"),
        2 => Some("right-alt"),
        _ => None,
    }
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
        builder = builder.plugin(tauri_plugin_updater::Builder::new().build());
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

            let app_data_dir = settings_path
                .parent()
                .ok_or_else(|| "鏃犳硶瀹氫綅搴旂敤鏁版嵁鐩綍".to_string())?
                .to_path_buf();
            let workspace_layout = WorkspaceLayout::new(app_data_dir);
            workspace::ensure_workspace_dirs(&workspace_layout)?;
            workspace::migrate_legacy_layout(
                settings_path.parent().unwrap_or_else(|| Path::new(".")),
                &workspace_layout,
            )?;
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
                sync_guard: Arc::new(AsyncMutex::new(())),
                sync_cancel: Mutex::new(None),
                sync_loop_signal,
                http: Client::builder()
                    .connect_timeout(Duration::from_secs(10))
                    .pool_idle_timeout(Duration::from_secs(30))
                    .build()
                    .map_err(|err| format!("创建 HTTP 客户端失败: {err}"))?,
                registered_hotkey: Mutex::new(None),
                registered_system_dictation_hotkey: Mutex::new(None),
                telegram_bridge: Mutex::new(TelegramBridgeManager::default()),
                local_http_api: Mutex::new(LocalHttpApiManager::default()),
                update_guard: AsyncMutex::new(()),
                auto_backup_guard: AsyncMutex::new(()),
                pending_webdav_conflict: Mutex::new(None),
            });

            #[cfg(desktop)]
            {
                let state = app.state::<AppState>();
                refresh_autostart_registration(&app.handle(), &state);
            }

            #[cfg(desktop)]
            {
                use tauri::menu::{Menu, MenuItem};
                use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
                use tauri_plugin_global_shortcut::ShortcutState;

                let show_item = MenuItem::with_id(app, "show", "显示窗口", true, None::<&str>)?;
                let check_update_item =
                    MenuItem::with_id(app, CHECK_UPDATE_MENU_ID, "检查更新", true, None::<&str>)?;
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
                let tray_menu = Menu::with_items(
                    app,
                    &[&show_item, &check_update_item, &hotkey_item, &quit_item],
                )?;
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
                            CHECK_UPDATE_MENU_ID => {
                                show_main_window_with_event(app, Some(TRAY_CHECK_UPDATE_EVENT))
                            }
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

                                if let Err(err) =
                                    write_settings_audited(&settings_path, &settings_copy)
                                {
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
                            let window_shortcut = state
                                .registered_hotkey
                                .lock()
                                .ok()
                                .and_then(|active| active.clone());
                            if window_shortcut
                                .as_ref()
                                .is_some_and(|current| *shortcut == *current)
                            {
                                toggle_main_window(app);
                                return;
                            }
                            let system_dictation_shortcut = state
                                .registered_system_dictation_hotkey
                                .lock()
                                .ok()
                                .and_then(|active| active.clone());
                            if system_dictation_shortcut
                                .as_ref()
                                .is_some_and(|current| *shortcut == *current)
                            {
                                if let Some(window) = app.get_webview_window("main") {
                                    let _ = window.emit("system-dictation-toggle", ());
                                }
                            }
                        })
                        .build(),
                )?;

                #[cfg(target_os = "windows")]
                start_system_dictation_side_alt_monitor(app.handle().clone());

                {
                let state = app.state::<AppState>();
                let settings = match state.settings.lock() {
                    Ok(guard) => guard.clone(),
                    Err(_) => return Ok(()),
                };
                if let Err(err) = update_hotkey_registrations(&app.handle(), &state, &settings)
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

                {
                    let app_handle = app.handle().clone();
                    eprintln!("[system-dictation] preload window scheduled");
                    app.run_on_main_thread(move || {
                        eprintln!("[system-dictation] preload window start");
                        match ensure_system_dictation_window_impl(&app_handle) {
                            Ok(()) => eprintln!("[system-dictation] preload window done"),
                            Err(err) => eprintln!("[system-dictation] preload window failed: {err}"),
                        }
                    })?;
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
                        if let Err(err) = TelegramBridgeRuntimeAdapter::new(&state).start().await {
                            if let Ok(mut manager) = state.telegram_bridge.lock() {
                                manager.last_error = Some(err.clone());
                                manager.last_stopped_ms = Some(now_ms());
                            }
                            let _ = persist_integration_module_statuses(&state);
                            eprintln!("Telegram bridge auto start failed: {err}");
                        }
                    }
                });
            }

            {
                let app_handle = app.handle().clone();
                tauri::async_runtime::spawn(async move {
                    let state = app_handle.state::<AppState>();
                    if let Err(err) = ensure_local_http_api_state(&app_handle, &state).await {
                        eprintln!("Local HTTP API auto start failed: {err}");
                    }
                });
            }

            {
                let app_handle = app.handle().clone();
                tauri::async_runtime::spawn(async move {
                    loop {
                        let state = app_handle.state::<AppState>();
                        if let Err(err) = maybe_run_scheduled_backup(&app_handle, &state).await {
                            eprintln!("Scheduled backup run failed: {err}");
                        }
                        tokio::time::sleep(Duration::from_secs(60)).await;
                    }
                });
            }

            start_sync_loop(app.handle().clone());

            // Open DevTools when TRANSFER_GENIE_DEVTOOLS env var is set and devtools feature is enabled.
            #[cfg(feature = "devtools")]
            if std::env::var("TRANSFER_GENIE_DEVTOOLS").is_ok() {
                if let Some(window) = app.get_webview_window("main") {
                    window.open_devtools();
                }
            }

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
            list_integration_modules,
            get_auto_backup_status,
            list_local_data_backups,
            create_local_data_backup,
            create_manual_local_data_backup,
            create_manual_settings_snapshot,
            restore_local_data_backup,
            get_local_http_api_status,
            get_app_version,
            check_app_update,
            download_and_install_update,
            restart_app,
            discover_telegram_chats,
            save_settings,
            paste_dictation_text,
            show_system_dictation_window,
            hide_system_dictation_window,
            set_system_dictation_level,
            system_dictation_action,
            list_settings_snapshots,
            clear_settings_snapshots,
            list_local_backup_archives,
            clear_local_backup_archives,
            restore_settings_snapshot,
            save_send_hotkey,
            process_text_with_ai,
            process_text_with_ai_stream,
            transcribe_speech,
            get_device_name,
            export_settings,
            import_settings,
            list_messages,
            list_messages_window,
            list_marked_messages,
            list_marked_tags,
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
            open_download_history_file,
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
            set_marked_messages_tags,
            create_marked_tag,
            delete_marked_tag,
            rename_marked_tag,
            toggle_marked_message_pin,
            test_webdav_speed,
            backup_webdav,
            restore_webdav,
            resolve_webdav_conflict
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    let version = env!("CARGO_PKG_VERSION");
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.set_title(&format!("Transfer Genie v{}", version));
    }

    app.run(move |app_handle, event| {
        if let tauri::RunEvent::Ready = event {
            let version = env!("CARGO_PKG_VERSION");
            if let Some(window) = app_handle.get_webview_window("main") {
                let _ = window.set_title(&format!("Transfer Genie v{}", version));
            }
        }

        if matches!(
            event,
            tauri::RunEvent::Exit | tauri::RunEvent::ExitRequested { .. }
        ) {
            let state = app_handle.state::<AppState>();
            let _ = TelegramBridgeRuntimeAdapter::new(&state).stop();
            let _ = stop_local_http_api_impl(&state);
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
    use tokio::sync::watch;

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
            save_filename_rule: crate::types::default_save_filename_rule(),
            send_hotkey: DEFAULT_SEND_HOTKEY.to_string(),
            global_hotkey_enabled: false,
            global_hotkey: DEFAULT_GLOBAL_HOTKEY.to_string(),
            auto_start: false,
            auto_update_enabled: false,
            local_http_api: LocalHttpApiSettings::default(),
            send: SendSettings::default(),
            backup: BackupSettings::default(),
            telegram: TelegramBridgeSettings::default(),
            ai: AiSettings::default(),
            speech_to_text: SpeechToTextSettings::default(),
        }
    }

    fn test_app_state(temp_dir: &Path, settings: Settings) -> AppState {
        let settings_path = temp_dir.join("settings.json");
        let db_path = temp_dir.join("messages.sqlite");
        let workspace_layout = WorkspaceLayout::new(temp_dir.to_path_buf());
        fs::create_dir_all(workspace_layout.endpoints_dir()).expect("create endpoints dir");
        let (sync_loop_signal, _) = watch::channel(0_u64);

        AppState {
            settings_path,
            db_path,
            files_base_dir: workspace_layout.endpoints_dir(),
            default_download_dir: temp_dir.join("downloads"),
            settings: Mutex::new(settings),
            sync_status: Mutex::new(SyncStatus::idle()),
            sync_guard: Arc::new(AsyncMutex::new(())),
            sync_cancel: Mutex::new(None),
            sync_loop_signal,
            http: Client::builder().build().expect("create http client"),
            registered_hotkey: Mutex::new(None),
            registered_system_dictation_hotkey: Mutex::new(None),
            telegram_bridge: Mutex::new(TelegramBridgeManager::default()),
            local_http_api: Mutex::new(LocalHttpApiManager::default()),
            update_guard: AsyncMutex::new(()),
            auto_backup_guard: AsyncMutex::new(()),
            pending_webdav_conflict: Mutex::new(None),
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
            marked_tag_ids: Vec::new(),
            marked_pinned: false,
            marked_due_date: None,
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
                marked_tag_ids: Vec::new(),
                marked_pinned: false,
                marked_due_date: None,
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
                marked_tag_ids: Vec::new(),
                marked_pinned: false,
                marked_due_date: None,
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
                marked_tag_ids: Vec::new(),
                marked_pinned: false,
                marked_due_date: None,
                format: "text".to_string(),
            },
        ];

        let candidates = collect_cleanup_candidates(messages, Some(50));
        assert_eq!(candidates.len(), 1);
        assert_eq!(candidates[0].filename, "old-unmarked.txt");
    }

    #[test]
    fn apply_marked_state_clears_tags_and_pin_when_unmarked() {
        let mut marked = true;
        let mut marked_tag_ids = vec!["tag-1".to_string(), "tag-2".to_string()];
        let mut marked_pinned = true;
        let mut marked_due_date = Some("2026-08-27".to_string());

        apply_marked_state(
            &mut marked,
            &mut marked_tag_ids,
            &mut marked_pinned,
            &mut marked_due_date,
            false,
            &[],
            None,
        );

        assert!(!marked);
        assert!(marked_tag_ids.is_empty());
        assert!(!marked_pinned);
        assert_eq!(marked_due_date, None);
    }

    #[test]
    fn sanitize_marked_tag_ids_filters_invalid_and_duplicate_values() {
        let tags = vec![
            MarkedTag {
                id: "tag-2".to_string(),
                name: "Two".to_string(),
            },
            MarkedTag {
                id: "tag-1".to_string(),
                name: "One".to_string(),
            },
        ];

        let sanitized = sanitize_marked_tag_ids(
            &tags,
            vec![
                "tag-2".to_string(),
                "missing".to_string(),
                "tag-1".to_string(),
                "tag-2".to_string(),
            ],
        );

        assert_eq!(sanitized, vec!["tag-1".to_string(), "tag-2".to_string()]);
    }

    #[test]
    fn apply_marked_tag_ids_to_entries_updates_only_selected_marked_messages() {
        let mut entries = vec![
            HistoryEntry {
                filename: "selected.txt".to_string(),
                sender: "tester".to_string(),
                timestamp_ms: 1,
                size: 1,
                kind: "text".to_string(),
                original_name: "selected.txt".to_string(),
                remote_path: None,
                marked: true,
                marked_tag_ids: vec!["old".to_string()],
                marked_pinned: false,
                marked_due_date: None,
                format: "text".to_string(),
            },
            HistoryEntry {
                filename: "unselected.txt".to_string(),
                sender: "tester".to_string(),
                timestamp_ms: 2,
                size: 1,
                kind: "text".to_string(),
                original_name: "unselected.txt".to_string(),
                remote_path: None,
                marked: true,
                marked_tag_ids: vec!["keep".to_string()],
                marked_pinned: false,
                marked_due_date: None,
                format: "text".to_string(),
            },
            HistoryEntry {
                filename: "not-marked.txt".to_string(),
                sender: "tester".to_string(),
                timestamp_ms: 3,
                size: 1,
                kind: "text".to_string(),
                original_name: "not-marked.txt".to_string(),
                remote_path: None,
                marked: false,
                marked_tag_ids: vec!["keep".to_string()],
                marked_pinned: false,
                marked_due_date: None,
                format: "text".to_string(),
            },
        ];

        let changed = apply_marked_tag_ids_to_entries(
            &mut entries,
            &["selected.txt".to_string(), "not-marked.txt".to_string()],
            &["tag-a".to_string(), "tag-b".to_string()],
        );

        assert_eq!(changed, 1);
        assert_eq!(
            entries[0].marked_tag_ids,
            vec!["tag-a".to_string(), "tag-b".to_string()]
        );
        assert_eq!(entries[1].marked_tag_ids, vec!["keep".to_string()]);
        assert_eq!(entries[2].marked_tag_ids, vec!["keep".to_string()]);
    }

    #[test]
    fn apply_marked_tag_ids_to_entries_is_noop_without_selection() {
        let mut entries = vec![HistoryEntry {
            filename: "selected.txt".to_string(),
            sender: "tester".to_string(),
            timestamp_ms: 1,
            size: 1,
            kind: "text".to_string(),
            original_name: "selected.txt".to_string(),
            remote_path: None,
            marked: true,
            marked_tag_ids: vec!["old".to_string()],
            marked_pinned: false,
            marked_due_date: None,
            format: "text".to_string(),
        }];

        let changed = apply_marked_tag_ids_to_entries(&mut entries, &[], &["tag-a".to_string()]);

        assert_eq!(changed, 0);
        assert_eq!(entries[0].marked_tag_ids, vec!["old".to_string()]);
    }

    #[test]
    fn ensure_unique_marked_tag_name_rejects_case_insensitive_duplicates() {
        let tags = vec![MarkedTag {
            id: "tag-1".to_string(),
            name: "重要".to_string(),
        }];

        let error = ensure_unique_marked_tag_name(&tags, "  重要  ", None)
            .expect_err("should reject duplicate");

        assert!(error.contains("已存在"));
        assert!(ensure_unique_marked_tag_name(&tags, "重要", Some("tag-1")).is_ok());
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
    fn normalize_settings_applies_local_http_api_defaults() {
        let mut settings = test_settings();
        settings.local_http_api.bind_address.clear();
        settings.local_http_api.bind_port = 0;
        let download_dir = std::env::temp_dir().join("transfer-genie-settings-test");

        let normalized = normalize_settings(settings, &download_dir).unwrap();

        assert_eq!(normalized.local_http_api.bind_address, "127.0.0.1");
        assert_eq!(normalized.local_http_api.bind_port, 6011);
    }

    #[test]
    fn normalize_settings_applies_save_filename_rule_default() {
        let mut settings = test_settings();
        settings.save_filename_rule = "   ".to_string();
        let download_dir = std::env::temp_dir().join("transfer-genie-settings-test");

        let normalized = normalize_settings(settings, &download_dir).unwrap();

        assert_eq!(
            normalized.save_filename_rule,
            crate::types::default_save_filename_rule()
        );
    }

    #[test]
    fn build_save_filename_expands_supported_placeholders() {
        let timestamp_ms = 1_704_067_200_000i64;

        let name = build_save_filename(
            "{yyyymmdd}_{filename}.{file_suffix}",
            "report.final.pdf",
            timestamp_ms,
        );

        assert_eq!(name, "20240101_report.final.pdf");
    }

    #[test]
    fn build_save_filename_keeps_dots_when_suffix_is_empty() {
        let timestamp_ms = 1_704_067_200_000i64;

        let name = build_save_filename(
            "{yyyymmdd}_{filename}.{file_suffix}",
            "report.final",
            timestamp_ms,
        );

        assert_eq!(name, "20240101_report.final");
    }

    #[test]
    fn normalize_settings_applies_speech_to_text_defaults() {
        let mut settings = test_settings();
        settings.speech_to_text.resource_id.clear();
        settings.speech_to_text.endpoint.clear();
        settings.speech_to_text.shortcut.clear();
        settings.speech_to_text.max_duration_secs = 0;
        settings.speech_to_text.task_retention_count = 0;
        let download_dir = std::env::temp_dir().join("transfer-genie-speech-settings-test");

        let normalized = normalize_settings(settings, &download_dir).unwrap();

        assert!(!normalized.speech_to_text.enabled);
        assert_eq!(
            normalized.speech_to_text.resource_id,
            "volc.seedasr.sauc.duration"
        );
        assert_eq!(
            normalized.speech_to_text.endpoint,
            "wss://openspeech.bytedance.com/api/v3/plan/sauc/bigmodel_nostream"
        );
        assert_eq!(normalized.speech_to_text.shortcut, "right-alt");
        assert_eq!(normalized.speech_to_text.max_duration_secs, 60);
        assert_eq!(normalized.speech_to_text.task_retention_count, 1);
        assert!(normalized.speech_to_text.cue_sound_enabled);
        assert_eq!(normalized.speech_to_text.cue_sound_kind, "system");
        assert!(!normalized.speech_to_text.capture_system_audio);
        assert_eq!(normalized.speech_to_text.system_audio_device_id, "");
    }

    #[test]
    fn normalize_settings_applies_system_dictation_defaults() {
        let mut settings = test_settings();
        settings.speech_to_text.system_dictation_enabled = false;
        settings.speech_to_text.system_dictation_shortcut.clear();
        let download_dir = std::env::temp_dir().join("transfer-genie-settings-test");

        let normalized = normalize_settings(settings, &download_dir).unwrap();

        assert!(!normalized.speech_to_text.system_dictation_enabled);
        assert_eq!(normalized.speech_to_text.system_dictation_shortcut, "alt+d");
    }

    #[test]
    fn normalize_settings_rejects_conflicting_system_dictation_shortcut() {
        let mut settings = test_settings();
        settings.global_hotkey_enabled = true;
        settings.global_hotkey = "ctrl+alt+d".to_string();
        settings.speech_to_text.system_dictation_enabled = true;
        settings.speech_to_text.system_dictation_shortcut = "ctrl+alt+d".to_string();
        let download_dir = std::env::temp_dir().join("transfer-genie-settings-test");

        let error = match normalize_settings(settings, &download_dir) {
            Ok(_) => panic!("conflicting dictation shortcut should be rejected"),
            Err(error) => error,
        };

        assert!(error.contains("系统听写快捷键不能和显示窗口快捷键相同"));
    }

    #[test]
    fn normalize_settings_accepts_side_alt_system_dictation_shortcut() {
        let mut settings = test_settings();
        settings.speech_to_text.system_dictation_enabled = true;
        settings.speech_to_text.system_dictation_shortcut = "AltRight".to_string();
        let download_dir = std::env::temp_dir().join("transfer-genie-speech-settings-test");

        let normalized = normalize_settings(settings, &download_dir).unwrap();

        assert_eq!(
            normalized.speech_to_text.system_dictation_shortcut,
            "right-alt"
        );
        assert!(!normalized.speech_to_text.shortcut_enabled);
    }

    #[test]
    fn normalize_settings_rejects_enabled_speech_without_api_key() {
        let mut settings = test_settings();
        settings.speech_to_text.enabled = true;
        settings.speech_to_text.api_key.clear();
        let download_dir = std::env::temp_dir().join("transfer-genie-speech-settings-test");

        let error = match normalize_settings(settings, &download_dir) {
            Ok(_) => panic!("enabled speech without api key should fail"),
            Err(error) => error,
        };

        assert!(error.contains("API Key"));
    }

    #[test]
    fn sanitize_speech_error_redacts_api_key() {
        let mut settings = SpeechToTextSettings::default();
        settings.api_key = "speech-secret-key".to_string();

        let error = sanitize_speech_error(
            "connection failed with speech-secret-key in transport log",
            &settings,
        );

        assert!(!error.contains("speech-secret-key"));
        assert!(error.contains("[redacted]"));
    }

    #[test]
    fn build_and_parse_asr_frames() {
        let request = serde_json::json!({"request":{"model_name":"bigmodel"}});
        let frame = build_asr_full_request(1, &request).expect("full request frame");
        assert_eq!(frame[0], 0x11);
        assert_eq!(frame[1], 0x11);
        assert_eq!(frame[2], 0x11);

        let audio_frame = build_asr_audio_request(2, b"audio", true).expect("audio request frame");
        assert_eq!(audio_frame[1], 0x23);
        assert_eq!(
            i32::from_be_bytes(audio_frame[4..8].try_into().unwrap()),
            -2
        );

        let payload = gzip_bytes(
            serde_json::json!({"result":{"text":"你好","additions":{"log_id":"log-1"}}})
                .to_string()
                .as_bytes(),
        )
        .unwrap();
        let mut server_frame = Vec::new();
        server_frame.extend_from_slice(&[0x11, 0x91, 0x11, 0x00]);
        server_frame.extend_from_slice(&1_i32.to_be_bytes());
        server_frame.extend_from_slice(&(payload.len() as u32).to_be_bytes());
        server_frame.extend_from_slice(&payload);

        let parsed = parse_asr_server_frame(&server_frame).expect("parse server frame");
        let payload = parsed.payload.expect("payload");
        assert_eq!(extract_asr_text(&payload).as_deref(), Some("你好"));
        assert_eq!(extract_asr_log_id(&payload).as_deref(), Some("log-1"));
    }

    #[test]
    fn parse_asr_error_frame_keeps_json_payload_text() {
        let payload = gzip_bytes(
            serde_json::json!({"message":"invalid audio format","code":45000151})
                .to_string()
                .as_bytes(),
        )
        .unwrap();
        let mut server_frame = Vec::new();
        server_frame.extend_from_slice(&[0x11, 0xf1, 0x11, 0x00]);
        server_frame.extend_from_slice(&1_i32.to_be_bytes());
        server_frame.extend_from_slice(&45000151_i32.to_be_bytes());
        server_frame.extend_from_slice(&(payload.len() as u32).to_be_bytes());
        server_frame.extend_from_slice(&payload);

        let parsed = parse_asr_server_frame(&server_frame).expect("parse error frame");

        assert_eq!(parsed.message_type, ASR_SERVER_ERROR_RESPONSE);
        assert_eq!(parsed.error_code, Some(45000151));
        assert!(parsed
            .error_text
            .as_deref()
            .is_some_and(|text| text.contains("invalid audio format")));
    }

    #[test]
    fn speech_audio_codec_matches_browser_recording_formats() {
        let opus_request = SpeechToTextRequest {
            audio_data: vec![1, 2, 3],
            format: Some("ogg".to_string()),
            mime_type: Some("audio/ogg;codecs=opus".to_string()),
            sample_rate: None,
            channels: None,
            bits_per_sample: None,
        };
        assert_eq!(speech_audio_format(&opus_request), "ogg");
        assert_eq!(speech_audio_codec(&opus_request), "opus");

        let wav_request = SpeechToTextRequest {
            audio_data: vec![1, 2, 3],
            format: None,
            mime_type: Some("audio/wav".to_string()),
            sample_rate: None,
            channels: None,
            bits_per_sample: None,
        };
        assert_eq!(speech_audio_format(&wav_request), "wav");
        assert_eq!(speech_audio_codec(&wav_request), "raw");
    }

    #[test]
    fn send_settings_default_copy_after_send_to_disabled() {
        let settings = Settings {
            send: SendSettings::default(),
            ..test_settings()
        };

        assert!(!settings.send.copy_after_send);
    }

    #[test]
    fn normalize_settings_rejects_invalid_local_http_api_bind_address() {
        let mut settings = test_settings();
        settings.local_http_api.bind_address = "not-an-ip".to_string();
        let download_dir = std::env::temp_dir().join("transfer-genie-settings-test");

        let error = match normalize_settings(settings, &download_dir) {
            Ok(_) => panic!("expected invalid local HTTP API address"),
            Err(err) => err,
        };

        assert!(error.contains("HTTP API"));
    }

    #[test]
    fn normalize_send_text_format_accepts_supported_values() {
        assert_eq!(normalize_send_text_format(None).unwrap(), "text");
        assert_eq!(
            normalize_send_text_format(Some("markdown".to_string())).unwrap(),
            "markdown"
        );
        assert_eq!(
            normalize_send_text_format(Some(" TEXT ".to_string())).unwrap(),
            "text"
        );
    }

    #[test]
    fn normalize_send_text_format_rejects_unknown_value() {
        let error = normalize_send_text_format(Some("html".to_string())).unwrap_err();
        assert!(error.contains("text"));
        assert!(error.contains("markdown"));
    }

    #[test]
    fn parse_local_http_marked_options_json_accepts_marked_tags() {
        let options = parse_local_http_marked_options_json(
            r#"{
                "tagNames": ["  New Tag  ", "urgent", "urgent"]
            }"#,
        )
        .unwrap();

        assert!(!options.marked);
        assert_eq!(
            options.tag_names,
            vec![
                "  New Tag  ".to_string(),
                "urgent".to_string(),
                "urgent".to_string()
            ]
        );
    }

    #[test]
    fn parse_local_http_marked_options_json_rejects_invalid_json() {
        let error = parse_local_http_marked_options_json("{not-json}").unwrap_err();
        assert!(error.contains("markedOptions"));
    }

    #[test]
    fn parse_local_http_marked_options_json_rejects_legacy_tag_fields() {
        let error = parse_local_http_marked_options_json(
            r#"{
                "marked": true,
                "selectedTagIds": ["tag-1"]
            }"#,
        )
        .unwrap_err();

        assert!(error.contains("selectedTagIds"));
        assert!(error.contains("tagNames"));
    }

    #[test]
    fn build_local_http_marked_options_reuses_existing_and_creates_missing_tags() {
        let tags = vec![MarkedTag {
            id: "tag-1".to_string(),
            name: "Urgent".to_string(),
        }];

        let options = build_local_http_marked_options(
            &tags,
            LocalHttpApiMarkedOptionsInput {
                marked: false,
                tag_names: vec![
                    " urgent ".to_string(),
                    "Follow-Up".to_string(),
                    "follow-up".to_string(),
                ],
                due_date: Some("2026-08-27".to_string()),
            },
        )
        .unwrap();

        assert!(options.marked);
        assert_eq!(options.due_date.as_deref(), Some("2026-08-27"));
        assert_eq!(options.selected_tag_ids, vec!["tag-1".to_string()]);
        assert_eq!(
            options.created_tags,
            vec![PendingCreatedTagInput {
                name: "Follow-Up".to_string(),
                selected: true,
            }]
        );
        assert!(options.deleted_tag_ids.is_empty());
    }

    #[tokio::test]
    async fn load_send_marked_options_does_not_mark_tags_changed_for_default_send() {
        let temp_dir =
            std::env::temp_dir().join(format!("transfer-genie-send-options-default-{}", now_ms()));
        fs::create_dir_all(&temp_dir).expect("create temp dir");
        let state = test_app_state(&temp_dir, test_settings());
        db::init_db(&state.db_path, Some("endpoint-1")).expect("initialize database");
        let endpoint = state
            .settings
            .lock()
            .expect("lock settings")
            .webdav_endpoints[0]
            .clone();

        let applied = load_and_apply_send_marked_options(
            &state,
            &endpoint,
            SendMarkedOptionsInput::default(),
        )
        .await
        .expect("apply default send marked options");

        assert!(!applied.tags_changed);
        assert!(!applied.marked);
        assert!(applied.tag_ids.is_empty());
        assert!(applied.tags.is_empty());
        assert!(applied.cleanup_targets.is_empty());
        let _ = fs::remove_dir_all(temp_dir);
    }

    #[tokio::test]
    async fn load_send_marked_options_marks_tags_changed_when_creating_tag() {
        let temp_dir = std::env::temp_dir().join(format!(
            "transfer-genie-send-options-create-tag-{}",
            now_ms()
        ));
        fs::create_dir_all(&temp_dir).expect("create temp dir");
        let state = test_app_state(&temp_dir, test_settings());
        db::init_db(&state.db_path, Some("endpoint-1")).expect("initialize database");
        let endpoint = state
            .settings
            .lock()
            .expect("lock settings")
            .webdav_endpoints[0]
            .clone();

        let applied = load_and_apply_send_marked_options(
            &state,
            &endpoint,
            SendMarkedOptionsInput {
                marked: true,
                created_tags: vec![PendingCreatedTagInput {
                    name: "重要".to_string(),
                    selected: true,
                }],
                ..Default::default()
            },
        )
        .await
        .expect("apply send marked options with created tag");

        assert!(applied.tags_changed);
        assert!(applied.marked);
        assert_eq!(applied.tags.len(), 1);
        assert_eq!(applied.tags[0].name, "重要");
        assert_eq!(applied.tag_ids, vec![applied.tags[0].id.clone()]);
        assert!(applied.cleanup_targets.is_empty());
        let _ = fs::remove_dir_all(temp_dir);
    }

    #[test]
    fn local_http_api_send_text_request_supports_marked_options() {
        let payload = parse_local_http_send_text_request_json(
            r#"{
                "text": "hello",
                "format": "markdown",
                "markedOptions": {
                    "marked": true,
                    "tagNames": ["urgent", "follow-up"]
                }
            }"#
            .as_bytes(),
        )
        .unwrap();

        assert_eq!(payload.text, "hello");
        assert_eq!(payload.format.as_deref(), Some("markdown"));
        assert_eq!(
            payload.marked_options,
            Some(LocalHttpApiMarkedOptionsInput {
                marked: true,
                tag_names: vec!["urgent".to_string(), "follow-up".to_string()],
                due_date: None,
            })
        );
    }

    #[test]
    fn parse_local_http_send_text_request_json_rejects_legacy_tag_fields() {
        let error = parse_local_http_send_text_request_json(
            r#"{
                "text": "hello",
                "markedOptions": {
                    "createdTags": [
                        { "name": "urgent", "selected": true }
                    ]
                }
            }"#
            .as_bytes(),
        )
        .unwrap_err();

        assert!(error.contains("createdTags"));
        assert!(error.contains("tagNames"));
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
    fn webdav_sync_runtime_snapshot_reflects_sync_state_and_endpoint_enablement() {
        let temp_dir =
            std::env::temp_dir().join(format!("transfer-genie-webdav-runtime-{}", now_ms()));
        let mut settings = test_settings();
        settings.webdav_endpoints[0].enabled = true;
        let state = test_app_state(&temp_dir, settings.clone());
        {
            let mut status = state.sync_status.lock().expect("lock sync status");
            status.running = true;
            status.last_error = Some("sync failed".to_string());
            status.last_run_ms = Some(123);
        }

        let snapshot = WebDavSyncRuntimeAdapter::new(&state)
            .status_snapshot(&settings)
            .expect("webdav runtime snapshot");

        assert!(snapshot.enabled);
        assert!(snapshot.running);
        assert_eq!(snapshot.last_error.as_deref(), Some("sync failed"));
        assert_eq!(snapshot.last_stopped_ms, Some(123));
    }

    #[test]
    fn webdav_sync_runtime_snapshot_reports_disabled_when_no_enabled_endpoint_exists() {
        let temp_dir = std::env::temp_dir().join(format!(
            "transfer-genie-webdav-runtime-disabled-{}",
            now_ms()
        ));
        let mut settings = test_settings();
        settings.webdav_endpoints[0].enabled = false;
        let state = test_app_state(&temp_dir, settings.clone());

        let snapshot = WebDavSyncRuntimeAdapter::new(&state)
            .status_snapshot(&settings)
            .expect("webdav runtime snapshot");

        assert!(!snapshot.enabled);
        assert!(!snapshot.running);
        assert!(snapshot.last_error.is_none());
    }

    #[test]
    fn should_auto_start_local_http_api_requires_enabled() {
        let mut settings = test_settings();
        assert!(!should_auto_start_local_http_api(&settings));

        settings.local_http_api.enabled = true;
        assert!(should_auto_start_local_http_api(&settings));
    }

    #[test]
    fn local_http_api_status_reports_running_address() {
        let manager = LocalHttpApiManager {
            state: LocalHttpApiState::Running,
            last_error: None,
            bind_address: "127.0.0.1".to_string(),
            bind_port: 6011,
            shutdown_tx: None,
            task: None,
        };

        let status = local_http_api_status_from_manager(&manager);

        assert!(matches!(status.state, LocalHttpApiState::Running));
        assert_eq!(
            status.address.as_deref(),
            Some(local_http_api_url("127.0.0.1", 6011).as_str())
        );
        assert!(status.last_error.is_none());
    }

    #[test]
    fn write_and_load_settings_preserve_local_http_api_flag() {
        let mut settings = test_settings();
        settings.local_http_api.enabled = true;
        settings.local_http_api.bind_address = "0.0.0.0".to_string();
        settings.local_http_api.bind_port = 6012;
        settings.auto_update_enabled = true;
        let temp_dir = std::env::temp_dir().join(format!("transfer-genie-local-http-{}", now_ms()));
        let settings_path = temp_dir.join("settings.json");

        write_settings_audited(&settings_path, &settings).expect("write settings");
        let loaded = load_settings(&settings_path, &temp_dir).expect("load settings");

        assert!(loaded.local_http_api.enabled);
        assert_eq!(loaded.local_http_api.bind_address, "0.0.0.0");
        assert_eq!(loaded.local_http_api.bind_port, 6012);
        assert!(loaded.auto_update_enabled);

        let _ = fs::remove_file(&settings_path);
        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn load_settings_defaults_ai_for_legacy_config() {
        let temp_dir = std::env::temp_dir().join(format!("transfer-genie-ai-legacy-{}", now_ms()));
        let settings_path = temp_dir.join("settings.json");
        fs::create_dir_all(&temp_dir).expect("create temp dir");
        fs::write(
            &settings_path,
            r#"{
                "webdav_endpoints": [],
                "active_webdav_id": null,
                "sender_name": "legacy",
                "refresh_interval_secs": 5,
                "download_dir": "/tmp",
                "send_hotkey": "enter",
                "global_hotkey_enabled": true,
                "global_hotkey": "alt+t",
                "auto_start": false,
                "auto_update_enabled": false,
                "local_http_api": {
                    "enabled": false,
                    "bind_address": "127.0.0.1",
                    "bind_port": 6011
                },
                "telegram": {
                    "enabled": false,
                    "auto_start": false,
                    "sender_name": "",
                    "bot_token": "",
                    "chat_id": "",
                    "proxy_enabled": false,
                    "proxy_url": "http://127.0.0.1:7890",
                    "poll_interval_secs": 5
                }
            }"#,
        )
        .expect("write legacy settings");

        let loaded = load_settings(&settings_path, &temp_dir).expect("load settings");

        assert!(!loaded.ai.enabled);
        assert_eq!(loaded.ai.provider.kind, "openai_compatible");
        assert_eq!(loaded.ai.default_action_id, "polish");
        assert!(loaded.ai.actions.iter().any(|action| action.id == "polish"));
        assert!(loaded
            .ai
            .actions
            .iter()
            .any(|action| action.category == "开发"));
        assert!(loaded
            .ai
            .actions
            .iter()
            .any(|action| action.id == "dev-requirements-brief"));
        assert!(loaded
            .ai
            .actions
            .iter()
            .any(|action| action.category == "设计"));
        assert!(loaded
            .ai
            .actions
            .iter()
            .any(|action| action.category == "影视"));
        assert!(loaded
            .ai
            .actions
            .iter()
            .any(|action| action.category == "翻译"));
        assert!(loaded
            .ai
            .actions
            .iter()
            .any(|action| action.category == "沟通"));
        assert!(loaded
            .ai
            .actions
            .iter()
            .any(|action| action.category == "格式"));

        let _ = fs::remove_file(&settings_path);
        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn default_ai_actions_include_expanded_prompt_library() {
        let settings = AiSettings::default();
        let expected_actions = [
            ("summarize-points", "总结要点", "通用"),
            ("extract-todos", "提取待办", "通用"),
            ("make-plan", "制定执行计划", "通用"),
            ("translate-to-chinese", "翻译成中文", "翻译"),
            ("translate-to-english", "翻译成英文", "翻译"),
            ("translate-keep-format", "保留格式翻译", "翻译"),
            ("chat-tone", "改成聊天语气", "沟通"),
            ("email-tone", "改成邮件语气", "沟通"),
            ("draft-reply", "生成回复", "沟通"),
            ("soften-tone", "语气更温和", "沟通"),
            ("one-line-summary", "提炼一句话", "沟通"),
            ("dev-error-analysis", "分析报错", "开发"),
            ("dev-commit-message", "生成 Commit Message", "开发"),
            ("dev-issue", "整理成 Issue", "开发"),
            ("dev-code-review", "代码审查", "开发"),
            ("dev-test-points", "生成测试点", "开发"),
            ("format-markdown", "整理为 Markdown", "格式"),
            ("format-table", "整理成表格", "格式"),
            ("format-key-info", "提取关键信息", "格式"),
            ("format-cleanup", "清理格式", "格式"),
        ];

        for (id, name, category) in expected_actions {
            let action = settings
                .actions
                .iter()
                .find(|action| action.id == id)
                .unwrap_or_else(|| panic!("missing default AI action {id}"));

            assert_eq!(action.name, name);
            assert_eq!(action.category, category);
            assert!(action.builtin);
            assert!(action.enabled);
            assert_eq!(action.output_mode, "preview_replace");
            assert!(action.user_prompt.contains("{{text}}"));
        }
    }

    #[test]
    fn normalize_settings_preserves_ai_configuration() {
        let mut settings = test_settings();
        settings.ai.enabled = true;
        settings.ai.provider.base_url = " https://api.example.com/v1/ ".to_string();
        settings.ai.provider.api_key = " sk-test ".to_string();
        settings.ai.provider.model = " model-a ".to_string();
        settings.ai.provider.temperature = 3.0;
        settings.ai.provider.timeout_secs = 0;
        settings.ai.actions.push(AiTextAction {
            id: "custom-dev".to_string(),
            name: " 自定义开发提示词 ".to_string(),
            category: " ".to_string(),
            builtin: false,
            favorite: true,
            enabled: true,
            system_prompt: "".to_string(),
            user_prompt: "处理 {{text}}".to_string(),
            output_mode: "".to_string(),
        });

        let normalized = normalize_settings(settings, Path::new("downloads")).expect("normalize");

        assert!(normalized.ai.enabled);
        assert_eq!(
            normalized.ai.provider.base_url,
            "https://api.example.com/v1"
        );
        assert_eq!(normalized.ai.provider.api_key, "sk-test");
        assert_eq!(normalized.ai.provider.model, "model-a");
        assert_eq!(normalized.ai.provider.temperature, 2.0);
        assert_eq!(normalized.ai.provider.timeout_secs, 60);
        let custom = normalized
            .ai
            .actions
            .iter()
            .find(|action| action.id == "custom-dev")
            .expect("custom action");
        assert_eq!(custom.name, "自定义开发提示词");
        assert_eq!(custom.category, "通用");
        assert_eq!(custom.output_mode, "preview_replace");
    }

    #[test]
    fn render_ai_prompt_replaces_known_variables() {
        let rendered = render_ai_prompt("格式: {{format}}\n{{text}}", "你好", "markdown");

        assert_eq!(rendered, "格式: markdown\n你好");
    }

    #[test]
    fn split_ai_think_blocks_removes_reasoning_from_output() {
        let raw = "<think>分析一下原文</think>\n\n润色后的正文";

        let (output, reasoning) = split_ai_think_blocks(raw);

        assert_eq!(output, "润色后的正文");
        assert_eq!(reasoning.as_deref(), Some("分析一下原文"));
    }

    #[test]
    fn split_ai_think_blocks_collects_multiple_blocks_case_insensitive() {
        let raw = "开头<THINK>第一段</THINK>中间<think>第二段</think>结尾";

        let (output, reasoning) = split_ai_think_blocks(raw);

        assert_eq!(output, "开头中间结尾");
        assert_eq!(reasoning.as_deref(), Some("第一段\n\n第二段"));
    }

    #[test]
    fn split_stream_delta_routes_reasoning_and_output() {
        let mut splitter = AiThinkStreamSplitter::default();

        let events = split_stream_delta("正文<think>思考</think>结尾", &mut splitter);

        assert_eq!(
            events,
            vec![
                ("output_delta".to_string(), "正文".to_string()),
                ("reasoning_delta".to_string(), "思考".to_string()),
                ("output_delta".to_string(), "结尾".to_string()),
            ]
        );
        assert!(!splitter.in_think);
        assert!(splitter.pending.is_empty());
    }

    #[test]
    fn split_stream_delta_keeps_think_state_across_chunks() {
        let mut splitter = AiThinkStreamSplitter::default();

        let first = split_stream_delta("正文<think>思", &mut splitter);
        let second = split_stream_delta("考</think>结尾", &mut splitter);

        assert_eq!(
            first,
            vec![
                ("output_delta".to_string(), "正文".to_string()),
                ("reasoning_delta".to_string(), "思".to_string()),
            ]
        );
        assert_eq!(
            second,
            vec![
                ("reasoning_delta".to_string(), "考".to_string()),
                ("output_delta".to_string(), "结尾".to_string()),
            ]
        );
        assert!(!splitter.in_think);
        assert!(splitter.pending.is_empty());
    }

    #[test]
    fn split_stream_delta_handles_tags_split_across_chunks() {
        let mut splitter = AiThinkStreamSplitter::default();

        let first = splitter.push("正文<thi");
        let second = splitter.push("nk>思考</thi");
        let third = splitter.push("nk>结尾");

        assert_eq!(
            first,
            vec![("output_delta".to_string(), "正文".to_string())]
        );
        assert_eq!(
            second,
            vec![("reasoning_delta".to_string(), "思考".to_string())]
        );
        assert_eq!(
            third,
            vec![("output_delta".to_string(), "结尾".to_string())]
        );
        assert!(!splitter.in_think);
        assert!(splitter.pending.is_empty());
    }

    #[tokio::test]
    async fn process_text_with_ai_rejects_disabled_ai() {
        let settings = test_settings();
        let request = AiTextProcessRequest {
            action_id: Some("polish".to_string()),
            text: "需要润色".to_string(),
            format: Some("text".to_string()),
            temporary_prompt: None,
        };

        let error = process_text_with_ai_impl(&Client::new(), &settings, request)
            .await
            .expect_err("disabled ai should fail");

        assert!(error.contains("AI 功能未启用"));
    }

    #[tokio::test]
    async fn process_text_with_ai_rejects_incomplete_provider() {
        let mut settings = test_settings();
        settings.ai.enabled = true;
        let request = AiTextProcessRequest {
            action_id: Some("polish".to_string()),
            text: "需要润色".to_string(),
            format: Some("markdown".to_string()),
            temporary_prompt: None,
        };

        let error = process_text_with_ai_impl(&Client::new(), &settings, request)
            .await
            .expect_err("incomplete provider should fail");

        assert!(error.contains("Base URL"));
    }

    #[test]
    fn resolve_ai_request_action_uses_temporary_prompt_without_mutating_settings() {
        let settings = test_settings();
        let original_len = settings.ai.actions.len();
        let request = AiTextProcessRequest {
            action_id: None,
            text: "需要处理".to_string(),
            format: Some("text".to_string()),
            temporary_prompt: Some(AiTemporaryPrompt {
                name: Some(" 即兴处理 ".to_string()),
                category: Some(" 临时 ".to_string()),
                system_prompt: Some(" 你是助手 ".to_string()),
                user_prompt: " 请处理：{{text}} ".to_string(),
                output_mode: None,
            }),
        };

        let action = resolve_ai_request_action(&settings.ai, &request).expect("temporary prompt");

        assert_eq!(action.id, "temporary-prompt");
        assert_eq!(action.name, "即兴处理");
        assert_eq!(action.category, "临时");
        assert_eq!(action.system_prompt, "你是助手");
        assert_eq!(action.user_prompt, "请处理：{{text}}");
        assert_eq!(action.output_mode, "preview_replace");
        assert_eq!(settings.ai.actions.len(), original_len);
    }

    #[test]
    fn resolve_ai_request_action_rejects_empty_temporary_prompt() {
        let settings = test_settings();
        let request = AiTextProcessRequest {
            action_id: None,
            text: "需要处理".to_string(),
            format: Some("text".to_string()),
            temporary_prompt: Some(AiTemporaryPrompt {
                name: None,
                category: None,
                system_prompt: None,
                user_prompt: "   ".to_string(),
                output_mode: None,
            }),
        };

        let error = match resolve_ai_request_action(&settings.ai, &request) {
            Ok(_) => panic!("empty temporary prompt should fail"),
            Err(error) => error,
        };

        assert!(error.contains("提示词"));
    }

    #[test]
    fn export_secrets_include_ai_key_without_plain_export_setting() {
        let mut settings = test_settings();
        settings.ai.enabled = true;
        settings.ai.provider.base_url = "https://api.example.com/v1".to_string();
        settings.ai.provider.api_key = "sk-secret".to_string();
        settings.ai.provider.model = "model-a".to_string();

        let secrets = extract_export_secrets(&settings);
        assert_eq!(
            secrets.ai.as_ref().map(|secret| secret.api_key.as_str()),
            Some("sk-secret")
        );

        let mut export_ai = settings.ai.clone();
        export_ai.provider.api_key.clear();
        let exported = serde_json::to_string(&export_ai).expect("serialize export ai");
        assert!(!exported.contains("sk-secret"));
    }

    #[test]
    fn export_secrets_include_speech_key_without_plain_export_setting() {
        let mut settings = test_settings();
        settings.speech_to_text.enabled = true;
        settings.speech_to_text.api_key = "speech-secret".to_string();
        settings.speech_to_text.resource_id = "volc.seedasr.sauc.duration".to_string();

        let secrets = extract_export_secrets(&settings);
        assert_eq!(
            secrets
                .speech_to_text
                .as_ref()
                .map(|secret| secret.api_key.as_str()),
            Some("speech-secret")
        );

        let mut export_speech = settings.speech_to_text.clone();
        export_speech.api_key.clear();
        let exported = serde_json::to_string(&export_speech).expect("serialize export speech");
        assert!(!exported.contains("speech-secret"));
    }

    #[test]
    fn persist_integration_module_statuses_writes_bundle_and_module_files() {
        let temp_dir =
            std::env::temp_dir().join(format!("transfer-genie-module-status-{}", now_ms()));
        let workspace_layout = WorkspaceLayout::new(temp_dir.clone());
        workspace::ensure_workspace_dirs(&workspace_layout).expect("ensure workspace dirs");

        let mut settings = test_settings();
        settings.telegram.enabled = true;
        let state = test_app_state(&temp_dir, settings);
        {
            let mut status = state.sync_status.lock().expect("lock sync status");
            status.running = true;
            status.last_run_ms = Some(100);
        }
        {
            let mut manager = state.telegram_bridge.lock().expect("lock telegram manager");
            manager.last_started_ms = Some(200);
            manager.last_stopped_ms = Some(150);
            manager.last_error = Some("bridge error".to_string());
        }

        persist_integration_module_statuses(&state).expect("persist integration module statuses");

        let workspace_root = workspace_root_for_state(&state);
        assert!(workspace_root
            .join("plugins")
            .join("module-status.json")
            .is_file());
        assert!(workspace_root
            .join("plugins")
            .join("webdav-sync")
            .join("status.json")
            .is_file());
        assert!(workspace_root
            .join("plugins")
            .join("telegram-bridge")
            .join("status.json")
            .is_file());

        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn write_settings_audited_creates_change_log() {
        let temp_dir =
            std::env::temp_dir().join(format!("transfer-genie-settings-audit-{}", now_ms()));
        let settings_path = temp_dir.join("settings.json");
        let workspace_root = temp_dir.join(workspace::WORKSPACE_DIR_NAME);

        let settings = test_settings();
        write_settings_audited(&settings_path, &settings).expect("write settings");

        assert!(settings_path.is_file());
        assert!(workspace_root
            .join("change-log")
            .join("events.jsonl")
            .is_file());

        let _ = fs::remove_file(&settings_path);
        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn list_settings_snapshots_for_state_returns_latest_snapshots() {
        let temp_dir =
            std::env::temp_dir().join(format!("transfer-genie-settings-snapshots-{}", now_ms()));
        let workspace_layout = WorkspaceLayout::new(temp_dir.clone());
        workspace::ensure_workspace_dirs(&workspace_layout).expect("ensure workspace dirs");
        let settings_path = temp_dir.join("settings.json");

        let mut settings = test_settings();
        settings.sender_name = "first".to_string();
        write_settings_audited(&settings_path, &settings).expect("write first settings");
        settings.sender_name = "second".to_string();
        write_settings_audited(&settings_path, &settings).expect("write second settings");

        let state = test_app_state(&temp_dir, settings);
        let snapshots = list_settings_snapshots_for_state(&state).expect("list settings snapshots");

        assert!(!snapshots.is_empty());
        assert_eq!(snapshots[0].category, "settings");
        assert_eq!(
            snapshots[0].target_path,
            settings_path.to_string_lossy().to_string()
        );

        let _ = fs::remove_file(&settings_path);
        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[tokio::test]
    async fn restore_settings_snapshot_updates_in_memory_settings() {
        let temp_dir = std::env::temp_dir().join(format!(
            "transfer-genie-restore-settings-snapshot-{}",
            now_ms()
        ));
        let workspace_layout = WorkspaceLayout::new(temp_dir.clone());
        workspace::ensure_workspace_dirs(&workspace_layout).expect("ensure workspace dirs");
        let settings_path = temp_dir.join("settings.json");

        let mut settings = test_settings();
        settings.sender_name = "before".to_string();
        write_settings_audited(&settings_path, &settings).expect("write first settings");
        settings.sender_name = "after".to_string();
        write_settings_audited(&settings_path, &settings).expect("write second settings");

        let state = test_app_state(&temp_dir, settings.clone());
        let snapshots = list_settings_snapshots_for_state(&state).expect("list settings snapshots");
        let restore_source = snapshots.last().expect("oldest snapshot");

        workspace::restore_snapshot_to_target(
            Path::new(&restore_source.path),
            &state.settings_path,
            Some(&workspace_root_for_state(&state)),
            "settings",
            "restore-settings-snapshot-test",
        )
        .expect("restore settings snapshot");

        let restored = load_settings(&state.settings_path, &state.default_download_dir)
            .expect("load restored settings");
        {
            let mut guard = state.settings.lock().expect("lock settings");
            *guard = restored.clone();
        }

        assert_eq!(restored.sender_name, "before");
        assert_eq!(
            state
                .settings
                .lock()
                .expect("lock updated settings")
                .sender_name,
            "before"
        );

        let _ = fs::remove_file(&settings_path);
        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn normalize_settings_applies_backup_defaults() {
        let mut settings = test_settings();
        let download_dir = std::env::temp_dir().join("transfer-genie-normalize-backup");
        settings.backup.enabled = true;
        settings.backup.interval_minutes = 0;
        settings.backup.retain_count = 0;

        let normalized = normalize_settings(settings, &download_dir).expect("normalize settings");

        assert_eq!(normalized.backup.interval_minutes, 5);
        assert_eq!(normalized.backup.retain_count, 1);
    }

    #[test]
    fn prune_auto_backup_archives_keeps_latest_files() {
        let archive_dir =
            std::env::temp_dir().join(format!("transfer-genie-backup-prune-{}", now_ms()));
        fs::create_dir_all(&archive_dir).expect("create archive dir");
        for name in ["001.zip", "002.zip", "003.zip"] {
            fs::write(archive_dir.join(name), name.as_bytes()).expect("write archive");
        }

        prune_auto_backup_archives(&archive_dir, 2).expect("prune backups");

        assert!(!archive_dir.join("001.zip").exists());
        assert!(archive_dir.join("002.zip").exists());
        assert!(archive_dir.join("003.zip").exists());

        let _ = fs::remove_dir_all(&archive_dir);
    }

    #[test]
    fn local_backup_record_legacy_json_defaults_manual_metadata() {
        let content = r#"{
            "endpointId":"endpoint-a",
            "backupPath":"E:/archives/backup.zip",
            "createdAtMs":100,
            "source":"backup-webdav"
        }"#;

        let record: LocalBackupRecord = serde_json::from_str(content).expect("parse legacy record");

        assert!(!record.manual);
        assert_eq!(record.name, "");
        assert_eq!(record.note, "");
    }

    #[test]
    fn prune_auto_backup_archives_preserves_manual_files() {
        let archive_dir =
            std::env::temp_dir().join(format!("transfer-genie-backup-prune-manual-{}", now_ms()));
        fs::create_dir_all(&archive_dir).expect("create archive dir");
        for name in ["001.zip", "002.zip", "003.zip", "manual.zip"] {
            fs::write(archive_dir.join(name), name.as_bytes()).expect("write archive");
        }
        let manual_path = archive_dir.join("manual.zip");
        save_backup_manual_metadata(
            &manual_path,
            &BackupManualMetadata {
                manual: true,
                name: "keep".to_string(),
                note: "manual".to_string(),
                created_at_ms: Some(1),
                kind: "local-data".to_string(),
            },
            None,
            "backup-metadata",
            "test",
        )
        .expect("write manual metadata");

        prune_auto_backup_archives(&archive_dir, 2).expect("prune backups");

        assert!(!archive_dir.join("001.zip").exists());
        assert!(archive_dir.join("002.zip").exists());
        assert!(archive_dir.join("003.zip").exists());
        assert!(manual_path.exists());
        assert!(backup_metadata_path(&manual_path).exists());

        let _ = fs::remove_dir_all(&archive_dir);
    }

    #[test]
    fn save_and_load_auto_backup_state_round_trip() {
        let temp_dir =
            std::env::temp_dir().join(format!("transfer-genie-backup-state-{}", now_ms()));
        let workspace_layout = WorkspaceLayout::new(temp_dir.clone());
        workspace::ensure_workspace_dirs(&workspace_layout).expect("ensure workspace dirs");
        let state = test_app_state(&temp_dir, test_settings());
        let record = AutoBackupStateRecord {
            last_run_ms: Some(100),
            last_success_ms: Some(90),
            last_error: Some("backup failed".to_string()),
            last_backup_path: Some("E:/backup.zip".to_string()),
        };

        save_auto_backup_state(&state, &record).expect("save auto backup state");
        let loaded = load_auto_backup_state(&state);

        assert_eq!(loaded.last_run_ms, Some(100));
        assert_eq!(loaded.last_success_ms, Some(90));
        assert_eq!(loaded.last_error.as_deref(), Some("backup failed"));
        assert_eq!(loaded.last_backup_path.as_deref(), Some("E:/backup.zip"));
        assert!(auto_backup_state_path(&state).is_file());

        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn auto_backup_status_for_state_combines_settings_and_persisted_state() {
        let temp_dir =
            std::env::temp_dir().join(format!("transfer-genie-auto-backup-status-{}", now_ms()));
        let workspace_layout = WorkspaceLayout::new(temp_dir.clone());
        workspace::ensure_workspace_dirs(&workspace_layout).expect("ensure workspace dirs");
        let mut settings = test_settings();
        settings.backup.enabled = true;
        settings.backup.interval_minutes = 15;
        settings.backup.retain_count = 3;
        settings.backup.settings_snapshot_retain_count = 4;
        let state = test_app_state(&temp_dir, settings);
        let persisted = AutoBackupStateRecord {
            last_run_ms: Some(100),
            last_success_ms: Some(90),
            last_error: Some("backup failed".to_string()),
            last_backup_path: Some("E:/archives/auto.zip".to_string()),
        };
        save_auto_backup_state(&state, &persisted).expect("save auto backup state");

        let status = auto_backup_status_for_state(&state).expect("auto backup status");

        assert!(status.enabled);
        assert_eq!(status.interval_minutes, 15);
        assert_eq!(status.retain_count, 3);
        assert_eq!(status.settings_snapshot_retain_count, 4);
        assert!(status.has_active_endpoint);
        assert_eq!(status.last_run_ms, Some(100));
        assert_eq!(status.last_success_ms, Some(90));
        assert_eq!(status.last_error.as_deref(), Some("backup failed"));
        assert_eq!(
            status.last_backup_path.as_deref(),
            Some("E:/archives/auto.zip")
        );

        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn should_run_auto_backup_respects_enablement_endpoint_and_interval() {
        let mut settings = test_settings();
        settings.backup.enabled = true;
        settings.backup.interval_minutes = 10;

        assert!(should_run_auto_backup(&settings, None, 1_000));
        assert!(!should_run_auto_backup(
            &settings,
            Some(1_000),
            1_000 + 5 * 60 * 1000
        ));
        assert!(should_run_auto_backup(
            &settings,
            Some(1_000),
            1_000 + 10 * 60 * 1000
        ));

        settings.backup.enabled = false;
        assert!(!should_run_auto_backup(&settings, None, 1_000));

        settings.backup.enabled = true;
        settings.active_webdav_id = None;
        assert!(!should_run_auto_backup(&settings, None, 1_000));
    }

    #[test]
    fn normalize_settings_defaults_backup_directory_and_retention_windows() {
        let mut settings = test_settings();
        settings.backup.directory = "  ".to_string();
        settings.backup.keep_all_days = 0;
        settings.backup.keep_daily_days = 1;

        let normalized =
            normalize_settings(settings, Path::new("downloads")).expect("normalize settings");

        assert!(normalized.backup.directory.contains("TransferGenie"));
        assert_eq!(normalized.backup.keep_all_days, 1);
        assert_eq!(normalized.backup.keep_daily_days, 1);
    }

    #[test]
    fn retention_selection_keeps_all_recent_and_one_daily_snapshot() {
        let day_ms = 24 * 60 * 60 * 1000_i64;
        let now = 10 * day_ms;
        let entries = vec![
            (PathBuf::from("day-0-a.zip"), now),
            (PathBuf::from("day-2-a.zip"), now - 2 * day_ms),
            (PathBuf::from("day-4-a.zip"), now - 4 * day_ms),
            (PathBuf::from("day-4-b.zip"), now - 4 * day_ms + 1),
            (PathBuf::from("day-8-a.zip"), now - 8 * day_ms),
        ];

        let retained = select_retained_snapshot_paths(entries, now, 3, 7);

        assert!(retained.contains(&PathBuf::from("day-0-a.zip")));
        assert!(retained.contains(&PathBuf::from("day-2-a.zip")));
        assert_eq!(
            retained.contains(&PathBuf::from("day-4-a.zip")) as u8
                + retained.contains(&PathBuf::from("day-4-b.zip")) as u8,
            1
        );
        assert!(!retained.contains(&PathBuf::from("day-8-a.zip")));
    }

    #[test]
    fn build_webdav_conflict_detects_remote_metadata_change() {
        let existing = DbMessage {
            endpoint_id: "endpoint-1".to_string(),
            filename: "message.txt".to_string(),
            sender: "sender".to_string(),
            timestamp_ms: 1,
            size: 10,
            kind: "text".to_string(),
            original_name: "message.txt".to_string(),
            etag: Some("local".to_string()),
            mtime: Some("old".to_string()),
            content: Some("hello".to_string()),
            local_path: None,
            remote_path: Some("files/message.txt".to_string()),
            file_hash: None,
            marked: false,
            marked_tag_ids: Vec::new(),
            marked_pinned: false,
            marked_due_date: None,
            format: "text".to_string(),
        };
        let remote = crate::types::DavEntry {
            filename: "message.txt".to_string(),
            remote_path: "files/message.txt".to_string(),
            href: String::new(),
            etag: Some("remote".to_string()),
            size: Some(12),
            mtime: Some("new".to_string()),
            is_collection: false,
        };

        let conflict = build_webdav_conflict("endpoint-1", "message.txt", &existing, &remote)
            .expect("conflict");

        assert_eq!(conflict.endpoint_id, "endpoint-1");
        assert_eq!(conflict.remote_path, "files/message.txt");
        assert_eq!(conflict.local_etag.as_deref(), Some("local"));
        assert_eq!(conflict.remote_etag.as_deref(), Some("remote"));
    }

    #[test]
    fn record_local_backup_event_writes_backup_record_and_change_log() {
        let temp_dir =
            std::env::temp_dir().join(format!("transfer-genie-backup-record-{}", now_ms()));
        let workspace_layout = WorkspaceLayout::new(temp_dir.clone());
        workspace::ensure_workspace_dirs(&workspace_layout).expect("ensure workspace dirs");
        let settings = test_settings();
        let endpoint = settings
            .webdav_endpoints
            .first()
            .cloned()
            .expect("test endpoint");
        let state = test_app_state(&temp_dir, settings);

        record_local_backup_event(&state, &endpoint, "E:/archives/backup.zip", "backup-webdav")
            .expect("record backup event");

        let backups_dir = workspace_root_for_state(&state).join("backups");
        let backup_records = fs::read_dir(&backups_dir)
            .expect("read backups dir")
            .filter_map(Result::ok)
            .filter(|entry| {
                entry.path().extension().and_then(|value| value.to_str()) == Some("json")
            })
            .collect::<Vec<_>>();
        assert_eq!(backup_records.len(), 1);

        let record_content =
            fs::read_to_string(backup_records[0].path()).expect("read backup record content");
        let record_json: serde_json::Value =
            serde_json::from_str(&record_content).expect("parse backup record json");
        assert_eq!(
            record_json
                .get("endpointId")
                .and_then(|value| value.as_str()),
            Some("endpoint-1")
        );
        assert_eq!(
            record_json
                .get("backupPath")
                .and_then(|value| value.as_str()),
            Some("E:/archives/backup.zip")
        );
        assert_eq!(
            record_json.get("source").and_then(|value| value.as_str()),
            Some("backup-webdav")
        );

        let change_log_path = workspace_root_for_state(&state)
            .join("change-log")
            .join("events.jsonl");
        let change_log = fs::read_to_string(&change_log_path).expect("read change log");
        assert!(change_log.contains("\"category\":\"backup-record\""));
        assert!(change_log.contains("\"operation\":\"backup-webdav\""));

        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn list_local_backup_archives_for_state_returns_sorted_records() {
        let temp_dir =
            std::env::temp_dir().join(format!("transfer-genie-list-backup-records-{}", now_ms()));
        let workspace_layout = WorkspaceLayout::new(temp_dir.clone());
        workspace::ensure_workspace_dirs(&workspace_layout).expect("ensure workspace dirs");
        let settings = test_settings();
        let endpoint = settings
            .webdav_endpoints
            .first()
            .cloned()
            .expect("test endpoint");
        let state = test_app_state(&temp_dir, settings);

        let archive_a = temp_dir.join("archive-a.zip");
        let archive_b = temp_dir.join("archive-b.zip");
        fs::write(&archive_a, b"a").expect("write archive a");
        fs::write(&archive_b, b"bb").expect("write archive b");

        record_local_backup_event(
            &state,
            &endpoint,
            &archive_a.to_string_lossy(),
            "backup-webdav",
        )
        .expect("record backup event a");
        std::thread::sleep(std::time::Duration::from_millis(2));
        record_local_backup_event(
            &state,
            &endpoint,
            &archive_b.to_string_lossy(),
            "restore-webdav",
        )
        .expect("record backup event b");

        let records = list_local_backup_archives_for_state(&state)
            .expect("list local backup archive records");

        assert_eq!(records.len(), 2);
        assert_eq!(
            records[0].backup_path,
            archive_b.to_string_lossy().to_string()
        );
        assert_eq!(records[0].source, "restore-webdav");
        assert!(records[0].exists);
        assert_eq!(records[0].size_bytes, 2);
        assert_eq!(
            records[1].backup_path,
            archive_a.to_string_lossy().to_string()
        );

        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn clear_local_backup_archives_removes_archives_metadata_and_records() {
        let temp_dir =
            std::env::temp_dir().join(format!("transfer-genie-clear-backup-records-{}", now_ms()));
        let workspace_layout = WorkspaceLayout::new(temp_dir.clone());
        workspace::ensure_workspace_dirs(&workspace_layout).expect("ensure workspace dirs");
        let mut settings = test_settings();
        settings.backup.directory = temp_dir
            .join("configured-backups")
            .to_string_lossy()
            .to_string();
        let endpoint = settings
            .webdav_endpoints
            .first()
            .cloned()
            .expect("test endpoint");
        let state = test_app_state(&temp_dir, settings.clone());

        let webdav_archive = temp_dir.join("archive-webdav.zip");
        fs::write(&webdav_archive, b"webdav").expect("write webdav archive");
        record_local_backup_event(
            &state,
            &endpoint,
            &webdav_archive.to_string_lossy(),
            "backup-webdav",
        )
        .expect("record webdav backup");

        let local_archive =
            configured_backup_dir(&settings).join("transfer-genie-local-data-1.zip");
        ensure_parent_dir(&local_archive).expect("create local archive parent");
        fs::write(&local_archive, b"local").expect("write local archive");
        save_backup_manual_metadata(
            &local_archive,
            &BackupManualMetadata {
                manual: true,
                name: "manual".to_string(),
                note: "note".to_string(),
                created_at_ms: Some(1),
                kind: "local-data".to_string(),
            },
            None,
            "backup-metadata",
            "test",
        )
        .expect("write local metadata");

        let removed = clear_local_backup_archives_for_state(&state).expect("clear archives");

        assert_eq!(removed, 2);
        assert!(!webdav_archive.exists());
        assert!(!local_archive.exists());
        assert!(!backup_metadata_path(&local_archive).exists());
        assert!(list_local_backup_archives_for_state(&state)
            .expect("list webdav records")
            .is_empty());
        let remaining_local_archives = fs::read_dir(configured_backup_dir(&settings))
            .expect("read backup dir")
            .filter_map(Result::ok)
            .filter(|entry| {
                entry.path().extension().and_then(|value| value.to_str()) == Some("zip")
            })
            .count();
        assert_eq!(remaining_local_archives, 0);

        let _ = fs::remove_dir_all(&temp_dir);
    }

    fn build_test_restore_archive(
        entry_names: &[&str],
    ) -> zip::ZipArchive<std::io::Cursor<Vec<u8>>> {
        use std::io::{Cursor, Write};
        use zip::write::FileOptions;

        let cursor = Cursor::new(Vec::new());
        let mut writer = zip::ZipWriter::new(cursor);
        let options: FileOptions<'_, ()> =
            FileOptions::default().compression_method(zip::CompressionMethod::Stored);

        for entry_name in entry_names {
            writer
                .start_file(entry_name, options)
                .expect("start archive entry");
            writer.write_all(b"{}").expect("write archive entry");
        }

        let cursor = writer.finish().expect("finish archive");
        zip::ZipArchive::new(Cursor::new(cursor.into_inner())).expect("open archive")
    }

    #[test]
    fn validate_restore_archive_history_entries_accepts_legacy_history_file() {
        let mut archive = build_test_restore_archive(&["history.json", "files/example.txt"]);

        assert!(restore_archive_has_history_entries(&mut archive));
        let result = validate_restore_archive_history_entries(&mut archive);

        assert!(result.is_ok());
    }

    #[test]
    fn validate_restore_archive_history_entries_accepts_manifest_history_file() {
        let mut archive = build_test_restore_archive(&["history/index.json", "files/example.txt"]);

        assert!(restore_archive_has_history_entries(&mut archive));
        let result = validate_restore_archive_history_entries(&mut archive);

        assert!(result.is_ok());
    }

    #[test]
    fn validate_restore_archive_history_entries_rejects_archive_without_history_index() {
        let mut archive = build_test_restore_archive(&["files/example.txt"]);

        assert!(!restore_archive_has_history_entries(&mut archive));
        let error = validate_restore_archive_history_entries(&mut archive)
            .expect_err("archive without history entry should fail");

        assert!(error.contains("history.json"));
    }

    #[test]
    fn restore_archive_target_path_rejects_empty_names() {
        assert_eq!(restore_archive_target_path(""), None);
        assert_eq!(restore_archive_target_path("   "), None);
    }

    #[test]
    fn restore_archive_target_path_keeps_non_empty_names() {
        assert_eq!(
            restore_archive_target_path("files/example.txt"),
            Some("files/example.txt")
        );
        assert_eq!(
            restore_archive_target_path(" history/index.json "),
            Some("history/index.json")
        );
    }

    #[test]
    fn classify_restore_archive_entry_skips_empty_names() {
        assert!(matches!(
            classify_restore_archive_entry("   ", false),
            RestoreArchiveEntryKind::Skip
        ));
    }

    #[test]
    fn classify_restore_archive_entry_marks_directory_entries() {
        match classify_restore_archive_entry(" files/subdir ", true) {
            RestoreArchiveEntryKind::Directory(path) => assert_eq!(path, "files/subdir"),
            _ => panic!("expected directory entry"),
        }
    }

    #[test]
    fn classify_restore_archive_entry_marks_file_entries() {
        match classify_restore_archive_entry(" files/example.txt ", false) {
            RestoreArchiveEntryKind::File(path) => assert_eq!(path, "files/example.txt"),
            _ => panic!("expected file entry"),
        }
    }

    #[test]
    fn should_skip_restore_cleanup_path_matches_root_and_root_slash_only() {
        assert!(should_skip_restore_cleanup_path("files", "files"));
        assert!(should_skip_restore_cleanup_path("files/", "files"));
        assert!(!should_skip_restore_cleanup_path(
            "files/example.txt",
            "files"
        ));
        assert!(!should_skip_restore_cleanup_path(
            "history/index.json",
            "history"
        ));
    }

    #[test]
    fn load_settings_defaults_auto_update_flag_for_legacy_config() {
        let temp_dir =
            std::env::temp_dir().join(format!("transfer-genie-settings-legacy-{}", now_ms()));
        let settings_path = temp_dir.join("settings.json");
        fs::create_dir_all(&temp_dir).expect("create temp dir");
        fs::write(
            &settings_path,
            r#"{
                "webdav_endpoints": [],
                "active_webdav_id": null,
                "sender_name": "legacy",
                "refresh_interval_secs": 5,
                "download_dir": "/tmp",
                "send_hotkey": "enter",
                "global_hotkey_enabled": true,
                "global_hotkey": "alt+t",
                "auto_start": false,
                "local_http_api": {
                    "enabled": false,
                    "bind_address": "127.0.0.1",
                    "bind_port": 6011
                },
                "telegram": {
                    "enabled": false,
                    "auto_start": false,
                    "sender_name": "",
                    "bot_token": "",
                    "chat_id": "",
                    "proxy_enabled": false,
                    "proxy_url": "http://127.0.0.1:7890",
                    "poll_interval_secs": 5
                }
            }"#,
        )
        .expect("write legacy settings");

        let loaded = load_settings(&settings_path, &temp_dir).expect("load settings");

        assert!(!loaded.auto_update_enabled);

        let _ = fs::remove_file(&settings_path);
        let _ = fs::remove_dir_all(&temp_dir);
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

        crate::telegram_bridge_runtime::finish_telegram_bridge_process(&mut manager, process, None);

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

        crate::telegram_bridge_runtime::refresh_telegram_bridge_manager(&mut manager);

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
