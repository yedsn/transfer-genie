import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { computed, reactive, ref, shallowRef } from 'vue';

function store() {
  const storage = new Map();
  const context = { exports: {}, window: { setInterval() {}, clearInterval() {} }, localStorage: {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
  }, require: () => ({ computed, reactive, ref, shallowRef }) };
  const source = fs.readFileSync(new URL('../src-ui/src/plugins/plugin-store.ts', import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } });
  vm.runInNewContext(compiled.outputText, context);
  context.exports.testWindow = context.window;
  return context.exports;
}

test('remote directory failure retains cached bots and clears after recovery', async () => {
  const api = store();
  let offline = false;
  api.testWindow.__TAURI__ = { core: { invoke: async command => {
    if (command === 'get_bot_scope') return 'shared-space';
    if (command === 'get_plugin_market') return '';
    if (command === 'list_bot_instances') {
      if (offline) throw new Error('Supabase 缺少机器人目录表，请执行 004_bot_plugin_records.sql');
      return [{instance_id:'remote-mac',name:'图片下载',device_name:'Mac'}];
    }
    return [];
  } } };
  await api.resolvePluginScope('profile');
  await api.refreshPlugins();
  offline = true;
  await api.refreshPlugins();
  assert.equal(api.pluginState.bots[0].instance_id, 'remote-mac');
  assert.match(api.pluginState.directoryError, /目录读取失败/);
  assert.match(api.pluginState.directoryError, /004_bot_plugin_records.sql/);
  offline = false;
  await api.refreshPlugins();
  assert.equal(api.pluginState.directoryError, '');
});

test('composer tabs retain independent references and bot targets', () => {
  const api=store();
  api.setPluginScope('space'); api.setComposerDraft('one');
  api.addReferences([{filename:'one.png'}]); api.selectBot('pc');
  api.setComposerDraft('two');
  assert.equal(api.pluginState.references.length,0);
  assert.equal(api.pluginState.target,'');
  api.addReferences([{filename:'two.png'}]);
  api.setComposerDraft('one');
  assert.equal(api.pluginState.references[0].filename,'one.png');
  assert.equal(api.pluginState.target,'pc');
});
test('download route stays on its draft and preserves other occurrences of the mention', () => {
  const api = store();
  api.setPluginScope('space');
  api.setComposerDraft('one');
  api.pluginState.bots = [{ instance_id: 'pc', download_options: { default_route: 'direct', profiles: [] } }];
  const label = '@下载机器人（PC）';
  const text = '🙂 ' + label + '\n' + label + ' 保留这段话';
  api.selectBot('pc', label, 1);
  api.selectDownloadRoute('company');
  api.setComposerDraft('two');
  assert.equal(api.getCallContext().targetBotInstanceId, null);
  api.setComposerDraft('one');
  const sent = api.getCallContext(text);
  assert.equal(sent.downloadRoute, 'company');
  assert.equal(sent.mentionStart, text.lastIndexOf(label));
  api.clearCallContext(sent, 'space');
  api.selectBot('pc', label);
  assert.equal(api.getCallContext(label).downloadRoute, 'default');
});
test('references are deduplicated, ordered and isolated between spaces', () => {
  const api = store();
  api.setPluginScope('one');
  api.addReferences([{ filename: 'b', timestamp_ms: 2 }, { filename: 'a', timestamp_ms: 1 }, { filename: 'a', timestamp_ms: 1 }]);
  assert.deepEqual(Array.from(api.pluginState.references, row => row.filename), ['a', 'b']);
  api.selectBot('pc-bot');
  api.setPluginScope('two');
  assert.equal(api.pluginState.references.length, 0);
  assert.equal(api.pluginState.target, '');
  api.setPluginScope('one');
  assert.equal(api.pluginState.references.length, 2);
  assert.equal(api.pluginState.target, 'pc-bot');
});

test('send completion preserves edits and drafts in another space', () => {
  const api = store();
  api.setPluginScope('one');
  api.addReferences([{ filename: 'a' }]);
  const sent = api.getCallContext();
  api.addReferences([{ filename: 'b' }]);
  api.clearCallContext(sent, 'one');
  assert.equal(api.pluginState.references.length, 2);
  api.setPluginScope('two');
  api.addReferences([{ filename: 'c' }]);
  api.clearCallContext(sent, 'one');
  assert.equal(api.pluginState.references[0].filename, 'c');
  api.clearCallContext(api.getCallContext(), 'two');
  assert.equal(api.pluginState.references.length, 0);
});

test('reference count is bounded at fifty', () => {
  const api = store();
  api.setPluginScope('one');
  api.addReferences(Array.from({ length: 60 }, (_, index) => ({ filename: String(index), timestamp_ms: index })));
  assert.equal(api.pluginState.references.length, 50);
});

test('mobile message fields retain reference identity and preview text', () => {
  const api = store();
  api.setPluginScope('mobile');
  api.addReferences([{ filename: 'text', messageId: 'id', timestampMs: 7, originalName: 'message.txt', kind: 'text', body: 'original text' }, {}]);
  assert.equal(api.pluginState.references.length, 1);
  const reference = api.pluginState.references[0];
  assert.equal(reference.message_id, 'id');
  assert.equal(reference.timestamp_ms, 7);
  assert.equal(reference.content, 'original text');
  assert.equal(reference.original_name, 'message.txt');
});

test('switching accounts in one profile restores separate drafts', async () => {
  const api = store();
  let owner = 'account-a';
  api.testWindow.__TAURI__ = { core: { invoke: async command => command === 'get_bot_scope' ? owner : command === 'get_plugin_market' ? '' : [] } };
  await api.resolvePluginScope('same-profile');
  api.addReferences([{ filename: 'private-a' }]);
  owner = 'account-b';
  await api.resolvePluginScope('same-profile');
  assert.equal(api.pluginState.references.length, 0);
  api.addReferences([{ filename: 'private-b' }]);
  owner = 'account-a';
  await api.resolvePluginScope('same-profile');
  assert.equal(api.pluginState.references[0].filename, 'private-a');
});
