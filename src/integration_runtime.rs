#![allow(dead_code)]

use crate::workspace::{self, WorkspaceLayout};
use serde::Serialize;
use std::path::{Path, PathBuf};

pub const MODULE_ID_WEBDAV_SYNC: &str = "webdav-sync";
pub const MODULE_ID_TELEGRAM_BRIDGE: &str = "telegram-bridge";

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ModuleKind {
    Sync,
    Bridge,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IntegrationModuleStatus {
    pub id: String,
    pub display_name: String,
    pub kind: ModuleKind,
    pub enabled: bool,
    pub running: bool,
    pub last_error: Option<String>,
    pub last_started_ms: Option<i64>,
    pub last_stopped_ms: Option<i64>,
}

#[derive(Clone, Debug, Default)]
pub struct ModuleRuntimeStateSnapshot {
    pub enabled: bool,
    pub running: bool,
    pub last_error: Option<String>,
    pub last_started_ms: Option<i64>,
    pub last_stopped_ms: Option<i64>,
}

pub trait SyncModuleRuntime {
    fn module_id(&self) -> &'static str;
    fn display_name(&self) -> &'static str;

    fn kind(&self) -> ModuleKind {
        ModuleKind::Sync
    }

    fn status_from_snapshot(
        &self,
        snapshot: ModuleRuntimeStateSnapshot,
    ) -> IntegrationModuleStatus {
        IntegrationModuleStatus {
            id: self.module_id().to_string(),
            display_name: self.display_name().to_string(),
            kind: self.kind(),
            enabled: snapshot.enabled,
            running: snapshot.running,
            last_error: snapshot.last_error,
            last_started_ms: snapshot.last_started_ms,
            last_stopped_ms: snapshot.last_stopped_ms,
        }
    }
}

pub trait BridgeModuleRuntime {
    fn module_id(&self) -> &'static str;
    fn display_name(&self) -> &'static str;

    fn kind(&self) -> ModuleKind {
        ModuleKind::Bridge
    }

    fn status_from_snapshot(
        &self,
        snapshot: ModuleRuntimeStateSnapshot,
    ) -> IntegrationModuleStatus {
        IntegrationModuleStatus {
            id: self.module_id().to_string(),
            display_name: self.display_name().to_string(),
            kind: self.kind(),
            enabled: snapshot.enabled,
            running: snapshot.running,
            last_error: snapshot.last_error,
            last_started_ms: snapshot.last_started_ms,
            last_stopped_ms: snapshot.last_stopped_ms,
        }
    }
}

pub struct WebDavSyncModule;

impl SyncModuleRuntime for WebDavSyncModule {
    fn module_id(&self) -> &'static str {
        MODULE_ID_WEBDAV_SYNC
    }

    fn display_name(&self) -> &'static str {
        "WebDAV Sync"
    }
}

pub struct TelegramBridgeModule;

impl BridgeModuleRuntime for TelegramBridgeModule {
    fn module_id(&self) -> &'static str {
        MODULE_ID_TELEGRAM_BRIDGE
    }

    fn display_name(&self) -> &'static str {
        "Telegram Bridge"
    }
}

pub fn builtin_module_statuses(
    webdav_snapshot: ModuleRuntimeStateSnapshot,
    telegram_snapshot: ModuleRuntimeStateSnapshot,
) -> Vec<IntegrationModuleStatus> {
    let sync = WebDavSyncModule;
    let bridge = TelegramBridgeModule;
    vec![
        sync.status_from_snapshot(webdav_snapshot),
        bridge.status_from_snapshot(telegram_snapshot),
    ]
}

pub fn module_status_bundle_path(workspace_root: &Path) -> PathBuf {
    workspace_root.join("plugins").join("module-status.json")
}

pub fn module_status_path(workspace_root: &Path, module_id: &str) -> PathBuf {
    WorkspaceLayout::new(
        workspace_root
            .parent()
            .unwrap_or(workspace_root)
            .to_path_buf(),
    )
    .plugin_dir(module_id)
    .join("status.json")
}

pub fn persist_module_statuses(
    workspace_root: &Path,
    statuses: &[IntegrationModuleStatus],
) -> Result<(), String> {
    workspace::write_json_with_audit_at(
        &module_status_bundle_path(workspace_root),
        statuses,
        Some(workspace_root),
        "integration-runtime",
        "write-module-status",
    )?;

    for status in statuses {
        workspace::write_json_with_audit_at(
            &module_status_path(workspace_root, &status.id),
            status,
            Some(workspace_root),
            "integration-runtime",
            "write-module-status",
        )?;
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn builtin_module_ids_are_stable() {
        let sync = WebDavSyncModule;
        let bridge = TelegramBridgeModule;

        assert_eq!(sync.module_id(), MODULE_ID_WEBDAV_SYNC);
        assert_eq!(bridge.module_id(), MODULE_ID_TELEGRAM_BRIDGE);
        assert_eq!(sync.kind(), ModuleKind::Sync);
        assert_eq!(bridge.kind(), ModuleKind::Bridge);
    }

    #[test]
    fn builtin_module_statuses_keep_expected_metadata() {
        let statuses = builtin_module_statuses(
            ModuleRuntimeStateSnapshot {
                enabled: true,
                running: true,
                last_error: None,
                last_started_ms: Some(11),
                last_stopped_ms: Some(9),
            },
            ModuleRuntimeStateSnapshot {
                enabled: false,
                running: false,
                last_error: Some("boom".to_string()),
                last_started_ms: Some(8),
                last_stopped_ms: Some(7),
            },
        );

        assert_eq!(statuses.len(), 2);
        assert_eq!(statuses[0].id, MODULE_ID_WEBDAV_SYNC);
        assert_eq!(statuses[0].display_name, "WebDAV Sync");
        assert_eq!(statuses[0].kind, ModuleKind::Sync);
        assert!(statuses[0].running);
        assert_eq!(statuses[1].id, MODULE_ID_TELEGRAM_BRIDGE);
        assert_eq!(statuses[1].kind, ModuleKind::Bridge);
        assert_eq!(statuses[1].last_error.as_deref(), Some("boom"));
    }

    #[test]
    fn persist_module_statuses_writes_bundle_and_module_specific_files() {
        let suffix = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis();
        let app_dir =
            std::env::temp_dir().join(format!("transfer-genie-integration-runtime-{suffix}"));
        let workspace_root = app_dir.join(workspace::WORKSPACE_DIR_NAME);
        let layout = WorkspaceLayout::new(app_dir.clone());
        let _ = fs::remove_dir_all(&app_dir);
        workspace::ensure_workspace_dirs(&layout).expect("ensure workspace dirs");

        let statuses = builtin_module_statuses(
            ModuleRuntimeStateSnapshot {
                enabled: true,
                running: false,
                last_error: None,
                last_started_ms: None,
                last_stopped_ms: Some(10),
            },
            ModuleRuntimeStateSnapshot {
                enabled: true,
                running: true,
                last_error: None,
                last_started_ms: Some(11),
                last_stopped_ms: None,
            },
        );
        persist_module_statuses(&workspace_root, &statuses).expect("persist module statuses");

        assert!(module_status_bundle_path(&workspace_root).is_file());
        assert!(module_status_path(&workspace_root, MODULE_ID_WEBDAV_SYNC).is_file());
        assert!(module_status_path(&workspace_root, MODULE_ID_TELEGRAM_BRIDGE).is_file());

        let _ = fs::remove_dir_all(&app_dir);
    }
}
