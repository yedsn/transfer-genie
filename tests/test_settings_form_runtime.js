import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import '../src-ui/src/utils/settings-form-runtime.js';

const runtime = globalThis.transferGenieSettingsFormRuntime;

function testEndpointSwitchAndPreviewRegressionGuards() {
  const tauriApiSource = readFileSync(new URL('../src-ui/src/services/tauri-api.js', import.meta.url), 'utf8');
  const source = readFileSync(new URL('../src-ui/src/legacy-main.js', import.meta.url), 'utf8');
  assert.match(source, /const viewModel = createMessageViewModel\(message\);[\s\S]*messagePreviewBody\.innerHTML/);
  assert.match(source, /pageMessages\.forEach\(\(message\) => \{\s*const viewModel = createMessageViewModel\(message\);/);
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
  const configuredProvider = runtime.getTelegramBridgeProviderState({
    activeProviderKind: 'webdav',
    activeProviderName: '主空间',
    activeProviderReady: true,
  });
  const configured = runtime.getTelegramBridgeFormState(
    {
      telegramBotToken: ' 123:abc ',
      telegramChatId: ' -1001 ',
    },
    true,
    configuredProvider,
  );
  assert.deepEqual(configured, {
    botToken: '123:abc',
    chatId: '-1001',
    provider: configuredProvider,
    providerLabel: 'WebDAV',
    spaceName: '主空间',
    availabilityReason: '',
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

function testTelegramBridgeProviderStates() {
  const webdav = runtime.getTelegramBridgeProviderState({
    activeProviderKind: 'webdav',
    activeProviderName: '公司网盘',
    activeProviderReady: true,
  });
  assert.equal(webdav.ready, true);
  assert.equal(webdav.providerLabel, 'WebDAV');
  assert.equal(webdav.spaceName, '公司网盘');

  const unbound = runtime.getTelegramBridgeProviderState({
    activeProviderKind: 'supabase',
    activeProviderName: '团队空间',
    activeProviderSpaceId: '',
  });
  assert.equal(unbound.reasonCode, 'unbound');
  assert.match(unbound.reason, /尚未完成绑定/);

  const signedOut = runtime.getTelegramBridgeProviderState({
    activeProviderKind: 'supabase',
    activeProviderName: '团队空间',
    activeProviderSpaceId: 'space-a',
    activeProviderAccountStatus: { signedIn: false },
  });
  assert.equal(signedOut.reasonCode, 'login_required');

  const unavailable = runtime.getTelegramBridgeProviderState({
    activeProviderKind: 'supabase',
    activeProviderName: '团队空间',
    activeProviderSpaceId: 'space-a',
    activeProviderAccountStatus: { signedIn: true },
    activeProviderConnectionStatus: { schema: false, message: '空间不可访问' },
  });
  assert.equal(unavailable.reasonCode, 'inaccessible');
  assert.equal(unavailable.reason, '空间不可访问');

  const ready = runtime.getTelegramBridgeProviderState({
    activeProviderKind: 'supabase',
    activeProviderName: '团队空间',
    activeProviderSpaceId: 'space-a',
    activeProviderAccountStatus: { signedIn: true },
    activeProviderConnectionStatus: { schema: true, rpc: true, rls: true, storage: true },
  });
  assert.equal(ready.ready, true);
  assert.equal(ready.providerLabel, 'Supabase');
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
    skippedItems: 0,
    conflictItems: 0,
    failedItems: 1,
    phase: 'running',
    totalBytes: 0,
    transferredBytes: 0,
    processedItems: 4,
    percent: 40,
    lastError: '',
    failedDetails: [],
    failedDetailCount: 0,
  });

  const snakeCase = runtime.normalizeStorageImportProgress({
    batch_id: 'batch-2',
    status: 'error',
    total_items: 5,
    applied_items: 4,
    failed_items: 1,
    last_error: 'one failed',
    failed_details: [{
      item_type: 'message',
      source_key: 'old-name.txt',
      state: 'error',
      error: 'UNIQUE constraint failed',
    }],
    failed_detail_count: 3,
  });
  assert.equal(snakeCase.processedItems, 5);
  assert.equal(snakeCase.percent, 100);
  assert.equal(snakeCase.lastError, 'one failed');
  assert.deepEqual(snakeCase.failedDetails, [{
    itemType: 'message',
    sourceKey: 'old-name.txt',
    state: 'error',
    error: 'UNIQUE constraint failed',
  }]);
  assert.equal(snakeCase.failedDetailCount, 3);

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

function testStorageProfileDraftIsIndependentAndUpsertPreservesOthers() {
  const profiles = [
    { id: 'webdav-a', provider_kind: 'webdav', name: 'A' },
    { id: 'supabase-b', provider_kind: 'supabase', name: 'B' },
  ];
  const draft = runtime.createStorageProfileDraft('webdav', profiles[0], 123);
  draft.name = 'A edited';
  assert.equal(profiles[0].name, 'A');
  const saved = runtime.upsertStorageProfile(profiles, draft);
  assert.equal(saved[0].name, 'A edited');
  assert.deepEqual(saved[1], profiles[1]);
  const added = runtime.upsertStorageProfile(
    saved,
    runtime.createStorageProfileDraft('supabase', {}, 456),
  );
  assert.deepEqual(added.slice(0, 2), saved);
  assert.equal(added[2].id, 'supabase-456');
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
  const aiSection = sectionHtml(html, 'settings-section-ai');
  assert.match(aiSection, /id="ai-tab-name-prompt"/);
  assert.match(aiSection, /aiTabNamePrompt/);
  assert.match(aiSection, /\{\{text\}\}/);

  assert.doesNotMatch(sectionHtml(html, 'settings-section-send'), /name="send-hotkey"|发送快捷键/);
  assert.doesNotMatch(sectionHtml(html, 'settings-section-system'), /global-hotkey|全局快捷键|启用全局快捷键/);
  assert.doesNotMatch(sectionHtml(html, 'settings-section-speech'), /system-dictation-shortcut|系统听写快捷键/);
  assert.match(html, /supabaseAuthBusy/);
  assert.match(html, /登录中.../);
  assert.match(html, /supabase-auth-message/);
  assert.doesNotMatch(html, /<h3 class="settings-group-title">Supabase 存储空间<\/h3>/);
  assert.match(html, /id="storage-space-transfer"/);
  const storageSection = sectionHtml(html, 'settings-section-webdav');
  const transferButtonIndex = storageSection.indexOf('id="storage-space-transfer"');
  const speedTestIndex = storageSection.indexOf('id="batch-speed-test"');
  assert.ok(transferButtonIndex >= 0 && speedTestIndex > transferButtonIndex, 'storage transfer is beside batch speed test in the header actions');
  assert.match(html, /storageTransferWizardOpen/);
  assert.match(html, /storageTransferWizardStep === 'select'/);
  assert.match(html, /storageTransferWizardStep === 'overview'/);
  assert.match(html, /storageTransferWizardStep === 'confirm'/);
  assert.match(html, /storageTransferWizardStep === 'progress'/);
  assert.match(html, /storageTransferWizardStep === 'complete'/);
  assert.match(html, /storage-transfer-stage-kicker/);
  assert.match(html, /storage-transfer-picker-order/);
  assert.match(html, /storage-transfer-confirm-list/);
  assert.match(html, /storage-transfer-progress-metrics/);
  assert.match(html, /已核验写入/);
  assert.match(html, /异常详情/);
  assert.match(html, /failedDetails/);
  assert.match(html, /下方查看异常原因/);
  assert.match(html, />完成<\/button>/);
  assert.match(html, /新增存储空间/);
  assert.match(html, /storageProfileEditorOpen/);
  assert.match(html, /storage-profile-editor-modal/);
  assert.match(html, /endpoint-provider-mark/);
  assert.match(html, /endpoint-current-state/);
  assert.match(html, /endpoint-remove-button/);
  const storageProfileEditorIndex = html.indexOf('storage-profile-editor-modal');
  const supabaseEmailIndex = html.indexOf('id="supabase-email"');
  assert.ok(supabaseEmailIndex > storageProfileEditorIndex, 'Supabase account controls are inside the storage profile editor');
  assert.match(html, /id="supabase-logout"/);
  assert.match(html, /登录只会暂存在当前向导，完成绑定后才保存/);
  assert.match(html, /storage-profile-wizard-steps/);
  assert.match(html, /storage-profile-account-summary/);
  assert.match(html, /账号邮箱/);
  assert.match(html, /用户 ID/);
  assert.match(html, /会话有效期/);
  assert.match(html, /账号中的存储空间/);
  assert.match(html, /ui.settingsForm.supabaseSpaces/);
  assert.doesNotMatch(html, /添加并切换/);
  assert.match(html, /useSupabaseSpace/);
  assert.match(html, /loadSupabaseSpaces/);
  assert.match(html, /useSupabaseSpace/);
  assert.match(html, /v-if="ui.settingsForm.supabaseAccountStatus\?\.signedIn"/);
  assert.match(html, /id="test-storage-profile"/);
  assert.match(html, /testStorageProfileDraftConnection/);
  assert.match(html, /测试连接只使用弹框里的草稿/);
  assert.match(html, /cancelStorageProfileEditor/);
  assert.match(html, /保存此空间/);
  assert.match(html, /完成绑定/);
  assert.match(html, /storageImportBusy/);
  assert.match(html, /role="progressbar"/);
  assert.doesNotMatch(html, /WebDAV 刷新间隔（秒）/);
  assert.match(html, /WebDAV 仅手动刷新/);

  const legacyMain = readFileSync(new URL('../src-ui/src/legacy-main.js', import.meta.url), 'utf8');
  const styles = readFileSync(new URL('../src-ui/src/styles.css', import.meta.url), 'utf8');
  assert.match(styles, /\.endpoint-header-actions \.button,[\s\S]*white-space: nowrap/);
  assert.match(styles, /\.storage-profile-editor-grid input:focus/);
  assert.match(styles, /\.storage-profile-wizard-steps/);
  assert.match(styles, /\.storage-profile-confirm-card/);
  assert.match(styles, /\.supabase-space-list/);
  assert.match(styles, /\.supabase-space-item\.is-current/);
  assert.match(styles, /\.endpoint-card\.is-active/);
  assert.doesNotMatch(legacyMain, /refreshTimer = setInterval/);
  assert.match(legacyMain, /function openStorageProfileEditor/);
  assert.match(legacyMain, /function cancelStorageProfileEditor/);
  assert.match(legacyMain, /function saveStorageProfileDraft/);
  assert.match(legacyMain, /save_storage_profile/);
  assert.match(legacyMain, /remove_storage_profile/);
  assert.match(legacyMain, /input:\s*\{\s*profileId: profile\.id, force: true \}/);
  assert.match(legacyMain, /确认强制移除存储空间/);
  assert.doesNotMatch(html, /endpoint-remove-button"[^>]*:disabled/);
  assert.match(legacyMain, /storageProfileOriginalId/);
  assert.doesNotMatch(legacyMain, /async function saveStorageProfileDraft\(\)[\s\S]*?const updated = await saveSettings\(\{ silent: true \}\)/);
  assert.match(legacyMain, /function loadSupabaseProfileAccountStatus/);
  assert.match(legacyMain, /async function loadSupabaseSpaces/);
  assert.match(legacyMain, /async function useSupabaseSpace/);
  assert.match(legacyMain, /switch_supabase_space/);
  assert.match(legacyMain, /supabase_draft_sign_in/);
  assert.match(legacyMain, /complete_supabase_binding/);
  assert.match(legacyMain, /create_supabase_space/);
  assert.doesNotMatch(legacyMain, /add_supabase_space_profile/);
  assert.match(legacyMain, /storageProfileEditorMode: 'edit'/);
  assert.match(legacyMain, /存储空间已保存，现在可以登录 Supabase 账号/);
  assert.match(html, /v-else>[\s\S]*id="supabase-email"/);
  assert.match(legacyMain, /function testStorageProfileDraftConnection/);
  assert.match(legacyMain, /test_supabase_draft_connection/);
  assert.match(legacyMain, /listen\('supabase-realtime-synced'/);
  assert.match(legacyMain, /loadMessages\(\{ checkNew: true, scrollToBottom: false \}\)/);
  assert.match(legacyMain, /while \(supabaseRealtimeRefreshQueued && isActiveSupabaseEndpoint\(\)\)/);
  assert.match(legacyMain, /function showSyncConflictResolutionDialog/);
  assert.match(legacyMain, /全部使用云端/);
  assert.match(legacyMain, /全部保留本地/);
  assert.match(legacyMain, /resolve_all_sync_conflicts/);
  assert.match(legacyMain, /retry_all_pending_operations/);
  assert.match(legacyMain, /aiTabNamePrompt: ai.tab_name_prompt/);
  assert.ok(legacyMain.includes("tab_name_prompt: (currentSettingsFormState.aiTabNamePrompt"));
  assert.match(legacyMain, /是否立即重试全部待同步项目/);
  assert.doesNotMatch(legacyMain, /是否立即重试第一项/);
  assert.doesNotMatch(legacyMain, /window\.prompt\([\s\S]*输入 local 保留本机内容/);
}

testNormalizeTelegramPollInterval();
testGetTelegramBridgeFormState();
testTelegramBridgeProviderStates();
testNormalizeLocalHttpApiBindPort();
testGetLocalHttpApiConfiguredUrl();
testGetCurrentSenderName();
testSendSettingsPayload();
testNormalizeSaveFilenameRule();
await testSupabaseLoginCapturesCredentialsBeforeSavingProfile();
testNormalizeStorageImportProgress();
testManualBackupDialogState();
testStorageProfileDraftIsIndependentAndUpsertPreservesOthers();
testEndpointSwitchAndPreviewRegressionGuards();
testShortcutSettingsMarkup();

console.log('settings-form-runtime tests passed');
