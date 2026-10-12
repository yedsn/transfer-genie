import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import '../src-ui/src/utils/settings-form-runtime.js';

const runtime = globalThis.transferGenieSettingsFormRuntime;

function testEndpointSwitchAndPreviewRegressionGuards() {
  const tauriApiSource = readFileSync(new URL('../src-ui/src/services/tauri-api.js', import.meta.url), 'utf8');
  const source = readFileSync(new URL('../src-ui/src/legacy-main.js', import.meta.url), 'utf8');
  assert.match(source, /const viewModel = createMessageViewModel\(message\);[\s\S]*messagePreviewBody\.innerHTML/);
  assert.match(source, /settings\.active_storage_profile_id = targetId/);
  assert.match(source, /targetProfile\?\.provider_kind === 'webdav' \? targetId : null/);
  assert.match(source, /activeEndpointId = settings\.active_storage_profile_id \|\| settings\.active_webdav_id \|\| null/);
  assert.match(tauriApiSource, /toggle_marked_message_pin/);
  assert.match(tauriApiSource, /set_marked_messages_tags/);
}

function testNormalizeTelegramPollInterval() {
  assert.equal(runtime.normalizeTelegramPollInterval(undefined, 5), 5);
  assert.equal(runtime.normalizeTelegramPollInterval(3, 5), 5);
  assert.equal(runtime.normalizeTelegramPollInterval(12, 5), 12);
}

function testGetTelegramBridgeFormState() {
  const configured = runtime.getTelegramBridgeFormState(
    {
      telegramBotToken: ' 123:abc ',
      telegramChatId: ' -1001 ',
    },
    true
  );
  assert.deepEqual(configured, {
    botToken: '123:abc',
    chatId: '-1001',
    isConfigured: true,
  });

  const missingEndpoint = runtime.getTelegramBridgeFormState(
    {
      telegramBotToken: '123:abc',
      telegramChatId: '-1001',
    },
    false
  );
  assert.equal(missingEndpoint.isConfigured, false);

  const invalidChatId = runtime.getTelegramBridgeFormState(
    {
      telegramBotToken: '123:abc',
      telegramChatId: 'chat-id',
    },
    true
  );
  assert.equal(invalidChatId.isConfigured, false);
}

function testNormalizeLocalHttpApiBindPort() {
  assert.equal(runtime.normalizeLocalHttpApiBindPort(6011), 6011);
  assert.equal(runtime.normalizeLocalHttpApiBindPort('65535'), 65535);
  assert.equal(runtime.normalizeLocalHttpApiBindPort('0'), null);
  assert.equal(runtime.normalizeLocalHttpApiBindPort('70000'), null);
  assert.equal(runtime.normalizeLocalHttpApiBindPort('abc'), null);
}

function testGetLocalHttpApiConfiguredUrl() {
  const ipv4Url = runtime.getLocalHttpApiConfiguredUrl(
    {
      localHttpApiBindAddress: ' 0.0.0.0 ',
      localHttpApiBindPort: '7001',
    },
    {
      defaultBindAddress: '127.0.0.1',
      defaultBindPort: 6011,
    }
  );
  assert.equal(ipv4Url, 'http://0.0.0.0:7001/api/send-file');

  const ipv6Url = runtime.getLocalHttpApiConfiguredUrl(
    {
      localHttpApiBindAddress: '::1',
      localHttpApiBindPort: 'invalid',
    },
    {
      defaultBindAddress: '127.0.0.1',
      defaultBindPort: 6011,
    }
  );
  assert.equal(ipv6Url, 'http://[::1]:6011/api/send-file');
}

function testGetCurrentSenderName() {
  assert.equal(runtime.getCurrentSenderName({ senderName: ' alice ' }, 'legacy'), 'alice');
  assert.equal(runtime.getCurrentSenderName({ senderName: '   ' }, ' legacy '), 'legacy');
  assert.equal(runtime.getCurrentSenderName({}, ''), '');
}

function testSendSettingsPayload() {
  assert.deepEqual(runtime.getSendSettingsPayload({ copyAfterSend: true }), {
    copy_after_send: true,
  });
  assert.deepEqual(runtime.getSendSettingsPayload({}), {
    copy_after_send: false,
  });
}

function testNormalizeSaveFilenameRule() {
  assert.equal(
    runtime.normalizeSaveFilenameRule(' {yyyymmdd}_{filename}.{file_suffix} ', '{filename}.{file_suffix}'),
    '{yyyymmdd}_{filename}.{file_suffix}'
  );
  assert.equal(
    runtime.normalizeSaveFilenameRule('   ', '{filename}.{file_suffix}'),
    '{filename}.{file_suffix}'
  );
}

async function testSupabaseLoginCapturesCredentialsBeforeSavingProfile() {
  const formState = {
    supabaseEmail: ' user@example.com ',
    supabasePassword: 'secret-before-save',
  };
  let received = null;
  const result = await runtime.performSupabaseSignIn(formState, {
    async ensureProfileSaved() {
      formState.supabasePassword = '';
      return 'profile-1';
    },
    async signIn(input) {
      received = input;
      return { signedIn: true };
    },
  });
  assert.deepEqual(received, {
    profileId: 'profile-1',
    email: 'user@example.com',
    password: 'secret-before-save',
  });
  assert.equal(result.signedIn, true);
  await assert.rejects(
    runtime.performSupabaseSignIn({ supabaseEmail: '', supabasePassword: '' }, {}),
    /请输入 Supabase 登录邮箱和密码/,
  );
}

function testNormalizeStorageImportProgress() {
  assert.deepEqual(runtime.normalizeStorageImportProgress({
    batchId: 'batch-1',
    status: 'running',
    totalItems: 10,
    appliedItems: 3,
    failedItems: 1,
  }), {
    batchId: 'batch-1',
    status: 'running',
    totalItems: 10,
    appliedItems: 3,
    failedItems: 1,
    processedItems: 4,
    percent: 40,
    lastError: '',
  });

  const snakeCase = runtime.normalizeStorageImportProgress({
    batch_id: 'batch-2',
    status: 'error',
    total_items: 5,
    applied_items: 4,
    failed_items: 1,
    last_error: 'one failed',
  });
  assert.equal(snakeCase.processedItems, 5);
  assert.equal(snakeCase.percent, 100);
  assert.equal(snakeCase.lastError, 'one failed');

  assert.equal(runtime.normalizeStorageImportProgress({ status: 'completed' }, 0).percent, 100);
}

function testManualBackupDialogState() {
  const opened = runtime.getManualBackupDialogState({}, {
    open: true,
    target: 'settings-snapshot',
    name: ' 升级前 ',
    note: '保留一份',
  });
  assert.deepEqual(opened, {
    open: true,
    target: 'settings-snapshot',
    title: '手动备份设置快照',
    name: ' 升级前 ',
    note: '保留一份',
    loading: false,
  });

  const fallback = runtime.getManualBackupDialogState(opened, {
    target: 'unknown',
    loading: true,
  });
  assert.equal(fallback.target, 'local-data');
  assert.equal(fallback.name, ' 升级前 ');
  assert.equal(fallback.note, '保留一份');
  assert.equal(fallback.loading, true);
}

function sectionHtml(html, id) {
  const marker = `id="${id}"`;
  const start = html.indexOf(marker);
  assert.notEqual(start, -1, `missing ${id}`);
  const next = html.indexOf('settings-section-anchor', start + marker.length);
  return next === -1 ? html.slice(start) : html.slice(start, next);
}

function testShortcutSettingsMarkup() {
  const html = readFileSync(new URL('../src-ui/index.html', import.meta.url), 'utf8');
  assert.match(html, /data-settings-nav-target="settings-section-shortcuts"[^>]*>快捷键</);

  const shortcuts = sectionHtml(html, 'settings-section-shortcuts');
  assert.match(shortcuts, /id="shortcuts-enabled"/);
  assert.match(shortcuts, /id="global-hotkey"/);
  assert.match(shortcuts, /id="global-hotkey-clear"/);
  assert.match(shortcuts, /id="global-hotkey-reset"/);
  assert.match(shortcuts, /id="system-dictation-shortcut"/);
  assert.match(shortcuts, /id="system-dictation-shortcut-clear"/);
  assert.match(shortcuts, /id="system-dictation-shortcut-reset"/);
  assert.match(shortcuts, /Shift\+Alt/);
  assert.match(shortcuts, /Alt\+S/);
  assert.match(shortcuts, /name="send-hotkey" value="enter"/);
  assert.match(shortcuts, /name="send-hotkey" value="ctrl_enter"/);
  assert.match(shortcuts, /id="send-hotkey-clear"/);
  assert.match(shortcuts, /id="send-hotkey-reset"/);

  assert.doesNotMatch(sectionHtml(html, 'settings-section-send'), /name="send-hotkey"|发送快捷键/);
  assert.doesNotMatch(sectionHtml(html, 'settings-section-system'), /global-hotkey|全局快捷键|启用全局快捷键/);
  assert.doesNotMatch(sectionHtml(html, 'settings-section-speech'), /system-dictation-shortcut|系统听写快捷键/);
  assert.match(html, /supabaseAuthBusy/);
  assert.match(html, /登录中.../);
  assert.match(html, /supabase-auth-message/);
  assert.match(html, /id="supabase-import-webdav"/);
  assert.match(html, /storageImportBusy/);
  assert.match(html, /role="progressbar"/);
  assert.match(html, /WebDAV 刷新间隔（秒）/);
  assert.match(html, /Supabase 使用 Realtime WebSocket 实时同步/);

  const legacyMain = readFileSync(new URL('../src-ui/src/legacy-main.js', import.meta.url), 'utf8');
  assert.match(legacyMain, /updateRefreshCountdown\(\);\n  if \(isActiveSupabaseEndpoint\(\)\) \{\n    return;\n  \}\n  refreshTimer = setInterval/);
  assert.match(legacyMain, /if \(isActiveSupabaseEndpoint\(\)\) \{\n    refreshLabel\.textContent = refreshLabelDefault \|\| '刷新';\n    return;\n  \}/);
  assert.match(legacyMain, /listen\('supabase-realtime-synced'/);
  assert.match(legacyMain, /loadMessages\(\{ checkNew: true, scrollToBottom: false \}\)/);
  assert.match(legacyMain, /while \(supabaseRealtimeRefreshQueued && isActiveSupabaseEndpoint\(\)\)/);
}

testNormalizeTelegramPollInterval();
testGetTelegramBridgeFormState();
testNormalizeLocalHttpApiBindPort();
testGetLocalHttpApiConfiguredUrl();
testGetCurrentSenderName();
testSendSettingsPayload();
testNormalizeSaveFilenameRule();
await testSupabaseLoginCapturesCredentialsBeforeSavingProfile();
testNormalizeStorageImportProgress();
testManualBackupDialogState();
testEndpointSwitchAndPreviewRegressionGuards();
testShortcutSettingsMarkup();

console.log('settings-form-runtime tests passed');
