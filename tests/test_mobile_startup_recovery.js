import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import ts from 'typescript';

const source = fs.readFileSync(new URL('../src-ui/src/mobile/mobile-controller.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
const profile = id => ({ id, name: id, provider_kind: 'supabase', enabled: true, supabase: { space_id: id, binding_state: 'bound' } });

function fixture() {
  let now = 1000;
  let timerId = 0;
  const timers = new Map();
  const settings = { active_storage_profile_id: 'a', storage_profiles: [profile('a'), profile('b')] };
  const calls = [];
  const api = {
    settings: {
      getSettings: async () => structuredClone(settings),
      supabaseCurrentUser: async (id, startup) => { calls.push(['account', id, startup]); return { signedIn: true, userId: id }; },
      activateStorageProfile: async id => { settings.active_storage_profile_id = id; return structuredClone(settings); },
    },
    mobileDraft: { get: async () => ({ text: '', attachments: [] }) },
    message: { listWindow: async () => ({ messages: [] }) },
    marked: { getMarkedMessages: async () => ({ messages: [] }), listMarkedTags: async () => [] },
    sync: { getSyncStatus: async () => ({ pending_count: 2 }), listPendingOperations: async () => [], listConflicts: async () => [] },
    transfer: { listDownloadHistory: async () => ({ records: [] }) },
    mobileCache: { getSummary: async () => ({}) },
    app: { getAppVersion: async () => 'fixture' },
  };
  const module = { exports: {} };
  class Clock extends Date { static now() { return now; } }
  vm.runInNewContext(compiled, { module, exports: module.exports, require: createRequire(import.meta.url),
    window: { location: { search: '' }, transferGenieApi: api, setTimeout: (fn, delay) => { const id = ++timerId; timers.set(id, { fn, at: now + delay }); return id; }, clearTimeout: id => timers.delete(id) },
    URLSearchParams, crypto, structuredClone, Date: Clock, navigator: {},
  });
  const controller = module.exports.useMobileController();
  return { controller, api, calls, settings, timers, advance: async (ms, suspended = false) => { now += ms; if (!suspended) for (const [id, timer] of [...timers]) if (timer.at <= now) { timers.delete(id); timer.fn(); } await flush(); } };
}

for (const stage of ['settings', 'account', 'draft']) {
  const f = fixture();
  const pending = deferred();
  if (stage === 'settings') f.api.settings.getSettings = () => pending.promise;
  if (stage === 'account') f.api.settings.supabaseCurrentUser = () => pending.promise;
  if (stage === 'draft') f.api.mobileDraft.get = () => pending.promise;
  const boot = f.controller.initialize();
  await flush();
  await f.advance(9999);
  assert.equal(f.controller.state.boot, 'loading');
  await f.advance(1);
  await boot;
  assert.equal(f.controller.state.boot, 'error', stage);
  assert.match(f.controller.state.error, stage === 'settings' ? /本地配置读取超时/ : /连接超时/);
  pending.resolve(stage === 'settings' ? f.settings : stage === 'account' ? { signedIn: true, userId: 'old' } : { text: 'old draft' });
  await flush();
  assert.equal(f.controller.state.boot, 'error');
  assert.equal(f.controller.state.composer.text, '');
  assert.equal(f.controller.state.composer.persistenceReady, false);
}

for (const outcome of ['resolve', 'reject']) {
  const f = fixture();
  const old = deferred();
  const normal = f.api.settings.supabaseCurrentUser;
  f.api.settings.supabaseCurrentUser = id => id === 'a' ? old.promise : normal(id, true);
  const boot = f.controller.initialize();
  await flush();
  f.controller.leaveStartup();
  await boot;
  assert.equal(f.controller.state.boot, 'choose-profile');
  await f.controller.chooseProfile(profile('b'));
  assert.equal(f.controller.state.boot, 'ready');
  old[outcome](outcome === 'resolve' ? { signedIn: true, userId: 'a' } : new Error('old failure'));
  await flush();
  await f.advance(20000);
  assert.equal(f.controller.state.boot, 'ready');
  assert.equal(f.controller.state.account.userId, 'b');
  assert.equal(f.controller.state.syncStatus.pending_count, 2);
  assert.equal(f.settings.storage_profiles.length, 2);
}

{
  const f = fixture();
  const old = deferred();
  const normal = f.api.settings.supabaseCurrentUser;
  f.api.settings.supabaseCurrentUser = () => old.promise;
  const boot = f.controller.initialize();
  await flush();
  await f.advance(11000, true);
  assert.equal(f.controller.state.boot, 'loading');
  await f.controller.refreshAfterForeground();
  await boot;
  assert.equal(f.controller.state.boot, 'error');
  f.api.settings.supabaseCurrentUser = normal;
  await f.controller.initialize();
  old.reject(new Error('late secret'));
  await flush();
  await f.advance(10000);
  assert.equal(f.controller.state.boot, 'ready');
  assert.equal(f.controller.state.error, '');
  assert.equal(f.calls.at(-1)[2], true, 'startup opts into bounded native auth');
}

for (const kind of ['network', 'service', 'session_revoked']) {
  const f = fixture();
  f.api.settings.supabaseCurrentUser = async () => { throw { kind, message: 'https://secret:password@fixture.invalid?token=secret' }; };
  await f.controller.initialize();
  assert.equal(f.controller.state.boot, kind === 'session_revoked' ? 'signed-out' : 'error');
  assert.doesNotMatch(f.controller.state.error, /secret|password|token/);
  assert.equal(f.timers.size, 0);
}
{
  const f = fixture();
  f.api.settings.getSettings = async () => { throw new Error('settings failed'); };
  await f.controller.initialize();
  assert.equal(f.controller.state.startupTitle, '本地配置读取失败');
  assert.equal(f.controller.state.profiles.length, 0);
}
console.log('mobile startup recovery: timeout, foreground, switching, late results, retry and error classification passed');
