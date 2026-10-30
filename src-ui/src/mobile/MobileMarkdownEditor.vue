<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, watch } from 'vue';
import { Editor, defaultValueCtx, rootCtx, editorViewCtx, editorViewOptionsCtx, serializerCtx } from '@milkdown/kit/core';
import { commonmark, toggleStrongCommand, toggleEmphasisCommand, toggleInlineCodeCommand, wrapInHeadingCommand, wrapInBulletListCommand, wrapInOrderedListCommand, wrapInBlockquoteCommand, createCodeBlockCommand, sinkListItemCommand, liftListItemCommand, imageSchema } from '@milkdown/kit/preset/commonmark';
import { gfm } from '@milkdown/kit/preset/gfm';
import { history } from '@milkdown/kit/plugin/history';
import { clipboard } from '@milkdown/kit/plugin/clipboard';
import { $prose, callCommand, replaceAll } from '@milkdown/kit/utils';
import { Plugin, TextSelection } from '@milkdown/kit/prose/state';
import { undo, redo } from '@milkdown/kit/prose/history';
import { lift } from '@milkdown/kit/prose/commands';
import '@milkdown/kit/prose/view/style/prosemirror.css';

const props = defineProps<{ modelValue: string; disabled?: boolean; toolbarTarget?: string; showDismissKeyboard?: boolean }>();
const emit = defineEmits<{ 'update:modelValue': [value: string]; dismissKeyboard: []; ready: [] }>();
const host = ref<HTMLElement | null>(null);
const fallback = ref<HTMLTextAreaElement | null>(null);
const ready = ref(false);
const failed = ref(false);
const active = ref<string[]>([]);
const linkOpen = ref(false);
const linkUrl = ref('');
const linkError = ref('');
let editor: Editor | undefined;
let destroyed = false;
let replacing = false;
let lastSource = props.modelValue;
let linkSelection: { from: number; to: number } | undefined;
const tools = [
  { id: 'bold', label: '粗体', glyph: 'B' },
  { id: 'italic', label: '斜体', glyph: 'I' },
  { id: 'heading', label: '标题', glyph: 'H₂' },
  { id: 'bullets', label: '无序列表', glyph: '• ≡' },
  { id: 'numbered', label: '有序列表', glyph: '1. ≡' },
  { id: 'indent', label: '增加缩进', glyph: 'indent' },
  { id: 'outdent', label: '减少缩进', glyph: 'outdent' },
  { id: 'quote', label: '引用', glyph: '❝' },
  { id: 'code', label: '代码', glyph: '</>' },
  { id: 'link', label: '链接', glyph: 'link' },
  { id: 'undo', label: '撤销', glyph: 'undo' },
  { id: 'redo', label: '重做', glyph: 'redo' },
];
function updateActive() {
  if (!ready.value || !editor) return;
  const { selection, storedMarks } = editor.ctx.get(editorViewCtx).state;
  const marks = storedMarks || selection.$from.marks();
  active.value = marks.map(mark => ({ strong: 'bold', emphasis: 'italic', inlineCode: 'code', link: 'link' }[mark.type.name] || mark.type.name));
  for (let depth = selection.$from.depth; depth > 0; depth--) {
    const name = selection.$from.node(depth).type.name;
    const tool = { heading: 'heading', bullet_list: 'bullets', ordered_list: 'numbered', blockquote: 'quote', code_block: 'code' }[name];
    if (tool) active.value.push(tool);
  }
}
const sync = $prose(ctx => new Plugin({
  // Synchronous serialization keeps the last keystroke available to Send,
  // background persistence and unmount; do not debounce editor -> draft state.
  view: view => {
    let previousMarkdown = ctx.get(serializerCtx)(view.state.doc);
    return { update(view, previous) {
      if (!previous.doc.eq(view.state.doc)) {
        const value = ctx.get(serializerCtx)(view.state.doc);
        // Heading IDs and cursor plugins can change node attributes on focus.
        // Those are not edits: retain the untouched source byte-for-byte.
        if (!replacing && value !== previousMarkdown) {
          lastSource = value;
          emit('update:modelValue', value);
        }
        previousMarkdown = value;
      }
      updateActive();
    } };
  },
}));
onMounted(async () => {
  try {
    editor = Editor.make().config(ctx => {
      ctx.set(rootCtx, host.value);
      ctx.set(defaultValueCtx, props.modelValue);
      ctx.set(editorViewOptionsCtx, {
        editable: () => !props.disabled,
        attributes: { role: 'textbox', 'aria-label': '消息内容', 'aria-multiline': 'true', 'data-placeholder': '写下你的想法…', tabindex: '0' },
        // Image nodes retain their Markdown identity without fetching private
        // or tracking URLs. Raw HTML uses Milkdown's inert text node.
        nodeViews: { image: node => {
          const dom = document.createElement('span');
          dom.className = 'mobile-editor-image-placeholder';
          dom.textContent = `图片 · ${node.attrs.alt || '附件链接'}`;
          return { dom };
        } },
        handleDOMEvents: { click: (_view, event) => {
          if ((event.target as Element)?.closest('a')) { event.preventDefault(); return true; }
          return false;
        } },
      });
    }).use(commonmark).use(gfm).use(history).use(clipboard).use(sync);
    await editor.create();
    if (destroyed) { await editor.destroy(); return; }
    ready.value = true;
    if (props.modelValue !== lastSource) setSource(props.modelValue);
    updateActive();
    emit('ready');
  } catch {
    // Preserve unsupported source rather than silently losing a restored draft.
    if (destroyed) { void editor?.destroy().catch(() => undefined); return; }
    failed.value = true;
    void editor?.destroy().catch(() => undefined);
    editor = undefined;
    requestAnimationFrame(() => { if (!destroyed) emit('ready'); });
  }
});
function focusEditor() {
  if (props.disabled) return false;
  const target = failed.value ? fallback.value : ready.value && editor ? editor.ctx.get(editorViewCtx).dom : null;
  if (!target) return false;
  target.focus({ preventScroll: true });
  return document.activeElement === target;
}
defineExpose({ focusEditor });
function setSource(value: string) {
  if (!ready.value || !editor || value === lastSource) return;
  replacing = true;
  try { editor.action(replaceAll(value)); lastSource = value; }
  catch { failed.value = true; }
  finally { replacing = false; }
}
watch(() => props.modelValue, setSource);
watch(() => props.disabled, () => {
  if (ready.value) editor?.ctx.get(editorViewCtx).setProps({ editable: () => !props.disabled });
});
function format(id: string) {
  if (!ready.value || !editor || props.disabled) return;
  const view = editor.ctx.get(editorViewCtx);
  if (id === 'link') {
    linkSelection = { from: view.state.selection.from, to: view.state.selection.to };
    linkUrl.value = view.state.selection.$from.marks().find(mark => mark.type.name === 'link')?.attrs.href || '';
    linkError.value = '';
    linkOpen.value = true;
    return;
  }
  view.dom.focus({ preventScroll: true });
  if (id === 'undo') undo(view.state, view.dispatch);
  else if (id === 'redo') redo(view.state, view.dispatch);
  else if (id === 'outdent') {
    if (!editor.action(callCommand(liftListItemCommand.key))) lift(view.state, view.dispatch);
  } else if (id === 'indent') {
    if (!editor.action(callCommand(sinkListItemCommand.key))) editor.action(callCommand(wrapInBlockquoteCommand.key));
  } else if (id === 'heading') editor.action(callCommand(wrapInHeadingCommand.key, active.value.includes('heading') ? 0 : 2));
  else if (id === 'code') {
    const { from, to } = view.state.selection;
    if (view.state.doc.textBetween(from, to, '\n').includes('\n') || view.state.selection.$from.parent.type.name === 'code_block') editor.action(callCommand(createCodeBlockCommand.key));
    else editor.action(callCommand(toggleInlineCodeCommand.key));
  } else {
    const command = { bold: toggleStrongCommand, italic: toggleEmphasisCommand, bullets: wrapInBulletListCommand, numbered: wrapInOrderedListCommand, quote: wrapInBlockquoteCommand }[id];
    if (command) editor.action(callCommand(command.key));
  }
  updateActive();
}
function closeLink() {
  linkOpen.value = false;
  editor?.ctx.get(editorViewCtx).dom.focus({ preventScroll: true });
}
function saveLink() {
  const href = linkUrl.value.trim();
  if (!/^https?:\/\/[^\s]+$/i.test(href)) { linkError.value = '请输入完整的 http 或 https 链接'; return; }
  if (!editor || !linkSelection || props.disabled) return;
  const view = editor.ctx.get(editorViewCtx);
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, linkSelection.from, linkSelection.to)));
  if (linkSelection.from === linkSelection.to) {
    const mark = view.state.schema.marks.link.create({ href });
    view.dispatch(view.state.tr.replaceSelectionWith(view.state.schema.text(href, [mark]), false));
  } else {
    const mark = view.state.schema.marks.link.create({ href });
    view.dispatch(view.state.tr.removeMark(linkSelection.from, linkSelection.to, mark.type).addMark(linkSelection.from, linkSelection.to, mark));
  }
  closeLink();
}
onBeforeUnmount(() => { destroyed = true; if (ready.value) void editor?.destroy(); });
</script>

<template>
  <div class="mobile-rich-editor">
    <Teleport :to="toolbarTarget || 'body'" :disabled="!toolbarTarget" defer>
    <div class="mobile-editor-format-bar">
    <form v-if="linkOpen" class="mobile-editor-link-form" aria-label="设置链接" @submit.prevent="saveLink" @keydown.esc.stop.prevent="closeLink">
      <input v-model="linkUrl" type="url" aria-label="链接地址" placeholder="https://…" :disabled="disabled" />
      <button type="button" aria-label="取消链接" @click="closeLink">取消</button><button type="submit" :disabled="disabled">确定</button>
      <p v-if="linkError" role="alert">{{ linkError }}</p>
    </form>
    <div class="mobile-markdown-toolbar" role="toolbar" aria-label="Markdown 格式工具">
      <button v-if="showDismissKeyboard" class="is-dismiss-keyboard" type="button" aria-label="收起键盘" title="收起键盘" @click="emit('dismissKeyboard')">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
      </button>
      <button v-for="tool in tools" :key="tool.id" type="button" :aria-label="tool.label" :title="tool.label" :aria-pressed="active.includes(tool.id)" :class="`is-${tool.id}`" :disabled="disabled || !ready || failed" @pointerdown.prevent @click="format(tool.id)">
        <svg v-if="['indent', 'outdent'].includes(tool.id)" viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5h9M11 10h9M11 15h9M4 20h16"/><path :d="tool.id === 'indent' ? 'm4 7 3 4-3 4' : 'm7 7-3 4 3 4'"/></svg>
        <svg v-else-if="tool.id === 'link'" viewBox="0 0 24 24" aria-hidden="true"><path d="m10 13 4-4M8 15l-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m2 3 1-1a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0"/></svg>
        <svg v-else-if="['undo', 'redo'].includes(tool.id)" viewBox="0 0 24 24" aria-hidden="true" :class="{ 'is-mirrored': tool.id === 'redo' }"><path d="M4 9h9a6 6 0 0 1 0 12M4 9l5-5M4 9l5 5"/></svg>
        <span v-else aria-hidden="true">{{ tool.glyph }}</span>
      </button>
    </div>
    </div>
    </Teleport>
    <p v-if="failed" class="mobile-inline-error" role="status">此内容暂不能以富文本编辑，已保留原文。</p>
    <textarea v-if="failed" ref="fallback" :value="modelValue" :disabled="disabled" aria-label="消息内容" @input="emit('update:modelValue', ($event.target as HTMLTextAreaElement).value)"></textarea>
    <div ref="host" v-show="!failed" class="mobile-rich-editor-host mobile-markdown" :aria-busy="!ready"></div>
  </div>
</template>
