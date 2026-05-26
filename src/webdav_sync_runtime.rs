use crate::integration_runtime::ModuleRuntimeStateSnapshot;
use crate::{cancel_active_sync, is_sync_running_from, run_sync, signal_sync_loop_reset};
use crate::{AppState, Settings, SyncStatus, AUTO_SYNC_SOURCE, REFRESH_SYNC_SOURCE};

pub struct WebDavSyncRuntimeAdapter<'a> {
    state: &'a AppState,
}

impl<'a> WebDavSyncRuntimeAdapter<'a> {
    pub fn new(state: &'a AppState) -> Self {
        Self { state }
    }

    pub fn status(&self) -> Result<SyncStatus, String> {
        let status = self
            .state
            .sync_status
            .lock()
            .map_err(|_| "读取同步状态失败".to_string())?;
        Ok(status.clone())
    }

    pub fn status_snapshot(&self, settings: &Settings) -> Result<ModuleRuntimeStateSnapshot, String> {
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

    pub fn cancel(&self) -> Result<(), String> {
        cancel_active_sync(self.state)
    }

    pub async fn refresh(&self) -> Result<SyncStatus, String> {
        if is_sync_running_from(self.state, AUTO_SYNC_SOURCE)? {
            self.cancel()?;
        }

        let result = run_sync(self.state, REFRESH_SYNC_SOURCE, true).await;
        signal_sync_loop_reset(self.state);
        result
    }
}
