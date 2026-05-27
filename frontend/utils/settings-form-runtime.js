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

  globalScope.transferGenieSettingsFormRuntime = {
    normalizeTelegramPollInterval: normalizeTelegramPollInterval,
    getTelegramBridgeFormState: getTelegramBridgeFormState,
    normalizeLocalHttpApiBindPort: normalizeLocalHttpApiBindPort,
    getLocalHttpApiConfiguredUrl: getLocalHttpApiConfiguredUrl,
    getCurrentSenderName: getCurrentSenderName,
  };
})(typeof window !== 'undefined' ? window : globalThis);
