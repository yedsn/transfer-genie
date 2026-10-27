import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import ts from 'typescript';

const source = fs.readFileSync(new URL('../src-ui/src/mobile/mobile-controller.ts', import.meta.url), 'utf8');
const module = { exports: {} };
const draftRows = new Map();
let activeProfile = { id: 'profile-a', provider_kind: 'supabase', supabase: { space_id: 'space-a' } };
let activeUser = 'user-a';
let textSends = 0;
let fileSends = 0;
const key = () => `${activeProfile.id}/${activeUser}/${activeProfile.supabase.space_id}`;
const emptyDraft = () => ({ text: '', format: 'text', marked: false, tagIds: [], dueDate: null, attachments: [], updatedAtMs: null });
const api = {
  settings: {
    getSettings: async () => ({ active_storage_profile_id: activeProfile.id, storage_profiles: [activeProfile] }),
    supabaseCurrentUser: async () => ({ signedIn: true, userId: activeUser }),
    listSupabaseSpaces: async () => [
      { id: 'space-a', name: 'A', current: activeProfile.supabase.space_id === 'space-a' },
      { id: 'space-b', name: 'B', current: activeProfile.supabase.space_id === 'space-b' },
    ],
    switchSupabaseSpace: async ({ spaceId }) => { activeProfile = { ...activeProfile, supabase: { ...activeProfile.supabase, space_id: spaceId } }; },
  },
  sync: {
    getSyncStatus: async () => ({ pending_count: 0 }),
    listPendingOperations: async () => [],
    listConflicts: async () => [],
  },
  transfer: { listDownloadHistory: async () => ({ records: [] }) },
  message: {
    listWindow: async () => ({ messages: [], hasMoreBefore: false }),
    sendText: async () => { textSends += 1; },
    sendFile: async () => { fileSends += 1; },
  },
  marked: { getMarkedMessages: async () => ({ messages: [], total: 0 }), listMarkedTags: async () => [] },
  mobileCache: { getSummary: async () => ({ reclaimableBytes: 0, fileCount: 0, protectedTasks: 0 }) },
  mobileDraft: {
    get: async () => JSON.parse(JSON.stringify(draftRows.get(key()) || emptyDraft())),
    save: async (payload) => {
      const empty = !payload.text && !payload.attachments.length && !payload.marked && !payload.tagIds.length && !payload.dueDate;
      const plain = JSON.parse(JSON.stringify(payload));
      if (empty) { draftRows.delete(key()); return { ...plain, updatedAtMs: null }; }
      const row = { ...plain, attachments: plain.attachments.map((item) => ({ ...item, available: !item.path.includes('missing') })), updatedAtMs: Date.now() };
      draftRows.set(key(), row);
      return JSON.parse(JSON.stringify(row));
    },
  },
  app: { getAppVersion: async () => 'test' },
  mobileIntegration: { cancelVideoPoster: async () => {}, generateImageThumbnail: async () => ({ path: '/preview.jpg' }), generateVideoPoster: async () => ({ path: '/poster.jpg' }) },
  path: { convertFileSrc: (path) => path },
};
const sandboxWindow = { location: { search: '' }, transferGenieApi: api, setTimeout, clearTimeout };
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
  module, exports: module.exports, require: createRequire(import.meta.url), window: sandboxWindow, URLSearchParams, crypto: globalThis.crypto, structuredClone,
  navigator: { clipboard: { writeText: async () => {} } },
});
const makeController = async () => { const controller = module.exports.useMobileController(); await controller.initialize(); return controller; };
const terminate = async (controller) => { await controller.deactivateComposerPersistence(); };
const attachment = (path = '/sandbox/report.pdf') => ({ id: crypto.randomUUID(), clientId: 'stable-client', path, originalName: 'report.pdf', mediaType: 'file', sizeBytes: 100, previewState: 'unsupported', available: true });

let controller = await makeController();
controller.state.composer.text = '# restart-safe';
controller.state.composer.format = 'markdown';
controller.state.composer.marked = true;
controller.state.composer.tagIds = ['work'];
controller.state.composer.dueDate = '2026-11-01';
controller.state.composer.attachments = [attachment()];
assert.equal(await controller.persistComposerDraft(true), true);

await terminate(controller);
controller = await makeController();
assert.equal(controller.state.composer.text, '# restart-safe');
assert.equal(controller.state.composer.format, 'markdown');
assert.equal(controller.state.composer.draftStatus, 'restored');
assert.deepEqual(Array.from(controller.state.composer.tagIds), ['work']);
assert.equal(controller.state.composer.attachments[0].clientId, 'stable-client');

await controller.switchSpace({ id: 'space-b', current: false });
assert.equal(controller.state.composer.text, '', 'another Space must not expose the previous draft');
controller.state.composer.text = 'space-b-only';
assert.equal(await controller.persistComposerDraft(true), true);
activeProfile = { ...activeProfile, supabase: { ...activeProfile.supabase, space_id: 'space-a' } };
await terminate(controller);
controller = await makeController();
assert.equal(controller.state.composer.text, '# restart-safe', 'returning to the original Space restores only its draft');
activeUser = 'user-b';
await terminate(controller);
controller = await makeController();
assert.equal(controller.state.composer.text, '', 'another Auth user must not see the previous account draft');

draftRows.set(key(), { ...emptyDraft(), attachments: [{ clientId: 'missing-client', path: '/sandbox/missing.pdf', originalName: 'missing.pdf', mediaType: 'file', sizeBytes: 10, available: false }], updatedAtMs: Date.now() });
await terminate(controller);
controller = await makeController();
assert.equal(controller.state.composer.attachments[0].available, false);
assert.equal(await controller.sendDraft(), false);
assert.match(controller.state.composer.error, /原文件已不可用/);
assert.equal(textSends, 0);
assert.equal(fileSends, 0);

activeUser = 'user-a';
activeProfile = { ...activeProfile, supabase: { ...activeProfile.supabase, space_id: 'space-a' } };
await terminate(controller);
controller = await makeController();
api.message.sendFile = async () => { fileSends += 1; throw new Error('fixture upload failure'); };
assert.equal(await controller.sendDraft(), false);
assert.equal(textSends, 1);
assert.equal(fileSends, 1);
await controller.persistComposerDraft(true);
const partial = draftRows.get(key());
assert.equal(partial.text, '', 'saved text is removed from the retry draft');
assert.equal(partial.attachments.length, 1);
assert.equal(partial.attachments[0].clientId, 'stable-client', 'failed attachment keeps stable identity');

api.message.sendFile = async () => { fileSends += 1; };
await terminate(controller);
controller = await makeController();
assert.equal(await controller.sendDraft(), true);
await controller.persistComposerDraft(true);
assert.equal(draftRows.has(key()), false, 'complete local send clears the persisted draft');
assert.equal(textSends, 1, 'attachment retry must not resend text already saved locally');

console.log('mobile draft persistence passed: restart restore, Profile/Auth/Space isolation, missing-file guard, partial retry identity and successful cleanup');
