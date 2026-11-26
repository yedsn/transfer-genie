<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { selectedMention, mentionDeletion, decorateTextarea, deleteTextareaMention } from './mention-editor';
import { pluginState as state, removeReference, clearReferences, selectBot, refreshPlugins, pluginAction } from './plugin-store';
import { locateQuotedMessage } from './reference-navigation';
const referenceNotice=ref('');
async function locateReference(filename:string) { try { referenceNotice.value=await locateQuotedMessage(filename)?'':'原消息已删除或当前不可用'; } catch { referenceNotice.value='暂时无法加载原消息，请稍后重试'; } }
const query = ref<string | null>(null);
const root = ref<HTMLElement | null>(null);
const active = ref(0);
const position = ref({ left: '0px', top: '0px', width: '280px', maxHeight: '280px' });
let editor: HTMLTextAreaElement | HTMLElement | null = null;
let mentionRange: Range | null = null;
let start = 0;
let end = 0;
let codeMirror:any = null;
let cmStart:any = null;
let cmEnd:any = null;
let cmMark:any=null;
function decorateEditors() {
  if(!root.value) return;
  const host=root.value.closest('.composer, .mobile-composer-content');
  host?.querySelectorAll<HTMLTextAreaElement>('textarea').forEach(input=>{if(!input.closest('.CodeMirror')) decorateTextarea(input);});
  cmMark?.clear();cmMark=null;
  host?.querySelectorAll('.CodeMirror').forEach(node=>{const cm=(node as any).CodeMirror;const label=selectedMention();if(!cm || !label)return;const index=cm.getValue().indexOf(label);if(index<0)return;const chip=document.createElement('span');chip.className='bot-mention-token';chip.textContent=label;cmMark=cm.markText(cm.posFromIndex(index),cm.posFromIndex(index+label.length),{replacedWith:chip,atomic:true,clearOnEnter:false});});
}
watch(()=>[state.target,state.mentionText,state.scope],()=>{void nextTick(decorateEditors);});
function redraw(event:Event) { const node=event.target as HTMLElement; if(node.closest?.('.composer, .mobile-composer-content')===root.value?.closest('.composer, .mobile-composer-content')) void nextTick(decorateEditors); }
function beforeInput(event:Event) { const input=event.target;const kind=(event as InputEvent).inputType;if(input instanceof HTMLTextAreaElement && !input.closest('.CodeMirror') && kind?.startsWith('delete') && input.closest('.composer, .mobile-composer-content')===root.value?.closest('.composer, .mobile-composer-content')){if(deleteTextareaMention(input,kind.includes('Backward')?'backward':'forward'))event.preventDefault();} }
const candidates = computed(() => state.bots.filter(bot => bot.enabled && (bot.name + ' ' + bot.device_name).toLowerCase().includes((query.value || '').toLowerCase())));
const ungranted = computed(() => state.plugins.filter(plugin => plugin.enabled && plugin.has_current_space && !plugin.current_space_allowed && plugin.manifest.capabilities?.some((capability:any)=>capability.kind==='bot') && plugin.manifest.name.toLowerCase().includes((query.value || '').toLowerCase())));
const loading = ref(false);
async function refreshCandidates() { loading.value=true; try { await refreshPlugins(); } finally { loading.value=false; } }
async function grant(plugin:any) { try { await pluginAction('set_plugin_space',{id:plugin.manifest.id,allowed:true}); } catch {} }
function token(bot: any) { return '@' + bot.name + '（' + bot.device_name + '）'; }
function inspect(event: Event) {
  const node = event.target as HTMLElement;
  if ((event as InputEvent).isComposing) return;
  if (!node?.closest?.('.composer, .mobile-composer-content') || node.closest('.composer, .mobile-composer-content') !== root.value?.closest('.composer, .mobile-composer-content')) return;
  const input = node instanceof HTMLTextAreaElement ? node : node.closest<HTMLElement>('[contenteditable="true"]');
  if (!input) return;
  editor = input;
  codeMirror=(event as CustomEvent).detail?.cm || (node.closest('.CodeMirror') as any)?.CodeMirror || null;
  const selected = state.bots.find(bot => bot.instance_id === state.target);
  const fullText = codeMirror ? codeMirror.getValue() : input instanceof HTMLTextAreaElement ? input.value : input.textContent || '';
  if (['input','bot-editor-change'].includes(event.type) && state.target && selectedMention() && !fullText.includes(selectedMention())) selectBot('');
  let before = '';
  mentionRange = null;
  if(codeMirror) {
    if(codeMirror.somethingSelected()) {query.value=null;return;}
    cmEnd=codeMirror.getCursor(); before=codeMirror.getLine(cmEnd.line).slice(0,cmEnd.ch);
  } else if (input instanceof HTMLTextAreaElement) {
    if (input.selectionStart !== input.selectionEnd) { query.value = null; return; }
    end = input.selectionStart; before = input.value.slice(0, end);
  } else {
    const selection = window.getSelection();
    if (!selection?.isCollapsed || !selection.rangeCount || !input.contains(selection.anchorNode)) { query.value = null; return; }
    const range = selection.getRangeAt(0);
    const prefix=range.cloneRange(); prefix.selectNodeContents(input); prefix.setEnd(range.startContainer,range.startOffset);
    before = prefix.toString();
    mentionRange = range.cloneRange();
  }
  const match = before.match(/(?:^|\s)@([^@\s（）]{0,40})$/u);
  if (!match) { query.value = null; return; }
  const wasClosed=query.value===null;
  query.value = match[1]; active.value = 0;
  if(wasClosed) void refreshCandidates();
  start = end - match[1].length - 1;
  if(codeMirror) cmStart={line:cmEnd.line,ch:cmEnd.ch-match[1].length-1};
  if (mentionRange) {
    let remaining=before.length-match[1].length-1;
    const walker=document.createTreeWalker(input,NodeFilter.SHOW_TEXT);
    let textNode:Node|null;
    while((textNode=walker.nextNode())) { const length=textNode.textContent?.length || 0; if(remaining<=length) {mentionRange.setStart(textNode,remaining);break;} remaining-=length; }
  }
  reposition();
}
function reposition() {
  if(query.value===null || !editor?.isConnected)return;
  const rect = codeMirror ? codeMirror.getWrapperElement().getBoundingClientRect() : editor.getBoundingClientRect();
  const viewport=window.visualViewport;
  const bottom=(viewport?.offsetTop || 0)+(viewport?.height || window.innerHeight);
  const menuHeight=Math.min(280, Math.max(64,(viewport?.height || window.innerHeight)-16));
  const top=rect.top>=menuHeight+8 ? rect.top-menuHeight-6 : Math.min(rect.top+28,bottom-menuHeight-8);
  position.value = { left: Math.max(8,Math.min(rect.left,window.innerWidth- Math.min(320,rect.width)-8)) + 'px', top: Math.max((viewport?.offsetTop || 0)+8,top) + 'px', width: Math.min(320, rect.width, window.innerWidth - 16) + 'px', maxHeight:menuHeight+'px' };
}
function choose(bot: any) {
  if (!editor || !bot) return;
  editor.focus();
  const text = token(bot) + ' ';
  if(codeMirror) {const cm=codeMirror; cm.replaceRange(text,cmStart,cmEnd,'+input'); cm.focus();}
  else if (editor instanceof HTMLTextAreaElement) {
    editor.setRangeText(text, start, end, 'end');
    editor.dispatchEvent(new Event('input', { bubbles: true }));
  } else if (mentionRange) {
    const detail={query:query.value || '',text,handled:false};
    editor.dispatchEvent(new CustomEvent('bot-insert-mention',{detail}));
    if(detail.handled){selectBot(bot.instance_id,token(bot));query.value=null;return;}
    const selection = window.getSelection(); selection?.removeAllRanges(); selection?.addRange(mentionRange);
    document.execCommand('insertText', false, text);
  }
  selectBot(bot.instance_id,token(bot)); query.value = null; void nextTick(decorateEditors);
}
function keydown(event: KeyboardEvent) {
  const input=event.target as HTMLElement;
  if(!event.isComposing && ['Backspace','Delete'].includes(event.key) && input.closest?.('.composer, .mobile-composer-content')===root.value?.closest('.composer, .mobile-composer-content')) {
    const cm=(input.closest('.CodeMirror') as any)?.CodeMirror;
    let removed=false;
    if(cm){const range=mentionDeletion(cm.getValue(),cm.indexFromPos(cm.getCursor('from')),cm.indexFromPos(cm.getCursor('to')),event.key==='Backspace'?'backward':'forward');if(range){selectBot('');cmMark?.clear();cmMark=null;cm.replaceRange('',cm.posFromIndex(range.from),cm.posFromIndex(range.to),'+delete');removed=true;}}
    else if(input instanceof HTMLTextAreaElement)removed=deleteTextareaMention(input,event.key==='Backspace'?'backward':'forward');
    if(removed){event.preventDefault();event.stopImmediatePropagation();void nextTick(decorateEditors);return;}
  }
  if (query.value === null || !editor?.contains(event.target as Node) || event.isComposing) return;
  if (event.key === 'Escape') { query.value = null; event.preventDefault(); event.stopImmediatePropagation(); }
  if (['ArrowDown', 'ArrowUp', 'Enter', 'Tab'].includes(event.key) && candidates.value.length) {
    event.preventDefault(); event.stopImmediatePropagation();
    if (event.key === 'ArrowDown') active.value = (active.value + 1) % candidates.value.length;
    else if (event.key === 'ArrowUp') active.value = (active.value + candidates.value.length - 1) % candidates.value.length;
    else choose(candidates.value[active.value]);
  }
}
function dismiss(event: Event) { if (!(event.target as HTMLElement)?.closest?.('.bot-mention-menu') && event.target !== editor) query.value = null; }
onMounted(() => {
  void refreshPlugins();
  document.addEventListener('input', inspect, true); document.addEventListener('click', inspect); document.addEventListener('compositionend', inspect);
  document.addEventListener('bot-editor-change',inspect);
  window.addEventListener('resize',decorateEditors);
  window.visualViewport?.addEventListener('resize',reposition);
  window.visualViewport?.addEventListener('scroll',reposition);
  document.addEventListener('input',redraw);document.addEventListener('bot-editor-change',redraw);document.addEventListener('focusin',redraw);document.addEventListener('scroll',redraw,true);document.addEventListener('beforeinput',beforeInput,true);
  document.addEventListener('keydown', keydown, true); document.addEventListener('pointerdown', dismiss);
});
onUnmounted(() => {
  document.removeEventListener('input', inspect, true); document.removeEventListener('click', inspect); document.removeEventListener('compositionend', inspect);
  document.removeEventListener('bot-editor-change',inspect);
  window.removeEventListener('resize',decorateEditors);
  window.visualViewport?.removeEventListener('resize',reposition);
  window.visualViewport?.removeEventListener('scroll',reposition);
  cmMark?.clear();document.removeEventListener('input',redraw);document.removeEventListener('bot-editor-change',redraw);document.removeEventListener('focusin',redraw);document.removeEventListener('scroll',redraw,true);document.removeEventListener('beforeinput',beforeInput,true);
  document.removeEventListener('keydown', keydown, true); document.removeEventListener('pointerdown', dismiss);
});
</script>
<template>
  <div ref="root" class="bot-composer" :style="!state.references.length && !state.error ? {padding:'0',gap:'0'} : undefined">
    <details v-if="state.references.length" class="bot-reference-list" open>
      <summary>已引用 {{ state.references.length }} 条消息</summary>
      <button type="button" class="quote-clear" @click="clearReferences" aria-label="取消全部引用">×</button>
      <div v-for="reference in state.references" :key="reference.filename" class="bot-reference-chip quote-draft">
        <button type="button" class="quote-jump" @click="locateReference(reference.filename)" :aria-label="'定位引用 '+(reference.original_name || reference.content || reference.filename)"><strong>{{ reference.sender || '引用消息' }}</strong><small>{{ reference.kind === 'image' ? '[图片] ' : reference.kind === 'text' ? '' : '[文件] ' }}{{ reference.content?.slice(0,100) || reference.original_name }}</small></button>
        <button type="button" :aria-label="`移除引用 ${reference.original_name}`" @click="removeReference(reference.filename)">×</button>
      </div>
    </details>
    <small v-if="referenceNotice" class="quote-notice" role="status">{{ referenceNotice }}</small>
    <Teleport to="body"><div v-if="query !== null" class="bot-mention-menu" :style="position" role="listbox" aria-label="选择机器人">
      <div class="mention-heading">选择要提醒的机器人</div>
      <button v-for="(bot,index) in candidates" :key="bot.instance_id" class="mention-option" type="button" role="option" :aria-selected="index===active" @pointerdown.prevent @mousedown.prevent @pointermove="active=index" @click="choose(bot)"><span class="mention-avatar" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="4" y="7" width="16" height="14" rx="4"/><path d="M12 7V3m-2 0h4M8 12h1m6 0h1m-7 5h6"/></svg></span><span class="mention-copy"><strong>{{ bot.name }}</strong><small>{{ bot.device_name }}</small></span><span class="mention-presence" :class="{online:bot.expires_at_ms>Date.now()}">{{ bot.expires_at_ms > Date.now() ? '可用' : '离线' }}</span></button>
      <div v-for="plugin in ungranted" :key="plugin.manifest.id" class="bot-permission-hint"><strong>{{ plugin.manifest.name }}</strong><p>已启用，尚未允许当前存储空间调用</p><button type="button" :disabled="state.busy" @mousedown.prevent @click="grant(plugin)">允许当前空间调用</button></div>
      <p v-if="loading && !candidates.length">正在查找机器人…</p>
      <p v-else-if="state.directoryError" role="alert">{{ state.directoryError }}<button type="button" @mousedown.prevent @click="refreshCandidates">重试</button></p>
      <p v-else-if="!candidates.length && !ungranted.length">{{ query ? '没有匹配的机器人，可按机器人名称或设备名称搜索。' : '当前空间暂无可调用机器人。请在目标电脑启用机器人并允许此空间调用，保持两端处于同一存储空间并完成同步；本机无需安装该插件。' }}</p>
    </div></Teleport>
    <p v-if="state.error" role="alert">{{ state.error }}</p>
  </div>
</template>
<style scoped>
.bot-composer{padding:8px 12px;display:grid;gap:8px;font-size:13px}.bot-target-picker{display:flex;gap:8px;align-items:center}.bot-target-picker select{flex:1;min-width:0;padding:7px;border:1px solid var(--border,#e1d7ce);border-radius:8px;background:transparent;color:inherit}.bot-reference-list{max-height:160px;overflow:auto}.bot-reference-chip{display:flex;gap:8px;align-items:center;padding:5px 0}.bot-reference-chip span{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.bot-composer button{color:inherit;background:transparent;border:0;padding:4px 8px;cursor:pointer}
</style>

<style scoped>
.bot-reference-list{position:relative;background:var(--panel-soft,#f1f1f1);border-radius:6px;padding:9px 34px 8px 12px;border-left:3px solid var(--border,#ccc);max-height:180px}.bot-reference-list summary{font-size:11px;color:var(--muted,#777);cursor:pointer;padding-bottom:3px}.bot-composer .quote-clear{position:absolute;right:5px;top:4px;color:var(--muted);font-size:18px}.quote-draft{padding:5px 0;align-items:flex-start}.quote-draft>span{display:grid;gap:3px;min-width:0}.quote-draft strong{font-size:11px;font-weight:500;color:var(--muted)}.quote-draft small{font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--muted);line-height:1.5}.quote-draft button{font-size:16px;line-height:1;color:var(--muted)}.bot-permission-hint{padding:10px;border-top:1px solid var(--border)}.bot-permission-hint>strong{font-size:13px}.bot-permission-hint>button{color:var(--accent-strong);font-size:12px}
</style>
<style scoped>
.bot-mention-menu{position:fixed;z-index:10000;max-height:210px;overflow:auto;padding:6px;border:1px solid var(--border,#ddd);border-radius:12px;background:var(--surface,#fffaf6);color:var(--text,#282523);box-shadow:0 8px 28px #0002}.bot-mention-menu button{display:flex;flex-direction:column;gap:4px;width:100%;text-align:left;border:0;background:transparent;color:inherit;padding:10px;border-radius:8px;cursor:pointer}.bot-mention-menu button[aria-selected=true],.bot-mention-menu button:hover{background:#e99a6422}.bot-mention-menu span,.bot-mention-menu p{font-size:12px;opacity:.75}
</style>

<style scoped>
.bot-mention-menu{padding:0;max-height:280px;overflow-y:auto;border-radius:8px;background:var(--panel,#fff);color:var(--ink,#222);box-shadow:0 5px 24px #0002;border-color:var(--border,#ddd);overscroll-behavior:contain}.mention-heading{padding:10px 12px 8px;font-size:11px;color:var(--muted);border-bottom:1px solid var(--border)}.bot-mention-menu .mention-option{display:flex;flex-direction:row;align-items:center;gap:10px;padding:9px 12px;border-radius:0;min-height:58px}.bot-mention-menu .mention-option[aria-selected=true],.bot-mention-menu .mention-option:hover{background:var(--panel-soft,#f2f2f2)}.bot-mention-menu .mention-avatar{display:grid;place-items:center;width:36px;height:36px;flex-shrink:0;border-radius:5px;background:#e6f2e9;color:#388a50;opacity:1}.mention-avatar svg{width:23px;height:23px}.bot-mention-menu .mention-copy{display:grid;gap:4px;flex:1;min-width:0;opacity:1}.mention-copy strong{font-size:13px;font-weight:500;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}.mention-copy small{font-size:11px;color:var(--muted)}.bot-mention-menu .mention-presence{font-size:10px;color:var(--muted);white-space:nowrap}.mention-presence:before{content:'';display:inline-block;width:5px;height:5px;border-radius:50%;background:var(--muted);margin-right:4px}.mention-presence.online:before{background:#44a15e}.bot-mention-menu>p{padding:0 12px 12px;line-height:1.6}.bot-composer .quote-draft .quote-jump{display:grid;gap:3px;flex:1;min-width:0;text-align:left;padding:0;font-size:12px;line-height:1.5}.quote-jump:hover small{text-decoration:underline}.quote-notice{font-size:11px;color:var(--muted)}
</style>
