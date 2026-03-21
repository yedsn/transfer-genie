use crate::filenames::{build_message_filename, parse_message_filename, MessageKind};
use crate::history::{append_history, load_history, save_history, HistoryEntry};
use crate::types::WebDavEndpoint;
use crate::webdav;
use log::{error, info, warn};
use reqwest::multipart::{Form, Part};
use reqwest::{Client, Proxy};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::env;
use std::fmt::{Display, Formatter};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::Duration;

const DEFAULT_POLL_INTERVAL_SECS: u64 = 5;
const TELEGRAM_GET_FILE_LIMIT_BYTES: i64 = 20 * 1024 * 1024;
const TELEGRAM_SEND_FILE_LIMIT_BYTES: i64 = 50 * 1024 * 1024;

#[derive(Clone, Deserialize)]
pub struct TelegramBridgeConfig {
    pub telegram_bot_token: String,
    pub allowed_chat_id: i64,
    #[serde(default)]
    pub proxy_url: String,
    pub webdav: WebDavEndpoint,
    #[serde(default = "default_poll_interval_secs")]
    pub poll_interval_secs: u64,
    #[serde(default)]
    pub state_path: String,
    #[serde(default)]
    pub temp_dir: String,
}

impl TelegramBridgeConfig {
    pub fn load(path: &Path) -> Result<Self, String> {
        let raw = fs::read_to_string(path)
            .map_err(|err| format!("读取桥接配置失败 {}: {err}", path.display()))?;
        let mut config: TelegramBridgeConfig =
            serde_json::from_str(&raw).map_err(|err| format!("解析桥接配置失败: {err}"))?;
        if config.telegram_bot_token.trim().is_empty() {
            return Err("telegram_bot_token 不能为空".to_string());
        }
        if config.allowed_chat_id == 0 {
            return Err("allowed_chat_id 不能为空".to_string());
        }
        if config.webdav.url.trim().is_empty() {
            return Err("webdav.url 不能为空".to_string());
        }
        if config.webdav.id.trim().is_empty() {
            config.webdav.id = "telegram-bridge".to_string();
        }
        if config.webdav.name.trim().is_empty() {
            config.webdav.name = "Telegram Bridge".to_string();
        }
        config.proxy_url = config.proxy_url.trim().to_string();
        config.webdav.enabled = true;
        config.poll_interval_secs = config.poll_interval_secs.max(1);
        let base = path.parent().unwrap_or_else(|| Path::new("."));
        if config.state_path.trim().is_empty() {
            config.state_path = base
                .join("telegram-bridge-state.json")
                .to_string_lossy()
                .to_string();
        }
        if config.temp_dir.trim().is_empty() {
            config.temp_dir = base
                .join("telegram-bridge-tmp")
                .to_string_lossy()
                .to_string();
        }
        Ok(config)
    }

    fn state_path(&self) -> PathBuf {
        PathBuf::from(&self.state_path)
    }

    fn temp_dir(&self) -> PathBuf {
        PathBuf::from(&self.temp_dir)
    }
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct BridgeState {
    #[serde(default)]
    pub last_update_id: i64,
    #[serde(default)]
    pub outbound_live_after_ms: i64,
    #[serde(default)]
    pub imported_telegram_messages: HashMap<String, String>,
    #[serde(default)]
    pub telegram_origin_filenames: HashSet<String>,
    #[serde(default)]
    pub outbound_messages: HashMap<String, OutboundRecord>,
}

impl BridgeState {
    pub fn load(path: &Path) -> Result<Self, String> {
        if !path.exists() {
            return Ok(Self::default());
        }
        let raw = fs::read_to_string(path)
            .map_err(|err| format!("读取桥接状态失败 {}: {err}", path.display()))?;
        serde_json::from_str(&raw).map_err(|err| format!("解析桥接状态失败: {err}"))
    }

    pub fn save(&self, path: &Path) -> Result<(), String> {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)
                .map_err(|err| format!("创建桥接状态目录失败 {}: {err}", parent.display()))?;
        }
        let temp = path.with_extension("tmp");
        let data =
            serde_json::to_vec_pretty(self).map_err(|err| format!("序列化桥接状态失败: {err}"))?;
        fs::write(&temp, data)
            .map_err(|err| format!("写入桥接状态临时文件失败 {}: {err}", temp.display()))?;
        fs::rename(&temp, path)
            .map_err(|err| format!("更新桥接状态文件失败 {}: {err}", path.display()))
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum OutboundStatus {
    Sent,
    RetryableError,
    PermanentFailure,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct OutboundRecord {
    pub status: OutboundStatus,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub telegram_message_id: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_error: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum ErrorKind {
    Permanent,
    Transient,
}

#[derive(Debug, Clone)]
struct BridgeError {
    kind: ErrorKind,
    category: &'static str,
    message: String,
}

impl BridgeError {
    fn permanent(category: &'static str, message: impl Into<String>) -> Self {
        Self {
            kind: ErrorKind::Permanent,
            category,
            message: message.into(),
        }
    }

    fn transient(category: &'static str, message: impl Into<String>) -> Self {
        Self {
            kind: ErrorKind::Transient,
            category,
            message: message.into(),
        }
    }
}

impl Display for BridgeError {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}: {}", self.category, self.message)
    }
}

#[derive(Debug, Deserialize)]
struct TelegramApiResponse<T> {
    ok: bool,
    result: Option<T>,
    description: Option<String>,
    error_code: Option<i64>,
}

#[derive(Debug, Deserialize)]
struct TelegramUpdate {
    update_id: i64,
    #[serde(default)]
    message: Option<TelegramMessage>,
}

#[derive(Debug, Deserialize)]
struct TelegramMessage {
    message_id: i64,
    date: i64,
    chat: TelegramChat,
    #[serde(default)]
    from: Option<TelegramUser>,
    #[serde(default)]
    text: Option<String>,
    #[serde(default)]
    document: Option<TelegramMedia>,
    #[serde(default)]
    photo: Vec<TelegramPhotoSize>,
    #[serde(default)]
    video: Option<TelegramMedia>,
    #[serde(default)]
    audio: Option<TelegramMedia>,
    #[serde(default)]
    voice: Option<TelegramMedia>,
    #[serde(default)]
    animation: Option<TelegramMedia>,
}

#[derive(Debug, Deserialize)]
struct TelegramChat {
    id: i64,
}

#[derive(Debug, Deserialize)]
struct TelegramUser {
    id: i64,
    first_name: String,
    #[serde(default)]
    last_name: Option<String>,
    #[serde(default)]
    username: Option<String>,
}

#[derive(Debug, Deserialize, Clone)]
struct TelegramMedia {
    file_id: String,
    #[serde(default)]
    file_name: Option<String>,
    #[serde(default)]
    file_size: Option<i64>,
    #[serde(default)]
    mime_type: Option<String>,
}

#[derive(Debug, Deserialize, Clone)]
struct TelegramPhotoSize {
    file_id: String,
    #[serde(default)]
    file_size: Option<i64>,
}

#[derive(Debug, Deserialize)]
struct TelegramFile {
    file_path: Option<String>,
}

#[derive(Debug, Deserialize)]
struct TelegramSentMessage {
    message_id: i64,
}

enum InboundPayload {
    Text(String),
    File {
        file_id: String,
        original_name: String,
        size_hint: Option<i64>,
    },
}

pub async fn run() -> Result<(), String> {
    let config_path = resolve_config_path();
    let config = TelegramBridgeConfig::load(&config_path)?;
    fs::create_dir_all(config.temp_dir()).map_err(|err| {
        format!(
            "创建桥接临时目录失败 {}: {err}",
            config.temp_dir().display()
        )
    })?;

    let webdav_client = Client::builder()
        .timeout(Duration::from_secs(config.poll_interval_secs.max(30) + 15))
        .build()
        .map_err(|err| format!("初始化 HTTP 客户端失败: {err}"))?;
    let telegram_client = build_telegram_client(&config)
        .map_err(|err| format!("鍒濆鍖?Telegram HTTP 瀹㈡埛绔け璐? {err}"))?;
    webdav::ensure_directory(&webdav_client, &config.webdav, "files").await?;

    let state_path = config.state_path();
    let mut state = BridgeState::load(&state_path)?;
    state.outbound_live_after_ms = now_ms();
    state.save(&state_path)?;
    info!(
        "event=bridge_started config={} chat_id={} outbound_live_after_ms={}",
        config_path.display(),
        config.allowed_chat_id,
        state.outbound_live_after_ms
    );

    loop {
        let mut dirty = false;

        match fetch_updates(&telegram_client, &config, state.last_update_id).await {
            Ok(updates) => {
                for update in updates {
                    match process_update(
                        &telegram_client,
                        &webdav_client,
                        &config,
                        &mut state,
                        update,
                    )
                    .await
                    {
                        Ok(changed) => dirty |= changed,
                        Err(err) => {
                            log_bridge_error("telegram_inbound_failed", &err);
                            if err.kind == ErrorKind::Transient {
                                break;
                            }
                        }
                    }
                }
            }
            Err(err) => log_bridge_error("telegram_poll_failed", &err),
        }

        match sync_webdav_to_telegram(&telegram_client, &webdav_client, &config, &mut state).await {
            Ok(changed) => dirty |= changed,
            Err(err) => log_bridge_error("telegram_outbound_failed", &err),
        }

        if dirty {
            state.save(&state_path)?;
        }
    }
}

fn resolve_config_path() -> PathBuf {
    let mut args = env::args_os().skip(1);
    if let Some(arg) = args.next() {
        if arg.to_string_lossy() == "--telegram-bridge" {
            if let Some(config_path) = args.next() {
                return PathBuf::from(config_path);
            }
        } else {
            return PathBuf::from(arg);
        }
    }
    if let Some(value) = env::var_os("TRANSFER_GENIE_TELEGRAM_BRIDGE_CONFIG") {
        return PathBuf::from(value);
    }
    PathBuf::from("telegram-bridge.json")
}

fn build_telegram_client(config: &TelegramBridgeConfig) -> Result<Client, String> {
    let mut builder =
        Client::builder().timeout(Duration::from_secs(config.poll_interval_secs.max(30) + 15));
    if !config.proxy_url.trim().is_empty() {
        let proxy = Proxy::all(config.proxy_url.trim())
            .map_err(|err| format!("Telegram 代理地址无效: {err}"))?;
        builder = builder.proxy(proxy);
    }
    builder
        .build()
        .map_err(|err| format!("创建 Telegram HTTP 客户端失败: {err}"))
}

async fn fetch_updates(
    client: &Client,
    config: &TelegramBridgeConfig,
    last_update_id: i64,
) -> Result<Vec<TelegramUpdate>, BridgeError> {
    let response = client
        .post(telegram_api_url(&config.telegram_bot_token, "getUpdates"))
        .json(&serde_json::json!({
          "offset": last_update_id + 1,
          "timeout": config.poll_interval_secs,
          "allowed_updates": ["message"],
        }))
        .send()
        .await
        .map_err(|err| BridgeError::transient("telegram_network", format!("轮询失败: {err}")))?;
    parse_telegram_response::<Vec<TelegramUpdate>>(response).await
}

async fn process_update(
    telegram_client: &Client,
    webdav_client: &Client,
    config: &TelegramBridgeConfig,
    state: &mut BridgeState,
    update: TelegramUpdate,
) -> Result<bool, BridgeError> {
    let Some(message) = update.message else {
        state.last_update_id = update.update_id;
        return Ok(true);
    };

    if message.chat.id != config.allowed_chat_id {
        warn!(
            "event=telegram_unauthorized_update chat_id={} message_id={}",
            message.chat.id, message.message_id
        );
        state.last_update_id = update.update_id;
        return Ok(true);
    }

    let message_key = telegram_message_key(message.chat.id, message.message_id);
    if state.imported_telegram_messages.contains_key(&message_key) {
        state.last_update_id = update.update_id;
        return Ok(true);
    }

    let Some(payload) = extract_inbound_payload(&message) else {
        info!(
            "event=telegram_update_skipped reason=unsupported message_id={}",
            message.message_id
        );
        state.last_update_id = update.update_id;
        return Ok(true);
    };

    let sender = resolve_sender(message.from.as_ref());
    let filename = import_into_webdav(
        telegram_client,
        webdav_client,
        config,
        &payload,
        &sender,
        message.date * 1000,
    )
    .await?;
    state
        .imported_telegram_messages
        .insert(message_key, filename.clone());
    state.telegram_origin_filenames.insert(filename);
    state.last_update_id = update.update_id;
    Ok(true)
}

async fn import_into_webdav(
    telegram_client: &Client,
    webdav_client: &Client,
    config: &TelegramBridgeConfig,
    payload: &InboundPayload,
    sender: &str,
    timestamp_ms: i64,
) -> Result<String, BridgeError> {
    webdav::ensure_directory(webdav_client, &config.webdav, "files")
        .await
        .map_err(|err| BridgeError::transient("webdav_io", err))?;

    match payload {
        InboundPayload::Text(text) => {
            let filename = build_message_filename(sender, "message.txt", timestamp_ms);
            let bytes = text.clone().into_bytes();
            webdav::upload_file(
                webdav_client,
                &config.webdav,
                &format!("files/{filename}"),
                bytes.clone(),
            )
            .await
            .map_err(|err| BridgeError::transient("webdav_io", err))?;
            append_history(
                webdav_client,
                &config.webdav,
                HistoryEntry {
                    filename: filename.clone(),
                    sender: sender.to_string(),
                    timestamp_ms,
                    size: bytes.len() as i64,
                    kind: MessageKind::Text.as_str().to_string(),
                    original_name: "message.txt".to_string(),
                    marked: false,
                    format: "text".to_string(),
                },
            )
            .await
            .map_err(|err| BridgeError::transient("webdav_history", err))?;
            Ok(filename)
        }
        InboundPayload::File {
            file_id,
            original_name,
            size_hint,
        } => {
            if let Some(size) = size_hint {
                if *size > TELEGRAM_GET_FILE_LIMIT_BYTES {
                    return Err(BridgeError::permanent(
                        "telegram_limit",
                        format!("Telegram 入站文件过大: {size}"),
                    ));
                }
            }
            let telegram_file = get_file(telegram_client, config, file_id).await?;
            let file_path = telegram_file
                .file_path
                .ok_or_else(|| BridgeError::permanent("telegram_api", "Telegram file_path 为空"))?;
            let bytes = download_telegram_file(telegram_client, config, &file_path).await?;
            let temp_path = temp_file_path(
                &config.temp_dir(),
                &format!(
                    "inbound-{}-{}",
                    sanitize_component(file_id),
                    sanitize_component(original_name)
                ),
            );
            write_temp_file(&temp_path, &bytes)
                .map_err(|err| BridgeError::transient("temp_io", err))?;
            let upload_bytes = fs::read(&temp_path).map_err(|err| {
                BridgeError::transient("temp_io", format!("读取临时文件失败: {err}"))
            })?;
            let _ = fs::remove_file(&temp_path);

            let filename = build_message_filename(sender, original_name, timestamp_ms);
            webdav::upload_file(
                webdav_client,
                &config.webdav,
                &format!("files/{filename}"),
                upload_bytes.clone(),
            )
            .await
            .map_err(|err| BridgeError::transient("webdav_io", err))?;
            append_history(
                webdav_client,
                &config.webdav,
                HistoryEntry {
                    filename: filename.clone(),
                    sender: sender.to_string(),
                    timestamp_ms,
                    size: upload_bytes.len() as i64,
                    kind: MessageKind::File.as_str().to_string(),
                    original_name: original_name.clone(),
                    marked: false,
                    format: "text".to_string(),
                },
            )
            .await
            .map_err(|err| BridgeError::transient("webdav_history", err))?;
            Ok(filename)
        }
    }
}

async fn sync_webdav_to_telegram(
    telegram_client: &Client,
    webdav_client: &Client,
    config: &TelegramBridgeConfig,
    state: &mut BridgeState,
) -> Result<bool, BridgeError> {
    let messages = collect_remote_messages(webdav_client, config).await?;
    let mut dirty = false;

    for entry in messages {
        if should_skip_outbound(state, &entry) {
            continue;
        }
        match send_history_entry(telegram_client, webdav_client, config, &entry).await {
            Ok(message_id) => {
                state.outbound_messages.insert(
                    entry.filename.clone(),
                    OutboundRecord {
                        status: OutboundStatus::Sent,
                        telegram_message_id: Some(message_id),
                        last_error: None,
                    },
                );
                dirty = true;
            }
            Err(err) if err.kind == ErrorKind::Permanent => {
                state.outbound_messages.insert(
                    entry.filename.clone(),
                    OutboundRecord {
                        status: OutboundStatus::PermanentFailure,
                        telegram_message_id: None,
                        last_error: Some(err.message.clone()),
                    },
                );
                warn!(
                    "event=webdav_outbound_permanent_failure filename={} category={} message={}",
                    entry.filename, err.category, err.message
                );
                dirty = true;
            }
            Err(err) => {
                state.outbound_messages.insert(
                    entry.filename.clone(),
                    OutboundRecord {
                        status: OutboundStatus::RetryableError,
                        telegram_message_id: None,
                        last_error: Some(err.message.clone()),
                    },
                );
                warn!(
                    "event=webdav_outbound_retryable_failure filename={} category={} message={}",
                    entry.filename, err.category, err.message
                );
                dirty = true;
            }
        }
    }

    Ok(dirty)
}

async fn collect_remote_messages(
    client: &Client,
    config: &TelegramBridgeConfig,
) -> Result<Vec<HistoryEntry>, BridgeError> {
    let history = load_history(client, &config.webdav)
        .await
        .map_err(|err| BridgeError::transient("webdav_history", err))?;
    let mut map: HashMap<String, HistoryEntry> = history
        .into_iter()
        .map(|entry| (entry.filename.clone(), entry))
        .collect();
    let entries = webdav::list_entries(client, &config.webdav, Some("files"), true)
        .await
        .map_err(|err| BridgeError::transient("webdav_io", err))?;
    let mut derived = false;

    for entry in entries {
        if entry.is_collection {
            continue;
        }
        if let Some(existing) = map.get_mut(&entry.filename) {
            if existing.size <= 0 {
                existing.size = entry.size.unwrap_or(0) as i64;
            }
            continue;
        }
        if let Some(parsed) = parse_message_filename(&entry.filename) {
            map.insert(
                entry.filename.clone(),
                HistoryEntry {
                    filename: entry.filename.clone(),
                    sender: parsed.sender,
                    timestamp_ms: parsed.timestamp_ms,
                    size: entry.size.unwrap_or(0) as i64,
                    kind: parsed.kind.as_str().to_string(),
                    original_name: parsed.original_name.clone(),
                    marked: false,
                    format: if parsed.original_name.to_lowercase().ends_with(".md") {
                        "markdown".to_string()
                    } else {
                        "text".to_string()
                    },
                },
            );
            derived = true;
        }
    }

    let mut merged: Vec<HistoryEntry> = map.into_values().collect();
    merged.sort_by_key(|entry| entry.timestamp_ms);
    if derived {
        save_history(client, &config.webdav, &merged)
            .await
            .map_err(|err| BridgeError::transient("webdav_history", err))?;
    }
    Ok(merged)
}

fn should_skip_outbound(state: &BridgeState, entry: &HistoryEntry) -> bool {
    if state.telegram_origin_filenames.contains(&entry.filename) {
        return true;
    }
    match state.outbound_messages.get(&entry.filename) {
        Some(record) => matches!(
            record.status,
            OutboundStatus::Sent | OutboundStatus::PermanentFailure
        ),
        None => entry.timestamp_ms < state.outbound_live_after_ms,
    }
}

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or(0)
}

async fn send_history_entry(
    telegram_client: &Client,
    webdav_client: &Client,
    config: &TelegramBridgeConfig,
    entry: &HistoryEntry,
) -> Result<i64, BridgeError> {
    match entry.kind.as_str() {
        "text" => {
            let bytes = webdav::download_file(
                webdav_client,
                &config.webdav,
                &format!("files/{}", entry.filename),
            )
            .await
            .map_err(|err| BridgeError::transient("webdav_io", err))?;
            let text = String::from_utf8_lossy(&bytes).to_string();
            send_message(
                telegram_client,
                config,
                &format!("{}:\n{}", entry.sender, text),
            )
            .await
        }
        "file" => {
            if entry.size > TELEGRAM_SEND_FILE_LIMIT_BYTES {
                return Err(BridgeError::permanent(
                    "telegram_limit",
                    format!("WebDAV 文件过大: {}", entry.size),
                ));
            }
            let bytes = webdav::download_file(
                webdav_client,
                &config.webdav,
                &format!("files/{}", entry.filename),
            )
            .await
            .map_err(|err| BridgeError::transient("webdav_io", err))?;
            let temp_path = temp_file_path(
                &config.temp_dir(),
                &format!(
                    "outbound-{}-{}",
                    sanitize_component(&entry.filename),
                    sanitize_component(&entry.original_name)
                ),
            );
            write_temp_file(&temp_path, &bytes)
                .map_err(|err| BridgeError::transient("temp_io", err))?;
            let send_bytes = fs::read(&temp_path).map_err(|err| {
                BridgeError::transient("temp_io", format!("读取临时文件失败: {err}"))
            })?;
            let _ = fs::remove_file(&temp_path);
            send_document(
                telegram_client,
                config,
                &entry.original_name,
                send_bytes,
                &format!("From {}", entry.sender),
            )
            .await
        }
        other => Err(BridgeError::permanent(
            "message_kind",
            format!("不支持的消息类型: {other}"),
        )),
    }
}

fn extract_inbound_payload(message: &TelegramMessage) -> Option<InboundPayload> {
    if let Some(text) = message.text.clone() {
        return Some(InboundPayload::Text(text));
    }
    if let Some(document) = message.document.clone() {
        return Some(InboundPayload::File {
            file_id: document.file_id,
            original_name: document
                .file_name
                .unwrap_or_else(|| format!("telegram-{}.bin", message.message_id)),
            size_hint: document.file_size,
        });
    }
    for media in [
        &message.video,
        &message.audio,
        &message.voice,
        &message.animation,
    ] {
        if let Some(media) = media.clone() {
            return Some(InboundPayload::File {
                file_id: media.file_id,
                original_name: derive_original_name(
                    &media.file_name,
                    &media.mime_type,
                    message.message_id,
                ),
                size_hint: media.file_size,
            });
        }
    }
    message.photo.last().map(|photo| InboundPayload::File {
        file_id: photo.file_id.clone(),
        original_name: format!("telegram-photo-{}.jpg", message.message_id),
        size_hint: photo.file_size,
    })
}

fn resolve_sender(user: Option<&TelegramUser>) -> String {
    match user {
        Some(user) => {
            let mut name = user.first_name.trim().to_string();
            if let Some(last_name) = user.last_name.as_deref() {
                if !last_name.trim().is_empty() {
                    if !name.is_empty() {
                        name.push(' ');
                    }
                    name.push_str(last_name.trim());
                }
            }
            if !name.is_empty() {
                return name;
            }
            if let Some(username) = user.username.as_deref() {
                if !username.trim().is_empty() {
                    return username.trim().to_string();
                }
            }
            format!("telegram-user-{}", user.id)
        }
        None => "telegram-user".to_string(),
    }
}

async fn get_file(
    client: &Client,
    config: &TelegramBridgeConfig,
    file_id: &str,
) -> Result<TelegramFile, BridgeError> {
    let response = client
        .post(telegram_api_url(&config.telegram_bot_token, "getFile"))
        .json(&serde_json::json!({ "file_id": file_id }))
        .send()
        .await
        .map_err(|err| {
            BridgeError::transient("telegram_network", format!("调用 getFile 失败: {err}"))
        })?;
    parse_telegram_response::<TelegramFile>(response).await
}

async fn download_telegram_file(
    client: &Client,
    config: &TelegramBridgeConfig,
    file_path: &str,
) -> Result<Vec<u8>, BridgeError> {
    let response = client
        .get(format!(
            "https://api.telegram.org/file/bot{}/{}",
            config.telegram_bot_token, file_path
        ))
        .send()
        .await
        .map_err(|err| {
            BridgeError::transient("telegram_network", format!("下载 Telegram 文件失败: {err}"))
        })?;
    let status = response.status();
    if status.is_server_error() || status.as_u16() == 429 {
        return Err(BridgeError::transient(
            "telegram_api",
            format!("下载 Telegram 文件失败: HTTP {status}"),
        ));
    }
    if !status.is_success() {
        return Err(BridgeError::permanent(
            "telegram_api",
            format!("下载 Telegram 文件失败: HTTP {status}"),
        ));
    }
    response
        .bytes()
        .await
        .map(|bytes| bytes.to_vec())
        .map_err(|err| {
            BridgeError::transient("telegram_network", format!("读取 Telegram 文件失败: {err}"))
        })
}

async fn send_message(
    client: &Client,
    config: &TelegramBridgeConfig,
    text: &str,
) -> Result<i64, BridgeError> {
    let response = client
        .post(telegram_api_url(&config.telegram_bot_token, "sendMessage"))
        .json(&serde_json::json!({ "chat_id": config.allowed_chat_id, "text": text }))
        .send()
        .await
        .map_err(|err| {
            BridgeError::transient("telegram_network", format!("发送文本失败: {err}"))
        })?;
    let message = parse_telegram_response::<TelegramSentMessage>(response).await?;
    Ok(message.message_id)
}

async fn send_document(
    client: &Client,
    config: &TelegramBridgeConfig,
    file_name: &str,
    bytes: Vec<u8>,
    caption: &str,
) -> Result<i64, BridgeError> {
    let response = client
        .post(telegram_api_url(&config.telegram_bot_token, "sendDocument"))
        .multipart(
            Form::new()
                .text("chat_id", config.allowed_chat_id.to_string())
                .text("caption", caption.to_string())
                .part(
                    "document",
                    Part::bytes(bytes).file_name(file_name.to_string()),
                ),
        )
        .send()
        .await
        .map_err(|err| {
            BridgeError::transient("telegram_network", format!("发送文件失败: {err}"))
        })?;
    let message = parse_telegram_response::<TelegramSentMessage>(response).await?;
    Ok(message.message_id)
}

async fn parse_telegram_response<T: for<'de> Deserialize<'de>>(
    response: reqwest::Response,
) -> Result<T, BridgeError> {
    let status = response.status();
    let body = response
        .text()
        .await
        .map_err(|err| BridgeError::transient("telegram_api", format!("读取响应失败: {err}")))?;
    let parsed: TelegramApiResponse<T> = serde_json::from_str(&body).map_err(|err| {
        BridgeError::transient("telegram_api", format!("解析响应失败: {err}; body={body}"))
    })?;
    if status.is_success() && parsed.ok {
        return parsed
            .result
            .ok_or_else(|| BridgeError::transient("telegram_api", "响应缺少 result 字段"));
    }
    let message = parsed
        .description
        .unwrap_or_else(|| format!("Telegram API HTTP {status}"));
    let code = parsed.error_code.unwrap_or(status.as_u16() as i64);
    if status.is_server_error() || status.as_u16() == 429 || code >= 500 {
        Err(BridgeError::transient(
            "telegram_api",
            format!("错误 {code}: {message}"),
        ))
    } else {
        Err(BridgeError::permanent(
            "telegram_api",
            format!("错误 {code}: {message}"),
        ))
    }
}

fn telegram_api_url(token: &str, method: &str) -> String {
    format!("https://api.telegram.org/bot{token}/{method}")
}

fn telegram_message_key(chat_id: i64, message_id: i64) -> String {
    format!("{chat_id}:{message_id}")
}

fn default_poll_interval_secs() -> u64 {
    DEFAULT_POLL_INTERVAL_SECS
}

fn derive_original_name(
    file_name: &Option<String>,
    mime_type: &Option<String>,
    message_id: i64,
) -> String {
    if let Some(file_name) = file_name {
        if !file_name.trim().is_empty() {
            return file_name.trim().to_string();
        }
    }
    let ext = match mime_type.as_deref() {
        Some("image/jpeg") => "jpg",
        Some("image/png") => "png",
        Some("image/webp") => "webp",
        Some("video/mp4") => "mp4",
        Some("audio/mpeg") => "mp3",
        Some("audio/ogg") => "ogg",
        Some("application/pdf") => "pdf",
        _ => "bin",
    };
    format!("telegram-{message_id}.{ext}")
}

fn temp_file_path(temp_dir: &Path, name: &str) -> PathBuf {
    temp_dir.join(name)
}

fn write_temp_file(path: &Path, bytes: &[u8]) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|err| format!("创建临时目录失败 {}: {err}", parent.display()))?;
    }
    fs::write(path, bytes).map_err(|err| format!("写入临时文件失败 {}: {err}", path.display()))
}

fn sanitize_component(value: &str) -> String {
    value
        .chars()
        .map(|ch| match ch {
            'a'..='z' | 'A'..='Z' | '0'..='9' | '.' | '_' | '-' => ch,
            _ => '_',
        })
        .collect()
}

fn log_bridge_error(event: &str, err: &BridgeError) {
    match err.kind {
        ErrorKind::Permanent => warn!(
            "event={} category={} kind=permanent message={}",
            event, err.category, err.message
        ),
        ErrorKind::Transient => error!(
            "event={} category={} kind=transient message={}",
            event, err.category, err.message
        ),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bridge_state_round_trip_persists_records() {
        let path = std::env::temp_dir().join("tg-bridge-state-test.json");
        let mut state = BridgeState::default();
        state.last_update_id = 12;
        state.outbound_live_after_ms = 34;
        state
            .imported_telegram_messages
            .insert("1:2".to_string(), "f".to_string());
        state.telegram_origin_filenames.insert("f".to_string());
        state.outbound_messages.insert(
            "g".to_string(),
            OutboundRecord {
                status: OutboundStatus::RetryableError,
                telegram_message_id: None,
                last_error: Some("temporary".to_string()),
            },
        );
        state.save(&path).expect("save state");
        let loaded = BridgeState::load(&path).expect("load state");
        let _ = fs::remove_file(&path);
        assert_eq!(loaded.last_update_id, 12);
        assert_eq!(loaded.outbound_live_after_ms, 34);
        assert!(loaded.telegram_origin_filenames.contains("f"));
        assert_eq!(
            loaded.outbound_messages.get("g").map(|item| &item.status),
            Some(&OutboundStatus::RetryableError)
        );
    }

    #[test]
    fn should_skip_outbound_for_imported_or_terminal_records() {
        let mut state = BridgeState::default();
        state.outbound_live_after_ms = 100;
        state.telegram_origin_filenames.insert("a".to_string());
        state.outbound_messages.insert(
            "b".to_string(),
            OutboundRecord {
                status: OutboundStatus::Sent,
                telegram_message_id: Some(1),
                last_error: None,
            },
        );
        state.outbound_messages.insert(
            "c".to_string(),
            OutboundRecord {
                status: OutboundStatus::PermanentFailure,
                telegram_message_id: None,
                last_error: Some("too large".to_string()),
            },
        );
        state.outbound_messages.insert(
            "d".to_string(),
            OutboundRecord {
                status: OutboundStatus::RetryableError,
                telegram_message_id: None,
                last_error: Some("temporary".to_string()),
            },
        );
        let imported = HistoryEntry {
            filename: "a".to_string(),
            sender: "tester".to_string(),
            timestamp_ms: 50,
            size: 1,
            kind: "text".to_string(),
            original_name: "message.txt".to_string(),
            marked: false,
            format: "text".to_string(),
        };
        let sent = HistoryEntry {
            filename: "b".to_string(),
            ..imported.clone()
        };
        let permanent = HistoryEntry {
            filename: "c".to_string(),
            ..imported.clone()
        };
        let retryable = HistoryEntry {
            filename: "d".to_string(),
            ..imported.clone()
        };
        let backlog = HistoryEntry {
            filename: "e".to_string(),
            timestamp_ms: 99,
            ..imported.clone()
        };
        let live = HistoryEntry {
            filename: "f".to_string(),
            timestamp_ms: 100,
            ..imported.clone()
        };
        assert!(should_skip_outbound(&state, &imported));
        assert!(should_skip_outbound(&state, &sent));
        assert!(should_skip_outbound(&state, &permanent));
        assert!(!should_skip_outbound(&state, &retryable));
        assert!(should_skip_outbound(&state, &backlog));
        assert!(!should_skip_outbound(&state, &live));
    }

    #[test]
    fn resolve_sender_prefers_name_then_username_then_id() {
        let user = TelegramUser {
            id: 7,
            first_name: "Alice".to_string(),
            last_name: Some("Z".to_string()),
            username: Some("alicez".to_string()),
        };
        assert_eq!(resolve_sender(Some(&user)), "Alice Z");
        let user = TelegramUser {
            id: 7,
            first_name: "".to_string(),
            last_name: None,
            username: Some("alicez".to_string()),
        };
        assert_eq!(resolve_sender(Some(&user)), "alicez");
        let user = TelegramUser {
            id: 7,
            first_name: "".to_string(),
            last_name: None,
            username: None,
        };
        assert_eq!(resolve_sender(Some(&user)), "telegram-user-7");
    }
}
