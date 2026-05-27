(function bootstrapSettingsOpsRuntime(globalScope) {
  if (!globalScope) {
    return;
  }

  var DEFAULT_BACKUP_LABEL = '备份 WebDAV';
  var DEFAULT_RESTORE_LABEL = '恢复 WebDAV';
  var BACKUP_RUNNING_LABEL = '备份中...';
  var RESTORE_RUNNING_LABEL = '恢复中...';

  function createDefaultSettingsOpsState() {
    return {
      backupLabel: DEFAULT_BACKUP_LABEL,
      backupRunning: false,
      restoreLabel: DEFAULT_RESTORE_LABEL,
      restoreRunning: false,
    };
  }

  function withBackupRunning(state, label) {
    var currentState = state || createDefaultSettingsOpsState();
    return Object.assign({}, currentState, {
      backupRunning: true,
      backupLabel: label || BACKUP_RUNNING_LABEL,
    });
  }

  function withBackupIdle(state, label) {
    var currentState = state || createDefaultSettingsOpsState();
    return Object.assign({}, currentState, {
      backupRunning: false,
      backupLabel: label || DEFAULT_BACKUP_LABEL,
    });
  }

  function withRestoreRunning(state, label) {
    var currentState = state || createDefaultSettingsOpsState();
    return Object.assign({}, currentState, {
      restoreRunning: true,
      restoreLabel: label || RESTORE_RUNNING_LABEL,
    });
  }

  function withRestoreIdle(state, label) {
    var currentState = state || createDefaultSettingsOpsState();
    return Object.assign({}, currentState, {
      restoreRunning: false,
      restoreLabel: label || DEFAULT_RESTORE_LABEL,
    });
  }

  function getBackupProgressLabel(payload) {
    var currentPayload = payload || {};
    if (currentPayload.state === 'finished') {
      return null;
    }
    var current = Number(currentPayload.current || 0);
    var total = Number(currentPayload.total || 0);
    var percent = total > 0 ? Math.round((current / total) * 100) : 0;
    if (currentPayload.state === 'scanning') {
      return '扫描中...';
    }
    if (currentPayload.state === 'downloading') {
      return '备份中 ' + percent + '%';
    }
    return currentPayload.state || BACKUP_RUNNING_LABEL;
  }

  function getRestoreProgressLabel(payload) {
    var currentPayload = payload || {};
    if (currentPayload.state === 'finished') {
      return null;
    }
    var current = Number(currentPayload.current || 0);
    var total = Number(currentPayload.total || 0);
    var percent = total > 0 ? Math.round((current / total) * 100) : 0;
    if (currentPayload.state === 'scanning') {
      return '清理旧数据...';
    }
    if (currentPayload.state === 'uploading') {
      return '恢复中 ' + percent + '%';
    }
    return currentPayload.state || RESTORE_RUNNING_LABEL;
  }

  globalScope.transferGenieSettingsOpsRuntime = {
    DEFAULT_BACKUP_LABEL: DEFAULT_BACKUP_LABEL,
    DEFAULT_RESTORE_LABEL: DEFAULT_RESTORE_LABEL,
    BACKUP_RUNNING_LABEL: BACKUP_RUNNING_LABEL,
    RESTORE_RUNNING_LABEL: RESTORE_RUNNING_LABEL,
    createDefaultSettingsOpsState: createDefaultSettingsOpsState,
    withBackupRunning: withBackupRunning,
    withBackupIdle: withBackupIdle,
    withRestoreRunning: withRestoreRunning,
    withRestoreIdle: withRestoreIdle,
    getBackupProgressLabel: getBackupProgressLabel,
    getRestoreProgressLabel: getRestoreProgressLabel,
  };
})(typeof window !== 'undefined' ? window : globalThis);
