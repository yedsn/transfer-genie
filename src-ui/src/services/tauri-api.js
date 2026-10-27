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

  const mobileIntegrationApi = {
    async listenLifecycle(callback) {
      const addPluginListener = _getTauri().core?.addPluginListener;
      if (typeof addPluginListener !== 'function') {
        throw new Error('Tauri plugin event listener is unavailable');
      }
      return addPluginListener('mobile-integration', 'lifecycle', callback);
    },
    async diagnostic(requestId) {
      return invoke('plugin:mobile-integration|diagnostic', {
        payload: { requestId },
      });
    },
    async selectMedia(selectionLimit = 10) {
      return invoke('plugin:mobile-integration|select_media', {
        payload: { selectionLimit },
      });
    },
    async selectDocuments(allowsMultipleSelection = true) {
      return invoke('plugin:mobile-integration|select_documents', {
        payload: { allowsMultipleSelection },
      });
    },
    async previewFile(path) {
      return invoke('plugin:mobile-integration|preview_file', {
        payload: { path },
      });
    },
    async shareFile(path) {
      return invoke('plugin:mobile-integration|share_file', {
        payload: { path },
      });
    },
    async generateImageThumbnail(path, maxPixelSize = 1280) {
      return invoke('plugin:mobile-integration|generate_image_thumbnail', {
        payload: { path, maxPixelSize },
      });
    },
    async generateVideoPoster(requestId, path, maxPixelSize = 1280, timeoutMilliseconds = 15000) {
      return invoke('plugin:mobile-integration|generate_video_poster', {
        payload: { requestId, path, maxPixelSize, timeoutMilliseconds },
      });
    },
    async cancelVideoPoster(requestId) {
      return invoke('plugin:mobile-integration|cancel_video_poster', {
        payload: { requestId },
      });
    },
  };

  const mobileCacheApi = {
    async getSummary() {
      return invoke('get_mobile_cache_summary');
    },
    async clear() {
      return invoke('clear_mobile_cache');
    },
  };

  // Settings API
  const settingsApi = {
    async setMobileLifecycleState(lifecycleState) {
      return invoke('set_mobile_lifecycle_state', { lifecycleState });
    },
    async getPlatformCapabilities() {
      return invoke('get_platform_capabilities');
    },
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
    async supabaseSignIn(input) {
      return invoke('supabase_sign_in', { input });
    },
    async supabaseDraftSignIn(input) {
      return invoke('supabase_draft_sign_in', { input });
    },
    async testSupabaseDraftConnection(input) {
      return invoke('test_supabase_draft_connection', { input });
    },
    async listSupabaseDraftSpaces(flowId) {
      return invoke('list_supabase_draft_spaces', { input: { flowId } });
    },
    async completeSupabaseBinding(input) {
      return invoke('complete_supabase_binding', { input });
    },
    async cancelSupabaseBindingFlow(flowId) {
      return invoke('cancel_supabase_binding_flow', { input: { flowId } });
    },
    async supabaseCurrentUser(profileId) {
      return invoke('supabase_current_user', { profileId });
    },
    async refreshSupabaseSession(profileId) {
      return invoke('supabase_refresh_session', { profileId });
    },
    async supabaseLogout(profileId) {
      return invoke('supabase_logout', { profileId });
    },
    async testSupabaseConnection(profileId) {
      return invoke('test_supabase_connection', { profileId });
    },
    async listSupabaseSpaces(profileId) {
      return invoke('list_supabase_spaces', { profileId });
    },
    async switchSupabaseSpace(input) {
      return invoke('switch_supabase_space', { input });
    },
  };

  // Sync/WebDAV API
  const syncApi = {
    async listPendingOperations() {
      return invoke('list_pending_operations');
    },
    async retryPendingOperation(operationId) {
      return invoke('retry_pending_operation', { operationId });
    },
    async listConflicts() {
      return invoke('list_sync_conflicts');
    },
    async resolveConflict(conflictId, resolution) {
      return invoke('resolve_sync_conflict', { input: { conflictId, resolution } });
    },
    async getSyncStatus() {
      return invoke('get_sync_status');
    },
    async refresh() {
      return invoke('refresh');
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
    async listWindow(input) {
      return invoke('list_messages_window', { input });
    },
    async searchMessages(params) {
      return invoke('list_messages', params);
    },
    async sendText(params) {
      return invoke('send_text', params);
    },
    async sendFile(params) {
      return invoke('send_file', params);
    },
    async sendSpeechMessage(params) {
      return invoke('send_speech_message', params);
    },
    async deleteMessages(filenames, deleteRemote) {
      return invoke('delete_messages', { filenames, deleteRemote });
    },
    async mark(filename, tagIds = [], dueDate = null) {
      return invoke('mark_message', { filename, tagIds, dueDate });
    },
    async unmark(filename) {
      return invoke('unmark_message', { filename });
    },
    async openMessageFile(filename, originalName = '', endpointId = null) {
      return invoke('open_message_file', { filename, originalName, endpointId });
    },
    async downloadMessageFile(filename, originalName = '', conflictAction = 'overwrite', endpointId = null) {
      return invoke('download_message_file', { filename, originalName, conflictAction, endpointId });
    },
    async saveMessageFileAs(filename, targetPath, endpointId) {
      return invoke('save_message_file_as', { filename, targetPath, endpointId });
    },
    async getThumbnail(filename) {
      return invoke('get_thumbnail', { filename });
    },
    async getMediaPreview(input) {
      return invoke('get_media_preview', { input });
    },
    async completeMediaPreview(input) {
      return invoke('complete_media_preview', { input });
    },
    async getMessageSourceAudioFile(filename, endpointId = null) {
      return invoke('get_message_source_audio_file', { filename, endpointId });
    },
  };

  const aiApi = {
    async processText(request) {
      return invoke('process_text_with_ai', { request });
    },
    async processTextStream(requestId, request) {
      return invoke('process_text_with_ai_stream', { requestId, request });
    },
  };

  // Marked messages API
  const markedApi = {
    async getMarkedMessages(params) {
      return invoke('list_marked_messages', params);
    },
    async toggleMarkedPin(filename) {
      return invoke('toggle_marked_message_pin', { filename });
    },
    async updateMarkedTags(filename, tagIds) {
      return invoke('set_marked_messages_tags', { filenames: [filename], tagIds });
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
    async listDownloadHistory(params) {
      return invoke('list_download_history', params || {});
    },
    async listUploadHistory(params) {
      return invoke('list_upload_history', params || {});
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
    ai: aiApi,
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
    mobileIntegration: mobileIntegrationApi,
    mobileCache: mobileCacheApi,
  };

  globalScope.transferGenieApi = api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
