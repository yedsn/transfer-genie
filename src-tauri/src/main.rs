mod db;
mod filenames;
mod types;
mod webdav;

use crate::db::DbMessage;
use crate::filenames::{build_message_filename, parse_message_filename, MessageKind};
use crate::types::{Message, Settings, SyncStatus};
use serde::{Deserialize, Serialize};
use rand::Rng;
use reqwest::Client;
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::sync::Mutex as AsyncMutex;
use tauri::Window;

struct AppState {
  settings_path: PathBuf,
  db_path: PathBuf,
  files_dir: PathBuf,
  default_download_dir: PathBuf,
  settings: Mutex<Settings>,
  sync_status: Mutex<SyncStatus>,
  sync_guard: AsyncMutex<()>,
  http: Client,
}

#[derive(Clone, Serialize, Deserialize)]
struct HistoryEntry {
  filename: String,
  sender: String,
  timestamp_ms: i64,
  size: i64,
  kind: String,
  original_name: String,
}

#[derive(Serialize)]
struct DownloadResult {
  status: String,
  path: Option<String>,
  suggested_path: Option<String>,
}

#[derive(Clone, Serialize)]
struct DownloadProgress {
  filename: String,
  received: u64,
  total: Option<u64>,
  status: String,
  error: Option<String>,
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
fn save_settings(state: State<'_, AppState>, settings: Settings) -> Result<Settings, String> {
  let mut normalized = settings.clone();
  if normalized.refresh_interval_secs == 0 {
    normalized.refresh_interval_secs = 5;
  }
  normalized.download_dir =
    normalize_download_dir(&normalized.download_dir, &state.default_download_dir);

  write_settings(&state.settings_path, &normalized)?;

  let mut guard = state
    .settings
    .lock()
    .map_err(|_| "写入设置失败".to_string())?;
  *guard = normalized.clone();
  Ok(normalized)
}

#[tauri::command]
fn list_messages(state: State<'_, AppState>) -> Result<Vec<Message>, String> {
  let mut messages = db::list_messages(&state.db_path).map_err(|err| err.to_string())?;
  let settings = current_settings(&state)?;
  let base_dir = resolve_download_dir(&state, &settings);
  for message in messages.iter_mut() {
    if message.kind == MessageKind::File.as_str() {
      let file_name = sanitize_filename(&message.original_name);
      let target_path = base_dir.join(file_name);
      message.download_exists = target_path.exists();
    } else {
      message.download_exists = false;
    }
  }
  Ok(messages)
}

#[tauri::command]
async fn send_text(state: State<'_, AppState>, text: String) -> Result<(), String> {
  let settings = current_settings(&state)?;
  ensure_webdav_configured(&settings)?;

  let timestamp_ms = now_ms();
  let filename = build_message_filename(&settings.sender_name, "message.txt", timestamp_ms);
  let remote_path = format!("files/{}", filename);
  let data = text.clone().into_bytes();

  webdav::ensure_directory(&state.http, &settings, "files").await?;
  webdav::upload_file(&state.http, &settings, &remote_path, data.clone()).await?;

  let message = DbMessage {
    filename: filename.clone(),
    sender: settings.sender_name.clone(),
    timestamp_ms,
    size: data.len() as i64,
    kind: MessageKind::Text.as_str().to_string(),
    original_name: "message.txt".to_string(),
    etag: None,
    mtime: None,
    content: Some(text),
    local_path: None,
  };

  db::upsert_message(&state.db_path, &message).map_err(|err| err.to_string())?;
  let _ = append_history(&state, &settings, message_to_history(&message)).await;
  Ok(())
}

#[tauri::command]
async fn send_file(state: State<'_, AppState>, path: String) -> Result<(), String> {
  let settings = current_settings(&state)?;
  ensure_webdav_configured(&settings)?;

  let file_path = PathBuf::from(path);
  let original_name = file_path
    .file_name()
    .and_then(|name| name.to_str())
    .ok_or_else(|| "无法读取文件名".to_string())?
    .to_string();

  let data = fs::read(&file_path).map_err(|err| format!("读取文件失败: {err}"))?;
  let timestamp_ms = now_ms();
  let filename = build_message_filename(&settings.sender_name, &original_name, timestamp_ms);
  let remote_path = format!("files/{}", filename);

  webdav::ensure_directory(&state.http, &settings, "files").await?;
  webdav::upload_file(&state.http, &settings, &remote_path, data.clone()).await?;

  let local_path = state.files_dir.join(&filename);
  fs::create_dir_all(&state.files_dir).map_err(|err| format!("创建目录失败: {err}"))?;
  fs::write(&local_path, &data).map_err(|err| format!("保存本地文件失败: {err}"))?;

  let message = DbMessage {
    filename: filename.clone(),
    sender: settings.sender_name.clone(),
    timestamp_ms,
    size: data.len() as i64,
    kind: MessageKind::File.as_str().to_string(),
    original_name,
    etag: None,
    mtime: None,
    content: None,
    local_path: Some(local_path.to_string_lossy().to_string()),
  };

  db::upsert_message(&state.db_path, &message).map_err(|err| err.to_string())?;
  let _ = append_history(&state, &settings, message_to_history(&message)).await;
  Ok(())
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
  ensure_webdav_configured(&settings)?;

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
    &settings,
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
  update_message_local_path(&state.db_path, &filename, &final_path, bytes.len() as i64)?;

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
  ensure_webdav_configured(&settings)?;

  if target_path.trim().is_empty() {
    return Err("未选择保存路径".to_string());
  }
  let final_path = PathBuf::from(target_path);
  let remote_path = format!("files/{}", filename);
  let window = window.clone();
  let bytes = match webdav::download_file_with_progress(
    &state.http,
    &settings,
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
  update_message_local_path(&state.db_path, &filename, &final_path, bytes.len() as i64)?;

  Ok(DownloadResult {
    status: "saved".to_string(),
    path: Some(final_path.to_string_lossy().to_string()),
    suggested_path: None,
  })
}

#[tauri::command]
async fn manual_refresh(state: State<'_, AppState>) -> Result<SyncStatus, String> {
  run_sync(&state, "手动刷新").await
}

#[tauri::command]
fn get_sync_status(state: State<'_, AppState>) -> Result<SyncStatus, String> {
  let status = state
    .sync_status
    .lock()
    .map_err(|_| "读取同步状态失败".to_string())?;
  Ok(status.clone())
}

fn current_settings(state: &State<'_, AppState>) -> Result<Settings, String> {
  let settings = state
    .settings
    .lock()
    .map_err(|_| "读取设置失败".to_string())?;
  Ok(settings.clone())
}

fn ensure_webdav_configured(settings: &Settings) -> Result<(), String> {
  if settings.webdav_url.trim().is_empty() {
    return Err("请先配置 WebDAV 地址".to_string());
  }
  Ok(())
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

fn files_dir(app_handle: &AppHandle) -> Result<PathBuf, String> {
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

fn load_settings(path: &Path, fallback_download_dir: &Path) -> Result<Settings, String> {
  if path.exists() {
    let data = fs::read_to_string(path).map_err(|err| format!("读取设置失败: {err}"))?;
    let mut settings =
      serde_json::from_str::<Settings>(&data).map_err(|err| format!("解析设置失败: {err}"))?;
    let normalized = normalize_download_dir(&settings.download_dir, fallback_download_dir);
    if settings.download_dir != normalized {
      settings.download_dir = normalized;
      write_settings(path, &settings)?;
    }
    Ok(settings)
  } else {
    let settings = Settings {
      webdav_url: String::new(),
      username: String::new(),
      password: String::new(),
      sender_name: random_sender_name(),
      refresh_interval_secs: 5,
      download_dir: normalize_download_dir("", fallback_download_dir),
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
  filename: &str,
  local_path: &Path,
  size: i64,
) -> Result<(), String> {
  let existing = db::get_message(db_path, filename).map_err(|err| err.to_string())?;
  let mut message = existing.ok_or_else(|| "未找到消息记录".to_string())?;
  message.local_path = Some(local_path.to_string_lossy().to_string());
  if size > 0 {
    message.size = size;
  }
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

async fn run_sync(state: &AppState, source: &str) -> Result<SyncStatus, String> {
  {
    let mut status = state
      .sync_status
      .lock()
      .map_err(|_| "更新同步状态失败".to_string())?;
    status.running = true;
    status.last_error = None;
    status.last_result = Some(format!("同步中：{source}"));
  }

  let result = sync_once(state).await;

  let mut status = state
    .sync_status
    .lock()
    .map_err(|_| "更新同步状态失败".to_string())?;
  status.running = false;
  status.last_run_ms = Some(now_ms());
  match result {
    Ok(count) => {
      status.last_error = None;
      status.last_result = Some(format!("同步完成，新增 {count} 条"));
      Ok(status.clone())
    }
    Err(err) => {
      status.last_error = Some(err.clone());
      status.last_result = Some("同步失败".to_string());
      Err(err)
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

  ensure_webdav_configured(&settings)?;

  let history = load_history(state, &settings).await?;
  let mut history_map: HashMap<String, HistoryEntry> = history
    .into_iter()
    .map(|entry| (entry.filename.clone(), entry))
    .collect();

  let entries = webdav::list_entries(&state.http, &settings, Some("files"), true).await?;
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
  db::prune_messages(&state.db_path, &keep_list).map_err(|err| err.to_string())?;

  let mut new_count = 0usize;
  let mut new_history_entries: Vec<HistoryEntry> = Vec::new();

  for filename in all_filenames {
    let file_entry = files_map.get(&filename);
    let history_entry = history_map.get(&filename);

    let parsed = parse_message_filename(&filename);
    let (sender, timestamp_ms, kind, original_name, size_hint) = if let Some(history) = history_entry
    {
      (
        history.sender.clone(),
        history.timestamp_ms,
        history.kind.clone(),
        history.original_name.clone(),
        history.size,
      )
    } else if let Some(parsed) = parsed.as_ref() {
      (
        parsed.sender.clone(),
        parsed.timestamp_ms,
        parsed.kind.as_str().to_string(),
        parsed.original_name.clone(),
        file_entry
          .and_then(|entry| entry.size)
          .unwrap_or(0) as i64,
      )
    } else {
      continue;
    };

    let existing = db::get_message(&state.db_path, &filename).map_err(|err| err.to_string())?;
    let mut message = existing.clone().unwrap_or(DbMessage {
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
    });

    if let Some(history) = history_entry {
      message.sender = history.sender.clone();
      message.timestamp_ms = history.timestamp_ms;
      message.kind = history.kind.clone();
      message.original_name = history.original_name.clone();
      if history.size > 0 {
        message.size = history.size;
      }
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
            Some(webdav::download_file(&state.http, &settings, &remote_path).await?)
          } else {
            webdav::download_optional_file(&state.http, &settings, &remote_path).await?
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
    save_history(state, &settings, &history).await?;
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
  }
}

async fn append_history(
  state: &AppState,
  settings: &Settings,
  entry: HistoryEntry,
) -> Result<(), String> {
  let mut history = load_history(state, settings).await?;
  if history.iter().any(|item| item.filename == entry.filename) {
    return Ok(());
  }
  history.push(entry);
  history.sort_by_key(|item| item.timestamp_ms);
  save_history(state, settings, &history).await
}

async fn load_history(
  state: &AppState,
  settings: &Settings,
) -> Result<Vec<HistoryEntry>, String> {
  let bytes = webdav::download_optional_file(&state.http, settings, "history.json").await?;
  match bytes {
    Some(data) => serde_json::from_slice::<Vec<HistoryEntry>>(&data)
      .map_err(|err| format!("解析历史记录失败: {err}")),
    None => Ok(Vec::new()),
  }
}

async fn save_history(
  state: &AppState,
  settings: &Settings,
  history: &[HistoryEntry],
) -> Result<(), String> {
  let data =
    serde_json::to_vec_pretty(history).map_err(|err| format!("序列化历史记录失败: {err}"))?;
  webdav::upload_file(&state.http, settings, "history.json", data).await
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

      let _ = run_sync(&state, "定时同步").await;
      tokio::time::sleep(Duration::from_secs(interval)).await;
    }
  });
}

fn main() {
  tauri::Builder::default()
    .setup(|app| {
      let settings_path = settings_path(&app.handle())?;
      let db_path = db_path(&app.handle())?;
      let files_dir = files_dir(&app.handle())?;
      let default_download_dir = default_download_dir(&app.handle())?;

      db::init_db(&db_path)?;
      fs::create_dir_all(&files_dir).map_err(|err| format!("创建文件目录失败: {err}"))?;

      let settings = load_settings(&settings_path, &default_download_dir)?;

      app.manage(AppState {
        settings_path,
        db_path,
        files_dir,
        default_download_dir,
        settings: Mutex::new(settings),
        sync_status: Mutex::new(SyncStatus::idle()),
        sync_guard: AsyncMutex::new(()),
        http: Client::new(),
      });

      start_sync_loop(app.handle().clone());
      Ok(())
    })
    .plugin(tauri_plugin_dialog::init())
    .invoke_handler(tauri::generate_handler![
      get_settings,
      save_settings,
      list_messages,
      send_text,
      send_file,
      download_message_file,
      save_message_file_as,
      manual_refresh,
      get_sync_status
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
