import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import ts from 'typescript';

// Exercise the effective default permission set: generated command permissions
// alone do not grant the webview access to the native inbox.
const acl = JSON.parse(fs.readFileSync(new URL('../gen/schemas/acl-manifests.json', import.meta.url), 'utf8'));
const mobilePermissions = acl['mobile-integration'];
const iosCapability = JSON.parse(fs.readFileSync(new URL('../capabilities/ios.json', import.meta.url), 'utf8'));
assert.ok(iosCapability.permissions.includes('mobile-integration:default'));
for (const command of ['list_shared_imports', 'stage_shared_imports', 'acknowledge_shared_imports']) {
  const permission = `allow-${command.replaceAll('_', '-')}`;
  assert.ok(mobilePermissions.default_permission.permissions.includes(permission), `${command} must be granted by default`);
  assert.ok(mobilePermissions.permissions[permission].commands.allow.includes(command));
}

const source = fs.readFileSync(new URL('../src-ui/src/mobile/mobile-controller.ts', import.meta.url), 'utf8');
const module = { exports: {} };
const batchId = '6E2EB4E9-44FD-4CF8-A21A-4D9EE19E8D34';
const fileId = 'B66FB3A5-103A-4BAC-B991-A7607877596B';
const stagedPath = `/sandbox/MobileImports/${batchId}/01-photo.jpg`;
let signedIn = true;
let batches = [];
let draft = null;
let saveFailure = false;
let ackFailure = false;
let sendCount = 0;
let calls = [];
const api = {
  settings: {
    getSettings: async () => ({
      active_storage_profile_id: 'profile-a',
      storage_profiles: [{ id: 'profile-a', provider_kind: 'supabase', supabase: { space_id: 'space-a' } }],
      default_editor_format: 'text',
    }),
    supabaseCurrentUser: async () => signedIn
      ? { signedIn: true, userId: 'user-a', email: 'user@example.com' }
      : { signedIn: false },
    listSupabaseSpaces: async () => [{ id: 'space-a', name: 'A', current: true }],
  },
  sync: {
    getSyncStatus: async () => ({ pending_count: 0 }),
    listPendingOperations: async () => [],
    listConflicts: async () => [],
  },
  transfer: { listDownloadHistory: async () => ({ records: [] }) },
  message: {
    listWindow: async () => ({ messages: [], hasMoreBefore: false }),
    sendFile: async () => { sendCount += 1; },
    sendText: async () => { sendCount += 1; },
  },
  marked: { getMarkedMessages: async () => ({ messages: [], total: 0 }), listMarkedTags: async () => [] },
  mobileCache: { getSummary: async () => ({ reclaimableBytes: 0, fileCount: 0, protectedTasks: 0 }) },
  mobileDraft: {
    get: async () => structuredClone(draft || { text: '', format: 'text', marked: false, tagIds: [], dueDate: null, attachments: [], updatedAtMs: null }),
    save: async (payload) => {
      calls.push(['save', payload.attachments.map((item) => item.path)]);
      if (saveFailure) throw new Error('fixture draft save failure');
      const empty = !payload.text && !payload.attachments.length && !payload.marked && !payload.tagIds.length && !payload.dueDate;
      draft = empty ? null : { ...structuredClone(payload), updatedAtMs: Date.now() };
      return draft || { ...structuredClone(payload), updatedAtMs: null };
    },
  },
  mobileIntegration: {
    cancelVideoPoster: async () => {},
    generateImageThumbnail: async () => ({ path: '/preview.jpg' }),
    generateVideoPoster: async () => ({ path: '/poster.jpg' }),
    listSharedImports: async () => {
      calls.push(['list']);
      return { batches: structuredClone(batches) };
    },
    stageSharedImports: async (ids) => {
      calls.push(['stage', [...ids]]);
      return {
        batches: structuredClone(batches.map((batch) => ({
          batchId: batch.batchId,
          createdAtMs: batch.createdAtMs,
          complete: batch.complete !== false,
          files: batch.complete === false ? [] : [{
            fileId: batch.files[0].fileId,
            path: stagedPath,
            importName: batch.files[0].importName,
            originalName: batch.files[0].originalName,
            contentType: batch.files[0].contentType,
            sizeBytes: batch.files[0].sizeBytes,
          }],
          failures: batch.complete === false ? [{
            fileId: batch.files[0].fileId,
            importName: batch.files[0].importName,
            code: 'FILE_UNAVAILABLE',
            message: '分享文件已不可用',
          }] : [],
        }))),
      };
    },
    acknowledgeSharedImports: async (ids) => {
      calls.push(['ack', [...ids]]);
      if (ackFailure) throw new Error('fixture inbox cleanup failure');
      batches = batches.filter((batch) => !ids.includes(batch.batchId));
      return { acknowledgedBatchIds: [...ids] };
    },
  },
  app: { getAppVersion: async () => 'test' },
  path: { convertFileSrc: (path) => path },
};

vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
  module,
  exports: module.exports,
  require: createRequire(import.meta.url),
  window: { location: { search: '' }, transferGenieApi: api, setTimeout, clearTimeout },
  URLSearchParams,
  crypto: globalThis.crypto,
  structuredClone,
  navigator: { clipboard: { writeText: async () => {} } },
});

const makeBatch = () => ({
  batchId,
  createdAtMs: 1,
  files: [{
    fileId,
    importName: '01-photo.jpg',
    originalName: 'photo.jpg',
    contentType: 'public.jpeg',
    sizeBytes: 12,
  }],
});
const makeController = async () => {
  const controller = module.exports.useMobileController();
  await controller.initialize();
  return controller;
};

let controller = await makeController();
assert.equal(controller.state.boot, 'ready');
draft = {
  text: 'keep this text',
  textClientId: 'stable-text',
  format: 'markdown',
  marked: true,
  tagIds: ['work'],
  dueDate: '2026-12-01',
  attachments: [{
    clientId: 'existing-file',
    path: `/sandbox/MobileImports/${crypto.randomUUID()}/existing.pdf`,
    originalName: 'existing.pdf',
    mediaType: 'file',
    sizeBytes: 8,
  }],
  updatedAtMs: 1,
};
controller = await makeController();
batches = [makeBatch()];
let outcome = await controller.importPendingShares();
assert.equal(outcome.hadBatches, true);
assert.equal(outcome.added, 1);
assert.equal(controller.state.composer.text, 'keep this text');
assert.equal(controller.state.composer.format, 'markdown');
assert.equal(controller.state.composer.marked, true);
assert.deepEqual(Array.from(controller.state.composer.tagIds), ['work']);
assert.equal(controller.state.composer.dueDate, '2026-12-01');
assert.equal(controller.state.composer.attachments.length, 2);
assert.equal(controller.state.composer.attachments[1].path, stagedPath);
assert.equal(controller.state.composer.attachments[1].clientId, `share-${fileId}`);
assert.equal(sendCount, 0, 'share import never sends automatically');
const saveIndex = calls.findIndex(([name]) => name === 'save');
const ackIndex = calls.findIndex(([name]) => name === 'ack');
assert.ok(saveIndex >= 0 && ackIndex > saveIndex, 'the draft must persist before the inbox is acknowledged');

// A duplicate URL delivery cannot add the same deterministic path twice.
ackFailure = true;
controller = await makeController();
batches = [makeBatch()];
outcome = await controller.importPendingShares();
assert.equal(outcome.added, 0, 'the restored draft already contains the deterministic staged path');
outcome = await controller.importPendingShares();
assert.equal(outcome.added, 0);
assert.equal(controller.state.composer.attachments.filter((item) => item.path === stagedPath).length, 1);
assert.match(controller.state.shareImport.error, /收件箱清理失败/);
ackFailure = false;
batches = [];

// A failed draft save leaves the batch unacknowledged and reports a retryable error.
controller = await makeController();
draft = null;
batches = [makeBatch()];
calls = [];
saveFailure = true;
outcome = await controller.importPendingShares();
assert.equal(outcome.hadBatches, true);
assert.match(outcome.error, /草稿保存失败/);
assert.equal(calls.some(([name]) => name === 'ack'), false);
assert.equal(batches.length, 1);
assert.equal(sendCount, 0);
saveFailure = false;
batches = [];

// A per-file failure is visible and retains the incomplete batch.
controller = await makeController();
batches = [{ ...makeBatch(), complete: false }];
outcome = await controller.importPendingShares();
assert.equal(outcome.failed, 1);
assert.match(outcome.error, /分享文件已不可用/);
assert.equal(outcome.acknowledgedBatchIds.length, 0);
assert.equal(controller.state.composer.attachments.length, 0);
batches = [];

// An empty draft receives the share as its first attachment.
controller = await makeController();
draft = null;
batches = [makeBatch()];
outcome = await controller.importPendingShares();
assert.equal(outcome.added, 1);
assert.equal(controller.state.composer.attachments.length, 1);
assert.equal(controller.state.composer.attachments[0].path, stagedPath);
assert.equal(controller.state.composer.text, '');
assert.equal(batches.length, 0);

// An unreadable staged item is reported as a failure and is not attached.
draft = null;
controller = await makeController();
batches = [{ ...makeBatch(), complete: false }];
outcome = await controller.importPendingShares();
assert.equal(outcome.added, 0);
assert.equal(controller.state.composer.attachments.length, 0);
assert.match(outcome.error, /分享文件已不可用/);
batches = [];

// Signed-out startup must not scan or consume the inbox.
await controller.deactivateComposerPersistence();
signedIn = false;
batches = [makeBatch()];
calls = [];
controller = await makeController();
assert.equal(controller.state.boot, 'signed-out');
outcome = await controller.importPendingShares();
assert.equal(outcome.hadBatches, false);
assert.equal(calls.some(([name]) => name === 'list'), false);
assert.equal(batches.length, 1, 'signed-out shares remain in the private inbox');
await controller.deactivateComposerPersistence();

console.log('mobile share import passed: draft merge, save-before-ack, duplicate delivery, save failure, partial failure, signed-out retention, no auto-send');
