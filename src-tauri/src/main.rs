mod db;
mod filenames;
mod types;
mod webdav;

use crate::db::DbMessage;
use crate::filenames::{build_message_filename, parse_message_filename, MessageKind};
use crate::types::{Message, Settings, SyncStatus};
use rand::Rng;
use reqwest::Client;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager, State};
use tokio::sync::Mutex as AsyncMutex;

struct AppState {
  settings_path: PathBuf,
  db_path: PathBuf,
  files_dir: PathBuf,
  settings: Mutex<Settings>,
  sync_status: Mutex<SyncStatus>,
  sync_guard: AsyncMutex<()>,
  http: Client,
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
  db::list_messages(&state.db_path).map_err(|err| err.to_string())
}

#[tauri::command]
async fn send_text(state: State<'_, AppState>, text: String) -> Result<(), String> {
  let settings = current_settings(&state)?;
  ensure_webdav_configured(&settings)?;

  let timestamp_ms = now_ms();
  let filename = build_message_filename(&settings.sender_name, "message.txt", timestamp_ms);
  let data = text.clone().into_bytes();

  webdav::upload_file(&state.http, &settings, &filename, data.clone()).await?;

  let message = DbMessage {
    filename: filename.clone(),
    sender: settings.sender_name,
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

  webdav::upload_file(&state.http, &settings, &filename, data.clone()).await?;

  let local_path = state.files_dir.join(&filename);
  fs::create_dir_all(&state.files_dir).map_err(|err| format!("创建目录失败: {err}"))?;
  fs::write(&local_path, &data).map_err(|err| format!("保存本地文件失败: {err}"))?;

  let message = DbMessage {
    filename: filename.clone(),
    sender: settings.sender_name,
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
  Ok(())
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

fn load_settings(path: &Path) -> Result<Settings, String> {
  if path.exists() {
    let data = fs::read_to_string(path).map_err(|err| format!("读取设置失败: {err}"))?;
    let settings = serde_json::from_str(&data).map_err(|err| format!("解析设置失败: {err}"))?;
    Ok(settings)
  } else {
    let settings = Settings {
      webdav_url: String::new(),
      username: String::new(),
      password: String::new(),
      sender_name: random_sender_name(),
      refresh_interval_secs: 5,
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

  let entries = webdav::list_entries(&state.http, &settings).await?;
  let mut new_count = 0usize;

  for entry in entries {
    if entry.is_collection {
      continue;
    }

    let parsed = match parse_message_filename(&entry.filename) {
      Some(parsed) => parsed,
      None => continue,
    };

    let existing = db::get_message(&state.db_path, &entry.filename).map_err(|err| err.to_string())?;

    let mut message = existing.clone().unwrap_or(DbMessage {
      filename: entry.filename.clone(),
      sender: parsed.sender.clone(),
      timestamp_ms: parsed.timestamp_ms,
      size: entry.size.unwrap_or(0) as i64,
      kind: parsed.kind.as_str().to_string(),
      original_name: parsed.original_name.clone(),
      etag: entry.etag.clone(),
      mtime: entry.mtime.clone(),
      content: None,
      local_path: None,
    });

    let mut changed = false;

    match parsed.kind {
      MessageKind::Text => {
        if message.content.is_none() {
          let bytes = webdav::download_file(&state.http, &settings, &entry.filename).await?;
          let content = String::from_utf8_lossy(&bytes).to_string();
          message.content = Some(content);
          message.size = bytes.len() as i64;
          changed = true;
        }
      }
      MessageKind::File => {
        let needs_download = match message.local_path.as_deref() {
          Some(path) => !Path::new(path).exists(),
          None => true,
        };
        if needs_download {
          let bytes = webdav::download_file(&state.http, &settings, &entry.filename).await?;
          fs::create_dir_all(&state.files_dir)
            .map_err(|err| format!("创建文件目录失败: {err}"))?;
          let local_path = state.files_dir.join(&entry.filename);
          fs::write(&local_path, &bytes).map_err(|err| format!("保存文件失败: {err}"))?;
          message.local_path = Some(local_path.to_string_lossy().to_string());
          message.size = bytes.len() as i64;
          changed = true;
        }
      }
    }

    if existing.is_none() || changed {
      message.etag = entry.etag.clone();
      message.mtime = entry.mtime.clone();
      db::upsert_message(&state.db_path, &message).map_err(|err| err.to_string())?;
      if existing.is_none() {
        new_count += 1;
      }
    }
  }

  Ok(new_count)
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

      db::init_db(&db_path)?;
      fs::create_dir_all(&files_dir).map_err(|err| format!("创建文件目录失败: {err}"))?;

      let settings = load_settings(&settings_path)?;

      app.manage(AppState {
        settings_path,
        db_path,
        files_dir,
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
      manual_refresh,
      get_sync_status
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
