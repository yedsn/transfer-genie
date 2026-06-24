// Tauri API service layer for Transfer Genie frontend

(function(globalScope) {
  if (!globalScope) {
    return;
  }

  // Lazy Tauri API accessors — always resolve from window.__TAURI__ at call time
  const _getTauri = () => (typeof window !== 'undefined' && window.__TAURI__) || {};
  const invoke = (...args) => { const t = _getTauri(); const fn = t.core?.invoke || t.invoke; return fn(...args); };
  const openDialog = (...args) => { const fn = _getTauri().dialog?.open; return fn?.(...args); };
  const saveDialog = (...args) => { const fn = _getTauri().dialog?.save; return fn?.(...args); };
  const listen = (...args) => { const fn = _getTauri().event?.listen; return fn?.(...args); };
  const convertFileSrc = (...args) => { const fn = _getTauri().path?.convertFileSrc; return fn?.(...args); };

  // Settings API
  const settingsApi = {
    async getSettings() {
      return invoke('get_settings');
    },
    async saveSettings(settings) {
      return invoke('save_settings', { settings });
    },
    async exportSettings(path, password) {
      return invoke('export_settings', { path, password });
    },
    async importSettings(path, password) {
      return invoke('import_settings', { path, password });
    },
    async listSettingsSnapshots() {
      return invoke('list_settings_snapshots');
    },
    async restoreSettingsSnapshot(snapshotPath) {
      return invoke('restore_settings_snapshot', { snapshotPath });
    },
    async getAutoBackupStatus() {
      return invoke('get_auto_backup_status');
    },
    async saveSendHotkey(sendHotkey) {
      return invoke('save_send_hotkey', { sendHotkey });
    },
  };

  // Sync/WebDAV API
  const syncApi = {
    async getSyncStatus() {
      return invoke('get_sync_status');
    },
    async testWebdavSpeed(endpointId, url, username, password) {
      return invoke('test_webdav_speed', { endpointId, url, username, password });
    },
    async switchEndpoint(endpointId) {
      return invoke('switch_endpoint', { endpointId });
    },
  };

  // Message API
  const messageApi = {
    async getMessages(params) {
      return invoke('get_messages', params);
    },
    async sendText(params) {
      return invoke('send_text', params);
    },
    async sendFile(params) {
      return invoke('send_file', params);
    },
    async deleteMessages(filenames, deleteRemote) {
      return invoke('delete_messages', { filenames, deleteRemote });
    },
    async toggleMessageMarked(filename, marked) {
      return invoke('toggle_message_marked', { filename, marked });
    },
    async openMessageFile(filename) {
      return invoke('open_message_file', { filename });
    },
    async downloadMessageFile(filename, endpointId) {
      return invoke('download_message_file', { filename, endpointId });
    },
    async saveMessageFileAs(filename, targetPath, endpointId) {
      return invoke('save_message_file_as', { filename, targetPath, endpointId });
    },
    async getThumbnail(filename) {
      return invoke('get_thumbnail', { filename });
    },
  };

  // Marked messages API
  const markedApi = {
    async getMarkedMessages(params) {
      return invoke('get_marked_messages', params);
    },
    async toggleMarkedPin(filename, pinned) {
      return invoke('toggle_marked_pin', { filename, pinned });
    },
    async updateMarkedTags(filename, tagIds) {
      return invoke('update_marked_tags', { filename, tagIds });
    },
    async listMarkedTags() {
      return invoke('list_marked_tags');
    },
    async createMarkedTag(name) {
      return invoke('create_marked_tag', { name });
    },
    async deleteMarkedTag(tagId) {
      return invoke('delete_marked_tag', { tagId });
    },
    async renameMarkedTag(tagId, newName) {
      return invoke('rename_marked_tag', { tagId, newName });
    },
  };

  // Download/Upload history API
  const transferApi = {
    async listDownloadHistory() {
      return invoke('list_download_history');
    },
    async listUploadHistory() {
      return invoke('list_upload_history');
    },
    async saveDownloadHistoryAs(filename, targetPath, endpointId) {
      return invoke('save_download_history_as', { filename, targetPath, endpointId });
    },
    async redownloadDownloadHistory(filename, endpointId) {
      return invoke('redownload_download_history', { filename, endpointId });
    },
    async deleteDownloadHistory(filename) {
      return invoke('delete_download_history', { filename });
    },
    async clearDownloadHistoryRecords(recordIds) {
      return invoke('clear_download_history_records', { recordIds });
    },
    async clearUploadHistoryRecords(recordIds) {
      return invoke('clear_upload_history_records', { recordIds });
    },
    async openDownloadHistoryDir(filename) {
      return invoke('open_download_history_dir', { filename });
    },
    async openDownloadHistoryFile(filename) {
      return invoke('open_download_history_file', { filename });
    },
  };

  // Backup API
  const backupApi = {
    async backupWebdav(path) {
      return invoke('backup_webdav', { path });
    },
    async restoreWebdav(path) {
      return invoke('restore_webdav', { path });
    },
    async listLocalBackupArchives() {
      return invoke('list_local_backup_archives');
    },
    async cleanupMessages(params) {
      return invoke('cleanup_messages', params);
    },
  };

  // Telegram bridge API
  const telegramApi = {
    async startTelegramBridge(params) {
      return invoke('start_telegram_bridge', params);
    },
    async stopTelegramBridge() {
      return invoke('stop_telegram_bridge');
    },
    async getTelegramBridgeStatus() {
      return invoke('get_telegram_bridge_status');
    },
    async discoverTelegramChats(botToken, proxyUrl) {
      return invoke('discover_telegram_chats', { botToken, proxyUrl });
    },
  };

  // Local HTTP API
  const localHttpApi = {
    async getLocalHttpApiStatus() {
      return invoke('get_local_http_api_status');
    },
  };

  // App API
  const appApi = {
    async getAppVersion() {
      return invoke('get_app_version');
    },
    async checkAppUpdate() {
      return invoke('check_app_update');
    },
    async downloadAndInstallUpdate() {
      return invoke('download_and_install_update');
    },
    async restartApp() {
      return invoke('restart_app');
    },
    async minimizeWindow() {
      return invoke('minimize_window');
    },
    async openUrl(url) {
      return invoke('open_url', { url });
    },
    async openDataDir() {
      return invoke('open_data_dir');
    },
    async openLogDir() {
      return invoke('open_log_dir');
    },
    async openDownloadDir() {
      return invoke('open_download_dir');
    },
    async chooseDownloadDir() {
      return invoke('choose_download_dir');
    },
  };

  // Dialog helpers
  const dialogApi = {
    async openFile(options) {
      if (!openDialog) return null;
      return openDialog(options);
    },
    async saveFile(options) {
      if (!saveDialog) return null;
      return saveDialog(options);
    },
  };

  // Event listener helper
  const eventApi = {
    async listen(eventName, handler) {
      if (!listen) return null;
      return listen(eventName, handler);
    },
  };

  // Path helper
  const pathApi = {
    convertFileSrc(path) {
      if (!convertFileSrc) return path;
      return convertFileSrc(path);
    },
  };

  // Integration modules API
  const integrationApi = {
    async getIntegrationModules() {
      return invoke('get_integration_modules');
    },
  };

  var api = {
    invoke: invoke,
    settings: settingsApi,
    sync: syncApi,
    message: messageApi,
    marked: markedApi,
    transfer: transferApi,
    backup: backupApi,
    telegram: telegramApi,
    localHttp: localHttpApi,
    app: appApi,
    dialog: dialogApi,
    event: eventApi,
    path: pathApi,
    integration: integrationApi,
  };

  globalScope.transferGenieApi = api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
