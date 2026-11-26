import { reactive } from 'vue';

export const pluginState = reactive({ plugins: [] as any[], modules: [] as any[], bots: [] as any[], tasks: [] as any[], events: [] as any[], contexts: [] as any[], market: [] as any[], marketUrl: '', directoryError: '', error: '', busy: false, references: [] as any[], target: '', mentionText: '', scope: '' });
const invoke = (name: string, args?: any) => { const t = (window as any).__TAURI__; return (t?.core?.invoke || t?.invoke)(name, args); };
let scopeGeneration = 0;
let requestedProfile = '';
let composerDraft = '';
function draftKey() { return 'tg-plugin-draft:' + pluginState.scope + (composerDraft ? ':draft:' + composerDraft : ''); }
function restoreDraft() {
  pluginState.references=[]; pluginState.target=''; pluginState.mentionText='';
  if (!pluginState.scope) return;
  try { const draft=JSON.parse(localStorage.getItem(draftKey()) || '{}'); pluginState.references=draft.references || []; pluginState.target=draft.target || ''; pluginState.mentionText=draft.mentionText || ''; } catch {}
}
export function setComposerDraft(id:string) {
  if (composerDraft === id) return;
  saveDraft(); composerDraft=id; restoreDraft();
}
export async function resolvePluginScope(profile: string) {
  const generation = ++scopeGeneration;
  if (requestedProfile !== profile) { requestedProfile = profile; setPluginScope(''); }
  try {
    const resolved = await invoke('get_bot_scope');
    if (generation === scopeGeneration) {
      const nextScope = typeof resolved === 'string' ? resolved : '';
      const changed = pluginState.scope !== nextScope;
      setPluginScope(nextScope);
      if (changed && nextScope) void refreshPlugins().catch(error => { pluginState.error = String(error); });
    }
  } catch { if (generation === scopeGeneration) setPluginScope(''); }
}
function saveDraft() { if (!pluginState.scope) return; localStorage.setItem(draftKey(), JSON.stringify({ references: pluginState.references, target: pluginState.target, mentionText:pluginState.mentionText })); }
export function setPluginScope(value: string) {
  if (value === pluginState.scope) return;
  saveDraft(); pluginState.scope = value; pluginState.references = []; pluginState.target = '';
  pluginState.directoryError = '';
  pluginState.mentionText=''; pluginState.bots = []; pluginState.tasks = []; pluginState.events = []; pluginState.contexts = [];
  restoreDraft();
}
export function addReferences(messages: any[]) {
  for (const message of messages) {
    const m = message.message || message;
    if (!m.filename) continue;
    if (!pluginState.references.some(r => r.filename === m.filename)) pluginState.references.push({ filename: m.filename, message_id: m.message_id || m.messageId || null, sender: m.sender || '', timestamp_ms: m.timestamp_ms || m.timestampMs || 0, kind: m.kind || (m.isFile ? 'file' : 'text'), original_name: m.original_name || m.originalName || m.title || '', content: m.content || m.body || null, file_hash: m.file_hash || null, size: m.size || 0 });
  }
  pluginState.references = pluginState.references.sort((a,b) => a.timestamp_ms - b.timestamp_ms || a.filename.localeCompare(b.filename)).slice(0,50); saveDraft();
}
export function removeReference(filename: string) { pluginState.references = pluginState.references.filter(r => r.filename !== filename); saveDraft(); }
export function clearReferences() { pluginState.references=[]; saveDraft(); }
export function selectBot(id: string, mentionText?:string) { pluginState.target = id; const bot=pluginState.bots.find(bot=>bot.instance_id===id); pluginState.mentionText=id ? (mentionText || (bot ? '@'+bot.name+'（'+bot.device_name+'）' : '')) : ''; saveDraft(); }
export function getCallContext() { return { references: JSON.parse(JSON.stringify(pluginState.references)), targetBotInstanceId: pluginState.target || null }; }
export function clearCallContext(sent?: ReturnType<typeof getCallContext>, sentScope?: string) {
  if (sent && (sentScope !== pluginState.scope || JSON.stringify(sent) !== JSON.stringify(getCallContext()))) return;
  pluginState.references = []; pluginState.target = ''; pluginState.mentionText=''; saveDraft();
}
export function getDraftIdentity() { return composerDraft; }
export async function refreshPlugins() {
  await resolvePluginScope(requestedProfile);
  const requestScope = pluginState.scope;
  const results = await Promise.allSettled([invoke('list_plugins'), invoke('list_bot_instances'), invoke('list_bot_events'), invoke('get_message_contexts'), invoke('get_plugin_market'), invoke('list_bot_tasks'), invoke('list_integration_modules')]);
  if (pluginState.scope !== requestScope) return;
  if (results[0].status === 'fulfilled') {
    const existing = new Map(pluginState.plugins.map(plugin => [plugin.manifest.id, plugin]));
    pluginState.plugins = results[0].value.map((plugin:any) => {
      const previous = existing.get(plugin.manifest.id);
      if (previous && JSON.stringify(previous.config) !== previous.savedConfig) {
        return {...plugin,config:previous.config,savedConfig:previous.savedConfig};
      }
      return {...plugin,savedConfig:JSON.stringify(plugin.config)};
    });
  }
  if (results[1].status === 'fulfilled') { pluginState.bots = results[1].value; pluginState.directoryError = ''; }
  else {
    const reason = results[1].reason;
    const message = typeof reason === 'string' ? reason : reason?.message;
    pluginState.directoryError = '机器人目录读取失败：' + (message || '请检查当前空间连接后重试。');
  }
  if (results[2].status === 'fulfilled') pluginState.events = results[2].value;
  if (results[3].status === 'fulfilled') pluginState.contexts = results[3].value;
  if (results[4].status === 'fulfilled') pluginState.marketUrl = results[4].value;
  if (results[5].status === 'fulfilled') pluginState.tasks = results[5].value;
  if (results[6].status === 'fulfilled') pluginState.modules = Array.isArray(results[6].value) ? results[6].value : [];
}
export async function pluginAction(name: string, args?: any) {
  pluginState.busy = true; pluginState.error = '';
  try { const result = await invoke(name, args);
    if (name === 'configure_plugin') {
      const plugin = pluginState.plugins.find(plugin => plugin.manifest.id === args?.id);
      if (plugin) plugin.savedConfig = JSON.stringify(args.config);
    }
    await refreshPlugins(); return result; } catch(e) { pluginState.error = String(e); throw e; } finally { pluginState.busy = false; }
}
(window as any).transferGeniePlugins = { state: pluginState, addReferences, getCallContext, clearCallContext, setScope: resolvePluginScope, setComposerDraft, getDraftIdentity };
window.setInterval(() => { if ((window as any).__TAURI__) void refreshPlugins(); }, 15000);
