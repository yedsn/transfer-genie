(function bootstrapSettingsFormRuntime(globalScope) {
  if (!globalScope) {
    return;
  }

  function normalizeTelegramPollInterval(value, minimumIntervalSecs) {
    var minimum = Math.max(1, Number(minimumIntervalSecs) || 1);
    return Math.max(minimum, Number(value) || minimum);
  }

  function getTelegramBridgeProviderState(formState) {
    var state = formState || {};
    var kind = String(state.activeProviderKind || '').trim().toLowerCase();
    var name = String(state.activeProviderName || '').trim();
    var providerLabel = kind === 'supabase' ? 'Supabase' : kind === 'webdav' ? 'WebDAV' : '未选择';
    var spaceName = name || (kind === 'supabase' ? 'Supabase 存储空间' : kind === 'webdav' ? 'WebDAV 存储空间' : '未选择存储空间');
    if (!kind) {
      return { providerKind: '', providerLabel: providerLabel, spaceName: spaceName, ready: false, reason: '请先选择当前活动存储空间', reasonCode: 'no_provider' };
    }
    if (kind === 'webdav') {
      var webdavReady = !!state.activeProviderReady;
      return { providerKind: kind, providerLabel: providerLabel, spaceName: spaceName, ready: webdavReady, reason: webdavReady ? '' : '当前 WebDAV 存储空间配置不完整或不可用', reasonCode: webdavReady ? '' : 'webdav_unavailable' };
    }
    var spaceId = String(state.activeProviderSpaceId || '').trim();
    if (!spaceId) {
      return { providerKind: kind, providerLabel: providerLabel, spaceName: spaceName, ready: false, reason: '当前 Supabase 存储空间尚未完成绑定', reasonCode: 'unbound' };
    }
    var account = state.activeProviderAccountStatus || {};
    if (!account.signedIn) {
      return { providerKind: kind, providerLabel: providerLabel, spaceName: spaceName, ready: false, reason: '请先登录当前 Supabase 存储空间', reasonCode: 'login_required' };
    }
    var connection = state.activeProviderConnectionStatus || {};
    if (connection.errorCode === 'AUTH_SESSION_INVALID' || connection.error_code === 'AUTH_SESSION_INVALID') {
      return { providerKind: kind, providerLabel: providerLabel, spaceName: spaceName, ready: false, reason: 'Supabase 会话已失效，请重新登录', reasonCode: 'session_invalid' };
    }
    if (connection.schema === false || connection.rpc === false || connection.rls === false || connection.storage === false) {
      return { providerKind: kind, providerLabel: providerLabel, spaceName: spaceName, ready: false, reason: connection.message || '当前 Supabase 存储空间不可访问', reasonCode: 'inaccessible' };
    }
    return { providerKind: kind, providerLabel: providerLabel, spaceName: spaceName, ready: true, reason: '', reasonCode: '' };
  }

  function getTelegramBridgeFormState(formState, hasActiveEndpoint, providerState) {
    var state = formState || {};
    var botToken = String(state.telegramBotToken || '').trim();
    var chatId = String(state.telegramChatId || '').trim();
    var provider = providerState || getTelegramBridgeProviderState(state);
    return {
      botToken: botToken,
      chatId: chatId,
      provider: provider,
      providerLabel: provider.providerLabel,
      spaceName: provider.spaceName,
      availabilityReason: provider.reason,
      isConfigured: !!botToken && /^-?\d+$/.test(chatId) && provider.ready,
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
    var skippedItems = Math.max(
      0,
      Number(value.skippedItems !== undefined ? value.skippedItems : value.skipped_items) || 0,
    );
    var conflictItems = Math.max(
      0,
      Number(value.conflictItems !== undefined ? value.conflictItems : value.conflict_items) || 0,
    );
    var processedItems = Math.min(
      totalItems || appliedItems + skippedItems + conflictItems + failedItems,
      appliedItems + skippedItems + conflictItems + failedItems,
    );
    var status = String(value.status || 'pending');
    var rawFailedDetails = value.failedDetails !== undefined ? value.failedDetails : value.failed_details;
    var failedDetails = Array.isArray(rawFailedDetails)
      ? rawFailedDetails.map(function (item) {
        var detail = item || {};
        return {
          itemType: String(detail.itemType !== undefined ? detail.itemType : detail.item_type || ''),
          sourceKey: String(detail.sourceKey !== undefined ? detail.sourceKey : detail.source_key || ''),
          state: String(detail.state || 'error'),
          error: String(detail.error || ''),
        };
      }).filter(function (item) { return item.error; })
      : [];
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
      skippedItems: skippedItems,
      conflictItems: conflictItems,
      failedItems: failedItems,
      phase: String(value.phase || status),
      totalBytes: Math.max(0, Number(value.totalBytes !== undefined ? value.totalBytes : value.total_bytes) || 0),
      transferredBytes: Math.max(
        0,
        Number(value.transferredBytes !== undefined ? value.transferredBytes : value.transferred_bytes) || 0,
      ),
      processedItems: processedItems,
      percent: percent,
      lastError: String(value.lastError !== undefined ? value.lastError : value.last_error || ''),
      failedDetails: failedDetails,
      failedDetailCount: Math.max(
        failedDetails.length,
        Number(value.failedDetailCount !== undefined ? value.failedDetailCount : value.failed_detail_count) || 0,
      ),
    };
  }

  function createStorageProfileDraft(providerKind, seed, nowValue) {
    var kind = providerKind === 'webdav' || providerKind === 'supabase' ? providerKind : '';
    var source = seed || {};
    var now = Number(nowValue) || Date.now();
    return {
      id: String(source.id || (kind ? kind + '-' + now : '')),
      provider_kind: kind,
      name: String(source.name || (kind === 'supabase' ? 'Supabase' : kind === 'webdav' ? 'WebDAV' : '')),
      enabled: source.enabled !== false,
      webdav: kind === 'webdav' ? {
        url: String(source.webdav && source.webdav.url || ''),
        username: String(source.webdav && source.webdav.username || ''),
        password: String(source.webdav && source.webdav.password || ''),
      } : null,
      supabase: kind === 'supabase' ? {
        api_url: String(source.supabase && source.supabase.api_url || ''),
        anon_key: String(source.supabase && source.supabase.anon_key || ''),
        space_id: String(source.supabase && source.supabase.space_id || ''),
      } : null,
    };
  }

  function upsertStorageProfile(profiles, draft) {
    var current = Array.isArray(profiles) ? profiles : [];
    var next = draft || {};
    var index = current.findIndex(function findProfile(profile) { return profile && profile.id === next.id; });
    if (index < 0) {
      return current.concat([next]);
    }
    return current.map(function replaceProfile(profile, profileIndex) {
      return profileIndex === index ? next : profile;
    });
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
    getTelegramBridgeProviderState: getTelegramBridgeProviderState,
    getTelegramBridgeFormState: getTelegramBridgeFormState,
    normalizeLocalHttpApiBindPort: normalizeLocalHttpApiBindPort,
    getLocalHttpApiConfiguredUrl: getLocalHttpApiConfiguredUrl,
    getCurrentSenderName: getCurrentSenderName,
    getSendSettingsPayload: getSendSettingsPayload,
    normalizeSaveFilenameRule: normalizeSaveFilenameRule,
    getSupabaseLoginInput: getSupabaseLoginInput,
    performSupabaseSignIn: performSupabaseSignIn,
    normalizeStorageImportProgress: normalizeStorageImportProgress,
    createStorageProfileDraft: createStorageProfileDraft,
    upsertStorageProfile: upsertStorageProfile,
    getManualBackupDialogState: getManualBackupDialogState,
  };
})(typeof window !== 'undefined' ? window : globalThis);
