import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import ts from 'typescript';

const source = fs.readFileSync(new URL('../src-ui/src/mobile/mobile-controller.ts', import.meta.url), 'utf8');
const module = { exports: {} };
const calls = { settingsReads: 0, spaces: 0, activate: [], bindings: [], drafts: 0, writes: 0, cancelledFlows: [], creates: [], saves: [], logouts: [], removes: [] };
const fixturePassword = crypto.randomUUID();
const delayedDiagnostics = new Map();
let delayedDraftSignIn = null;
let businessReads = 0;
let syncReads = 0;
const profileA = { id: 'profile-a', name: 'A', provider_kind: 'supabase', enabled: true, supabase: { api_url: 'https://a.fixture.invalid', anon_key: 'public-a', space_id: 'space-a', binding_state: 'bound' } };
const profileB = { id: 'profile-b', name: 'B disabled', provider_kind: 'supabase', enabled: false, supabase: { api_url: 'https://b.fixture.invalid', anon_key: 'public-b', space_id: 'space-b', binding_state: 'bound' } };
const webdav = { id: 'desktop-only', name: 'WebDAV', provider_kind: 'webdav', enabled: true };
let settings = { active_storage_profile_id: 'profile-a', sender_name: 'fixture', storage_profiles: [profileA, profileB, webdav] };
let rejectDraft = false;
let rejectActivation = false;
let rejectSettingsRead = false;
let rejectBinding = false;
let rejectCurrentUser = false;
let offlinePending = false;
const signedOutProfiles = new Set();
const api = {
  settings: {
    getSettings: async () => { calls.settingsReads += 1; if (rejectSettingsRead) throw new Error('fixture settings unavailable'); return structuredClone(settings); },
    supabaseCurrentUser: async (profileId) => {
      if (rejectCurrentUser) throw new Error('fixture target account unavailable');
      return { profileId, signedIn: !signedOutProfiles.has(profileId), userId: signedOutProfiles.has(profileId) ? null : `user-${profileId}` };
    },
    listSupabaseSpaces: async () => { calls.spaces += 1; return [{ id: 'remote-not-a-profile', name: 'Remote only' }]; },
    activateStorageProfile: async (profileId) => { calls.activate.push(profileId); if (rejectActivation) throw new Error('fixture activation failure'); settings = { ...settings, active_storage_profile_id: profileId }; return structuredClone(settings); },
    testSupabaseConnection: async (profileId) => {
      if (!delayedDiagnostics.has(profileId)) return { network: true, auth: true, schema: true, rpc: true, rls: true };
      const delayed = delayedDiagnostics.get(profileId);
      return delayed.promise || delayed;
    },
    testSupabaseDraftConnection: async () => ({ network: true, publicKey: true }),
    supabaseDraftSignIn: async () => delayedDraftSignIn ? delayedDraftSignIn.promise : ({ profileId: 'flow-b', signedIn: true, userId: 'user-b', email: 'b@example.invalid' }),
    listSupabaseDraftSpaces: async () => [{ id: 'space-b-new', name: 'B Space' }],
    completeSupabaseBinding: async (input) => {
      calls.bindings.push(structuredClone(input));
      if (rejectBinding) throw new Error('fixture configuration save failure');
      const profile = { ...input.profile, id: `saved-${input.spaceId}` };
      settings = { ...settings, storage_profiles: [...settings.storage_profiles.filter(item => item.id !== profile.id), profile] };
      return structuredClone(settings);
    },
    cancelSupabaseBindingFlow: async (flowId) => { calls.cancelledFlows.push(flowId); },
    createSupabaseSpace: async (input) => { calls.creates.push(structuredClone(input)); if (calls.creates.length === 1) throw new Error('fixture retry'); return { id: input.spaceId, name: input.name }; },
    saveStorageProfile: async (input) => { calls.saves.push(structuredClone(input)); settings = { ...settings, storage_profiles: settings.storage_profiles.map(item => item.id === input.originalProfileId ? input.profile : item) }; return structuredClone(settings); },
    supabaseLogout: async (profileId) => { calls.logouts.push(profileId); },
    removeStorageProfile: async (profileId, options) => { calls.removes.push({ profileId, options }); settings = { ...settings, storage_profiles: settings.storage_profiles.filter(item => item.id !== profileId), active_storage_profile_id: settings.active_storage_profile_id === profileId ? null : settings.active_storage_profile_id }; return structuredClone(settings); },
  },
  sync: { getSyncStatus: async () => { syncReads += 1; return { pending_count: offlinePending ? 2 : 0, last_error: offlinePending ? 'offline fixture' : null }; }, listPendingOperations: async () => [], listConflicts: async () => [] },
  transfer: { listDownloadHistory: async () => ({ records: [] }) },
  message: {
    listWindow: async () => { businessReads += 1; return { messages: [], hasMoreBefore: false }; },
    sendText: async () => { calls.writes += 1; },
    sendFile: async () => { calls.writes += 1; },
  },
  marked: { getMarkedMessages: async () => ({ messages: [], total: 0 }), listMarkedTags: async () => [] },
  mobileCache: { getSummary: async () => ({ reclaimableBytes: 0, fileCount: 0, protectedTasks: 0 }) },
  mobileDraft: {
    get: async () => ({ text: '', format: 'text', marked: false, tagIds: [], dueDate: null, attachments: [], updatedAtMs: null }),
    save: async (payload) => { calls.drafts += 1; if (rejectDraft) throw new Error('fixture draft failure'); return { ...payload, updatedAtMs: Date.now() }; },
  },
  app: { getAppVersion: async () => 'test' },
};
const sandboxWindow = { location: { search: '' }, transferGenieApi: api, setTimeout, clearTimeout };
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
  module, exports: module.exports, require: createRequire(import.meta.url), window: sandboxWindow, URLSearchParams, crypto: globalThis.crypto, structuredClone,
  navigator: { clipboard: { writeText: async () => {} } },
});

const controller = module.exports.useMobileController();
await controller.initialize();
assert.deepEqual(Array.from(controller.state.profiles, item => item.id), ['profile-a', 'profile-b'], 'all Supabase profiles remain manageable');
assert.equal(controller.state.connectionStates['profile-b'], 'disabled');
assert.equal(calls.spaces, 0, 'startup does not wait for or enumerate remote Spaces');
assert.equal(controller.state.profiles.some(item => item.id === 'remote-not-a-profile'), false);

await controller.chooseProfile(profileB);
assert.deepEqual(calls.activate, [], 'disabled profiles are not activatable');

const profileC = { ...profileB, id: 'profile-c', name: 'C', enabled: true, supabase: { ...profileB.supabase, space_id: 'space-c' } };
controller.state.profiles.push(profileC);
settings = { ...settings, storage_profiles: [...settings.storage_profiles, profileC] };
controller.state.composer.text = 'must persist before switching';
rejectDraft = true;
await controller.chooseProfile(profileC);
assert.deepEqual(calls.activate, [], 'failed draft persistence blocks activation');
assert.equal(controller.state.activeProfile.id, 'profile-a');

rejectDraft = false;
for (const lock of ['sending', 'selecting']) {
  controller.state.composer[lock] = true;
  await controller.chooseProfile(profileC);
  assert.deepEqual(calls.activate, [], `${lock} blocks backend activation`);
  assert.equal(controller.state.activeProfile.id, 'profile-a');
  assert.match(controller.state.notice, /等待/);
  controller.state.composer[lock] = false;
}
rejectActivation = true;
await controller.chooseProfile(profileC);
rejectActivation = false;
assert.equal(settings.active_storage_profile_id, 'profile-a', 'pre-commit failure preserves persisted A');
assert.equal(controller.state.activeProfile.id, 'profile-a');
assert.equal(controller.state.composer.text, 'must persist before switching');
assert.match(controller.state.error, /activation failure/);
calls.activate.length = 0;
offlinePending = true;
await controller.chooseProfile(profileC);
assert.deepEqual(calls.activate, ['profile-c']);
assert.ok(calls.drafts >= 2);
assert.equal(controller.state.boot, 'ready', 'offline pending does not prevent local-profile activation');
assert.equal(controller.state.syncStatus.pending_count, 2);
offlinePending = false;
rejectCurrentUser = true;
await controller.chooseProfile(profileA);
rejectCurrentUser = false;
assert.equal(settings.active_storage_profile_id, 'profile-a', 'post-commit load error retains committed target A');
assert.equal(controller.state.settings.active_storage_profile_id, 'profile-a');
assert.equal(controller.state.activeProfile.id, 'profile-a');
assert.equal(controller.state.boot, 'error');
assert.equal(controller.state.account, null, 'target error cannot display previous C account');
assert.equal(controller.state.composer.text, '', 'target error cannot display previous C draft');
await controller.chooseProfile(profileC);
assert.equal(controller.state.boot, 'ready');

const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};
const late = deferred();
delayedDiagnostics.set('profile-b', late);
const activationCountBeforeDiagnostics = calls.activate.length;
const businessReadsBeforeDiagnostics = businessReads;
const syncReadsBeforeDiagnostics = syncReads;
const diagnosingRemoved = controller.diagnoseProfile(profileB);
controller.state.profiles = controller.state.profiles.filter(item => item.id !== 'profile-b');
late.resolve({ network: true, auth: true, schema: true, rpc: true, rls: true });
await diagnosingRemoved;
assert.notEqual(controller.state.connectionStates['profile-b'], 'ready', 'late diagnostics cannot revive a removed card');
assert.equal(calls.activate.length, activationCountBeforeDiagnostics, 'diagnostics do not activate the inspected profile');
assert.equal(businessReads, businessReadsBeforeDiagnostics, 'diagnostics do not read the inspected profile business feed');
assert.equal(syncReads, syncReadsBeforeDiagnostics, 'diagnostics do not schedule or inspect business sync state');

// A late check for an edited endpoint cannot classify the replacement target.
const lateEdited = deferred();
delayedDiagnostics.set('profile-c', lateEdited);
const diagnosingEdited = controller.diagnoseProfile(profileC);
const editedProfileC = { ...profileC, supabase: { ...profileC.supabase, api_url: 'https://c-edited.fixture.invalid' } };
controller.state.profiles = controller.state.profiles.map(item => item.id === profileC.id ? editedProfileC : item);
lateEdited.resolve({ network: true, auth: true, schema: true, rpc: true, rls: true });
assert.equal(await diagnosingEdited, false);
assert.notEqual(controller.state.connectionStates['profile-c'], 'ready', 'late diagnostics cannot overwrite an edited target');

const profileD = { ...profileC, id: 'profile-d', name: 'D' };
controller.state.profiles.push(profileD);
delayedDiagnostics.set('profile-d', Promise.reject({ kind: 'session_revoked', message: 'session revoked' }));
assert.equal(await controller.diagnoseProfile(profileD), false);
assert.equal(controller.state.connectionStates['profile-d'], 'signed-out');
const profileE = { ...profileC, id: 'profile-e', name: 'E' };
controller.state.profiles.push(profileE);
delayedDiagnostics.set('profile-e', Promise.reject(new Error('network offline')));
assert.equal(await controller.diagnoseProfile(profileE), false);
assert.equal(controller.state.connectionStates['profile-e'], 'network-error');

// A draft connection has an isolated account/Space context and never replaces active A.
controller.openConnectionWizard();
Object.assign(controller.state.connectionWizard, { apiUrl: 'https://b-new.fixture.invalid', anonKey: 'public-b-new', email: 'b@example.invalid', password: fixturePassword });
assert.equal(await controller.testSetupConnection(), true);
assert.equal(controller.state.connectionWizard.step, 2);
assert.equal(await controller.setupSignIn(), true);
assert.equal(controller.state.connectionWizard.step, 3);
assert.equal(controller.state.connectionWizard.account.userId, 'user-b');
assert.equal(controller.state.account.userId, 'user-profile-c', 'draft B cannot replace active account context');
assert.equal(controller.state.activeProfile.id, 'profile-c');

// Explicit create retries preserve both idempotency identifiers.
Object.assign(controller.state.connectionWizard, { createName: 'Created explicitly', createOpen: true });
assert.equal(await controller.createWizardSpace(), false);
const operationId = controller.state.connectionWizard.createOperationId;
const spaceId = controller.state.connectionWizard.createSpaceId;
assert.ok(operationId && spaceId);
assert.equal(await controller.createWizardSpace(), true);
assert.equal(calls.creates[1].operationId, operationId);
assert.equal(calls.creates[1].spaceId, spaceId);
assert.equal(controller.state.connectionWizard.step, 4);

// Cancellation invalidates the flow before awaiting cleanup.
controller.state.connectionWizard.flowId = 'flow-b';
await controller.cancelConnectionWizard();
assert.deepEqual(calls.cancelledFlows, ['flow-b']);
assert.equal(controller.state.connectionWizard.open, false);
assert.equal(controller.state.activeProfile.id, 'profile-c');

// A cancelled in-flight login cannot repopulate the wizard with a late result.
controller.openConnectionWizard();
Object.assign(controller.state.connectionWizard, { apiUrl: 'https://late.fixture.invalid', anonKey: 'public-late', email: 'late@example.invalid', password: fixturePassword, tested: true, step: 2 });
delayedDraftSignIn = deferred();
const lateSignIn = controller.setupSignIn();
await Promise.resolve();
await controller.cancelConnectionWizard();
delayedDraftSignIn.resolve({ profileId: 'late-flow', signedIn: true, userId: 'late-user', email: 'late@example.invalid' });
assert.equal(await lateSignIn, false);
assert.equal(controller.state.connectionWizard.flowId, '');
assert.equal(controller.state.connectionWizard.account, null);
assert.equal(controller.state.connectionWizard.spaces.length, 0);
assert.equal(controller.state.connectionWizard.open, false);
delayedDraftSignIn = null;
assert.ok(calls.cancelledFlows.includes('late-flow'), 'late login removes its Rust-owned temporary session');

// A configuration-save failure leaves the flow and confirmation draft intact
// so the same operation can be retried. Saving without activation then reads
// authoritative settings while preserving the current profile.
controller.openConnectionWizard();
Object.assign(controller.state.connectionWizard, {
  step: 4, flowId: 'flow-config-retry', apiUrl: 'https://retry.fixture.invalid', anonKey: 'public-retry',
  profileName: 'Retry connection', account: { userId: 'retry-user' },
  spaces: [{ id: 'space-retry', name: 'Retry Space' }], selectedSpaceId: 'space-retry',
});
const settingsReadsBeforeRetry = calls.settingsReads;
rejectBinding = true;
assert.equal(await controller.completeSetup(controller.state.connectionWizard.spaces[0], false), false);
rejectBinding = false;
assert.equal(controller.state.connectionWizard.open, true);
assert.equal(controller.state.connectionWizard.flowId, 'flow-config-retry');
assert.equal(controller.state.connectionWizard.selectedSpaceId, 'space-retry');
assert.match(controller.state.error, /fixture configuration save failure/);
assert.equal(await controller.completeSetup(controller.state.connectionWizard.spaces[0], false), true);
assert.equal(calls.bindings.filter(item => item.flowId === 'flow-config-retry').length, 2);
assert.equal(controller.state.activeProfile.id, 'profile-c', 'save-only keeps the previous active profile');
assert.ok(controller.state.profiles.some(item => item.id === 'saved-space-retry'));
assert.ok(calls.settingsReads > settingsReadsBeforeRetry, 'completion reloads authoritative settings');
assert.match(controller.state.notice, /当前连接未切换/);

// A committed binding remains saved when the optional activation fails. The
// consumed flow is closed and a retry must happen from the saved connection.
controller.openConnectionWizard();
Object.assign(controller.state.connectionWizard, {
  step: 4, flowId: 'flow-save-then-fail', apiUrl: 'https://saved.fixture.invalid', anonKey: 'public-saved',
  profileName: 'Saved connection', account: { userId: 'saved-user' },
  spaces: [{ id: 'space-saved', name: 'Saved Space' }], selectedSpaceId: 'space-saved',
});
rejectActivation = true;
assert.equal(await controller.completeSetup(controller.state.connectionWizard.spaces[0], true), true);
rejectActivation = false;
assert.equal(calls.bindings.filter(item => item.flowId === 'flow-save-then-fail').length, 1);
assert.equal(calls.activate.at(-1), 'saved-space-saved');
assert.equal(controller.state.connectionWizard.open, false);
assert.equal(controller.state.connectionWizard.flowId, '');
assert.ok(controller.state.profiles.some(item => item.id === 'saved-space-saved'), 'saved profile is reloaded from authoritative settings');
assert.equal(controller.state.activeProfile.id, 'profile-c', 'failed activation preserves the previous active profile');
assert.match(controller.state.notice, /已保存，但未切换/);
assert.equal(controller.state.error, '');

// Changing endpoint inputs invalidates every downstream result and cancels the old flow.
controller.openConnectionWizard();
Object.assign(controller.state.connectionWizard, { flowId: 'stale-flow', tested: true, step: 3, account: { userId: 'stale-user' }, spaces: [{ id: 'stale-space' }], selectedSpaceId: 'stale-space' });
controller.resetWizardDownstream();
await new Promise(resolve => setTimeout(resolve, 0));
assert.equal(controller.state.connectionWizard.step, 1);
assert.equal(controller.state.connectionWizard.account, null);
assert.equal(controller.state.connectionWizard.spaces.length, 0);
assert.ok(calls.cancelledFlows.includes('stale-flow'));

// Profile-scoped management never submits a stale whole-settings snapshot.
controller.beginConnectionEdit(profileA);
assert.equal(await controller.renameProfile('A renamed'), true);
assert.equal(calls.saves[0].originalProfileId, 'profile-a');
assert.equal(calls.saves[0].profile.id, 'profile-a');
assert.equal(calls.saves[0].profile.name, 'A renamed');
assert.equal(await controller.logoutProfile(profileA), true);
assert.deepEqual(calls.logouts, ['profile-a']);
assert.equal(controller.state.activeProfile.id, 'profile-c', 'logging out A does not alter active C');
assert.equal(await controller.removeProfile(profileA), true);
assert.equal(JSON.stringify(calls.removes), JSON.stringify([{ profileId: 'profile-a', options: {} }]));
assert.equal(controller.state.activeProfile.id, 'profile-c');

// Recovery states never expose business writes, and a failed connection does
// not have to be repaired before the user selects another saved connection.
const invalidProfile = { ...profileC, id: 'profile-invalid', name: 'Needs repair', supabase: { ...profileC.supabase, space_id: '', binding_state: 'needs_attention' } };
settings = { ...settings, active_storage_profile_id: invalidProfile.id, storage_profiles: [invalidProfile, profileC, webdav] };
await controller.initialize();
assert.equal(controller.state.boot, 'needs-space');
controller.state.composer.text = 'must never be sent from an invalid binding';
assert.equal(await controller.sendDraft(), false);
assert.equal(calls.writes, 0, 'an invalid binding cannot call any send API');
await controller.chooseProfile(profileC);
assert.equal(controller.state.boot, 'ready');
assert.equal(controller.state.activeProfile.id, 'profile-c');
assert.ok(controller.state.profiles.some(item => item.id === invalidProfile.id), 'selecting B does not remove failed A');

signedOutProfiles.add(invalidProfile.id);
settings = { ...settings, active_storage_profile_id: invalidProfile.id, storage_profiles: [{ ...invalidProfile, supabase: { ...invalidProfile.supabase, space_id: 'space-invalid', binding_state: 'bound' } }, profileC, webdav] };
await controller.initialize();
assert.equal(controller.state.boot, 'signed-out');
await controller.chooseProfile(profileC);
assert.equal(controller.state.boot, 'ready');
assert.equal(controller.state.activeProfile.id, 'profile-c');
signedOutProfiles.clear();

rejectSettingsRead = true;
await controller.initialize();
rejectSettingsRead = false;
assert.equal(controller.state.boot, 'error');
assert.match(controller.state.error, /fixture settings unavailable/);
await controller.chooseProfile(profileC);
assert.equal(controller.state.boot, 'ready', 'initialization errors still allow selecting a saved connection');
assert.equal(controller.state.activeProfile.id, 'profile-c');

// Late settings/Auth initialization cannot overwrite the new connection view.
const originalSettingsRead = api.settings.getSettings;
const lateSettings = deferred();
api.settings.getSettings = async () => lateSettings.promise;
const staleInitialization = controller.initialize();
api.settings.getSettings = originalSettingsRead;
await controller.initialize();
lateSettings.resolve({ active_storage_profile_id: 'stale-profile', storage_profiles: [] });
await staleInitialization;
assert.equal(controller.state.activeProfile.id, 'profile-c');
assert.equal(controller.state.boot, 'ready');
const originalUserRead = api.settings.supabaseCurrentUser;
const lateAccount = deferred();
api.settings.supabaseCurrentUser = async () => lateAccount.promise;
const staleAccountInitialization = controller.initialize();
await Promise.resolve();
await Promise.resolve();
api.settings.supabaseCurrentUser = originalUserRead;
await controller.initialize();
lateAccount.resolve({ signedIn: true, userId: 'stale-user' });
await staleAccountInitialization;
assert.equal(controller.state.account.userId, 'user-profile-c');
assert.equal(controller.state.boot, 'ready');
const lateLogin = deferred();
let loginTarget;
api.settings.supabaseSignIn = async (input) => { loginTarget = input.profileId; return lateLogin.promise; };
const oldLogin = controller.signIn();
await controller.initialize();
lateLogin.resolve({ signedIn: true, userId: 'old-login-user' });
await oldLogin;
assert.equal(loginTarget, 'profile-c', 'login captured the original profile target');
assert.equal(controller.state.account.userId, 'user-profile-c');
assert.equal(controller.state.login.sending, false);

// Read-only marked/tag and draft results carry the same connection generation.
const originalMarkedRead = api.marked.getMarkedMessages;
const lateMarks = deferred();
api.marked.getMarkedMessages = async () => lateMarks.promise;
const staleMarks = controller.refreshAfterForeground();
api.marked.getMarkedMessages = originalMarkedRead;
await controller.initialize();
lateMarks.resolve({ messages: [{ filename: 'old-mark', marked: true }], total: 1 });
await staleMarks;
assert.equal(controller.state.markedMessages.length, 0);
const originalTagsRead = api.marked.listMarkedTags;
const lateTags = deferred();
api.marked.listMarkedTags = async () => lateTags.promise;
const staleTags = controller.refreshAfterForeground();
for (let step = 0; step < 8; step += 1) await Promise.resolve();
api.marked.listMarkedTags = originalTagsRead;
await controller.initialize();
lateTags.resolve([{ id: 'old-tag', name: 'Old private tag' }]);
await staleTags;
assert.equal(controller.state.tags.length, 0);
const originalDraftRead = api.mobileDraft.get;
const lateDraft = deferred();
api.mobileDraft.get = async () => lateDraft.promise;
const staleDraftInitialization = controller.initialize();
for (let step = 0; step < 8; step += 1) await Promise.resolve();
api.mobileDraft.get = originalDraftRead;
await controller.initialize();
lateDraft.resolve({ text: 'old private draft', attachments: [{ path: '/old/private.pdf' }], updatedAtMs: 1 });
await staleDraftInitialization;
assert.equal(controller.state.composer.text, '');
assert.equal(controller.state.composer.attachments.length, 0);
const originalDraftSave = api.mobileDraft.save;
const lateDraftSave = deferred();
let capturedDraftScope;
api.mobileDraft.save = async (payload, scope) => { capturedDraftScope = scope; return lateDraftSave.promise; };
controller.state.composer.text = 'old saved draft';
const staleSavingDraft = controller.persistComposerDraft(true);
await Promise.resolve();
await controller.initialize();
lateDraftSave.resolve({ updatedAtMs: 123 });
assert.equal(await staleSavingDraft, false);
assert.equal(capturedDraftScope.profileId, 'profile-c');
assert.equal(capturedDraftScope.userId, 'user-profile-c');
assert.equal(capturedDraftScope.spaceId, 'space-c');
assert.equal(controller.state.composer.text, '');
assert.notEqual(controller.state.composer.draftUpdatedAt, 123);
api.mobileDraft.save = originalDraftSave;

// Realtime is a hint to read scoped state, never a source of old business rows.
const listeners = new Map();
api.event = { listen: async (name, callback) => { listeners.set(name, callback); return () => listeners.delete(name); } };
const removeListeners = await controller.installTransferListeners();
const originalMessageRead = api.message.listWindow;
const lateRealtimeRows = deferred();
api.message.listWindow = async () => lateRealtimeRows.promise;
const staleRealtime = listeners.get('supabase-realtime-synced')();
for (let step = 0; step < 8; step += 1) await Promise.resolve();
api.message.listWindow = originalMessageRead;
signedOutProfiles.add('profile-c');
await controller.initialize();
lateRealtimeRows.resolve({ messages: [{ filename: 'old-private-realtime', kind: 'text', content: 'old' }] });
await staleRealtime;
assert.equal(controller.state.boot, 'signed-out');
assert.equal(controller.state.messages.length, 0);
assert.equal(controller.state.error, '');
removeListeners();
signedOutProfiles.clear();
await controller.initialize();

await controller.deactivateComposerPersistence();
console.log('mobile storage connections passed: local profiles, recovery selection, invalid-binding write guard and safe activation');
