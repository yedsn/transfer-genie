(function bootstrapSettingsFormRuntime(globalScope) {
  if (!globalScope) {
    return;
  }

  function normalizeTelegramPollInterval(value, minimumIntervalSecs) {
    var minimum = Math.max(1, Number(minimumIntervalSecs) || 1);
    return Math.max(minimum, Number(value) || minimum);
  }

  function getTelegramBridgeFormState(formState, hasActiveEndpoint) {
    var state = formState || {};
    var botToken = String(state.telegramBotToken || '').trim();
    var chatId = String(state.telegramChatId || '').trim();
    return {
      botToken: botToken,
      chatId: chatId,
      isConfigured: !!botToken && /^-?\d+$/.test(chatId) && !!hasActiveEndpoint,
    };
  }

  function normalizeLocalHttpApiBindPort(value) {
    var parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
      return null;
    }
    return parsed;
  }

  function getLocalHttpApiConfiguredUrl(formState, options) {
    var state = formState || {};
    var config = options || {};
    var defaultBindAddress = String(config.defaultBindAddress || '127.0.0.1');
    var defaultBindPort = Number(config.defaultBindPort || 6011);
    var bindAddress = String(state.localHttpApiBindAddress || defaultBindAddress).trim() || defaultBindAddress;
    var bindPort = normalizeLocalHttpApiBindPort(state.localHttpApiBindPort) || defaultBindPort;
    var wrappedAddress =
      bindAddress.includes(':') && !bindAddress.startsWith('[') ? '[' + bindAddress + ']' : bindAddress;
    return 'http://' + wrappedAddress + ':' + bindPort + '/api/send-file';
  }

  function getCurrentSenderName(formState, legacySenderName) {
    var state = formState || {};
    var senderName = String(state.senderName || '').trim();
    if (senderName) {
      return senderName;
    }
    return String(legacySenderName || '').trim();
  }

  function getSendSettingsPayload(formState) {
    var state = formState || {};
    return {
      copy_after_send: !!state.copyAfterSend,
    };
  }

  function getManualBackupDialogState(currentState, patch) {
    var current = currentState || {};
    var next = patch || {};
    var target = next.target || current.target || 'local-data';
    if (target !== 'settings-snapshot') {
      target = 'local-data';
    }
    return {
      open: !!(next.open !== undefined ? next.open : current.open),
      target: target,
      title: String(
        next.title ||
          current.title ||
          (target === 'settings-snapshot' ? '手动备份设置快照' : '手动备份本地归档'),
      ),
      name: String(next.name !== undefined ? next.name : current.name || ''),
      note: String(next.note !== undefined ? next.note : current.note || ''),
      loading: !!(next.loading !== undefined ? next.loading : current.loading),
    };
  }

  globalScope.transferGenieSettingsFormRuntime = {
    normalizeTelegramPollInterval: normalizeTelegramPollInterval,
    getTelegramBridgeFormState: getTelegramBridgeFormState,
    normalizeLocalHttpApiBindPort: normalizeLocalHttpApiBindPort,
    getLocalHttpApiConfiguredUrl: getLocalHttpApiConfiguredUrl,
    getCurrentSenderName: getCurrentSenderName,
    getSendSettingsPayload: getSendSettingsPayload,
    getManualBackupDialogState: getManualBackupDialogState,
  };
})(typeof window !== 'undefined' ? window : globalThis);
