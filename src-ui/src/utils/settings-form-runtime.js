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

  function normalizeSaveFilenameRule(value, defaultRule) {
    var fallback = String(defaultRule || '{filename}.{file_suffix}');
    var normalized = String(value || '').trim();
    return normalized || fallback;
  }

  function getSupabaseLoginInput(formState) {
    var state = formState || {};
    return {
      email: String(state.supabaseEmail || '').trim(),
      password: String(state.supabasePassword || ''),
    };
  }

  async function performSupabaseSignIn(formState, dependencies) {
    var login = getSupabaseLoginInput(formState);
    if (!login.email || !login.password) {
      throw new Error('请输入 Supabase 登录邮箱和密码');
    }
    var deps = dependencies || {};
    if (typeof deps.ensureProfileSaved !== 'function' || typeof deps.signIn !== 'function') {
      throw new Error('Supabase 登录组件尚未就绪');
    }
    var profileId = await deps.ensureProfileSaved();
    return deps.signIn({
      profileId: profileId,
      email: login.email,
      password: login.password,
    });
  }

  function normalizeStorageImportProgress(progress, fallbackTotal) {
    var value = progress || {};
    var totalItems = Math.max(
      0,
      Number(value.totalItems !== undefined ? value.totalItems : value.total_items)
        || Number(fallbackTotal)
        || 0,
    );
    var appliedItems = Math.max(
      0,
      Number(value.appliedItems !== undefined ? value.appliedItems : value.applied_items) || 0,
    );
    var failedItems = Math.max(
      0,
      Number(value.failedItems !== undefined ? value.failedItems : value.failed_items) || 0,
    );
    var processedItems = Math.min(totalItems || appliedItems + failedItems, appliedItems + failedItems);
    var status = String(value.status || 'pending');
    var percent = totalItems > 0
      ? Math.min(100, Math.max(0, Math.round((processedItems / totalItems) * 100)))
      : status === 'completed'
        ? 100
        : 0;
    return {
      batchId: String(value.batchId !== undefined ? value.batchId : value.batch_id || ''),
      status: status,
      totalItems: totalItems,
      appliedItems: appliedItems,
      failedItems: failedItems,
      processedItems: processedItems,
      percent: percent,
      lastError: String(value.lastError !== undefined ? value.lastError : value.last_error || ''),
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
    normalizeSaveFilenameRule: normalizeSaveFilenameRule,
    getSupabaseLoginInput: getSupabaseLoginInput,
    performSupabaseSignIn: performSupabaseSignIn,
    normalizeStorageImportProgress: normalizeStorageImportProgress,
    getManualBackupDialogState: getManualBackupDialogState,
  };
})(typeof window !== 'undefined' ? window : globalThis);
