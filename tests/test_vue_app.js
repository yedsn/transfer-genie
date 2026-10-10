import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

globalThis.window = globalThis;

const sourcePath = new URL('../src-ui/src/store.ts', import.meta.url);
let source = await readFile(sourcePath, 'utf8');
source = source
  .replace(/import \{ reactive \} from ["']vue["'];?/, 'const reactive = (value) => value;')
  .replace(/import type .*?;\s*/g, '');
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2020,
    module: ts.ModuleKind.ES2020,
  },
  fileName: 'store.ts',
}).outputText;
const storeModule = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);

storeModule.installTransferGenieBridge();
const bridge = globalThis.transferGenieVue;
assert.ok(bridge?.isEnabled, 'Vue 3 bridge is installed');

bridge.syncAppVersion('1.2.3');
assert.equal(bridge.store.appVersion, '1.2.3');

bridge.syncActiveTab('downloads');
assert.equal(bridge.store.activeTab, 'downloads');
bridge.syncActiveTab('invalid-tab');
assert.equal(bridge.store.activeTab, 'home', 'invalid tabs fall back to home');

const settings = { senderName: 'alice', nested: { enabled: true } };
bridge.syncSettings(settings);
settings.nested.enabled = false;
assert.equal(bridge.store.settings.nested.enabled, true, 'settings are cloned before entering reactive state');
assert.ok(Number.isFinite(bridge.store.lastSettingsSavedAt));

bridge.syncHomeFeed({ searchQuery: 'video', messageCards: [{ filename: 'clip.mp4' }] });
assert.equal(bridge.store.homeFeed.searchQuery, 'video');
assert.equal(bridge.store.homeFeed.messageCards[0].filename, 'clip.mp4');
assert.equal(bridge.store.homeFeed.visibleCount, 0, 'partial sync preserves existing fields');

bridge.syncTransferTasks({
  currentView: 'downloads',
  downloadPage: 2,
  downloadTotalPages: 4,
  downloadTasks: [{ key: 'download-1' }],
});
assert.equal(bridge.store.transferTasks.downloadPage, 2);
assert.equal(bridge.store.transferTasks.downloadTasks[0].key, 'download-1');

bridge.syncSettingsForm({ senderName: 'alice', localHttpApiEnabled: true });
assert.equal(bridge.store.settingsForm.senderName, 'alice');
assert.equal(bridge.store.settingsForm.localHttpApiEnabled, true);
assert.equal(bridge.store.settingsForm.refreshIntervalSecs, 5, 'partial form sync preserves defaults');

const calls = [];
bridge.setActions({
  openMessagePreview(message) { calls.push(['preview', message.filename]); return 'opened'; },
  updateSettingsFormField(field, value) { calls.push(['field', field, value]); },
});
assert.equal(bridge.callAction('openMessagePreview', { filename: 'clip.mp4' }), 'opened');
bridge.callAction('updateSettingsFormField', 'senderName', 'bob');
assert.equal(bridge.callAction('missingAction'), undefined);
assert.deepEqual(calls, [
  ['preview', 'clip.mp4'],
  ['field', 'senderName', 'bob'],
]);

let legacyActivation = null;
globalThis.transferGenieLegacySetActiveTab = (tab, options) => { legacyActivation = { tab, options }; };
bridge.activateTab('settings');
assert.equal(bridge.store.activeTab, 'settings');
assert.deepEqual(legacyActivation, {
  tab: 'settings',
  options: { scrollToBottom: false, focusInput: false },
});

console.log('Vue 3 store bridge tests passed');
