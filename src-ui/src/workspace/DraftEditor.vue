<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { composerStore } from "./composer-store";
import type { DraftTab } from "./composer-store";

const props = defineProps<{ draft: DraftTab; paneId: string; isActive?: boolean }>();

const isMarkdown = computed(() => props.draft.format === "markdown");
const textEl = ref<HTMLTextAreaElement | null>(null);
const mdWrap = ref<HTMLElement | null>(null);
const aiBusy = ref(false);
const aiError = ref("");
const aiMenu = ref<{ x: number; y: number } | null>(null);
const aiMenuPreferSelection = ref(false);
const aiLoadingReasoning = ref<HTMLElement | null>(null);
let activeAiRequestId = "";
const aiPreview = ref<{
  title: string;
  sourceText: string;
  outputText: string;
  reasoningText: string;
  mode: "selection" | "draft" | "cursor";
  selectionStart: number;
  selectionEnd: number;
} | null>(null);
let editor: any = null;
let initRetry = 0;
let fullscreenListener: ((event: Event) => void) | null = null;
let resizeListener: (() => void) | null = null;

const MARKDOWN_NORMAL_HEIGHT = "180px";

const mdId = "cw-md-" + props.paneId + "-" + props.draft.id;

function createAiRequestId() {
  return "ai-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
}

function appendAiStreamEvent(payload: any) {
  if (!payload || payload.requestId !== activeAiRequestId || !aiPreview.value) return;
  if (payload.eventType === "start") {
    aiPreview.value.title = payload.actionName || aiPreview.value.title;
    return;
  }
  if (payload.eventType === "reasoning_delta") {
    aiPreview.value.reasoningText += payload.delta || "";
    nextTick(() => {
      const el = aiLoadingReasoning.value;
      if (el) el.scrollTop = el.scrollHeight;
    });
    return;
  }
  if (payload.eventType === "output_delta") {
    const delta = payload.delta || "";
    aiPreview.value.outputText += aiPreview.value.outputText ? delta : delta.replace(/^\s+/, "");
    return;
  }
  if (payload.eventType === "error") {
    aiError.value = payload.error || "AI 处理失败";
    aiPreview.value = null;
    return;
  }
}

async function listenAiStream(requestId: string) {
  const eventApi = (window as any).transferGenieApi?.event;
  const tauriListen = (window as any).__TAURI__?.event?.listen;
  const handler = (event: any) => appendAiStreamEvent(event?.payload || {});
  if (eventApi?.listen) return eventApi.listen("ai-text-stream", handler);
  if (tauriListen) return tauriListen("ai-text-stream", handler);
  return null;
}

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

const aiSettings = computed(() => {
  const store = (window as any).transferGenieVue?.store;
  return store?.settingsForm || {};
});

const aiActions = computed(() => {
  const actions = Array.isArray(aiSettings.value.aiActions) ? aiSettings.value.aiActions : [];
  return actions.filter((action: any) => action && action.enabled !== false);
});

const groupedAiActions = computed(() => {
  const groups: Array<{ category: string; actions: any[] }> = [];
  const indexByCategory = new Map<string, number>();
  aiActions.value.forEach((action: any) => {
    const category = String(action?.category || "通用").trim() || "通用";
    let index = indexByCategory.get(category);
    if (index === undefined) {
      index = groups.length;
      indexByCategory.set(category, index);
      groups.push({ category, actions: [] });
    }
    groups[index].actions.push(action);
  });
  return groups;
});

const favoriteAiActions = computed(() => aiActions.value.filter((action: any) => !!action.favorite));

const canRunAi = computed(() => {
  const settings = aiSettings.value;
  return !!settings.aiEnabled && !!String(settings.aiBaseUrl || "").trim() && !!String(settings.aiApiKey || "").trim() && !!String(settings.aiModel || "").trim() && aiActions.value.length > 0;
});

const aiPreviewRows = computed(() => {
  const text = aiPreview.value?.outputText || "";
  const visualLines = text.split(/\r\n|\r|\n/).reduce((count, line) => {
    return count + Math.max(1, Math.ceil(Array.from(line).length / 56));
  }, 0);
  return Math.min(14, Math.max(4, visualLines));
});

function defaultAiActionId() {
  const settings = aiSettings.value;
  const configured = String(settings.aiDefaultActionId || "polish");
  if (aiActions.value.some((action: any) => action.id === configured)) return configured;
  return aiActions.value[0]?.id || "polish";
}

function getPlainSelection() {
  const textarea = textEl.value;
  const text = props.draft.text || "";
  if (!textarea) return { mode: "draft" as const, text, start: 0, end: text.length };
  const start = typeof textarea.selectionStart === "number" ? textarea.selectionStart : 0;
  const end = typeof textarea.selectionEnd === "number" ? textarea.selectionEnd : start;
  if (end > start) return { mode: "selection" as const, text: text.slice(start, end), start, end };
  return { mode: "draft" as const, text, start: 0, end: text.length };
}

function getMarkdownSelection(preferSelection = false) {
  const text = props.draft.text || "";
  const cm = editor?.cm;
  if (cm && preferSelection && typeof cm.getSelection === "function") {
    const selected = String(cm.getSelection() || "");
    if (selected) return { mode: "selection" as const, text: selected, start: -1, end: -1 };
  }
  return { mode: "draft" as const, text, start: 0, end: text.length };
}

function currentAiInput(preferSelection = false) {
  return isMarkdown.value ? getMarkdownSelection(preferSelection) : getPlainSelection();
}

async function runAiAction(actionId?: string, preferSelection = false) {
  aiMenu.value = null;
  aiError.value = "";
  if (!canRunAi.value) {
    aiError.value = "请先在设置中启用并配置 AI。";
    return;
  }
  const input = currentAiInput(preferSelection);
  if (!input.text.trim()) {
    aiError.value = "请先输入或选中需要处理的文本。";
    return;
  }
  aiBusy.value = true;
  activeAiRequestId = createAiRequestId();
  aiPreview.value = {
    title: "AI 处理中...",
    sourceText: input.text,
    outputText: "",
    reasoningText: "",
    mode: input.mode,
    selectionStart: input.start,
    selectionEnd: input.end,
  };
  let unlisten: any = null;
  try {
    const api = (window as any).transferGenieApi;
    const payload = {
      actionId: actionId || defaultAiActionId(),
      text: input.text,
      format: props.draft.format,
    };
    const tauriInvoke = (window as any).__TAURI__?.core?.invoke || (window as any).__TAURI__?.invoke;
    const streamInvoke = api?.ai?.processTextStream
      ? (requestId: string, request: any) => api.ai.processTextStream(requestId, request)
      : tauriInvoke
        ? (requestId: string, request: any) => tauriInvoke("process_text_with_ai_stream", { requestId, request })
        : null;
    if (streamInvoke) {
      unlisten = await listenAiStream(activeAiRequestId);
      await streamInvoke(activeAiRequestId, payload);
    } else {
      const result = api?.ai?.processText
        ? await api.ai.processText(payload)
        : api?.invoke
          ? await api.invoke("process_text_with_ai", { request: payload })
          : await tauriInvoke("process_text_with_ai", { request: payload });
      aiPreview.value = {
        title: result?.actionName || "AI 处理结果",
        sourceText: input.text,
        outputText: result?.outputText || "",
        reasoningText: result?.reasoningText || "",
        mode: input.mode,
        selectionStart: input.start,
        selectionEnd: input.end,
      };
    }
  } catch (error: any) {
    aiError.value = String(error || "AI 处理失败");
    aiPreview.value = null;
  } finally {
    if (typeof unlisten === "function") {
      try { unlisten(); } catch (e) { /* ignore */ }
    }
    aiBusy.value = false;
  }
}

function applyAiPreview(mode?: "replace" | "insert") {
  const preview = aiPreview.value;
  if (!preview) return;
  const output = preview.outputText || "";
  if (isMarkdown.value && editor?.cm) {
    const cm = editor.cm;
    if (mode === "insert") {
      cm.replaceSelection(output);
    } else if (preview.mode === "selection" && typeof cm.replaceSelection === "function") {
      cm.replaceSelection(output);
    } else if (typeof editor.setMarkdown === "function") {
      editor.setMarkdown(output);
    } else if (typeof cm.setValue === "function") {
      cm.setValue(output);
    }
    try { composerStore.setDraftText(props.draft.id, cm.getValue()); } catch (e) { /* ignore */ }
  } else {
    const current = props.draft.text || "";
    let next = output;
    let cursor = output.length;
    if (mode === "insert" && textEl.value) {
      const start = textEl.value.selectionStart || 0;
      const end = textEl.value.selectionEnd || start;
      next = current.slice(0, start) + output + current.slice(end);
      cursor = start + output.length;
    } else if (preview.mode === "selection" && preview.selectionStart >= 0 && preview.selectionEnd >= preview.selectionStart) {
      next = current.slice(0, preview.selectionStart) + output + current.slice(preview.selectionEnd);
      cursor = preview.selectionStart + output.length;
    }
    composerStore.setDraftText(props.draft.id, next);
    setTimeout(() => {
      if (textEl.value) textEl.value.setSelectionRange(cursor, cursor);
    }, 0);
  }
  aiPreview.value = null;
}

function closeAiPreview() { aiPreview.value = null; }

function onEditorContextMenu(event: MouseEvent) {
  onActivated();
  const input = currentAiInput(true);
  if (!input.text.trim()) return;
  event.preventDefault();
  aiMenuPreferSelection.value = true;
  aiMenu.value = { x: event.clientX, y: event.clientY };
}

function closeAiMenu() { aiMenu.value = null; }

function toggleAiActionFavorite(action: any) {
  const store = (window as any).transferGenieVue?.store;
  const actions = Array.isArray(store?.settingsForm?.aiActions) ? store.settingsForm.aiActions : [];
  const index = actions.findIndex((item: any) => item && item.id === action?.id);
  if (index < 0) return;
  (window as any).transferGenieVue?.callAction?.("updateAiActionField", index, "favorite", !action.favorite);
}

function openAiActionMenu(event: MouseEvent) {
  onActivated();
  if (!canRunAi.value || aiBusy.value) return;
  const target = event.currentTarget as HTMLElement;
  const rect = target.getBoundingClientRect();
  aiMenuPreferSelection.value = false;
  const menuWidth = 132;
  const x = Math.max(8, Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 8));
  const y = Math.max(8, Math.min(rect.bottom + 4, window.innerHeight - 8));
  aiMenu.value = { x, y };
}

function onPreviewInput(event: Event) {
  if (!aiPreview.value) return;
  aiPreview.value.outputText = (event.target as HTMLTextAreaElement).value;
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
    <div class="cw-ai-bar">
      <div class="cw-ai-split-button">
        <button class="cw-btn cw-ai-main-button" type="button" :disabled="aiBusy || !canRunAi" @click="runAiAction(defaultAiActionId(), false)" title="使用默认提示词润色">
          <span>{{ aiBusy ? '处理中...' : '一键润色' }}</span>
        </button>
        <button class="cw-btn cw-ai-dropdown-button" type="button" :disabled="aiBusy || !canRunAi" @click="openAiActionMenu" title="选择提示词" aria-label="选择提示词">
          <span class="cw-ai-chevron" aria-hidden="true"></span>
        </button>
      </div>
      <span v-if="aiError" class="cw-ai-error">{{ aiError }}</span>
    </div>
    <div v-if="isMarkdown" class="cw-md-wrap" ref="mdWrap" @focusin="onActivated" @contextmenu="onEditorContextMenu"></div>
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
      @contextmenu="onEditorContextMenu"
    ></textarea>
    <div v-if="aiMenu" class="cw-ai-menu-backdrop" @click="closeAiMenu" @contextmenu.prevent="closeAiMenu"></div>
    <div v-if="aiMenu" class="cw-ai-menu" :style="{ left: aiMenu.x + 'px', top: aiMenu.y + 'px' }" @contextmenu.prevent>
      <div v-if="favoriteAiActions.length" class="cw-ai-menu-group cw-ai-menu-favorite-group">
        <button type="button" class="cw-ai-menu-category-item">
          <span>收藏</span>
          <span class="cw-ai-menu-arrow" aria-hidden="true"></span>
        </button>
        <div class="cw-ai-submenu">
          <div v-for="action in favoriteAiActions" :key="action.id" class="cw-ai-action-row">
            <button type="button" class="cw-ai-menu-item" @click="runAiAction(action.id, aiMenuPreferSelection)">
              <span>{{ action.name || action.id }}</span>
            </button>
            <button type="button" class="cw-ai-favorite-button is-active" title="取消收藏" @click.stop="toggleAiActionFavorite(action)"><span aria-hidden="true">♥</span></button>
          </div>
        </div>
      </div>
      <div v-for="group in groupedAiActions" :key="group.category" class="cw-ai-menu-group">
        <button type="button" class="cw-ai-menu-category-item">
          <span>{{ group.category }}</span>
          <span class="cw-ai-menu-arrow" aria-hidden="true"></span>
        </button>
        <div class="cw-ai-submenu">
          <div v-for="action in group.actions" :key="action.id" class="cw-ai-action-row">
            <button type="button" class="cw-ai-menu-item" @click="runAiAction(action.id, aiMenuPreferSelection)">
              <span>{{ action.name || action.id }}</span>
            </button>
            <button type="button" class="cw-ai-favorite-button" :class="{ 'is-active': action.favorite }" :title="action.favorite ? '取消收藏' : '收藏'" @click.stop="toggleAiActionFavorite(action)"><span aria-hidden="true">♥</span></button>
          </div>
        </div>
      </div>
    </div>
    <div v-if="aiBusy" class="cw-ai-loading-backdrop">
      <div class="cw-ai-loading-box" role="status" aria-live="polite">
        <span class="cw-ai-loading-spinner" aria-hidden="true"></span>
        <div class="cw-ai-loading-text">
          <strong>AI 正在处理...</strong>
          <span>完成后将显示结果预览</span>
        </div>
        <div v-if="aiPreview?.reasoningText" ref="aiLoadingReasoning" class="cw-ai-loading-reasoning">
          <pre>{{ aiPreview.reasoningText }}</pre>
        </div>
      </div>
    </div>
    <div v-if="aiPreview && !aiBusy" class="cw-modal-backdrop" @click.self="closeAiPreview">
      <div class="cw-modal cw-ai-preview">
        <div class="cw-modal-title cw-ai-preview-title">{{ aiPreview.title }}</div>
        <textarea class="cw-ai-preview-text" :rows="aiPreviewRows" :value="aiPreview.outputText" @input="onPreviewInput"></textarea>
        <div class="cw-modal-actions">
          <button class="cw-btn" type="button" @click="closeAiPreview">取消</button>
          <button class="cw-btn" type="button" :disabled="!aiPreview.outputText" @click="applyAiPreview('insert')">插入</button>
          <button class="cw-btn cw-btn-primary" type="button" :disabled="!aiPreview.outputText" @click="applyAiPreview('replace')">替换</button>
        </div>
      </div>
    </div>
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
