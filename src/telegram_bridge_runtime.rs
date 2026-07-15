use crate::integration_runtime::{ModuleRuntimeStateSnapshot, MODULE_ID_TELEGRAM_BRIDGE};
use crate::workspace::{self, WorkspaceLayout};
use crate::{
    current_settings, ensure_parent_dir, persist_integration_module_statuses,
    resolve_active_endpoint, webdav, AppState, Settings, TelegramBridgeRuntimeConfig,
    TelegramBridgeSettings, WebDavEndpoint,
};
use serde::Serialize;
use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, ExitStatus, Stdio};
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Clone, Serialize)]
pub struct TelegramBridgeStatus {
    pub running: bool,
    pub pid: Option<u32>,
    pub last_started_ms: Option<i64>,
    pub last_stopped_ms: Option<i64>,
    pub last_error: Option<String>,
}

pub struct ManagedTelegramBridgeProcess {
    pub child: Child,
    pub runtime_config_path: PathBuf,
}

#[derive(Default)]
pub struct TelegramBridgeManager {
    pub process: Option<ManagedTelegramBridgeProcess>,
    pub last_started_ms: Option<i64>,
    pub last_stopped_ms: Option<i64>,
    pub last_error: Option<String>,
    pub last_pid: Option<u32>,
}

struct PreparedTelegramBridgeLaunch {
    runtime_config_path: PathBuf,
    runtime_config_data: String,
}

pub fn spawn_telegram_bridge_process(
    bridge_arg: &str,
    runtime_config_path: &Path,
) -> Result<ManagedTelegramBridgeProcess, String> {
    let current_exe = env::current_exe()
        .map_err(|err| format!("resolve telegram bridge executable failed: {err}"))?;
    let child = Command::new(&current_exe)
        .arg(bridge_arg)
        .arg(runtime_config_path)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|err| format!("start telegram bridge failed: {err}"))?;

    Ok(ManagedTelegramBridgeProcess {
        child,
        runtime_config_path: runtime_config_path.to_path_buf(),
    })
}

pub fn telegram_bridge_status_from_manager(
    manager: &TelegramBridgeManager,
) -> TelegramBridgeStatus {
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

pub fn telegram_bridge_runtime_snapshot(
    manager: &TelegramBridgeManager,
    enabled: bool,
) -> ModuleRuntimeStateSnapshot {
    ModuleRuntimeStateSnapshot {
        enabled,
        running: manager.process.is_some(),
        last_error: manager.last_error.clone(),
        last_started_ms: manager.last_started_ms,
        last_stopped_ms: manager.last_stopped_ms,
    }
}

pub fn telegram_bridge_is_running(manager: &TelegramBridgeManager) -> bool {
    manager.process.is_some()
}

pub fn finish_telegram_bridge_process(
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

pub fn mark_start_failure(manager: &mut TelegramBridgeManager, err: String) {
    manager.last_error = Some(err);
    manager.last_stopped_ms = Some(now_ms());
}

pub fn attach_started_process(
    manager: &mut TelegramBridgeManager,
    process: ManagedTelegramBridgeProcess,
) {
    manager.last_started_ms = Some(now_ms());
    manager.last_error = None;
    manager.last_pid = Some(process.child.id());
    manager.process = Some(process);
}

pub fn stop_active_process(manager: &mut TelegramBridgeManager) -> bool {
    if let Some(mut process) = manager.process.take() {
        let _ = process.child.kill();
        finish_telegram_bridge_process(manager, process, None);
        true
    } else {
        false
    }
}

pub fn refresh_telegram_bridge_manager(manager: &mut TelegramBridgeManager) {
    let outcome = match manager.process.as_mut() {
        Some(process) => match process.child.try_wait() {
            Ok(Some(status)) => Some(Ok(status)),
            Ok(None) => None,
            Err(err) => Some(Err(format!("check telegram bridge status failed: {err}"))),
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

fn telegram_bridge_dir(state: &AppState) -> PathBuf {
    let app_data_dir = state
        .settings_path
        .parent()
        .unwrap_or_else(|| Path::new("."))
        .to_path_buf();
    WorkspaceLayout::new(app_data_dir).plugin_dir(MODULE_ID_TELEGRAM_BRIDGE)
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

pub fn telegram_bridge_launch_config_is_valid(settings: &Settings) -> bool {
    resolve_telegram_bridge_launch_config(settings).is_ok()
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
        .map_err(|err| format!("serialize Telegram bridge runtime config failed: {err}"))?;

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

pub fn telegram_bridge_status_for_state(state: &AppState) -> Result<TelegramBridgeStatus, String> {
    let mut manager = state
        .telegram_bridge
        .lock()
        .map_err(|_| "读取 Telegram bridge 状态失败".to_string())?;
    refresh_telegram_bridge_manager(&mut manager);
    let status = telegram_bridge_status_from_manager(&manager);
    drop(manager);
    let _ = persist_integration_module_statuses(state);
    Ok(status)
}

pub async fn start_telegram_bridge_for_state(
    state: &AppState,
    bridge_arg: &str,
) -> Result<TelegramBridgeStatus, String> {
    let launch = prepare_telegram_bridge_launch(state).await?;
    let mut manager = state
        .telegram_bridge
        .lock()
        .map_err(|_| "更新 Telegram bridge 状态失败".to_string())?;
    refresh_telegram_bridge_manager(&mut manager);
    if telegram_bridge_is_running(&manager) {
        return Ok(telegram_bridge_status_from_manager(&manager));
    }

    write_telegram_bridge_runtime_config_audited(&launch)?;
    let process = match spawn_telegram_bridge_process(bridge_arg, &launch.runtime_config_path) {
        Ok(process) => process,
        Err(err) => {
            let _ = fs::remove_file(&launch.runtime_config_path);
            mark_start_failure(&mut manager, err.clone());
            return Err(err);
        }
    };

    attach_started_process(&mut manager, process);
    std::thread::sleep(std::time::Duration::from_millis(350));
    refresh_telegram_bridge_manager(&mut manager);
    if !telegram_bridge_is_running(&manager) {
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

pub fn stop_telegram_bridge_for_state(state: &AppState) -> Result<TelegramBridgeStatus, String> {
    let mut manager = state
        .telegram_bridge
        .lock()
        .map_err(|_| "更新 Telegram bridge 状态失败".to_string())?;
    refresh_telegram_bridge_manager(&mut manager);
    stop_active_process(&mut manager);
    let status = telegram_bridge_status_from_manager(&manager);
    drop(manager);
    let _ = persist_integration_module_statuses(state);
    Ok(status)
}

fn telegram_bridge_exit_message(status: ExitStatus) -> Option<String> {
    if status.success() {
        None
    } else if let Some(code) = status.code() {
        Some(format!("Telegram bridge exited with code {code}"))
    } else {
        Some("Telegram bridge exited unexpectedly".to_string())
    }
}

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

#[cfg(test)]
mod tests {
    use super::*;

    fn spawn_sleeping_process() -> Child {
        let mut command = if cfg!(windows) {
            let mut command = Command::new("cmd");
            command.args(["/C", "ping", "-n", "2", "127.0.0.1", ">", "NUL"]);
            command
        } else {
            let mut command = Command::new("sh");
            command.args(["-c", "sleep 2"]);
            command
        };
        command
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .expect("spawn sleeping process")
    }

    fn spawn_quick_exit_process() -> Child {
        let mut command = if cfg!(windows) {
            let mut command = Command::new("cmd");
            command.args(["/C", "exit", "0"]);
            command
        } else {
            let mut command = Command::new("sh");
            command.args(["-c", "true"]);
            command
        };
        command
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .expect("spawn quick exit process")
    }

    #[test]
    fn finish_telegram_bridge_process_cleans_runtime_file_and_updates_status() {
        let runtime_config_path = std::env::temp_dir().join(format!(
            "transfer-genie-telegram-runtime-finish-{}.json",
            now_ms()
        ));
        fs::write(&runtime_config_path, "{}").expect("write runtime config");

        let process = ManagedTelegramBridgeProcess {
            child: spawn_quick_exit_process(),
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
        fs::write(&runtime_config_path, "{}").expect("write runtime config");

        let process = ManagedTelegramBridgeProcess {
            child: spawn_quick_exit_process(),
            runtime_config_path: runtime_config_path.clone(),
        };
        let mut manager = TelegramBridgeManager {
            process: Some(process),
            ..Default::default()
        };

        std::thread::sleep(std::time::Duration::from_millis(150));

        refresh_telegram_bridge_manager(&mut manager);

        assert!(manager.process.is_none());
        assert!(!runtime_config_path.exists());
        assert!(manager.last_stopped_ms.is_some());
    }

    #[test]
    fn mark_start_failure_updates_error_and_stopped_time() {
        let mut manager = TelegramBridgeManager::default();

        mark_start_failure(&mut manager, "boom".to_string());

        assert_eq!(manager.last_error.as_deref(), Some("boom"));
        assert!(manager.last_stopped_ms.is_some());
    }

    #[test]
    fn telegram_bridge_runtime_snapshot_reflects_manager_state() {
        let manager = TelegramBridgeManager {
            last_started_ms: Some(10),
            last_stopped_ms: Some(8),
            last_error: Some("boom".to_string()),
            ..Default::default()
        };

        let snapshot = telegram_bridge_runtime_snapshot(&manager, true);

        assert!(snapshot.enabled);
        assert!(!snapshot.running);
        assert_eq!(snapshot.last_started_ms, Some(10));
        assert_eq!(snapshot.last_stopped_ms, Some(8));
        assert_eq!(snapshot.last_error.as_deref(), Some("boom"));
    }

    #[test]
    fn telegram_bridge_is_running_reflects_process_presence() {
        let manager = TelegramBridgeManager::default();
        assert!(!telegram_bridge_is_running(&manager));
    }

    #[test]
    fn attach_started_process_sets_running_metadata() {
        let runtime_config_path = std::env::temp_dir().join(format!(
            "transfer-genie-telegram-runtime-attach-{}.json",
            now_ms()
        ));
        fs::write(&runtime_config_path, "{}").expect("write runtime config");

        let process = ManagedTelegramBridgeProcess {
            child: spawn_sleeping_process(),
            runtime_config_path: runtime_config_path.clone(),
        };
        let expected_pid = process.child.id();
        let mut manager = TelegramBridgeManager {
            last_error: Some("old error".to_string()),
            ..Default::default()
        };

        attach_started_process(&mut manager, process);

        assert_eq!(manager.last_pid, Some(expected_pid));
        assert!(manager.last_started_ms.is_some());
        assert!(manager.last_error.is_none());
        assert!(manager.process.is_some());

        let process = manager.process.take().expect("active process");
        finish_telegram_bridge_process(&mut manager, process, None);
        assert!(!runtime_config_path.exists());
    }

    #[test]
    fn stop_active_process_kills_and_cleans_runtime_file() {
        let runtime_config_path = std::env::temp_dir().join(format!(
            "transfer-genie-telegram-runtime-stop-{}.json",
            now_ms()
        ));
        fs::write(&runtime_config_path, "{}").expect("write runtime config");

        let process = ManagedTelegramBridgeProcess {
            child: spawn_sleeping_process(),
            runtime_config_path: runtime_config_path.clone(),
        };
        let mut manager = TelegramBridgeManager {
            process: Some(process),
            ..Default::default()
        };

        assert!(stop_active_process(&mut manager));
        assert!(manager.process.is_none());
        assert!(!runtime_config_path.exists());
        assert!(manager.last_stopped_ms.is_some());
    }

    #[test]
    fn telegram_bridge_status_from_manager_prefers_active_process_pid() {
        let runtime_config_path = std::env::temp_dir().join(format!(
            "transfer-genie-telegram-runtime-status-{}.json",
            now_ms()
        ));
        fs::write(&runtime_config_path, "{}").expect("write runtime config");

        let process = ManagedTelegramBridgeProcess {
            child: spawn_sleeping_process(),
            runtime_config_path: runtime_config_path.clone(),
        };
        let expected_pid = process.child.id();
        let mut manager = TelegramBridgeManager {
            process: Some(process),
            last_error: Some("last error".to_string()),
            last_pid: Some(42),
            ..Default::default()
        };

        let status = telegram_bridge_status_from_manager(&manager);

        assert!(status.running);
        assert_eq!(status.pid, Some(expected_pid));
        assert_eq!(status.last_error.as_deref(), Some("last error"));

        let process = manager.process.take().expect("active process");
        finish_telegram_bridge_process(&mut manager, process, None);
        assert!(!runtime_config_path.exists());
    }
}
