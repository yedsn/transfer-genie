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
let defaultEditorFormat = 'markdown';
let settingsWrites = 0;
let lastSavedSettings;
const key = () => `${activeProfile.id}/${activeUser}/${activeProfile.supabase.space_id}`;
const emptyDraft = () => ({ text: '', format: 'text', marked: false, tagIds: [], dueDate: null, attachments: [], updatedAtMs: null });
const api = {
  settings: {
    getSettings: async () => ({ active_storage_profile_id: activeProfile.id, storage_profiles: [activeProfile], default_editor_format: defaultEditorFormat, desktop_only: 'preserved' }),
    saveSettings: async settings => { settingsWrites += 1; lastSavedSettings = settings; defaultEditorFormat = settings.default_editor_format; return settings; },
    supabaseCurrentUser: async () => ({ signedIn: true, userId: activeUser }),
    listSupabaseSpaces: async () => [
      { id: 'space-a', name: 'A', current: activeProfile.supabase.space_id === 'space-a' },
      { id: 'space-b', name: 'B', current: activeProfile.supabase.space_id === 'space-b' },
    ],
    activateStorageProfile: async (profileId) => { activeProfile = { ...activeProfile, id: profileId }; },
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
assert.equal(controller.state.composer.format, 'markdown', 'an empty new draft uses the configured Markdown default');
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
assert.equal(controller.state.composer.draftPersisted, true, 'restored draft starts safe for native navigation');
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
assert.equal(controller.state.composer.format, 'markdown', 'another scoped empty draft still uses the configured default');

assert.equal(await controller.saveDefaultEditorFormat('text'), true);
assert.equal(settingsWrites, 1);
assert.equal(lastSavedSettings.default_editor_format, 'text');
assert.equal(lastSavedSettings.desktop_only, 'preserved', 'saving the mobile default must retain unrelated desktop settings');
assert.equal(controller.state.settings.default_editor_format, 'text');
assert.equal(controller.state.composer.format, 'markdown', 'changing the default does not rewrite the already-open draft');
controller.prepareNewComposer();
assert.equal(controller.state.composer.format, 'text', 'the next empty open uses the new default without a restart');
await terminate(controller);
controller = await makeController();
assert.equal(controller.state.composer.format, 'text', 'the next empty composer uses the saved text default');

defaultEditorFormat = 'invalid';
await terminate(controller);
controller = await makeController();
assert.equal(controller.state.composer.format, 'text', 'an invalid stored default falls back to text');

const realSaveSettings = api.settings.saveSettings;
api.settings.saveSettings = async () => { throw new Error('fixture settings failure'); };
assert.equal(await controller.saveDefaultEditorFormat('markdown'), false);
assert.equal(controller.state.settings.default_editor_format, 'invalid', 'a failed save keeps the previous persisted snapshot');
assert.equal(controller.state.toast.tone, 'error');
api.settings.saveSettings = realSaveSettings;
defaultEditorFormat = 'markdown';

activeUser = 'user-a';
await terminate(controller);
controller = await makeController();
assert.equal(controller.state.composer.format, 'markdown', 'a restored Markdown draft retains its format');
assert.equal(await controller.saveDefaultEditorFormat('text'), true);
controller.prepareNewComposer();
assert.equal(controller.state.composer.format, 'markdown', 'a saved draft wins over a different default');
activeUser = 'user-b';

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

// The native picker result must be durable before its controller call returns.
api.mobileIntegration.selectDocuments = async () => ({ items: [{ path: '/sandbox/picked.pdf', originalName: 'picked.pdf', sizeBytes: 20 }] });
await controller.selectDocuments();
assert.equal(draftRows.get(key()).attachments.length, 1);
assert.equal(draftRows.get(key()).attachments[0].path, '/sandbox/picked.pdf');
const selectedClientId = draftRows.get(key()).attachments[0].clientId;
await terminate(controller);
controller = await makeController();
assert.equal(controller.state.composer.attachments[0].clientId, selectedClientId);

// Switching Profile, not just Auth or Space, cannot expose an existing draft.
await terminate(controller);
activeProfile = { ...activeProfile, id: 'profile-b' };
controller = await makeController();
assert.equal(controller.state.composer.text, '');
assert.equal(controller.state.composer.attachments.length, 0);
controller.state.composer.text = 'profile-b-only';
assert.equal(controller.state.composer.draftStatus, 'idle');
assert.equal(controller.state.composer.draftPersisted, false, 'editing immediately disables native navigation');
await new Promise(resolve => setTimeout(resolve, 450));
assert.equal(draftRows.get(key()).text, 'profile-b-only');
assert.equal(controller.state.composer.draftStatus, 'saved');
assert.equal(controller.state.composer.draftPersisted, true, 'successful automatic save re-enables native navigation');

// A failed save must not fall through to sending or silently discard the draft.
const realSave = api.mobileDraft.save;
const sendsBeforeFailure = textSends;
api.mobileDraft.save = async () => { throw new Error('fixture database write failure'); };
controller.state.composer.text = 'retain-after-write-failure';
assert.equal(await controller.sendDraft(), false);
assert.equal(textSends, sendsBeforeFailure);
assert.equal(controller.state.composer.text, 'retain-after-write-failure');
assert.equal(controller.state.composer.draftStatus, 'error');
assert.equal(controller.state.composer.draftPersisted, false);
assert.equal(controller.state.composer.sending, false);
api.mobileDraft.save = realSave;
assert.equal(await controller.persistComposerDraft(true), true);
assert.equal(draftRows.get(key()).text, 'retain-after-write-failure');

// An unreadable persisted payload cannot be overwritten by an empty editor.
await terminate(controller);
const realGet = api.mobileDraft.get;
api.mobileDraft.get = async () => { throw new Error('fixture corrupt payload'); };
controller = await makeController();
assert.equal(controller.state.composer.persistenceReady, false);
assert.equal(controller.state.composer.draftStatus, 'error');
assert.equal(await controller.persistComposerDraft(true), false);
assert.equal(draftRows.get(key()).text, 'retain-after-write-failure');
api.mobileDraft.get = realGet;
await terminate(controller);
controller = await makeController();
assert.equal(controller.state.composer.text, 'retain-after-write-failure');
await terminate(controller);

// Swipe waits for the exact saved snapshot and refuses a stale completion.
controller = await makeController();
let resolveSave;
let notifyStarted;
const started = new Promise(resolve => { notifyStarted = resolve; });
api.mobileDraft.save = async payload => {
  notifyStarted();
  await new Promise(resolve => { resolveSave = resolve; });
  return { ...payload, updatedAtMs: Date.now() };
};
controller.state.composer.text = "before swipe";
const pendingSwipeSave = controller.persistComposerDraftForNavigation();
await started;
controller.state.composer.text = "changed while saving";
assert.equal(controller.state.composer.draftPersisted, false);
resolveSave();
assert.equal(await pendingSwipeSave, false, "a changed draft cannot be closed on an older save");
assert.equal(controller.state.composer.draftPersisted, false);
api.mobileDraft.save = realSave;
assert.equal(await controller.persistComposerDraftForNavigation(), true);
assert.equal(controller.state.composer.draftPersisted, true);
assert.equal(draftRows.get(key()).text, "changed while saving");
controller.state.composer.text = "";
assert.equal(await controller.persistComposerDraftForNavigation(), true, "empty-draft deletion is successful without a timestamp");
assert.equal(controller.state.composer.draftPersisted, true);
assert.equal(draftRows.has(key()), false);
await terminate(controller);

console.log('mobile draft persistence passed: restart restore, Profile/Auth/Space isolation, immediate picker save, debounce/status, missing-file guard, save/restore failure protection, partial retry identity and successful cleanup');
