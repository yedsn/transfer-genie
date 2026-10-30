import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import ts from 'typescript';

const html = fs.readFileSync(new URL('../src-ui/index.html', import.meta.url), 'utf8');
const main = fs.readFileSync(new URL('../src-ui/src/main.ts', import.meta.url), 'utf8');
const shell = fs.readFileSync(new URL('../src-ui/src/mobile/MobileShell.vue', import.meta.url), 'utf8');
const controller = fs.readFileSync(new URL('../src-ui/src/mobile/mobile-controller.ts', import.meta.url), 'utf8');
const tauriApi = fs.readFileSync(new URL('../src-ui/src/services/tauri-api.js', import.meta.url), 'utf8');
// Exercise the real helper rather than mocking the Tauri 2 URL conversion.
const apiWindow = { __TAURI__: { core: { convertFileSrc: path => 'asset:' + path } } };
vm.runInNewContext(tauriApi, { window: apiWindow });
assert.equal(apiWindow.transferGenieApi.path.convertFileSrc('/sandbox/preview.jpg'), 'asset:/sandbox/preview.jpg');
apiWindow.__TAURI__ = { path: { convertFileSrc: path => 'legacy:' + path } };
assert.equal(apiWindow.transferGenieApi.path.convertFileSrc('/preview.jpg'), 'legacy:/preview.jpg');
const styles = fs.readFileSync(new URL('../src-ui/src/mobile/mobile.css', import.meta.url), 'utf8');
const accessibilityNative = fs.readFileSync(new URL('../plugins/mobile-integration/ios/Sources/MobileAccessibility.swift', import.meta.url), 'utf8');
const pluginNative = fs.readFileSync(new URL('../plugins/mobile-integration/ios/Sources/ExamplePlugin.swift', import.meta.url), 'utf8');
assert.match(accessibilityNative, /UIFont.preferredFont/);
assert.match(accessibilityNative, /--mobile-text-scale/);
assert.match(pluginNative, /UIContentSizeCategory.didChangeNotification/);
assert.match(pluginNative, /reduceMotionStatusDidChangeNotification/);
assert.match(pluginNative, /atDocumentEnd/);
assert.ok(pluginNative.includes('pinchGestureRecognizer?.isEnabled = false'));
assert.match(main, /user-scalable=no/);
assert.match(styles, /touch-action: pan-x pan-y/);
assert.ok(styles.includes('font-size: calc(15px * var(--mobile-text-scale, 1))'));
assert.match(styles, /data-mobile-reduced-motion/);
assert.ok(shell.includes('window.visualViewport?.addEventListener("resize", updateViewport)'));
assert.ok(shell.includes('window.visualViewport?.removeEventListener("resize", updateViewport)'));
assert.ok(shell.includes('window.visualViewport?.removeEventListener("scroll", updateViewport)'));
assert.match(shell, /viewport.scale - 1/);
assert.match(styles, /--mobile-viewport-height/);
assert.match(styles, /.mobile-composer-sheet textarea { font-size: calc\(16px \* var\(--mobile-text-scale, 1\)\); }/);

assert.match(html, /id="mobile-app-shell"/);
assert.match(main, /nativeIosWebview/);
assert.match(main, /mobile-preview/);
assert.ok(main.includes('if (previewMobile || nativeIosWebview)'));
assert.ok(main.includes('document.getElementById("app-shell")?.remove()'));
assert.ok(main.includes('if (!document.documentElement.classList.contains("is-ios-platform"))'));
assert.match(styles, /html.is-ios-platform #app-shell { display: none !important; }/);
assert.ok(styles.includes('env(safe-area-inset-bottom)'));
assert.match(styles, /100dvh/);
assert.match(styles, /prefers-reduced-motion: reduce/);
assert.match(styles, /prefers-contrast: more/);
assert.match(styles, /.mobile-task-check { width: 44px; height: 44px; }/);
assert.match(styles, /.mobile-sheet header > button { width: 44px; height: 44px/);
assert.match(styles, /.mobile-space-switcher {[^}]*min-height: 44px/);
assert.match(styles, /.mobile-transfer-pill {[^}]*min-height: 44px/);
assert.match(styles, /focus-visible/);
assert.match(shell, /aria-label="Supabase 登录邮箱"/);
assert.match(shell, /aria-label="Supabase 登录密码"/);
assert.match(shell, /aria-label="主要导航"/);
for (const label of ['消息', '标记', '我的']) {
  assert.ok(shell.includes(`aria-label="${label}"`), `primary navigation keeps the stable accessible name ${label}`);
}
assert.match(shell, /aria-current/);
assert.match(shell, /handleGlobalKeydown/);
assert.match(shell, /trapSheetFocus/);
assert.ok(shell.match(/:inert="activeSheet !== null"/g)?.length >= 3);
assert.ok(shell.split(`:aria-hidden="activeSheet ? 'true' : undefined"`).length - 1 >= 3);
assert.match(shell, /sheetOpener/);
assert.ok(shell.includes('querySelector<HTMLElement>("[autofocus]")'));
assert.match(shell, /aria-label="消息内容"/);
assert.ok(shell.includes('v-if="state.composer.error" class="mobile-inline-error" role="alert"'));
assert.match(shell, /tabindex="-1"/);
assert.match(shell, /ref="feedScroller"/);
assert.match(shell, /@scroll.passive="handleFeedScroll"/);
assert.match(shell, /anchorOffset/);
assert.match(shell, /followLatest/);
assert.match(shell, /MobileMessageBody/);
assert.match(shell, /beforeMessageToggle/);
assert.match(shell, /compactSyncTitle/);
assert.ok(shell.includes('class="mobile-space-sync"'));
assert.equal(shell.includes('class="mobile-sync-ribbon"'), false, 'sync state must not occupy a separate feed panel');
assert.equal(shell.includes('state.notice'), false, 'operation feedback must not render as the feed banner');
assert.ok(shell.includes('class="mobile-toast"'), 'operation feedback is rendered at the shell root');
assert.ok(shell.includes(':class="`is-${state.toast.tone}`"'));
assert.ok(shell.indexOf('class="mobile-toast"') > shell.lastIndexOf('class="mobile-sheet'), 'toast stays above every sheet instead of inside the feed');
assert.match(styles, /.mobile-toast { position: absolute; z-index: 90;/);
assert.match(styles, /.mobile-star-icon.is-marked { color: #e5a51e; fill: #f7c84a;/);
assert.ok(shell.includes(`:class="{ 'is-marked': selectedMessage?.marked }"`));
assert.ok(shell.includes(`:class="{ 'is-marked': state.composer.marked }"`));
assert.equal(shell.includes('class="mobile-profile-status"'), false, 'sync state must not occupy a separate profile panel');
assert.equal(shell.includes('class="mobile-transfer-summary"'), false, 'sync state must not occupy a separate transfer panel');
assert.equal(shell.includes('class="mobile-inline-sync"'), false, 'sync state should appear only once in the top Space selector');
assert.ok(shell.includes("'is-self': isOwnMessage(message, state.settings?.sender_name)"));
assert.match(styles, /.mobile-message-card.is-self { align-items: flex-end; }/);
assert.match(styles, /--bubble-background: #dff5d5/);
assert.match(styles, /white-space: pre-wrap; overflow-wrap: anywhere/);
assert.ok(shell.indexOf('向上滚动查看更多') < shell.indexOf('class="mobile-message-list"'));

for (const label of ['消息', '标记', '我的', '新消息', '同步与传输', '选择存储空间']) {
  assert.ok(shell.includes(label), `mobile shell should include ${label}`);
}

for (const desktopOnlyLabel of ['WebDAV', 'Telegram Bridge', '本地 HTTP API', '全局快捷键', '开机启动']) {
  assert.equal(shell.includes(desktopOnlyLabel), false, `mobile shell must hide ${desktopOnlyLabel}`);
}

assert.match(shell, /不会自动创建 Space/);
assert.ok(shell.includes('@pointerdown="beginLongPress(message)"'));
assert.ok(shell.includes('startSelection(message)'));
assert.match(shell, /aria-label="消息批量操作"/);
assert.match(shell, /longPressTriggered/);
assert.ok(shell.includes("activeSheet === 'delete-confirm'"));
assert.ok(shell.includes('async function confirmDeletion()'));
assert.equal(shell.slice(shell.indexOf('async function applySelection'), shell.indexOf('async function sendDraft')).includes('window.confirm('), false, 'deletion must not depend on the iOS JS confirm return value');
assert.doesNotMatch(shell, /demo@example.com|UI-only 原型|操作不会写入 Supabase|toggleOfflinePreview/);
assert.match(shell, /state.composer.attachments/);
assert.match(shell, /已保存到本机/);
assert.match(shell, /仅移除本地附件缓存/);
assert.match(shell, /删除消息（同步到云端）/);
assert.ok(shell.includes('state.messages.find((item) => item.filename === message.filename)'));
assert.match(shell, /attachmentState: "idle"/);

for (const command of [
  'listWindow', 'mark', 'unmark', 'getMediaPreview', 'completeMediaPreview',
  'listSupabaseSpaces', 'switchSupabaseSpace', 'refreshSupabaseSession', 'refresh',
  'list_sync_conflicts', 'resolve_sync_conflict', 'retry_pending_operation'
]) {
  assert.ok(tauriApi.includes(command), `Tauri API should expose ${command}`);
}
assert.ok(tauriApi.includes('get_mobile_composer_draft'));
assert.ok(tauriApi.includes('save_mobile_composer_draft'));
assert.match(shell, /transfer-genie-mobile-backgrounding/);
assert.match(shell, /已恢复上次未发送的草稿/);
assert.match(shell, /草稿已自动保存/);

assert.ok(controller.includes('listWindow({ limit: 50 })'));
assert.match(controller, /mobileIntegration.selectMedia/);
assert.match(controller, /mobileIntegration.selectDocuments/);
assert.match(controller, /message.sendText/);
assert.match(controller, /message.sendFile/);
assert.match(controller, /void Promise.allSettled([refreshMessages(), refreshMarked(), refreshStatus(), refreshTransfers()])/);
assert.match(controller, /clientId: `mobile-\$\{crypto\.randomUUID\(\)\}`/);
assert.match(controller, /clientId: attachment\.clientId/);
assert.doesNotMatch(controller, /sendFile\(\{ path: attachment\.path, clientId: `mobile-\$\{crypto\.randomUUID/);
assert.match(controller, /generateImageThumbnail\(attachment\.path\)/);
assert.match(controller, /generateVideoPoster\(requestId, attachment\.path\)/);
assert.match(controller, /cancelVideoPoster\(attachment\.previewRequestId\)/);
assert.match(shell, /正在生成预览/);
assert.match(shell, /预览失败/);
assert.match(controller, /message.downloadMessageFile/);
assert.match(controller, /listSupabaseDraftSpaces/);
assert.ok(controller.includes('if (previewMode)'));
assert.match(controller, /pending_count/);

// Exercise the real controller with a local API harness, not only source contracts.
const runtimeApi = {
  settings: {
    getSettings: async () => ({ active_storage_profile_id: 'supabase-1', storage_profiles: [{ id: 'supabase-1', provider_kind: 'supabase', supabase: { space_id: 'space-a' } }] }),
    supabaseCurrentUser: async () => ({ signedIn: true, userId: 'user-a' }),
    listSupabaseSpaces: async () => [{ id: 'space-a', name: 'A' }],
    activateStorageProfile: async () => ({}),
  },
  sync: {
    getSyncStatus: async () => ({ pending_count: 1 }),
    listPendingOperations: async () => [{ operationId: 'stable-attachment', entityType: 'attachment', entityId: 'stable-attachment', action: 'upsert', originalName: 'large.bin', size: 4096, state: 'pending' }],
    listConflicts: async () => [],
    resolveConflict: async () => ({}),
    retryPendingOperation: async () => ({}),
  },
  transfer: { listDownloadHistory: async () => ({ records: [{ filename: 'download', original_name: 'download.bin', file_size: 1024, received: 1024, status: 'paused', error: '传输已暂停' }] }) },
  message: { listWindow: async () => ({ messages: [] }) },
  marked: { getMarkedMessages: async () => ({ messages: [] }), listMarkedTags: async () => [], createMarkedTag: async (name) => ({ id: 'new-tag', name }) },
  mobileCache: {
    getSummary: async () => ({ reclaimableBytes: 2048, fileCount: 2, protectedTasks: 1, removedBytes: 0, removedFiles: 0 }),
    clear: async () => ({ reclaimableBytes: 0, fileCount: 0, protectedTasks: 1, removedBytes: 2048, removedFiles: 2 }),
  },
  mobileDraft: {
    get: async () => ({ text: '', format: 'text', marked: false, tagIds: [], dueDate: null, attachments: [], updatedAtMs: null }),
    save: async (payload) => ({ ...payload, updatedAtMs: Date.now() }),
  },
  app: { getAppVersion: async () => 'test' },
};
const runtimeModule = { exports: {} };
const runtimeClipboard = { writeText: async () => {} };
vm.runInNewContext(ts.transpileModule(controller, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
  module: runtimeModule, exports: runtimeModule.exports, require: createRequire(import.meta.url),
  window: { location: { search: '' }, transferGenieApi: runtimeApi, setTimeout, clearTimeout }, URLSearchParams, crypto: globalThis.crypto,
  navigator: { clipboard: runtimeClipboard },
});
const runtime = runtimeModule.exports.useMobileController();
const ownMessage = runtimeModule.exports.isOwnMessage;
assert.equal(ownMessage({ sender: 'Jam' }, ' Jam '), true);
assert.equal(ownMessage({ sender: 'Mac' }, 'Jam'), false, 'another device on the same account belongs on the left');
assert.equal(ownMessage({ sender: '我' }, ''), true);
assert.equal(ownMessage({ sender: '' }, ''), false, 'missing sender identity must not classify every message as own');
await runtime.initialize();
assert.equal(runtime.state.boot, 'ready');
assert.equal(runtime.state.transfers.length, 2);
const upload = runtime.state.transfers.find((item) => item.id === 'upload-stable-attachment');
assert.equal(upload.state, 'pending');
assert.equal(upload.progress, 0);
const paused = runtime.state.transfers.find((item) => item.id === 'download-download');
assert.equal(paused.state, 'paused');
assert.equal(paused.progress, 99, 'received bytes alone must not display completed');
assert.ok(runtime.activeTransfers.value.some((item) => item.state === 'paused'));
upload.state = 'failed';
let retriedOperation = '';
runtimeApi.sync.retryPendingOperation = async (operationId) => { retriedOperation = operationId; };
runtimeApi.sync.listPendingOperations = async () => [];
runtimeApi.transfer.listDownloadHistory = async () => ({ records: [] });
assert.equal(await runtime.retryTransfer(upload), true);
assert.equal(retriedOperation, 'stable-attachment');
assert.match(runtime.state.toast.message, /重新提交/);
runtimeApi.transfer.listDownloadHistory = async () => ({ records: [{ filename: 'download', file_size: 1024, status: 'complete' }] });
await runtime.refreshAfterForeground();
assert.equal(runtime.state.transfers.length, 1);
assert.equal(runtime.state.transfers[0].progress, 100);
assert.equal(runtime.activeTransfers.value.length, 0);
runtimeApi.transfer.listDownloadHistory = async () => ({ records: [{ filename: 'removed', status: 'cache_removed' }] });
await runtime.refreshAfterForeground();
assert.equal(runtime.state.transfers.length, 0, 'cleared cache history must not appear as an active transfer');
assert.equal(runtime.state.cache.fileCount, 2);
assert.equal(await runtime.clearCache(), true);
assert.equal(runtime.state.cache.fileCount, 0);
assert.match(runtime.state.toast.message, /已释放/);

// Binding an already configured destination must activate the returned existing profile ID.
const existingProfile = {
  id: 'supabase-existing', name: 'Existing', provider_kind: 'supabase', enabled: true,
  supabase: { api_url: 'https://supabase.example/', anon_key: 'public-key', space_id: 'space-existing' },
};
let savedActiveProfileId = '';
let bindingInput = null;
runtimeApi.settings.completeSupabaseBinding = async (input) => {
  bindingInput = input;
  return { active_storage_profile_id: null, storage_profiles: [existingProfile] };
};
runtimeApi.settings.activateStorageProfile = async (profileId) => { savedActiveProfileId = profileId; return { active_storage_profile_id: profileId, storage_profiles: [existingProfile] }; };
runtimeApi.settings.getSettings = async () => ({ active_storage_profile_id: 'supabase-existing', storage_profiles: [existingProfile] });
runtimeApi.settings.supabaseCurrentUser = async () => ({ signedIn: true, userId: 'user-a' });
runtimeApi.settings.listSupabaseSpaces = async () => [{ id: 'space-existing', name: 'Existing', current: true }];
runtimeApi.sync.getSyncStatus = async () => ({ pending_count: 0 });
runtimeApi.transfer.listDownloadHistory = async () => ({ records: [] });
runtime.state.connectionWizard.flowId = 'binding-flow';
runtime.state.connectionWizard.apiUrl = 'https://supabase.example';
runtime.state.connectionWizard.anonKey = 'public-key';
runtime.state.connectionWizard.profileName = 'Retry';
await runtime.completeSetup({ id: 'space-existing', name: 'Existing' });
assert.equal(bindingInput.originalProfileId, null);
assert.notEqual(bindingInput.profile.id, existingProfile.id, 'the draft may use a temporary ID');
assert.equal(savedActiveProfileId, existingProfile.id, 'the saved existing profile must become active');
assert.equal(runtime.state.boot, 'ready');

assert.match(shell, /controller.retryPreview/);
assert.match(shell, /controller.previewImageFailed/);
assert.match(shell, /aria-label="播放视频"/);
assert.match(shell, /payload.deleted_at != null || payload.deletedAt != null/);
assert.ok(shell.includes('attachmentStatus(selectedMessage)'));
assert.match(styles, /mobile-detail-actions button:disabled/);

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
};
const settle = async () => { for (let step = 0; step < 8; step += 1) await Promise.resolve(); };

// Sender edits use fresh settings, keep drafts/history, validate and serialize writes.
const latestSettings = { active_storage_profile_id: 'supabase-existing', sender_name: 'Old', storage_profiles: [existingProfile, { id: 'desktop', provider_kind: 'webdav' }], send_hotkey: 'Ctrl+Enter', telegram: { enabled: true } };
runtimeApi.settings.getSettings = async () => latestSettings;
const oldWindow = runtime.state.messages;
runtime.state.composer.text = 'unsent draft';
let senderWrites = 0;
let senderSaved;
const senderWrite = deferred();
runtimeApi.settings.saveSettings = async (settings) => { senderWrites += 1; senderSaved = settings; return senderWrite.promise; };
assert.equal(await runtime.saveSenderName('   '), false);
assert.match(runtime.state.sender.error, /请输入/);
const changingSender = runtime.saveSenderName('  iPhone  ');
await settle();
assert.equal(runtime.state.sender.saving, true);
assert.equal(await runtime.saveSenderName('Another'), false);
assert.equal(senderWrites, 1);
assert.equal(senderSaved.sender_name, 'iPhone');
assert.deepEqual(senderSaved.storage_profiles, latestSettings.storage_profiles);
assert.equal(senderSaved.send_hotkey, latestSettings.send_hotkey);
assert.deepEqual(senderSaved.telegram, latestSettings.telegram);
senderWrite.resolve(senderSaved);
assert.equal(await changingSender, true);
assert.equal(runtime.state.settings.sender_name, 'iPhone');
assert.equal(runtime.state.composer.text, 'unsent draft');
assert.equal(runtime.state.messages, oldWindow);
assert.equal(runtime.state.sender.saving, false);
runtimeApi.settings.saveSettings = async () => { throw new Error('settings write failed'); };
assert.equal(await runtime.saveSenderName('New name'), false);
assert.match(runtime.state.sender.error, /settings write failed/);
assert.equal(runtime.state.settings.sender_name, 'iPhone');
runtime.state.composer.text = '';

const imageRaw = { filename: 'photo', original_name: 'photo.jpg', kind: 'file', download_exists: true };
// Selection mutations use existing APIs, keep metadata and retain only failed rows for retry.
const batchRows = [
  { filename: 'batch-a', marked: false, tagIds: ['keep-tag'], dueDate: '2026-11-01' },
  { filename: 'batch-b', marked: false, tagIds: [], dueDate: null },
];
// Single actions serialize writes and do not report stale or unconfirmed success.
let singleMarkCalls = [];
const singleMark = deferred();
runtimeApi.message.mark = async (...args) => { singleMarkCalls.push(args); return singleMark.promise; };
const markingSingle = runtime.toggleMark(batchRows[0]);
assert.equal(runtime.state.busy, true);
assert.equal(await runtime.toggleMark(batchRows[0]), false);
assert.deepEqual(singleMarkCalls, [['batch-a', ['keep-tag'], '2026-11-01']]);
singleMark.resolve();
assert.equal(await markingSingle, true);
assert.equal(runtime.state.busy, false);
assert.equal(runtime.state.toast.message, '已标记');
assert.equal(runtime.state.toast.tone, 'success');
runtimeApi.message.unmark = async () => {};
assert.equal(await runtime.toggleMark({ ...batchRows[0], marked: true }), true);
assert.equal(runtime.state.toast.message, '已取消标记');
runtimeApi.message.unmark = async () => { throw new Error('mark failed'); };
assert.equal(await runtime.toggleMark({ ...batchRows[0], marked: true }), false);
assert.match(runtime.state.error, /mark failed/);
assert.equal(runtime.state.toast.tone, 'error');
const singleDelete = deferred();
let singleDeleteCalls = 0;
runtimeApi.message.deleteMessages = async (filenames, remote) => {
  singleDeleteCalls += 1;
  assert.deepEqual(Array.from(filenames), ['batch-a']);
  assert.equal(remote, true);
  return singleDelete.promise;
};
const deletingSingle = runtime.deleteMessage(batchRows[0], true);
assert.equal(await runtime.deleteMessage(batchRows[0], true), false);
assert.equal(singleDeleteCalls, 1);
singleDelete.resolve({ deleted: 1, failed: [] });
assert.equal(await deletingSingle, true);
assert.match(runtime.state.toast.message, /等待同步/);
runtimeApi.message.deleteMessages = async () => ({ deleted: 0, failed: [] });
assert.equal(await runtime.deleteMessage(batchRows[0], true), false);
assert.match(runtime.state.error, /尚未确认/);
runtimeApi.message.deleteMessages = async () => ({ deleted: 0, failed: ['batch-a'] });
assert.equal(await runtime.deleteMessage(batchRows[0], false), false);
assert.equal(runtime.state.toast.tone, 'error');
assert.match(runtime.state.toast.message, /batch-a/);
const staleSingleMark = deferred();
runtimeApi.message.mark = async () => staleSingleMark.promise;
const staleMarking = runtime.toggleMark(batchRows[0]);
await runtime.initialize();
const nextSingleMark = deferred();
runtimeApi.message.mark = async () => nextSingleMark.promise;
const nextMarking = runtime.toggleMark(batchRows[1]);
assert.equal(runtime.state.busy, true);
staleSingleMark.reject(new Error('old-account failure'));
assert.equal(await staleMarking, false);
assert.equal(runtime.state.error, '');
assert.equal(runtime.state.busy, true, 'stale finally must not unlock a newer action');
nextSingleMark.resolve();
assert.equal(await nextMarking, true);
const staleDelete = deferred();
runtimeApi.message.deleteMessages = async () => staleDelete.promise;
const staleDeleting = runtime.deleteMessage(batchRows[0], true);
await runtime.initialize();
staleDelete.resolve({ deleted: 1, failed: [] });
assert.equal(await staleDeleting, false);
assert.equal(runtime.state.toast.visible, false);
runtime.state.busy = true;
let accountWrites = 0;
runtimeApi.settings.supabaseLogout = runtimeApi.settings.switchSupabaseSpace = async () => { accountWrites += 1; };
await runtime.logout();
await runtime.switchSpace({ id: 'another-space' });
assert.equal(accountWrites, 0, 'account transitions must wait for message actions');
runtime.state.busy = false;
const copying = deferred();
let clipboardWrites = [];
runtimeClipboard.writeText = async (value) => { clipboardWrites.push(value); return copying.promise; };
const copyingSingle = runtime.copyMessage({ ...batchRows[0], body: 'fixture text', title: 'fallback' });
assert.equal(await runtime.copyMessage({ ...batchRows[0], body: 'duplicate' }), false);
assert.deepEqual(clipboardWrites, ['fixture text']);
copying.resolve();
assert.equal(await copyingSingle, true);
assert.equal(runtime.state.toast.message, '已复制到剪贴板');
assert.equal(runtime.state.toast.tone, 'success');
assert.equal(runtime.state.toast.visible, true);
runtimeClipboard.writeText = async () => { throw new Error('clipboard unavailable'); };
assert.equal(await runtime.copyMessage({ ...batchRows[0], title: 'fixture filename' }), false);
assert.match(runtime.state.error, /clipboard unavailable/);
const staleClipboard = deferred();
runtimeClipboard.writeText = async () => staleClipboard.promise;
const staleCopying = runtime.copyMessage({ ...batchRows[0], title: 'fixture filename' });
await runtime.initialize();
staleClipboard.resolve();
assert.equal(await staleCopying, false);
assert.equal(runtime.state.toast.visible, false);
const batchMarks = [];
runtimeApi.message.mark = async (...args) => { batchMarks.push(args); if (args[0] === 'batch-b') throw new Error('offline'); };
let batchResult = await runtime.applyMessageSelection([...batchRows, batchRows[0]], 'mark');
assert.deepEqual(batchMarks, [['batch-a', ['keep-tag'], '2026-11-01'], ['batch-b', [], null]]);
assert.deepEqual(Array.from(batchResult.succeeded), ['batch-a']);
assert.deepEqual(Array.from(batchResult.failed), ['batch-b']);
assert.match(runtime.state.error, /已保留选择/);
const bulkDeletion = deferred();
let deletionCalls = 0;
runtimeApi.message.deleteMessages = async (filenames, remote) => { deletionCalls += 1; assert.deepEqual(Array.from(filenames), ['batch-a', 'batch-b']); assert.equal(remote, true); return bulkDeletion.promise; };
const deletingBatch = runtime.applyMessageSelection(batchRows, 'delete');
assert.equal(await runtime.applyMessageSelection(batchRows, 'delete'), null);
assert.equal(deletionCalls, 1, 'duplicate batch taps must not submit twice');
bulkDeletion.resolve({ deleted: 1, failed: ['batch-b'] });
batchResult = await deletingBatch;
assert.deepEqual(Array.from(batchResult.succeeded), ['batch-a']);
assert.deepEqual(Array.from(batchResult.failed), ['batch-b']);
assert.equal(runtime.state.busy, false);
let unmarks = [];
runtimeApi.message.unmark = async (filename) => { unmarks.push(filename); };
batchResult = await runtime.applyMessageSelection([{ ...batchRows[0], marked: true }, batchRows[1]], 'unmark');
assert.deepEqual(unmarks, ['batch-a']);
assert.equal(batchResult.failed.length, 0);
const interruptedMark = deferred();
let interruptedCalls = 0;
runtimeApi.message.mark = async () => { interruptedCalls += 1; return interruptedMark.promise; };
const interruptedBatch = runtime.applyMessageSelection(batchRows, 'mark');
await runtime.initialize();
interruptedMark.resolve();
assert.equal(await interruptedBatch, null);
assert.equal(interruptedCalls, 1, 'a changed account generation must stop before mutating the next row');
runtime.state.error = '';
runtime.dismissToast();
runtimeApi.path = { convertFileSrc: (path) => `asset:${path}` };
runtimeApi.message.listWindow = async () => ({ messages: [imageRaw] });
let passive = deferred();
let originalDownloads = 0;
runtimeApi.message.getMediaPreview = async () => passive.promise;
runtimeApi.message.downloadMessageFile = async () => { originalDownloads += 1; return { path: '/sandbox/photo.jpg' }; };
await runtime.refreshMessages();
const photo = runtime.state.messages[0];
assert.equal(photo.previewState, 'loading');
assert.equal(photo.cached, true);
assert.equal(originalDownloads, 0, 'list previews must not request originals');
passive.resolve({ state: 'offline', error: 'network unavailable' });
await settle();
assert.equal(photo.previewState, 'offline');
assert.match(runtimeModule.exports.previewStatus(photo), /联网后重试/);
assert.match(runtimeModule.exports.attachmentStatus(photo), /离线打开/);
runtimeApi.message.getMediaPreview = async () => ({ state: 'ready', path: '/sandbox/preview.jpg' });
await runtime.retryPreview(photo);
assert.equal(photo.previewState, 'ready');
assert.equal(photo.previewUrl, 'asset:/sandbox/preview.jpg');
runtime.previewImageFailed(photo);
assert.equal(photo.previewState, 'failed');
assert.equal(photo.previewUrl, undefined);
runtimeApi.message.getMediaPreview = async () => ({ state: 'failed', error: '预览尚未生成' });
await runtime.retryPreview(photo);
assert.equal(photo.previewState, 'missing');
assert.equal(originalDownloads, 0, 'retry thumbnail must not download a historical original');

const clip = { ...photo, kind: 'video', filename: 'clip.mp4', originalName: 'clip.mp4' };
runtimeApi.message.completeMediaPreview = async () => ({ state: 'ready', path: '/sandbox/poster.jpg' });
runtimeApi.message.downloadMessageFile = async () => ({ path: '/sandbox/clip.mp4' });
assert.equal(await runtime.prepareVideo(clip), 'asset:/sandbox/clip.mp4');
await settle();
assert.equal(clip.previewUrl, 'asset:/sandbox/poster.jpg');
assert.equal(clip.attachmentState, 'cached');
const staleVideoDownload = deferred();
runtimeApi.message.downloadMessageFile = async () => staleVideoDownload.promise;
const staleVideo = runtime.prepareVideo(clip);
await runtime.initialize();
staleVideoDownload.resolve({ path: '/other-account.mp4' });
assert.equal(await staleVideo, null, 'account switch must invalidate an in-flight video URL');
runtime.state.busy = false;

let nativePreviewCalls = 0;
let nativeShareCalls = 0;
runtimeApi.mobileIntegration = {
  previewFile: async () => { nativePreviewCalls += 1; return { presented: true, supported: true }; },
  shareFile: async () => { nativeShareCalls += 1; throw { code: 'CANCELLED', message: 'The user cancelled the operation.' }; },
};
runtimeApi.message.completeMediaPreview = async () => { throw new Error('poster generation failed'); };
const download = deferred();
runtimeApi.message.downloadMessageFile = async () => { originalDownloads += 1; return download.promise; };
const openPhoto = runtime.previewMessage(photo);
assert.equal(photo.attachmentState, 'downloading');
assert.equal(runtime.state.busy, true);
await runtime.previewMessage(photo);
assert.equal(originalDownloads, 1, 'duplicate tap must not start another download');
download.resolve({ path: '/sandbox/photo.jpg' });
await openPhoto;
assert.equal(nativePreviewCalls, 1, 'thumbnail failure must not prevent opening the original');
assert.equal(photo.attachmentState, 'cached');
assert.equal(photo.previewState, 'failed');
assert.equal(runtime.state.error, '');

runtimeApi.message.downloadMessageFile = async () => ({ path: '/sandbox/photo.jpg' });
runtimeApi.mobileIntegration.previewFile = async () => { nativePreviewCalls += 1; return { presented: false, supported: false }; };
await runtime.previewMessage(photo);
assert.equal(photo.attachmentState, 'unsupported');
assert.match(runtimeModule.exports.attachmentStatus(photo), /分享导出/);
await runtime.shareMessage(photo);
assert.equal(nativeShareCalls, 1);
assert.equal(photo.attachmentState, 'cached');
assert.equal(runtime.state.error, '', 'cancelling system sharing is not a transfer error');

runtimeApi.message.downloadMessageFile = async () => { throw new Error('传输已暂停，回到前台后重试'); };
await runtime.shareMessage(photo);
assert.equal(photo.attachmentState, 'paused');
assert.equal(runtime.state.busy, false);

// Conflict resolution re-reads authoritative rows and status without rendering raw payload JSON.
const conflict = { id: 7, entityType: 'message', entityId: 'message-7', localPayload: { content: 'local copy' }, remotePayload: { content: 'remote copy' }, localRevision: 2, remoteRevision: 3 };
runtimeApi.sync.listConflicts = async () => [conflict];
let conflictResolution;
runtimeApi.sync.resolveConflict = async (id, resolution) => { conflictResolution = { id, resolution }; };
await runtime.loadConflicts();
assert.equal(runtime.state.conflicts.length, 1);
runtimeApi.sync.listConflicts = async () => [];
assert.equal(await runtime.resolveConflict(conflict, 'remote'), true);
assert.deepEqual(conflictResolution, { id: 7, resolution: 'remote' });
assert.equal(runtime.state.conflicts.length, 0);
assert.match(runtime.state.toast.message, /采用云端版本/);
assert.equal(nativeShareCalls, 1, 'paused download must never present sharing');

runtimeApi.message.listWindow = async () => ({ messages: [{ filename: 'audio', original_name: 'voice.m4a', kind: 'file' }] });
await runtime.refreshMessages();
assert.equal(runtime.state.messages[0].kind, 'audio');

// A late original response after logout must not cross the native presentation boundary.
const staleDownload = deferred();
const previewCallsBeforeLogout = nativePreviewCalls;
runtimeApi.message.downloadMessageFile = async () => staleDownload.promise;
const staleOpen = runtime.previewMessage(runtime.state.messages[0]);
runtimeApi.settings.supabaseCurrentUser = async () => ({ signedIn: false });
await runtime.initialize();
assert.equal(runtime.state.boot, 'signed-out');
assert.equal(runtime.state.messages.length, 0);
staleDownload.resolve({ path: '/sandbox/private-old-account.m4a' });
await staleOpen;
assert.equal(nativePreviewCalls, previewCallsBeforeLogout);
assert.equal(runtime.state.error, '', 'late old-account errors must not replace the new login view');

const staleMessages = deferred();
const staleOperations = deferred();
runtimeApi.message.listWindow = async () => staleMessages.promise;
runtimeApi.sync.listPendingOperations = async () => staleOperations.promise;
runtime.state.boot = 'ready';
const staleRefresh = Promise.all([runtime.refreshMessages(), runtime.refreshRuntimeState()]);
await runtime.initialize();
staleMessages.resolve({ messages: [imageRaw] });
staleOperations.resolve([{ entityType: 'attachment', action: 'upsert', entityId: 'old-private-file' }]);
await staleRefresh;
assert.equal(runtime.state.messages.length, 0, 'late list response cannot restore private files after logout');
assert.equal(runtime.state.transfers.length, 0);

const listeners = new Map();
runtimeApi.event = { listen: async (name, callback) => { listeners.set(name, callback); return () => listeners.delete(name); } };
const removeListeners = await runtime.installTransferListeners();
await listeners.get('download-progress')({ payload: { filename: 'old-private-file', status: 'complete' } });
assert.equal(runtime.state.transfers.length, 0, 'progress events after logout must not expose old files');
runtime.state.boot = 'ready';
runtimeApi.sync.listPendingOperations = async () => [];
runtimeApi.transfer.listDownloadHistory = async () => ({ records: [] });
await listeners.get('download-progress')({ payload: { filename: 'other-account-file', received: 1024, total: 1024, status: 'complete' } });
assert.equal(runtime.state.transfers.length, 0, 'unscoped event payload must not become authoritative transfer state');
const realtimePage = deferred();
let realtimeReads = 0;
runtimeApi.message.listWindow = async () => {
  realtimeReads += 1;
  if (realtimeReads === 1) return realtimePage.promise;
  return { messages: [{ filename: 'remote-new', kind: 'text', sender: 'Mac', content: 'remote update', timestamp_ms: 20 }] };
};
runtimeApi.marked.getMarkedMessages = async () => ({ messages: [] });

runtimeApi.marked.listMarkedTags = async () => [];
const realtimeCallback = listeners.get('supabase-realtime-synced');
assert.equal(typeof realtimeCallback, 'function', 'the mobile shell must observe authoritative Realtime convergence');
const realtimeRefresh = realtimeCallback();
await settle();
await realtimeCallback();
realtimePage.resolve({ messages: [{ filename: 'remote-old', kind: 'text', content: 'old snapshot', timestamp_ms: 10 }] });
await realtimeRefresh;
assert.equal(realtimeReads, 2, 'a Realtime hint received during refresh must queue another local read');
assert.equal(runtime.state.messages[0].filename, 'remote-new');
removeListeners();
assert.equal(listeners.size, 0);
await realtimeCallback();
assert.equal(realtimeReads, 2, 'disposed listeners must not restart feed reads');

// The feed stays oldest-to-newest, pages upward, and keeps loaded history on refresh.
const feed = runtimeModule.exports.useMobileController();
const rawText = (filename, timestamp) => ({ filename, kind: 'text', timestamp_ms: timestamp, content: filename });
let latest = [rawText('b', 20), rawText('c', 30)];
const windowCalls = [];
runtimeApi.message.listWindow = async (input) => {
  windowCalls.push(input);
  if (input.beforeFilename === 'b') return { messages: [rawText('a', 10)], hasMoreBefore: false };
  return { messages: latest, hasMoreBefore: true };
};
await feed.refreshMessages();
assert.deepEqual(Array.from(feed.state.messages, (item) => item.filename), ['b', 'c']);
await Promise.all([feed.loadOlderMessages(), feed.loadOlderMessages()]);
assert.equal(windowCalls.filter((input) => input.beforeFilename).length, 1, 'concurrent upward loads must not duplicate requests');
assert.deepEqual(Array.from(feed.state.messages, (item) => item.filename), ['a', 'b', 'c']);
assert.equal(feed.state.loadingOlder, false);
assert.equal(feed.state.hasMoreBefore, false);
latest = [rawText('b', 20), rawText('c', 30), rawText('d', 40)];
await feed.refreshMessages();
assert.deepEqual(Array.from(feed.state.messages, (item) => item.filename), ['a', 'b', 'c', 'd'], 'new messages append without dropping loaded history');
latest = [rawText('b', 20), rawText('d', 40)];
await feed.refreshMessages();
assert.deepEqual(Array.from(feed.state.messages, (item) => item.filename), ['a', 'b', 'd'], 'refresh removes authoritative deletions in the loaded range');
runtimeApi.message.listWindow = async () => { throw new Error('offline history'); };
feed.state.hasMoreBefore = true;
await feed.loadOlderMessages();
assert.equal(feed.state.loadingOlder, false);
assert.match(feed.state.error, /offline history/);
assert.deepEqual(Array.from(feed.state.messages, (item) => item.filename), ['a', 'b', 'd']);

// Search uses the account-scoped index, not only the visible 50-message window.
const searchController = runtimeModule.exports.useMobileController();
const searchRows = Array.from({ length: 125 }, (_, i) => rawText(`search-${i}`, i));
const searchCalls = [];
runtimeApi.message.searchMessages = async (input) => {
  searchCalls.push(input);
  return { messages: searchRows.slice(input.offset, input.offset + input.limit), total: 1000, has_more: true };
};
await searchController.searchMessages('  older match  ');
assert.equal(searchCalls[0].searchQuery, 'older match');
assert.equal(searchController.state.search.messages.length, 50);
assert.equal(searchController.state.search.hasMore, true);
await Promise.all([searchController.loadMoreSearch(), searchController.loadMoreSearch()]);
assert.equal(searchCalls.length, 2, 'duplicate search pagination is gated');
assert.equal(searchCalls[1].offset, 50, 'lookahead row is not skipped');
await searchController.loadMoreSearch();
assert.equal(searchController.state.search.messages.length, 125);
assert.equal(searchController.state.search.hasMore, false, 'unfiltered backend total must not imply more matches');
const lateSearch = deferred();
runtimeApi.message.searchMessages = async (input) => input.searchQuery === 'old' ? lateSearch.promise : ({ messages: [rawText('new-result', 1)] });
const oldSearch = searchController.searchMessages('old');
await searchController.searchMessages('new');
lateSearch.resolve({ messages: [rawText('old-result', 2)] });
await oldSearch;
assert.deepEqual(Array.from(searchController.state.search.messages, (item) => item.filename), ['new-result'], 'late query results are ignored');
runtimeApi.message.searchMessages = async () => { throw new Error('search failure'); };
await searchController.loadMoreSearch();
assert.match(searchController.state.search.error, /search failure/);
assert.equal(searchController.state.search.loading, false);
assert.equal(searchController.state.search.messages.length, 1, 'failed page preserves readable results');
await searchController.searchMessages('');
assert.equal(searchController.state.search.messages.length, 0);

// Marked filters query the backend before paging, so matching row 101 is reachable.
const markedController = runtimeModule.exports.useMobileController();
const markedRows = searchRows.map((row, i) => ({ ...row, marked: true, marked_tag_ids: [i > 100 ? 'rare' : 'common'] }));
const markedCalls = [];
runtimeApi.marked.getMarkedMessages = async (input) => {
  markedCalls.push(input);
  const matches = markedRows.filter((row) => !input.tagId || row.marked_tag_ids.includes(input.tagId));
  return { messages: matches.slice(input.offset, input.offset + input.limit), total: matches.length, has_more: input.offset + input.limit < matches.length };
};
await markedController.setMarkedFilter(false, '');
assert.equal(markedController.state.markedView.messages.length, 100);
await Promise.all([markedController.loadMoreMarked(), markedController.loadMoreMarked()]);
assert.equal(markedCalls.length, 2);
assert.equal(markedController.state.markedView.messages.length, 125);
assert.equal(markedController.state.markedView.hasMore, false);
markedController.state.boot = 'ready';
runtimeApi.message.listWindow = async () => ({ messages: [] });
await markedController.refreshAfterForeground();
assert.equal(markedController.state.markedTotal, 125, 'badge uses authoritative total, not the 100 loaded summary rows');
assert.equal(markedController.state.markedView.messages.length, 125, 'refresh retains the loaded marked range');
await markedController.setMarkedFilter(true, 'rare');
assert.equal(markedController.state.markedView.messages.length, 24);
assert.equal(markedCalls.at(-1).pendingOnly, true);
assert.equal(markedCalls.at(-1).tagId, 'rare');
const lateMarked = deferred();
runtimeApi.marked.getMarkedMessages = async (input) => input.tagId === 'old' ? lateMarked.promise : ({ messages: [markedRows[0]] });
const oldMarked = markedController.setMarkedFilter(false, 'old');
await markedController.setMarkedFilter(true, 'new');
lateMarked.resolve({ messages: [markedRows[1]] });
await oldMarked;
assert.equal(markedController.state.markedView.messages[0].filename, markedRows[0].filename);
runtimeApi.marked.getMarkedMessages = async () => { throw new Error('marked unavailable'); };
await markedController.setMarkedFilter(false, '');
assert.equal(markedController.state.markedView.loading, false);
assert.match(markedController.state.markedView.error, /marked unavailable/);
runtimeApi.marked.getMarkedMessages = async () => ({ messages: [] });

// A reset/logout also invalidates pending query responses and their loading flags.
const accountSearch = deferred();
runtimeApi.message.searchMessages = async () => accountSearch.promise;
const pendingSearch = searchController.searchMessages('private');
runtimeApi.message.listWindow = async () => ({ messages: [] });
await searchController.initialize();
accountSearch.resolve({ messages: [rawText('previous-account', 1)] });
await pendingSearch;
assert.equal(searchController.state.search.messages.length, 0);
assert.equal(searchController.state.search.loading, false);
const accountMarked = deferred();
runtimeApi.marked.getMarkedMessages = async (input) => input.tagId === 'private' ? accountMarked.promise : ({ messages: [] });
const pendingMarked = markedController.setMarkedFilter(true, 'private');
await markedController.initialize();
accountMarked.resolve({ messages: [markedRows[0]] });
await pendingMarked;
assert.equal(markedController.state.markedView.messages.length, 0);
assert.equal(markedController.state.markedView.loading, false);

// Draft previews use the sandbox original, never download/send implicitly.
runtimeApi.message.listWindow = async () => ({ messages: [] });
runtimeApi.settings.supabaseCurrentUser = async () => ({ signedIn: true, userId: 'user-a' });
await runtime.initialize();
const draftFile = { id: 'draft-a', clientId: 'stable-draft-a', path: '/sandbox/report.pdf', originalName: 'report.pdf', mediaType: 'file', sizeBytes: 100, previewState: 'unsupported' };
runtime.state.composer.attachments = [draftFile];
runtimeApi.mobileIntegration.previewFile = async (path) => { assert.equal(path, draftFile.path); return { supported: false }; };
await runtime.previewDraftAttachment(draftFile.id);
assert.match(runtime.state.composer.attachments[0].error, /仍可发送/);
assert.equal(runtime.state.composer.attachments.length, 1);
assert.equal(runtime.state.busy, false);

// Marked metadata edits preserve the mark and enqueue both tag and due date.
const markedMessage = { ...imageRaw, marked: true, marked_tag_ids: ['old-tag'], marked_due_date: '2026-10-28' };
runtimeApi.message.listWindow = async () => ({ messages: [markedMessage] });
runtimeApi.marked.getMarkedMessages = async () => ({ messages: [markedMessage] });
runtimeApi.marked.listMarkedTags = async () => [{ id: 'old-tag', name: '旧标签' }];
let markedWrite;
runtimeApi.message.mark = async (filename, tagIds, dueDate) => { markedWrite = { filename, tagIds, dueDate }; };
await runtime.refreshAfterForeground();
assert.equal(await runtime.updateMarkedMetadata(runtime.state.markedMessages[0], ['old-tag'], '2026-11-01'), true);
assert.deepEqual(markedWrite, { filename: 'photo', tagIds: ['old-tag'], dueDate: '2026-11-01' });
assert.match(runtime.state.toast.message, /标记设置已保存/);
runtimeApi.marked.createMarkedTag = async (name) => ({ id: 'new-tag', name });
runtimeApi.marked.listMarkedTags = async () => [{ id: 'old-tag', name: '旧标签' }, { id: 'new-tag', name: '工作' }];
assert.deepEqual(await runtime.createMarkedTag(' 工作 '), { id: 'new-tag', name: '工作' });
assert.equal(runtime.state.tags.length, 2);
// A successful local creation must survive a separate catalog-refresh failure.
let confirmedTagWrites = 0;
runtimeApi.marked.createMarkedTag = async (name) => { confirmedTagWrites += 1; return { id: 'confirmed-tag', name }; };
runtimeApi.marked.listMarkedTags = async () => { throw new Error('fixture catalog refresh failed'); };
assert.deepEqual(await runtime.createMarkedTag('已保存标签'), { id: 'confirmed-tag', name: '已保存标签' });
assert.equal(confirmedTagWrites, 1);
assert.equal(runtime.state.tags.find(tag => tag.id === 'confirmed-tag').name, '已保存标签');
assert.equal(runtime.state.error, '', 'a confirmed write is not presented as a failed creation');
assert.match(runtime.state.toast.message, /标签已保存.*列表.*刷新/);
runtimeApi.marked.createMarkedTag = async () => { throw new Error('fixture creation failed'); };
assert.equal(await runtime.createMarkedTag('未创建标签'), null);
assert.match(runtime.state.error, /fixture creation failed/);
assert.equal(runtime.state.tags.some(tag => tag.name === '未创建标签'), false);
runtimeApi.marked.createMarkedTag = async (name) => ({ id: 'new-tag', name });
const oldTags = deferred();
let tagReads = 0;
runtimeApi.marked.listMarkedTags = async () => {
  tagReads += 1;
  return tagReads === 1 ? oldTags.promise : [{ id: 'account-b-tag', name: '当前账号标签' }];
};
const staleTagCreation = runtime.createMarkedTag('旧账号标签');
await settle();
await runtime.initialize();
oldTags.resolve([{ id: 'account-a-tag', name: '旧账号标签' }]);
assert.equal(await staleTagCreation, null);
assert.deepEqual(Array.from(runtime.state.tags, (tag) => tag.id), ['account-b-tag']);

// Duplicate sends are rejected; failure keeps the same attachment identity for retry.
runtime.state.composer.attachments = [draftFile];
const sendText = deferred();
let textWrites = 0;
let fileWrites = [];
let textInput;
runtimeApi.message.sendText = async (input) => { textInput = input; textWrites += 1; return sendText.promise; };
runtimeApi.message.sendFile = async (input) => { fileWrites.push(input); throw new Error('local copy failed'); };
runtime.state.composer.text = 'message';
runtime.state.composer.format = 'markdown';
runtime.state.composer.marked = true;
runtime.state.composer.tagIds = ['work', 'urgent'];
runtime.state.composer.dueDate = '2026-10-29';
const firstSend = runtime.sendDraft();
assert.equal(await runtime.sendDraft(), false);
runtime.removeAttachment(draftFile.id);
assert.equal(runtime.state.composer.attachments.length, 1, 'cannot remove a file mid-send');
sendText.resolve({});
assert.equal(await firstSend, false);
assert.equal(textWrites, 1);
assert.equal(fileWrites.length, 1);
assert.equal(textInput.format, 'markdown');
assert.deepEqual(JSON.parse(JSON.stringify(textInput.markedOptions)), { marked: true, selectedTagIds: ['work', 'urgent'], dueDate: '2026-10-29', createdTags: [], deletedTagIds: [] });
assert.deepEqual(JSON.parse(JSON.stringify(fileWrites[0].markedOptions)), JSON.parse(JSON.stringify(textInput.markedOptions)));
assert.equal(runtime.state.composer.text, '');
assert.equal(runtime.state.composer.savedLocally, true);
assert.equal(runtime.state.composer.attachments[0].clientId, draftFile.clientId);
runtimeApi.message.sendFile = async (input) => { fileWrites.push(input); };
assert.equal(await runtime.sendDraft(), true);
assert.equal(textWrites, 1, 'retry must not resend already saved text');
assert.equal(fileWrites[1].clientId, draftFile.clientId);
assert.deepEqual(JSON.parse(JSON.stringify(fileWrites[1].markedOptions)), JSON.parse(JSON.stringify(textInput.markedOptions)), 'retry must keep selected tag IDs/date and not recreate tags');
assert.equal(runtime.state.composer.marked, false);
assert.equal(runtime.state.composer.tagIds.length, 0);
assert.equal(runtime.state.composer.attachments.length, 0);

// A committed send must leave the sending state even when post-send reads hang.
const hangingPostSendRead = deferred();
let committedWrites = 0;
runtimeApi.message.listWindow = async () => hangingPostSendRead.promise;
runtimeApi.message.sendText = async (input) => { textInput = input; committedWrites += 1; };
runtime.state.composer.text = 'committed before a slow refresh';
assert.equal(await Promise.race([runtime.sendDraft(), new Promise((_, reject) => setTimeout(() => reject(new Error('send waited for post-send refresh')), 250))]), true);
assert.equal(runtime.state.composer.sending, false);
assert.equal(runtime.state.composer.text, '');
assert.equal(runtime.state.composer.savedLocally, true);
assert.equal(committedWrites, 1, 'the slow refresh path must commit exactly once');
hangingPostSendRead.resolve({ messages: [] });
await settle();
runtimeApi.message.listWindow = async () => ({ messages: [] });

// Importing a selection blocks another native picker and sending the existing draft.
runtime.state.composer.text = 'keep while importing';
const importingDocuments = deferred();
let documentPickerCalls = 0;
let mediaPickerCalls = 0;
runtimeApi.mobileIntegration.selectDocuments = async () => { documentPickerCalls += 1; return importingDocuments.promise; };
runtimeApi.mobileIntegration.selectMedia = async () => { mediaPickerCalls += 1; return { items: [] }; };
const importing = runtime.selectDocuments();
assert.equal(runtime.state.composer.selecting, true);
await runtime.selectDocuments();
await runtime.selectMedia();
assert.equal(documentPickerCalls, 1, 'one native selection may be active at a time');
assert.equal(mediaPickerCalls, 0, 'media and document pickers share the import lock');
assert.equal(await runtime.sendDraft(), false, 'do not send while imported attachments are still being copied');
assert.equal(textWrites, 1);
importingDocuments.reject({ code: 'RESOURCE_UNAVAILABLE', message: 'cloud document unavailable' });
await importing;
assert.equal(runtime.state.composer.selecting, false);
assert.equal(runtime.state.composer.text, 'keep while importing');
assert.match(runtime.state.composer.error, /cloud document unavailable/);
runtimeApi.mobileIntegration.selectDocuments = async () => ({ items: [draftFile] });
await runtime.selectDocuments();
assert.equal(runtime.state.composer.error, '', 'successful selection clears the previous import error');
assert.equal(runtime.state.composer.attachments.length, 1);
runtime.removeAttachment(runtime.state.composer.attachments[0].id);
runtime.state.composer.text = '';

// Picker results from a previous account cannot repopulate a new draft.
const lateText = deferred();
runtimeApi.message.sendText = async () => lateText.promise;
runtime.state.composer.text = 'old account text';
runtime.state.composer.attachments = [draftFile];
const sendingOldAccount = runtime.sendDraft();
runtimeApi.settings.supabaseCurrentUser = async () => ({ signedIn: false });
await runtime.initialize();
lateText.resolve({});
assert.equal(await sendingOldAccount, false);
assert.equal(fileWrites.length, 2, 'account switching stops the remainder of the old send batch');
assert.equal(runtime.state.composer.text, '');
assert.equal(runtime.state.toast.visible, false);

runtimeApi.settings.supabaseCurrentUser = async () => ({ signedIn: true, userId: 'user-a' });
await runtime.initialize();
const pendingPicker = deferred();
runtimeApi.mobileIntegration.selectDocuments = async () => pendingPicker.promise;
const selecting = runtime.selectDocuments();
runtimeApi.settings.supabaseCurrentUser = async () => ({ signedIn: false });
await runtime.initialize();
pendingPicker.resolve({ items: [draftFile] });
await selecting;
assert.equal(runtime.state.composer.attachments.length, 0);
assert.equal(runtime.state.composer.selecting, false);

runtimeApi.settings.supabaseCurrentUser = async () => ({ signedIn: true, userId: 'user-b' });
await runtime.initialize();
const oldSelection = deferred();
runtimeApi.mobileIntegration.selectDocuments = async () => oldSelection.promise;
const staleSelection = runtime.selectDocuments();
await runtime.initialize();
const newSelection = deferred();
runtimeApi.mobileIntegration.selectMedia = async () => newSelection.promise;
const currentSelection = runtime.selectMedia();
oldSelection.resolve({ items: [draftFile] });
await staleSelection;
assert.equal(runtime.state.composer.selecting, true, 'an old selection must not unlock a new account selection');
assert.equal(runtime.state.composer.attachments.length, 0);
newSelection.reject({ code: 'CANCELLED', message: 'The user cancelled the operation.' });
await currentSelection;
assert.equal(runtime.state.composer.selecting, false);
assert.equal(runtime.state.composer.error, '', 'cancelling the picker is not an import error');

// Passive preview completion must update the actual reactive list row, not its raw source.
runtimeApi.message.listWindow = async () => ({ messages: [imageRaw], hasMoreBefore: true });
runtimeApi.marked.getMarkedMessages = async () => ({ messages: [] });
runtimeApi.message.getMediaPreview = async () => ({ state: 'ready', path: '/sandbox/preview.jpg' });
const mediaController = runtimeModule.exports.useMobileController();
await mediaController.initialize();
const reactiveChecks = [];
const { watch } = createRequire(import.meta.url)('vue');
async function resolveReactivePreview(row, pending, expectedPath) {
  const observed = [];
  const stop = watch(() => row.previewUrl, value => observed.push(value), { flush: 'sync' });
  try {
    pending.resolve({ state: 'ready', path: expectedPath });
    await settle();
    assert.equal(row.previewUrl, 'asset:' + expectedPath);
    assert.deepEqual(observed, ['asset:' + expectedPath], 'Vue must observe asynchronous thumbnail completion');
    reactiveChecks.push(row.filename);
  } finally { stop(); }
}
const searchThumbnail = deferred();
runtimeApi.message.getMediaPreview = async () => searchThumbnail.promise;
runtimeApi.message.searchMessages = async () => ({ messages: [imageRaw] });
await mediaController.searchMessages('photo');
await resolveReactivePreview(mediaController.state.search.messages[0], searchThumbnail, '/sandbox/search-preview.jpg');
await mediaController.searchMessages('');
const historyThumbnail = deferred();
runtimeApi.message.getMediaPreview = async () => historyThumbnail.promise;
runtimeApi.message.listWindow = async () => ({ messages: [{ ...imageRaw, filename: 'older-photo', timestamp_ms: 1 }], hasMoreBefore: false });
await mediaController.loadOlderMessages();
await resolveReactivePreview(mediaController.state.messages.find(row => row.filename === 'older-photo'), historyThumbnail, '/sandbox/history-preview.jpg');
const markThumbnail = deferred();
runtimeApi.message.getMediaPreview = async () => markThumbnail.promise;
runtimeApi.marked.getMarkedMessages = async () => ({ messages: [{ ...imageRaw, filename: 'marked-photo', marked: true }] });
await mediaController.setMarkedFilter(true, '');
await resolveReactivePreview(mediaController.state.markedView.messages[0], markThumbnail, '/sandbox/marked-preview.jpg');
assert.equal(reactiveChecks.length, 3);

// In-flight playback cannot start a second original download; failures unlock retry.
let videoDownloads = 0;
const pendingVideo = deferred();
runtimeApi.message.downloadMessageFile = async () => { videoDownloads += 1; return pendingVideo.promise; };
const videoRow = { ...mediaController.state.messages[0], kind: 'video', filename: 'retry.mp4', originalName: 'retry.mp4' };
const preparingVideo = mediaController.prepareVideo(videoRow);
assert.equal(await mediaController.prepareVideo(videoRow), null);
assert.equal(videoDownloads, 1);
pendingVideo.reject(new Error('传输已暂停，回到前台后重试'));
assert.equal(await preparingVideo, null);
assert.equal(videoRow.attachmentState, 'paused');
assert.equal(mediaController.state.busy, false);
runtimeApi.message.downloadMessageFile = async () => { throw new Error('network unavailable'); };
assert.equal(await mediaController.prepareVideo(videoRow), null);
assert.equal(videoRow.attachmentState, 'failed');
assert.match(videoRow.attachmentError, /network unavailable/);
assert.equal(mediaController.state.busy, false);
runtimeApi.message.downloadMessageFile = async () => ({ path: '/sandbox/retry.mp4' });
assert.equal(await mediaController.prepareVideo(videoRow), 'asset:/sandbox/retry.mp4');
assert.equal(videoRow.attachmentState, 'cached');
assert.equal(videoRow.attachmentError, undefined);

console.log('mobile UI shell tests passed');
