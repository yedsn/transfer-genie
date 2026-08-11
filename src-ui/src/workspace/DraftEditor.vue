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
type SubmenuSide = "left" | "right";
type SubmenuAlign = "down" | "up";
const aiMenu = ref<{ x: number; y: number; submenuSide: SubmenuSide; submenuAlign: SubmenuAlign; anchorBottom: number } | null>(null);
const editorMenu = ref<{
  x: number;
  y: number;
  selectionText: string;
} | null>(null);
const editorAiMenu = ref<{ x: number; y: number; side: SubmenuSide; anchorBottom: number } | null>(null);
const editorAiActionMenu = ref<{ x: number; y: number; actions: any[]; favorite: boolean; anchorBottom: number } | null>(null);
const aiMenuPreferSelection = ref(false);
const aiMenuEl = ref<HTMLElement | null>(null);
const editorMenuEl = ref<HTMLElement | null>(null);
const editorAiMenuEl = ref<HTMLElement | null>(null);
const editorAiActionMenuEl = ref<HTMLElement | null>(null);
const aiLoadingReasoning = ref<HTMLElement | null>(null);
const aiPromptDialogOpen = ref(false);
const aiPromptText = ref("");
const aiPromptLibraryOpen = ref(false);
const aiPromptSaveOpen = ref(false);
const aiPromptSaveName = ref("");
const aiPromptSaveCategory = ref("自定义");
const aiPromptSaveBusy = ref(false);
const aiPromptSaveError = ref("");
const sendHotkeyValue = ref("enter");
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
let visibilityListener: ((event: Event) => void) | null = null;
let sendHotkeyListener: ((event: Event) => void) | null = null;
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

function syncSendHotkey(value?: string) {
  const bridge = (window as any).transferGenieComposer;
  const next = value || bridge?.getSendHotkey?.() || (window as any).transferGenieSendHotkey || "enter";
  sendHotkeyValue.value = next === "ctrl_enter" ? "ctrl_enter" : "enter";
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

const aiPromptCategories = computed(() => groupedAiActions.value.map((group) => group.category));

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

const sendHotkeyTitle = computed(() => {
  return sendHotkeyValue.value === "ctrl_enter" ? "Ctrl+Enter" : "Enter";
});

const aiPromptRunTitle = computed(() => `分析（${sendHotkeyTitle.value}）`);

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

async function runAiAction(actionId?: string, preferSelection = false, temporaryPrompt?: any) {
  aiMenu.value = null;
  editorMenu.value = null;
  editorAiActionMenu.value = null;
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
    const payload: any = {
      text: input.text,
      format: props.draft.format,
    };
    if (temporaryPrompt) payload.temporaryPrompt = temporaryPrompt;
    else payload.actionId = actionId || defaultAiActionId();
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

function openAiPromptDialog() {
  onActivated();
  aiError.value = "";
  aiPromptSaveError.value = "";
  if (!canRunAi.value || aiBusy.value) return;
  aiPromptText.value = "";
  aiPromptSaveName.value = "";
  aiPromptSaveCategory.value = aiPromptCategories.value[0] || "自定义";
  aiPromptLibraryOpen.value = false;
  aiPromptSaveOpen.value = false;
  aiPromptDialogOpen.value = true;
}

function closeAiPromptDialog() {
  if (aiPromptSaveBusy.value) return;
  aiPromptDialogOpen.value = false;
  aiPromptLibraryOpen.value = false;
  aiPromptSaveOpen.value = false;
  aiPromptSaveError.value = "";
}

function toggleAiPromptLibrary() {
  aiPromptSaveOpen.value = false;
  aiPromptSaveError.value = "";
  aiPromptLibraryOpen.value = !aiPromptLibraryOpen.value;
}

function selectPromptLibraryAction(action: any) {
  aiPromptText.value = String(action?.user_prompt || action?.userPrompt || "");
  aiPromptSaveName.value = String(action?.builtin ? "" : action?.name || "").trim();
  aiPromptSaveCategory.value = String(action?.category || aiPromptSaveCategory.value || "自定义").trim() || "自定义";
  aiPromptLibraryOpen.value = false;
}

function openAiPromptSave() {
  aiPromptLibraryOpen.value = false;
  aiPromptSaveError.value = "";
  if (!aiPromptText.value.trim()) {
    aiPromptSaveError.value = "请先输入提示词。";
    return;
  }
  aiPromptSaveOpen.value = true;
}

async function saveAiPromptToLibrary() {
  aiPromptSaveError.value = "";
  const prompt = aiPromptText.value.trim();
  const name = aiPromptSaveName.value.trim();
  const category = aiPromptSaveCategory.value.trim();
  if (!prompt) { aiPromptSaveError.value = "请先输入提示词。"; return; }
  if (!name) { aiPromptSaveError.value = "请填写提示词名称。"; return; }
  if (!category) { aiPromptSaveError.value = "请填写提示词类型。"; return; }
  aiPromptSaveBusy.value = true;
  try {
    const action = await (window as any).transferGenieVue?.callAction?.("saveComposerAiPrompt", {
      name,
      category,
      userPrompt: prompt,
      systemPrompt: "你是一个可靠的中文内容处理助手。",
      outputMode: "preview_replace",
    });
    aiPromptSaveOpen.value = false;
    if (action?.name) aiPromptSaveName.value = action.name;
  } catch (error: any) {
    aiPromptSaveError.value = String(error?.message || error || "保存提示词失败");
  } finally {
    aiPromptSaveBusy.value = false;
  }
}

async function runAiPromptDialog() {
  const prompt = aiPromptText.value.trim();
  if (!prompt) {
    aiError.value = "请先输入提示词。";
    return;
  }
  aiPromptDialogOpen.value = false;
  await runAiAction(undefined, false, {
    name: "分析结果",
    category: "临时",
    systemPrompt: "你是一个可靠的中文内容处理助手。请严格按照用户要求处理内容，只输出最终处理结果，不输出思路、步骤、解释、分析过程或任何过程性文字。",
    userPrompt: `${prompt}\n\n请根据以上要求处理下面的内容。只输出处理后的最终结果，不要输出处理思路、步骤、解释或分析过程。\n\n{{text}}`,
    outputMode: "preview_replace",
  });
}

function handleAiPromptKeydown(event: KeyboardEvent) {
  if (!shouldSendForEnter(event)) return;
  event.preventDefault();
  event.stopPropagation();
  if (aiBusy.value || !aiPromptText.value.trim()) return;
  runAiPromptDialog();
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

function clampMenuPosition(x: number, y: number, width: number, height: number) {
  const gap = 8;
  return {
    x: Math.max(gap, Math.min(x, window.innerWidth - width - gap)),
    y: Math.max(gap, Math.min(y, window.innerHeight - height - gap)),
  };
}

function estimateAiMenuHeight() {
  const categoryCount = groupedAiActions.value.length + (favoriteAiActions.value.length ? 1 : 0);
  const favoriteDividerHeight = favoriteAiActions.value.length ? 5 : 0;
  return Math.min(window.innerHeight - 16, 12 + categoryCount * 30 + favoriteDividerHeight);
}

function estimateAiSubmenuHeight() {
  const actionCounts = groupedAiActions.value.map((group) => group.actions.length);
  if (favoriteAiActions.value.length) actionCounts.push(favoriteAiActions.value.length);
  const maxActions = Math.max(1, ...actionCounts);
  return Math.min(window.innerHeight - 16, 12 + maxActions * 30);
}

function getSubmenuPlacement(x: number, y: number, menuWidth: number, submenuWidth: number, submenuHeight: number) {
  const gap = 8;
  return {
    submenuSide: x + menuWidth + submenuWidth + gap > window.innerWidth ? "left" as SubmenuSide : "right" as SubmenuSide,
    submenuAlign: y + submenuHeight + gap > window.innerHeight ? "up" as SubmenuAlign : "down" as SubmenuAlign,
  };
}

async function adjustFloatingMenuPosition(kind: "ai" | "editor") {
  await nextTick();
  const menu = kind === "ai" ? aiMenu.value : editorMenu.value;
  const el = kind === "ai" ? aiMenuEl.value : editorMenuEl.value;
  if (!menu || !el) return;
  const rect = el.getBoundingClientRect();
  const next = clampMenuPosition(menu.x, menu.y, rect.width, rect.height);
  const submenuWidth = kind === "ai" ? 176 : 132;
  const submenuHeight = 320;
  const placement = getSubmenuPlacement(next.x, next.y, rect.width, submenuWidth, submenuHeight);
  if (kind === "ai" && aiMenu.value) aiMenu.value = { ...aiMenu.value, ...next, ...placement, submenuAlign: "up" };
  else if (kind === "editor" && editorMenu.value) editorMenu.value = { ...editorMenu.value, ...next };
}

async function adjustEditorAiMenuPosition() {
  await nextTick();
  const menu = editorAiMenu.value;
  const el = editorAiMenuEl.value;
  if (!menu || !el) return;
  const rect = el.getBoundingClientRect();
  const next = clampMenuPosition(menu.x, menu.anchorBottom - rect.height, rect.width, rect.height);
  editorAiMenu.value = { ...menu, ...next, anchorBottom: next.y + rect.height };
}

async function adjustEditorAiActionMenuPosition() {
  await nextTick();
  const menu = editorAiActionMenu.value;
  const el = editorAiActionMenuEl.value;
  if (!menu || !el) return;
  const rect = el.getBoundingClientRect();
  const next = clampMenuPosition(menu.x, menu.anchorBottom - rect.height, rect.width, rect.height);
  editorAiActionMenu.value = { ...menu, ...next };
}

function onEditorContextMenu(event: MouseEvent) {
  onActivated();
  event.preventDefault();
  aiMenuPreferSelection.value = true;
  const menuWidth = 148;
  const menuHeight = 154;
  const { x, y } = clampMenuPosition(event.clientX, event.clientY, menuWidth, menuHeight);
  editorMenu.value = {
    x,
    y,
    selectionText: getEditorSelectionText(),
  };
  editorAiMenu.value = null;
  editorAiActionMenu.value = null;
  adjustFloatingMenuPosition("editor");
}

function closeAiMenu() { aiMenu.value = null; }
function closeEditorMenu() {
  editorMenu.value = null;
  editorAiMenu.value = null;
  editorAiActionMenu.value = null;
}

function openEditorAiMenu(event: MouseEvent) {
  if (!editorMenu.value || !editorMenu.value.selectionText.trim()) return;
  const target = event.currentTarget as HTMLElement;
  const rect = target.getBoundingClientRect();
  const parentRect = editorMenuEl.value?.getBoundingClientRect();
  const menuWidth = 132;
  const menuHeight = 320;
  const openLeft = rect.right + menuWidth + 8 > window.innerWidth;
  const x = openLeft ? rect.left - menuWidth + 2 : rect.right - 2;
  const anchorBottom = parentRect?.bottom || rect.bottom + menuHeight;
  const y = Math.max(8, Math.min(anchorBottom - menuHeight, window.innerHeight - menuHeight - 8));
  editorAiMenu.value = { x, y, side: openLeft ? "left" : "right", anchorBottom };
  editorAiActionMenu.value = null;
  adjustEditorAiMenuPosition();
}

function openEditorAiActionMenu(event: MouseEvent, actions: any[], favorite = false) {
  if (!editorMenu.value || !editorAiMenu.value || !Array.isArray(actions) || !actions.length) return;
  const target = event.currentTarget as HTMLElement;
  const rect = target.getBoundingClientRect();
  const parentRect = editorAiMenuEl.value?.getBoundingClientRect();
  const menuWidth = 176;
  const menuHeight = 320;
  const openLeft = rect.right + menuWidth + 8 > window.innerWidth;
  const x = openLeft ? rect.left - menuWidth + 2 : rect.right - 2;
  const anchorBottom = parentRect?.bottom || rect.bottom + menuHeight;
  const y = Math.max(8, Math.min(anchorBottom - menuHeight, window.innerHeight - menuHeight - 8));
  editorAiActionMenu.value = { x, y, actions, favorite, anchorBottom };
  adjustEditorAiActionMenuPosition();
}

function getEditorSelectionText() {
  if (isMarkdown.value && editor?.cm && typeof editor.cm.getSelection === "function") {
    return String(editor.cm.getSelection() || "");
  }
  const textarea = textEl.value;
  if (!textarea) return "";
  const start = textarea.selectionStart || 0;
  const end = textarea.selectionEnd || start;
  return (props.draft.text || "").slice(start, end);
}

function focusEditor() {
  try {
    if (isMarkdown.value && editor?.cm) editor.cm.focus();
    else textEl.value?.focus();
  } catch (e) { /* ignore */ }
}

function replaceEditorSelection(text: string) {
  if (isMarkdown.value && editor?.cm) {
    const cm = editor.cm;
    cm.replaceSelection(text);
    try { composerStore.setDraftText(props.draft.id, cm.getValue()); } catch (e) { /* ignore */ }
    return;
  }
  const textarea = textEl.value;
  const current = props.draft.text || "";
  const start = textarea?.selectionStart || 0;
  const end = textarea?.selectionEnd || start;
  const next = current.slice(0, start) + text + current.slice(end);
  composerStore.setDraftText(props.draft.id, next);
  setTimeout(() => textarea?.setSelectionRange(start + text.length, start + text.length), 0);
}

async function copyEditorSelection() {
  const selected = editorMenu.value?.selectionText || getEditorSelectionText();
  if (!selected) return;
  closeEditorMenu();
  try { await navigator.clipboard.writeText(selected); } catch (e) { focusEditor(); document.execCommand("copy"); }
}

async function cutEditorSelection() {
  const selected = editorMenu.value?.selectionText || getEditorSelectionText();
  if (!selected) return;
  closeEditorMenu();
  try { await navigator.clipboard.writeText(selected); } catch (e) { /* ignore */ }
  replaceEditorSelection("");
}

async function pasteIntoEditor() {
  closeEditorMenu();
  focusEditor();
  try {
    const text = await navigator.clipboard.readText();
    replaceEditorSelection(text);
  } catch (e) {
    document.execCommand("paste");
  }
}

function selectAllEditorText() {
  closeEditorMenu();
  if (isMarkdown.value && editor?.cm && typeof editor.cm.execCommand === "function") {
    editor.cm.execCommand("selectAll");
    editor.cm.focus();
    return;
  }
  const textarea = textEl.value;
  if (!textarea) return;
  textarea.focus();
  textarea.select();
}

function toggleAiActionFavorite(action: any) {
  const store = (window as any).transferGenieVue?.store;
  const actions = Array.isArray(store?.settingsForm?.aiActions) ? store.settingsForm.aiActions : [];
  const index = actions.findIndex((item: any) => item && item.id === action?.id);
  if (index < 0) return;
  (window as any).transferGenieVue?.callAction?.("updateAiActionFavorite", index, !action.favorite, { save: true });
}

function openAiActionMenu(event: MouseEvent) {
  onActivated();
  if (!canRunAi.value || aiBusy.value) return;
  const target = event.currentTarget as HTMLElement;
  const rect = target.getBoundingClientRect();
  aiMenuPreferSelection.value = false;
  const menuWidth = 132;
  const menuHeight = estimateAiMenuHeight();
  const submenuWidth = 176;
  const submenuHeight = estimateAiSubmenuHeight();
  const { x, y } = clampMenuPosition(rect.right - menuWidth, rect.bottom + 4, menuWidth, menuHeight);
  const anchorBottom = y + menuHeight;
  aiMenu.value = { x, y, ...getSubmenuPlacement(x, y, menuWidth, submenuWidth, submenuHeight), submenuAlign: "up", anchorBottom };
  adjustFloatingMenuPosition("ai");
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

function handleEscapeKeydown(event: KeyboardEvent) {
  if (event.key !== "Escape" || event.defaultPrevented || event.isComposing) return false;
  if (document.querySelector(".dialog-overlay, .cw-modal-backdrop")) return false;
  event.preventDefault();
  event.stopPropagation();
  const legacy = (window as any).transferGenieLegacyFullscreen;
  if (isComposerFullscreen()) {
    if (legacy && typeof legacy.set === "function") legacy.set(false);
    else {
      document.documentElement.classList.remove("composer-fullscreen-active");
      document.body.classList.remove("composer-fullscreen-active");
      window.dispatchEvent(new CustomEvent("transfer-genie:composer-fullscreen-change", { detail: { enabled: false } }));
    }
    return true;
  }
  const appApi = (window as any).transferGenieApi?.app;
  const tauriInvoke = (window as any).__TAURI__?.core?.invoke || (window as any).__TAURI__?.invoke;
  if (appApi?.minimizeWindow) appApi.minimizeWindow().catch(() => {});
  else if (tauriInvoke) tauriInvoke("minimize_window").catch(() => {});
  return true;
}

function handleEditorKeydown(event: KeyboardEvent) {
  if (handleEscapeKeydown(event)) return;
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
  syncSendHotkey();
  sendHotkeyListener = (event: Event) => {
    const custom = event as CustomEvent<{ sendHotkey?: string }>;
    syncSendHotkey(custom.detail?.sendHotkey);
  };
  fullscreenListener = (event: Event) => {
    const custom = event as CustomEvent<{ enabled?: boolean }>;
    const fullscreen = typeof custom?.detail?.enabled === "boolean" ? custom.detail.enabled : isComposerFullscreen();
    window.requestAnimationFrame(() => {
      refreshMarkdownLayout(fullscreen);
    });
  };
  visibilityListener = (event: Event) => {
    const custom = event as CustomEvent<{ visible?: boolean }>;
    if (custom?.detail?.visible === false) return;
    window.requestAnimationFrame(() => refreshMarkdownLayout());
  };
  resizeListener = () => refreshMarkdownLayout();
  window.addEventListener("transfer-genie:send-hotkey-change", sendHotkeyListener as EventListener);
  window.addEventListener("transfer-genie:composer-fullscreen-change", fullscreenListener as EventListener);
  window.addEventListener("transfer-genie:composer-visibility-change", visibilityListener as EventListener);
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
  if (sendHotkeyListener) window.removeEventListener("transfer-genie:send-hotkey-change", sendHotkeyListener as EventListener);
  if (fullscreenListener) window.removeEventListener("transfer-genie:composer-fullscreen-change", fullscreenListener as EventListener);
  if (visibilityListener) window.removeEventListener("transfer-genie:composer-visibility-change", visibilityListener as EventListener);
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
      <button class="cw-ai-prompt-button" type="button" :disabled="aiBusy || !canRunAi" @click="openAiPromptDialog" title="输入提示词" aria-label="输入提示词">
        <img src="/icons/ai.svg" alt="" aria-hidden="true" />
      </button>
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
    <div v-if="aiMenu" ref="aiMenuEl" class="cw-ai-menu cw-ai-menu-bottom-aligned" :style="{ left: aiMenu.x + 'px', top: aiMenu.y + 'px' }" @contextmenu.prevent>
      <div v-if="favoriteAiActions.length" class="cw-ai-menu-group cw-ai-menu-favorite-group">
        <button type="button" class="cw-ai-menu-category-item">
          <span>收藏</span>
          <span class="cw-ai-menu-arrow" aria-hidden="true"></span>
        </button>
        <div class="cw-ai-submenu" :class="{ 'is-left': aiMenu.submenuSide === 'left', 'is-up': aiMenu.submenuAlign === 'up' }">
          <div v-for="action in favoriteAiActions" :key="action.id" class="cw-ai-action-row">
            <button type="button" class="cw-ai-menu-item" @click="runAiAction(action.id, aiMenuPreferSelection)">
              <span>{{ action.name || action.id }}</span>
            </button>
            <button type="button" class="cw-ai-favorite-button is-active" title="取消收藏" @click.stop="toggleAiActionFavorite(action)"><span aria-hidden="true">★</span></button>
          </div>
        </div>
      </div>
      <div v-for="group in groupedAiActions" :key="group.category" class="cw-ai-menu-group">
        <button type="button" class="cw-ai-menu-category-item">
          <span>{{ group.category }}</span>
          <span class="cw-ai-menu-arrow" aria-hidden="true"></span>
        </button>
        <div class="cw-ai-submenu" :class="{ 'is-left': aiMenu.submenuSide === 'left', 'is-up': aiMenu.submenuAlign === 'up' }">
          <div v-for="action in group.actions" :key="action.id" class="cw-ai-action-row">
            <button type="button" class="cw-ai-menu-item" @click="runAiAction(action.id, aiMenuPreferSelection)">
              <span>{{ action.name || action.id }}</span>
            </button>
            <button type="button" class="cw-ai-favorite-button" :class="{ 'is-active': action.favorite }" :title="action.favorite ? '取消收藏' : '收藏'" @click.stop="toggleAiActionFavorite(action)"><span aria-hidden="true">★</span></button>
          </div>
        </div>
      </div>
    </div>
    <div v-if="editorMenu" class="cw-ai-menu-backdrop" @click="closeEditorMenu" @contextmenu.prevent="closeEditorMenu"></div>
    <div v-if="editorMenu" ref="editorMenuEl" class="cw-editor-menu" :style="{ left: editorMenu.x + 'px', top: editorMenu.y + 'px' }" @contextmenu.prevent>
      <button type="button" class="cw-editor-menu-item" :disabled="!editorMenu.selectionText" @click="copyEditorSelection">复制</button>
      <button type="button" class="cw-editor-menu-item" :disabled="!editorMenu.selectionText" @click="cutEditorSelection">剪切</button>
      <button type="button" class="cw-editor-menu-item" @click="pasteIntoEditor">粘贴</button>
      <button type="button" class="cw-editor-menu-item" @click="selectAllEditorText">全选</button>
      <div class="cw-editor-menu-divider"></div>
      <div class="cw-editor-menu-group" @mouseenter="openEditorAiMenu">
        <button type="button" class="cw-editor-menu-item cw-editor-menu-sub-trigger" :disabled="!editorMenu.selectionText.trim()">
          <span>AI</span>
          <span class="cw-ai-menu-arrow" aria-hidden="true"></span>
        </button>
      </div>
    </div>
    <div
      v-if="editorAiMenu"
      ref="editorAiMenuEl"
      class="cw-ai-submenu cw-editor-ai-submenu cw-editor-ai-menu-floating"
      :style="{ left: editorAiMenu.x + 'px', top: editorAiMenu.y + 'px' }"
      @contextmenu.prevent
    >
      <div v-if="favoriteAiActions.length" class="cw-ai-menu-group cw-ai-menu-favorite-group" @mouseenter="openEditorAiActionMenu($event, favoriteAiActions, true)">
        <button type="button" class="cw-ai-menu-category-item">
          <span>收藏</span>
          <span class="cw-ai-menu-arrow" aria-hidden="true"></span>
        </button>
      </div>
      <div v-for="group in groupedAiActions" :key="'editor-' + group.category" class="cw-ai-menu-group" @mouseenter="openEditorAiActionMenu($event, group.actions, false)">
        <button type="button" class="cw-ai-menu-category-item">
          <span>{{ group.category }}</span>
          <span class="cw-ai-menu-arrow" aria-hidden="true"></span>
        </button>
      </div>
    </div>
    <div
      v-if="editorAiActionMenu"
      ref="editorAiActionMenuEl"
      class="cw-ai-submenu cw-editor-ai-action-menu"
      :style="{ left: editorAiActionMenu.x + 'px', top: editorAiActionMenu.y + 'px' }"
      @contextmenu.prevent
    >
      <div v-for="action in editorAiActionMenu.actions" :key="'editor-action-' + action.id" class="cw-ai-action-row">
        <button type="button" class="cw-ai-menu-item" @click="runAiAction(action.id, true)">
          <span>{{ action.name || action.id }}</span>
        </button>
        <button
          type="button"
          class="cw-ai-favorite-button"
          :class="{ 'is-active': action.favorite }"
          :title="action.favorite ? '取消收藏' : '收藏'"
          @click.stop="toggleAiActionFavorite(action)"
        ><span aria-hidden="true">★</span></button>
      </div>
    </div>
    <div v-if="aiPromptDialogOpen" class="cw-modal-backdrop" @click.self="closeAiPromptDialog">
      <div class="cw-modal cw-ai-prompt-dialog">
        <div class="cw-modal-title cw-ai-prompt-title">
          <span>AI 提示词</span>
          <button class="cw-ai-prompt-close" type="button" @click="closeAiPromptDialog" aria-label="关闭">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>
        <div class="cw-ai-prompt-shell">
          <div class="cw-ai-prompt-composer">
            <textarea
              class="cw-ai-prompt-input"
              v-model="aiPromptText"
              placeholder="输入提示词，告诉 AI 如何处理当前内容..."
              spellcheck="false"
              @keydown="handleAiPromptKeydown"
            ></textarea>
          </div>
          <div class="cw-ai-prompt-action-row">
            <div class="cw-ai-prompt-tools">
              <button class="cw-ai-prompt-tool" type="button" @click="toggleAiPromptLibrary" title="提示词库" aria-label="提示词库">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19.5V5.25A2.25 2.25 0 0 1 6.25 3H20v15H6.25A2.25 2.25 0 0 0 4 20.25" /><path d="M8 7h8M8 11h6" /></svg>
              </button>
              <button class="cw-ai-prompt-tool" type="button" @click="openAiPromptSave" title="保存到提示词库" aria-label="保存到提示词库">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z" /><path d="M7 3v6h8M7 21v-7h10v7" /></svg>
              </button>
            </div>
            <button class="cw-btn cw-btn-primary cw-ai-prompt-run" type="button" :disabled="aiBusy || !aiPromptText.trim()" :title="aiPromptRunTitle" @click="runAiPromptDialog">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l1.7 4.6L18 9.3l-4.3 1.7L12 16l-1.7-5L6 9.3l4.3-1.7L12 3Z" /><path d="M19 14l.8 2.2L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.8L19 14Z" /></svg>
              <span>分析</span>
            </button>
          </div>
        </div>
        <div v-if="aiPromptLibraryOpen" class="cw-ai-prompt-library">
          <div v-for="group in groupedAiActions" :key="group.category" class="cw-ai-prompt-library-group">
            <div class="cw-ai-prompt-library-title">{{ group.category }}</div>
            <button v-for="action in group.actions" :key="action.id" class="cw-ai-prompt-chip" type="button" @click="selectPromptLibraryAction(action)">
              {{ action.name || action.id }}
            </button>
          </div>
        </div>
        <div v-if="aiPromptSaveOpen" class="cw-ai-prompt-save">
          <label>
            <span>名称</span>
            <input v-model="aiPromptSaveName" type="text" placeholder="提示词名称" />
          </label>
          <label>
            <span>类型</span>
            <input v-model="aiPromptSaveCategory" type="text" list="cw-ai-prompt-categories" placeholder="提示词类型" />
          </label>
          <datalist id="cw-ai-prompt-categories">
            <option v-for="category in aiPromptCategories" :key="category" :value="category"></option>
          </datalist>
          <div class="cw-ai-prompt-save-actions">
            <button class="cw-btn" type="button" :disabled="aiPromptSaveBusy" @click="aiPromptSaveOpen = false">取消保存</button>
            <button class="cw-btn cw-btn-primary" type="button" :disabled="aiPromptSaveBusy" @click="saveAiPromptToLibrary">{{ aiPromptSaveBusy ? '保存中...' : '确认保存' }}</button>
          </div>
        </div>
        <div v-if="aiPromptSaveError" class="cw-ai-prompt-error">{{ aiPromptSaveError }}</div>
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
