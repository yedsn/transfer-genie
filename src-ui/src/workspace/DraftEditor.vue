<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { composerStore } from "./composer-store";
import type { DraftTab } from "./composer-store";

const props = defineProps<{ draft: DraftTab; paneId: string; isActive?: boolean }>();

const isMarkdown = computed(() => props.draft.format === "markdown");
const textEl = ref<HTMLTextAreaElement | null>(null);
const mdWrap = ref<HTMLElement | null>(null);
let editor: any = null;
let initRetry = 0;
let fullscreenListener: ((event: Event) => void) | null = null;
let resizeListener: (() => void) | null = null;

const MARKDOWN_NORMAL_HEIGHT = "180px";

const mdId = "cw-md-" + props.paneId + "-" + props.draft.id;

function isComposerFullscreen() {
  return document.documentElement.classList.contains("composer-fullscreen-active") || document.body.classList.contains("composer-fullscreen-active");
}

function registerFocus() {
  // 注册活动草稿聚焦函数，供 legacy focusTextInput 复用
  const bridge = (window as any).transferGenieComposer;
  if (bridge && props.isActive) {
    bridge._focusActive = () => {
      try {
        if (isMarkdown.value && editor && editor.cm) editor.cm.focus();
        else if (textEl.value) textEl.value.focus({ preventScroll: true } as any);
      } catch (e) { /* ignore */ }
    };
    bridge._clearActive = () => {
      try {
        if (isMarkdown.value && editor && typeof editor.setMarkdown === "function") editor.setMarkdown("");
      } catch (e) { /* 纯文本由响应式 :value 自动清空 */ }
    };
  }
}

function onActivated() {
  composerStore.setActivePane(props.paneId);
  registerFocus();

}


function onTextInput(event: Event) {
  const v = (event.target as HTMLTextAreaElement).value;
  composerStore.setDraftText(props.draft.id, v);
}

function shouldSendForEnter(event: KeyboardEvent) {
  if (event.defaultPrevented || event.key !== "Enter" || event.isComposing) return false;
  const bridge = (window as any).transferGenieComposer;
  const hotkey = bridge?.getSendHotkey?.() === "ctrl_enter" ? "ctrl_enter" : "enter";
  const isCtrlLike = event.ctrlKey || event.metaKey;
  const isAlt = event.altKey;
  const isShift = event.shiftKey;
  if (hotkey === "ctrl_enter") return isCtrlLike && !isAlt;
  return !isCtrlLike && !isAlt && !isShift;
}

function handleEditorKeydown(event: KeyboardEvent) {
  if (!shouldSendForEnter(event)) return;
  event.preventDefault();
  event.stopPropagation();
  const bridge = (window as any).transferGenieComposer;
  if (bridge && typeof bridge.sendActiveDraft === "function") bridge.sendActiveDraft();
}

function initMarkdown() {
  if (editor) return;
  if (!(window as any).editormd) {
    initRetry += 1;
    if (initRetry > 40) return;
    setTimeout(initMarkdown, 100);
    return;
  }
  if (!mdWrap.value) return;
  mdWrap.value.id = mdId;
  try {
    editor = (window as any).editormd(mdId, {
      width: "100%",
      height: isComposerFullscreen() ? "100%" : MARKDOWN_NORMAL_HEIGHT,
      path: "lib/editor.md/lib/",
      pluginPath: "lib/editor.md/plugins/",
      placeholder: "使用 Markdown 输入草稿…",
      watch: true,
      toolbar: true,
      codeFold: true,
      searchReplace: true,
      flowChart: true,
      sequenceDiagram: true,
      toolbarIcons: function () {
        return ["bold", "italic", "quote", "|", "h1", "h2", "h3", "|", "list-ul", "list-ol", "|", "link", "code", "code-block", "table", "datetime", "|", "watch", "preview", "clear", "help"];
      },
      onload: function () {
        try { this.setMarkdown(props.draft.text || ""); } catch (e) { /* ignore */ }
        window.requestAnimationFrame(() => refreshMarkdownLayout());
        const cm = this.cm;
        if (cm) {
          cm.on("change", () => {
            try { composerStore.setDraftText(props.draft.id, cm.getValue()); } catch (e) { /* ignore */ }
          });
          cm.on("focus", () => { onActivated(); });
          cm.on("keydown", (_cm: any, event: KeyboardEvent) => { handleEditorKeydown(event); });
        }
      },
    });
  } catch (e) {
    console.error("editormd init failed", e);
  }
}

function refreshMarkdownLayout(fullscreen = isComposerFullscreen()) {
  if (!isMarkdown.value || !editor) return;
  try {
    if (typeof editor.resize === "function") {
      editor.resize("100%", fullscreen ? "100%" : MARKDOWN_NORMAL_HEIGHT);
    }
    if (editor.cm && typeof editor.cm.refresh === "function") {
      editor.cm.refresh();
    }
  } catch (e) { /* ignore */ }
}

function destroyMarkdown() {
  try {
    if (editor) {
      if (typeof editor.destroy === "function") editor.destroy();
      else if (editor.cm && typeof editor.cm.toTextArea === "function") editor.cm.toTextArea();
    }
  } catch (e) { /* ignore */ }
  editor = null;
}

onMounted(() => {
  if (isMarkdown.value) initMarkdown();
  registerFocus();
  fullscreenListener = (event: Event) => {
    const custom = event as CustomEvent<{ enabled?: boolean }>;
    const fullscreen = typeof custom?.detail?.enabled === "boolean" ? custom.detail.enabled : isComposerFullscreen();
    window.requestAnimationFrame(() => {
      refreshMarkdownLayout(fullscreen);
    });
  };
  resizeListener = () => refreshMarkdownLayout();
  window.addEventListener("transfer-genie:composer-fullscreen-change", fullscreenListener as EventListener);
  window.addEventListener("resize", resizeListener);
});
watch(() => props.isActive, (active) => { if (active) registerFocus(); });
watch(isMarkdown, (next) => {
  if (next) {
    initRetry = 0;
    setTimeout(initMarkdown, 0);
  } else {
    destroyMarkdown();
  }
});
watch(() => props.draft.id, () => {
  if (isMarkdown.value) {
    initRetry = 0;
    setTimeout(() => {
      refreshMarkdownLayout();
    }, 0);
  }
});
onBeforeUnmount(() => {
  destroyMarkdown();
  if (fullscreenListener) window.removeEventListener("transfer-genie:composer-fullscreen-change", fullscreenListener as EventListener);
  if (resizeListener) window.removeEventListener("resize", resizeListener);
  const bridge = (window as any).transferGenieComposer;
  if (bridge && props.isActive) { bridge._focusActive = null; bridge._clearActive = null; }
});

function setFormat(format: string) {
  composerStore.setDraftFormat(props.draft.id, format as any);
}
</script>

<template>
  <div class="cw-editor">
    <div v-if="isMarkdown" class="cw-md-wrap" ref="mdWrap" @focusin="onActivated"></div>
    <textarea
      v-else
      class="cw-textarea"
      :value="draft.text"
      placeholder="输入消息…"
      spellcheck="false"
      ref="textEl"
      @input="onTextInput"
      @keydown="handleEditorKeydown"
      @focus="onActivated"
    ></textarea>
    <div class="cw-editor-foot">
      <div class="cw-fmt-toggle">
        <div class="cw-fmt-indicator" :class="{ 'is-md': isMarkdown }"></div>
        <label class="cw-fmt-tab" :class="{ 'is-active': !isMarkdown }">
          <input type="radio" :name="'fmt-' + paneId + '-' + draft.id" value="text" :checked="!isMarkdown" @change="setFormat('text')" />
          <span>纯文本</span>
        </label>
        <label class="cw-fmt-tab" :class="{ 'is-active': isMarkdown }">
          <input type="radio" :name="'fmt-' + paneId + '-' + draft.id" value="markdown" :checked="isMarkdown" @change="setFormat('markdown')" />
          <span>Markdown</span>
        </label>
      </div>
      <span class="cw-hint">拖入消息卡可新建草稿</span>
    </div>
  </div>
</template>
