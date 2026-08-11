<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { composerStore } from "./composer-store";
import DraftEditor from "./DraftEditor.vue";

const state = composerStore.state;
const mainEl = ref<HTMLElement | null>(null);
const hoverZone = ref<Record<string, string>>({});
const destructivePrompt = ref<{ title: string; body: string; action: () => void } | null>(null);

const orderedPanes = computed(() =>
  state.paneOrder.map((id) => state.panes.find((p) => p.id === id)).filter(Boolean)
);
const layoutClasses = computed(() => ({
  "is-single": state.layout === "single",
  "is-horizontal": state.layout === "horizontal",
  "is-vertical": state.layout === "vertical",
  "is-three-column": state.layout === "three-column",
}));
const canSplitH = computed(() => state.layout === "single" || (state.layout === "horizontal" && state.panes.length === 2));
const canSplitV = computed(() => state.layout === "single");
const canCollapse = computed(() => state.layout !== "single");
function draftTitle(tab: any) {
  if (tab.title) return tab.title;
  const preview = (tab.text || "").replace(/\n/g, " ").trim();
  return preview ? preview.slice(0, 16) : "空草稿";
}
function activeTabOf(pane: any) {
  if (!pane.activeTabId) return pane.tabs[0] || null;
  return pane.tabs.find((t: any) => t.id === pane.activeTabId) || pane.tabs[0] || null;
}
function editorKey(pane: any) {
  const t = activeTabOf(pane);
  return t ? t.id : "empty";
}

function addDraft(paneId: string) { composerStore.addDraft(paneId); }
function switchDraft(paneId: string, tabId: string) { composerStore.switchDraft(paneId, tabId); }
function requestDestructiveAction(title: string, body: string, action: () => void) {
  destructivePrompt.value = { title, body, action };
}

function confirmDestructiveAction() {
  const prompt = destructivePrompt.value;
  destructivePrompt.value = null;
  if (prompt) prompt.action();
}

function cancelDestructiveAction() {
  destructivePrompt.value = null;
}

function clearWorkspace() {
  const nonEmpty = state.panes.reduce((sum: number, pane: any) => {
    return sum + pane.tabs.filter((tab: any) => (tab.text || "").trim().length > 0).length;
  }, 0);
  const body = nonEmpty > 0
    ? "将清空全部草稿，其中 " + nonEmpty + " 条有内容。清空后草稿编号会从 1 重新开始。"
    : "将清空全部草稿，并把草稿编号从 1 重新开始。";
  requestDestructiveAction("确认清空草稿", body, () => composerStore.clearWorkspaceConfirmed());
}

function removeDraft(tabId: string) {
  if (composerStore.isDraftNonEmpty(tabId)) {
    requestDestructiveAction("确认关闭草稿", "该草稿有内容，关闭后会丢失。", () => composerStore.removeDraftConfirmed(tabId));
    return;
  }
  composerStore.removeDraftConfirmed(tabId);
}


const ctxMenu = ref<{ x: number; y: number; tabId: string; paneId: string } | null>(null);
function onTabContextMenu(event: MouseEvent, tab: any, paneId: string) {
  event.preventDefault();
  ctxMenu.value = { x: event.clientX, y: event.clientY, tabId: tab.id, paneId };
}
function closeCtxMenu() { ctxMenu.value = null; }
function ctxAction(action: string) {
  const m = ctxMenu.value;
  if (!m) return;
  const { tabId, paneId } = m;
  ctxMenu.value = null;
  switch (action) {
    case "splitRight":
      composerStore.splitTab(tabId, "right");
      break;
    case "splitLeft":
      composerStore.splitTab(tabId, "left");
      break;
    case "splitTop":
      composerStore.splitTab(tabId, "top");
      break;
    case "splitBottom":
      composerStore.splitTab(tabId, "bottom");
      break;
    case "close":
      removeDraft(tabId);
      break;
    case "closeOthers": {
      const nonEmpty = composerStore.countNonEmptyOthersInPane(paneId, tabId);
      const run = () => composerStore.closeOthersInPaneConfirmed(paneId, tabId);
      if (nonEmpty > 0) requestDestructiveAction("确认关闭其他草稿", "将关闭其他草稿，其中 " + nonEmpty + " 条有内容。", run);
      else run();
      break;
    }
    case "closeRight": {
      const nonEmpty = composerStore.countNonEmptyRightInPane(paneId, tabId);
      const run = () => composerStore.closeRightInPaneConfirmed(paneId, tabId);
      if (nonEmpty > 0) requestDestructiveAction("确认关闭右侧草稿", "将关闭右侧草稿，其中 " + nonEmpty + " 条有内容。", run);
      else run();
      break;
    }
    case "closeLeft": {
      const nonEmpty = composerStore.countNonEmptyLeftInPane(paneId, tabId);
      const run = () => composerStore.closeLeftInPaneConfirmed(paneId, tabId);
      if (nonEmpty > 0) requestDestructiveAction("确认关闭左侧草稿", "将关闭左侧草稿，其中 " + nonEmpty + " 条有内容。", run);
      else run();
      break;
    }
    case "closeAll": {
      const nonEmpty = composerStore.countNonEmptyInPane(paneId);
      const run = () => composerStore.closeAllInPaneConfirmed(paneId);
      if (nonEmpty > 0) requestDestructiveAction("确认关闭全部草稿", "将关闭本栏全部草稿，其中 " + nonEmpty + " 条有内容。", run);
      else run();
      break;
    }
  }
}
function onPaneDragOver(event: DragEvent, paneId: string) {
  const drag = (window as any).transferGenieWorkspaceDrag;
  const ctx = (window as any).transferGenieComposerDragCtx;
  if (!ctx || !ctx.payload) return;
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = ctx.payload.kind === "message" ? "copy" : "move";
  const paneEl = (event.currentTarget as HTMLElement);
  const zone = drag.detectDropZone(event, paneEl, mainEl.value);
  hoverZone.value[paneId] = zone === "detach" ? "" : zone;
}
function onPaneDragLeave(paneId: string, event: DragEvent) {
  const paneEl = (event.currentTarget as HTMLElement);
  if (!paneEl.contains(event.relatedTarget as Node)) hoverZone.value[paneId] = "";
}
function onPaneDrop(event: DragEvent, paneId: string) {
  const ctx = (window as any).transferGenieComposerDragCtx;
  if (!ctx || !ctx.payload) return;
  event.preventDefault();
  const drag = (window as any).transferGenieWorkspaceDrag;
  const paneEl = (event.currentTarget as HTMLElement);
  const zone = drag.detectDropZone(event, paneEl, mainEl.value);
  if (ctx.payload.kind === "message") {
    composerStore.dockMessageAsDraft(ctx.payload.message, paneId, zone);
  } else if (ctx.payload.kind === "tab" && ctx.payload.sourceId) {
    if (zone === "center") {
      composerStore.moveDraft(ctx.payload.sourceId, paneId);
    } else {
      composerStore.dockTab(ctx.payload.sourceId, paneId, zone);
    }
  }
  hoverZone.value[paneId] = "";
  ctx.payload = null;
}
function onTabDragStart(event: DragEvent, tab: any, paneId: string) {
  const ctx = (window as any).transferGenieComposerDragCtx;
  const drag = (window as any).transferGenieWorkspaceDrag;
  ctx.payload = drag.createDragPayload({ kind: "tab", sourceId: tab.id, sourcePaneId: paneId, contentKind: tab.kind, sourceRef: tab.sourceRef, title: tab.title });
  if (event.dataTransfer) { event.dataTransfer.setData("text/plain", tab.id); event.dataTransfer.effectAllowed = "move"; }
}
function onDragEnd() {
  const ctx = (window as any).transferGenieComposerDragCtx;
  ctx.payload = null;
}

function requestCollapseToSingle() {
  const keep = state.activePaneId || state.panes[0]?.id || "";
  const losing = composerStore.getCollapseLossCount(keep);
  if (losing > 0) {
    requestDestructiveAction("确认收起为单栏", "收起后会丢弃其他分栏中的 " + losing + " 条草稿。", () => composerStore.collapseConfirmed(keep));
    return;
  }
  composerStore.collapseConfirmed(keep);
}

function closeDestructivePromptOnLayoutChange() {
  if (!destructivePrompt.value) return;
  cancelDestructiveAction();
}
// R5: 放大输入框 —— 合并到工具栏，调用 legacy setComposerFullscreen
const isFullscreen = ref(false);
function readFullscreenState() {
  const legacy = (window as any).transferGenieLegacyFullscreen;
  if (legacy && typeof legacy.get === "function") return !!legacy.get();
  return document.documentElement.classList.contains("composer-fullscreen-active") || document.body.classList.contains("composer-fullscreen-active");
}

function toggleFullscreen() {
  const legacy = (window as any).transferGenieLegacyFullscreen;
  const next = !readFullscreenState();
  if (legacy && typeof legacy.set === "function") legacy.set(next);
  isFullscreen.value = readFullscreenState();
}

// 双击工具栏空白区域快速切换全屏；落在按钮上时放行按钮自身行为
function onToolbarDblClick(event: MouseEvent) {
  const target = event.target as HTMLElement | null;
  if (target && target.closest("button")) return;
  toggleFullscreen();
}

function syncFullscreenState(event?: Event) {
  const custom = event as CustomEvent<{ enabled?: boolean }>;
  if (custom?.detail && typeof custom.detail.enabled === "boolean") {
    isFullscreen.value = custom.detail.enabled;
    return;
  }
  isFullscreen.value = readFullscreenState();
}

function globalDragEnd() {
  const ctx = (window as any).transferGenieComposerDragCtx;
  if (ctx) ctx.payload = null;
}

let dragEndHandler: ((e: DragEvent) => void) | null = null;
onMounted(() => {
  (window as any).transferGenieComposerDragCtx = { payload: null };
  dragEndHandler = globalDragEnd;
  window.addEventListener("dragend", globalDragEnd as any, true);
  window.addEventListener("transfer-genie:composer-fullscreen-change", syncFullscreenState as EventListener);
  window.addEventListener("resize", closeDestructivePromptOnLayoutChange);
  syncFullscreenState();
  composerStore.restore();
  const bridge = (window as any).transferGenieComposer || {};
  bridge.isActive = () => true;
  bridge.getActiveDraft = () => composerStore.getActiveDraft();
  bridge.setActiveDraftFormat = (f: string) => {
    const d = composerStore.activeDraft;
    if (d) composerStore.setDraftFormat(d.id, f as any);
  };
  bridge.clearActiveDraftAfterSend = () => {
    composerStore.clearActiveDraftAfterSend();
    if (bridge._clearActive) bridge._clearActive();
  };
  bridge.getSendHotkey = () => (window as any).transferGenieSendHotkey || "enter";
  bridge.sendActiveDraft = () => {
    const send = (window as any).transferGenieSendActiveDraft;
    if (typeof send === "function") send();
  };
  bridge.focusActiveDraft = () => { if (bridge._focusActive) bridge._focusActive(); };
  bridge.setActiveDraftText = (text: string) => {
    const d = composerStore.activeDraft;
    if (d) composerStore.setDraftText(d.id, text);
    if (bridge._setActiveText) bridge._setActiveText(text || "");
  };
  (window as any).transferGenieComposer = bridge;
});
onUnmounted(() => {
  if (dragEndHandler) window.removeEventListener("dragend", dragEndHandler as any, true);
  window.removeEventListener("transfer-genie:composer-fullscreen-change", syncFullscreenState as EventListener);
  window.removeEventListener("resize", closeDestructivePromptOnLayoutChange);
});

</script>

<template>
  <div class="composer-ws" ref="mainEl">
    <div class="composer-ws-toolbar" @dblclick="onToolbarDblClick" title="双击空白处可全屏 / 退出全屏">
      <div class="cw-toolbar-group">
        <button class="cw-btn cw-btn-icon" type="button" @click="composerStore.addDraft(state.activePaneId || state.panes[0]?.id)" title="新建草稿">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
          <span>草稿</span>
        </button>
        <button class="cw-btn cw-btn-icon" type="button" @click="clearWorkspace" title="清空草稿">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v5M14 11v5"/></svg>
          <span>清空</span>
        </button>
      </div>
      <div class="cw-toolbar-divider" aria-hidden="true"></div>
      <div class="cw-toolbar-group">
        <button class="cw-btn cw-btn-icon" type="button" :disabled="!canSplitH" @click="composerStore.splitHorizontal()" title="横向分栏">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 5h18v14H3z"/><path d="M12 5v14"/></svg>
          <span>横分</span>
        </button>
        <button class="cw-btn cw-btn-icon" type="button" :disabled="!canSplitV" @click="composerStore.splitVertical()" title="纵向分栏">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 5h18v14H3z"/><path d="M3 12h18"/></svg>
          <span>纵分</span>
        </button>
        <button class="cw-btn cw-btn-icon" type="button" :disabled="!canCollapse" @click="requestCollapseToSingle" title="收起为单栏">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="4" y="4" width="16" height="16" rx="1"/></svg>
          <span>单栏</span>
        </button>
      </div>
      <div class="cw-toolbar-divider" aria-hidden="true"></div>
      <div class="cw-toolbar-group">
        <button class="cw-btn cw-btn-icon" type="button" @click="toggleFullscreen" :title="isFullscreen ? '退出全屏' : '全屏'">
          <svg v-if="!isFullscreen" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3"/></svg>
          <svg v-else viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M8 3v3a2 2 0 0 1-2 2H3M21 8h-3a2 2 0 0 1-2-2V3M3 16h3a2 2 0 0 1 2 2v3M16 21v-3a2 2 0 0 1 2-2h3"/></svg>
          <span>{{ isFullscreen ? '退出全屏' : '全屏' }}</span>
        </button>
      </div>
      <span class="cw-info">{{ state.panes.length }} 栏 · {{ state.panes.reduce((n:number,p:any)=>n+p.tabs.length,0) }} 草稿</span>
    </div>

    <div v-if="destructivePrompt" class="cw-modal-backdrop" @click.self="cancelDestructiveAction">
      <div class="cw-modal">
        <div class="cw-modal-title">{{ destructivePrompt.title }}</div>
        <div class="cw-modal-body">{{ destructivePrompt.body }}</div>
        <div class="cw-modal-actions">
          <button class="cw-btn" type="button" @click="cancelDestructiveAction">取消</button>
          <button class="cw-btn cw-btn-danger" type="button" @click="confirmDestructiveAction">确认</button>
        </div>
      </div>
    </div>

    <div class="composer-ws-main" :class="layoutClasses">
      <section
        v-for="pane in orderedPanes"
        :key="pane.id"
        class="cw-pane"
        :class="{ 'is-active': pane.id === state.activePaneId }"
        @dragover="onPaneDragOver($event, pane.id)"
        @dragleave="onPaneDragLeave(pane.id, $event)"
        @drop="onPaneDrop($event, pane.id)"
      >
        <header class="cw-tabs">
          <button
            v-for="tab in pane.tabs"
            :key="tab.id"
            class="cw-tab"
            :class="{ 'is-active': tab.id === pane.activeTabId }"
            type="button"
            draggable="true"
            @dragstart="onTabDragStart($event, tab, pane.id)"
            @dragend="onDragEnd"
            @click="switchDraft(pane.id, tab.id)"
            @contextmenu="onTabContextMenu($event, tab, pane.id)"
            :title="draftTitle(tab)"
          >
            <span class="cw-tab-fmt" :data-fmt="tab.format">{{ tab.format === 'markdown' ? 'M' : 'T' }}</span>
            <span class="cw-tab-title">{{ draftTitle(tab) }}</span>
            <span class="cw-tab-close" @click.stop="removeDraft(tab.id)" title="删除草稿">×</span>
          </button>
          <button class="cw-tab-add" type="button" @click="addDraft(pane.id)" title="新建草稿">+</button>
        </header>

       <DraftEditor
         v-if="activeTabOf(pane)"
         :key="editorKey(pane)"
         :draft="activeTabOf(pane)"
         :pane-id="pane.id"
          :is-active="pane.id === state.activePaneId"
       />
        <div v-else class="cw-pane-empty">空分栏</div>

        <div v-if="hoverZone[pane.id]" class="cw-drop-overlay">
          <div class="cw-drop-zone cw-drop-top" :class="{ 'is-hot': hoverZone[pane.id] === 'top' }"></div>
          <div class="cw-drop-zone cw-drop-left" :class="{ 'is-hot': hoverZone[pane.id] === 'left' }"></div>
          <div class="cw-drop-zone cw-drop-center" :class="{ 'is-hot': hoverZone[pane.id] === 'center' }"></div>
          <div class="cw-drop-zone cw-drop-right" :class="{ 'is-hot': hoverZone[pane.id] === 'right' }"></div>
          <div class="cw-drop-zone cw-drop-bottom" :class="{ 'is-hot': hoverZone[pane.id] === 'bottom' }"></div>
        </div>
      </section>
    </div>
    <div v-if="ctxMenu" class="cw-ctx-backdrop" @click="closeCtxMenu" @contextmenu.prevent="closeCtxMenu" @wheel="closeCtxMenu"></div>
    <div
      v-if="ctxMenu"
      class="cw-ctx-menu"
      :style="{ left: ctxMenu.x + 'px', top: ctxMenu.y + 'px' }"
      @contextmenu.prevent
    >
      <div class="cw-ctx-submenu">
        <button class="cw-ctx-item cw-ctx-sub-trigger" type="button">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
          <span>关闭</span>
        </button>
        <div class="cw-ctx-sub-items">
          <button class="cw-ctx-item" type="button" @click="ctxAction('close')">关闭当前</button>
          <button class="cw-ctx-item" type="button" @click="ctxAction('closeOthers')">关闭其他</button>
          <button class="cw-ctx-item" type="button" @click="ctxAction('closeRight')">关闭右侧</button>
          <button class="cw-ctx-item" type="button" @click="ctxAction('closeLeft')">关闭左侧</button>
          <button class="cw-ctx-item" type="button" @click="ctxAction('closeAll')">关闭全部</button>
        </div>
      </div>
      <div class="cw-ctx-submenu">
        <button class="cw-ctx-item cw-ctx-sub-trigger" type="button">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="4" width="18" height="16" rx="1"/><path d="M12 4v16"/></svg>
          <span>拆分</span>
        </button>
        <div class="cw-ctx-sub-items">
          <button class="cw-ctx-item" type="button" @click="ctxAction('splitRight')">向右拆分</button>
          <button class="cw-ctx-item" type="button" @click="ctxAction('splitLeft')">向左拆分</button>
          <button class="cw-ctx-item" type="button" @click="ctxAction('splitTop')">向上拆分</button>
          <button class="cw-ctx-item" type="button" @click="ctxAction('splitBottom')">向下拆分</button>
        </div>
      </div>
    </div>
  </div>
</template>
