import { computed, reactive, ref, shallowRef } from 'vue';

export const pluginState = reactive({ plugins: [] as any[], modules: [] as any[], bots: [] as any[], tasks: [] as any[], events: [] as any[], contexts: [] as any[], market: [] as any[], marketUrl: '', directoryError: '', error: '', busy: false, references: [] as any[], target: '', mentionText: '', scope: '' });
export const downloadDraft = reactive({ route: 'default', enabled: false, ordinal: 0 });
const invoke = (name: string, args?: any) => { const t = (window as any).__TAURI__; return (t?.core?.invoke || t?.invoke)(name, args); };
let scopeGeneration = 0;
let requestedProfile = '';
let composerDraft = '';
const immediateCalls = reactive<Record<string, { target: string; created: number }>>({});
export const legacyFeedbackTargets = shallowRef<{ filename: string; target: HTMLElement }[]>([]);
const feedbackTime = ref(Date.now());
let feedbackTimer: number | undefined;
let feedbackRequest = 0;

export function noteBotCall(filename: string, target: string | null, scope = pluginState.scope) {
  if (!filename || !target || scope !== pluginState.scope) return;
  immediateCalls[filename] = { target, created: Date.now() };
  feedbackTime.value = Date.now();
  void refreshBotChat().catch(() => {});
}

export const feedbackByMessage = computed(() => {
  const byMessage = new Map<string, any[]>();
  for (const task of pluginState.tasks) {
    if (!task.message_filename) continue;
    const list = byMessage.get(task.message_filename) ?? [];
    list.push(task);
    byMessage.set(task.message_filename, list);
  }
  for (const [filename, call] of Object.entries(immediateCalls)) {
    if (!byMessage.has(filename)) byMessage.set(filename, [{
      task_id: filename, message_filename: filename, target_instance_id: call.target,
      created_at_ms: call.created, status: 'waiting_device', pending_delivery: true,
    }]);
  }
  return byMessage;
});
export const botReplies = computed(() => new Map<string, { filename: string; text?: string }>(pluginState.contexts
  .filter(context => context.task_id && !context.target_bot_instance_id && context.filename)
  .map(context => [context.task_id, context])));
const eventsByTask = computed(() => {
  const map = new Map<string, any[]>();
  for (const event of pluginState.events) {
    const list = map.get(event.task_id) ?? [];
    list.push(event);
    map.set(event.task_id, list);
  }
  return map;
});
export function botFeedback(task: any) {
  const bot = pluginState.bots.find(bot => bot.instance_id === task.target_instance_id);
  const context = pluginState.contexts.find(context => context.filename === task.message_filename);
  const name = bot?.name || context?.bot_name || '机器人';
  const device = bot?.device_name || context?.bot_device_name;
  const events = eventsByTask.value.get(task.task_id) ?? [];
  const latest = events.filter(event => event.kind === task.status)
    .reduce((newest, event) => !newest || event.timestamp_ms >= newest.timestamp_ms ? event : newest, undefined);
  let status: string = task.status;
  if (status === 'waiting_device' && task.expires_at_ms && feedbackTime.value >= task.expires_at_ms) status = 'expired';
  let title: string;
  let detail = '';
  const transfers: { id: string; name: string; received: number; total: number | null; speed: number | null }[] = [];
  const expiry = bot?.expires_at_ms ?? context?.bot_expires_at_ms;
  if (status === 'waiting_device') {
    if (expiry && expiry <= feedbackTime.value) {
      title = '目标设备离线';
      detail = task.pending_delivery ? '任务已保存在本机，连接恢复后会继续投递。' : '任务已排队，设备上线后可继续处理。';
    } else if (task.pending_delivery) {
      const delayed = feedbackTime.value - task.created_at_ms >= 8_000;
      title = delayed ? '投递暂未确认' : '正在投递';
      detail = delayed ? '任务已保存到本机，尚未同步。应用会继续重试。' : '任务已保存到本机，正在同步到当前空间。';
    } else {
      title = feedbackTime.value - task.created_at_ms >= 8_000 ? '机器人暂未响应' : '等待机器人接单';
      detail = '任务已投递，目标设备尚未确认接单。';
    }
  } else if (['running', 'progress', 'queued'].includes(status)) {
    title = '正在处理';
    const finished = new Set(events.map(event => event.payload?.item?.item_id).filter(Boolean));
    detail = finished.size ? '已处理 ' + finished.size + ' 项' : '机器人已接单。';
    const samples = new Map<string, any>();
    for (const event of events) {
      const item = event.payload?.transfer_item;
      if (!item?.item_id || finished.has(item.item_id)) continue;
      const previous = samples.get(item.item_id);
      if (!previous || event.timestamp_ms > previous.timestamp_ms ||
        (event.timestamp_ms === previous.timestamp_ms && item.status === 'preparing')) {
        samples.set(item.item_id, event);
      }
    }
    for (const [id, event] of samples) {
      const item = event.payload.transfer_item;
      const sample = item.transfer;
      if (item.status !== 'downloading' || !Number.isSafeInteger(sample?.received_bytes) || sample.received_bytes < 0) continue;
      transfers.push({
        id, name: item.name || '文件', received: sample.received_bytes,
        total: Number.isSafeInteger(sample.total_bytes) && sample.total_bytes > 0 ? sample.total_bytes : null,
        speed: feedbackTime.value - event.timestamp_ms <= 12_000 && Number.isSafeInteger(sample.bytes_per_second) && sample.bytes_per_second >= 0 ? sample.bytes_per_second : null,
      });
    }
  } else {
    title = ({ succeeded:'处理完成', partial_failed:'部分处理失败', failed:'处理失败', cancelled:'任务已取消', expired:'任务已过期', interrupted:'任务中断', cancel_requested:'正在取消' } as Record<string,string>)[status] || '等待机器人接单';
    detail = botReplies.value.get(task.task_id)?.text || latest?.payload?.error || (status === 'expired' ? '设备未在有效期内处理此任务。' : '');
  }
  return { name, device, title, detail, status, transfers, download: !!bot?.download_options || context?.bot_target_icon === 'download' };
}

export async function refreshBotChat() {
  const scope = pluginState.scope;
  const request = ++feedbackRequest;
  const result = await Promise.allSettled([invoke('list_bot_tasks'), invoke('list_bot_events'), invoke('get_message_contexts')]);
  if (scope !== pluginState.scope || request !== feedbackRequest) return;
  if (result[0].status === 'fulfilled' && Array.isArray(result[0].value)) {
    pluginState.tasks = result[0].value;
    for (const task of pluginState.tasks) delete immediateCalls[task.message_filename];
  }
  if (result[1].status === 'fulfilled' && Array.isArray(result[1].value)) pluginState.events = result[1].value;
  if (result[2].status === 'fulfilled' && Array.isArray(result[2].value)) pluginState.contexts = result[2].value;
  feedbackTime.value = Date.now();
  const awaiting = pluginState.tasks.some(task => ['waiting_device', 'progress'].includes(task.status)) || Object.keys(immediateCalls).length > 0;
  if (awaiting && feedbackTimer === undefined) {
    feedbackTimer = window.setInterval(() => { feedbackTime.value = Date.now(); }, 1000);
  } else if (!awaiting && feedbackTimer !== undefined) {
    window.clearInterval(feedbackTimer);
    feedbackTimer = undefined;
  }
}

export function listenBotChat(onMessagesChanged: () => void): Promise<() => void> | undefined {
  return (window as any).__TAURI__?.event?.listen('bot-chat-updated', ({ payload }: any) => {
    if (!payload || payload.scope !== pluginState.scope) return;
    void refreshBotChat().catch(() => {}).then(() => {
      if (payload.messagesChanged && payload.scope === pluginState.scope) onMessagesChanged();
    });
  });
}
function draftKey() { return 'tg-plugin-draft:' + pluginState.scope + (composerDraft ? ':draft:' + composerDraft : ''); }
function restoreDraft() {
  Object.assign(downloadDraft, { route: 'default', enabled: false, ordinal: 0 });
  pluginState.references=[]; pluginState.target=''; pluginState.mentionText='';
  if (!pluginState.scope) return;
  try { const draft=JSON.parse(localStorage.getItem(draftKey()) || '{}'); pluginState.references=draft.references || []; pluginState.target=draft.target || ''; pluginState.mentionText=draft.mentionText || ''; if (draft.download) Object.assign(downloadDraft, draft.download); } catch {}
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
function saveDraft() { if (!pluginState.scope) return; localStorage.setItem(draftKey(), JSON.stringify({ references: pluginState.references, target: pluginState.target, mentionText:pluginState.mentionText, download:downloadDraft })); }
export function setPluginScope(value: string) {
  if (value === pluginState.scope) return;
  saveDraft(); pluginState.scope = value; pluginState.references = []; pluginState.target = '';
  pluginState.directoryError = '';
  pluginState.mentionText=''; pluginState.bots = []; pluginState.tasks = []; pluginState.events = []; pluginState.contexts = [];
  for (const filename of Object.keys(immediateCalls)) delete immediateCalls[filename];
  if (feedbackTimer !== undefined) window.clearInterval(feedbackTimer);
  feedbackTimer = undefined;
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
export function selectBot(id: string, mentionText?: string, ordinal = 0) {
  pluginState.target = id;
  const bot = pluginState.bots.find(bot => bot.instance_id === id);
  pluginState.mentionText = id ? (mentionText || (bot ? '@'+bot.name+'（'+bot.device_name+'）' : '')) : '';
  Object.assign(downloadDraft, { route: 'default', enabled: !!bot?.download_options, ordinal });
  saveDraft();
}
export function selectDownloadRoute(route: string) { downloadDraft.route = route; saveDraft(); }

export function mentionOffset(text: string, label = pluginState.mentionText) {
  if (!label) return -1;
  let index = -label.length;
  for (let i = 0; i <= downloadDraft.ordinal; i++) {
    index = text.indexOf(label, index + label.length);
    if (index < 0) break;
  }
  return index;
}
type CallContext = { references: any[]; targetBotInstanceId: string | null; downloadRoute?: string; mentionText?: string; mentionStart?: number };
export function getCallContext(text?: string): CallContext {
  const context = { references: JSON.parse(JSON.stringify(pluginState.references)), targetBotInstanceId: pluginState.target || null };
  if (!context.targetBotInstanceId || !downloadDraft.enabled) return context;
  const mentionText = pluginState.mentionText;
  let serializedMention = mentionText;
  let mentionStart = text === undefined ? -1 : mentionOffset(text);
  // Markdown serializers may escape punctuation within device names.
  if (text !== undefined && mentionStart < 0) {
    serializedMention = mentionText.replace(/[\\`*_{}\[\]()<>#+\-.!|]/g, '\\$&');
    mentionStart = mentionOffset(text, serializedMention);
  }
  if (text !== undefined && mentionStart < 0) throw new Error('下载机器人提及已变化，请重新选择');
  return { ...context, downloadRoute: downloadDraft.route, mentionText: serializedMention, mentionStart };
}
export function clearCallContext(sent?: ReturnType<typeof getCallContext>, sentScope?: string) {
  const current = getCallContext();
  if (sent && (sentScope !== pluginState.scope || sent.targetBotInstanceId !== current.targetBotInstanceId || sent.downloadRoute !== current.downloadRoute || JSON.stringify(sent.references) !== JSON.stringify(current.references))) return;
  pluginState.references = []; selectBot('');
}
export function getDraftIdentity() { return composerDraft; }
export async function refreshMessageContexts() {
  await refreshBotChat();
}
export async function refreshPlugins() {
  await resolvePluginScope(requestedProfile);
  const requestScope = pluginState.scope;
  const results = await Promise.allSettled([invoke('list_plugins'), invoke('list_bot_instances'), invoke('get_plugin_market'), invoke('list_integration_modules'), refreshBotChat()]);
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
  if (results[2].status === 'fulfilled') pluginState.marketUrl = results[2].value;
  if (results[3].status === 'fulfilled') pluginState.modules = Array.isArray(results[3].value) ? results[3].value : [];
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
(window as any).transferGeniePlugins = { state: pluginState, addReferences, getCallContext, clearCallContext, setScope: resolvePluginScope, setComposerDraft, getDraftIdentity, refreshMessageContexts, noteBotCall };
window.setInterval(() => { if ((window as any).__TAURI__) void refreshPlugins(); }, 15000);
