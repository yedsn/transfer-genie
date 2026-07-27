/**
 * 输入框草稿工作区 store：把消息输入框改造成多分栏多草稿工作区。
 *
 * 每个标签是一条草稿（draft），携带 text 与 format（text|markdown）。
 * 每个分栏拥有独立草稿标签组与活动草稿；活动分栏的活动草稿为发送目标。
 * 草稿相关纯逻辑在 composer-core.js（可测试），本文件为响应式封装。
 */
import { reactive } from "vue";
import "./workspace-core.js";
import "./workspace-persistence.js";
import "./workspace-restore.js";
import "./workspace-drag.js";
import "./composer-core.js";

// @ts-ignore
const core = (globalThis as any).transferGenieWorkspaceCore;
// @ts-ignore
const ccore = (globalThis as any).transferGenieComposerCore;
// @ts-ignore
const persistence = (globalThis as any).transferGenieWorkspacePersistence;
// @ts-ignore
const restore = (globalThis as any).transferGenieWorkspaceRestore;

export type DraftFormat = "text" | "markdown";

export interface DraftTab {
  id: string;
  kind: string;
  title: string;
  sourceRef: string | null;
  text: string;
  format: DraftFormat;
  message: any | null;
  missing: boolean;
}

export interface DraftPane {
  id: string;
  tabs: DraftTab[];
  activeTabId: string | null;
}

export interface ComposerState {
  panes: DraftPane[];
  layout: string;
  paneOrder: string[];
  activePaneId: string | null;
}

const state = reactive<ComposerState>(ccore.createInitialComposer()) as ComposerState;

function commit(next: ComposerState) {
  state.panes = next.panes;
  state.layout = next.layout;
  state.paneOrder = next.paneOrder;
  state.activePaneId = next.activePaneId;
  persistence.save(state);
}


function activePaneId(): string {
  return state.activePaneId || state.panes[0]?.id || "";
}

function getDefaultDraftFormat(): DraftFormat {
  if (typeof window !== "undefined") {
    const vueStore = (window as any).transferGenieVue?.store;
    const defaultFormat = vueStore?.settingsForm?.defaultEditorFormat;
    if (defaultFormat === "markdown") return "markdown";
  }
  return "text";
}

// 内容保护确认：关闭非空草稿或收起布局丢弃其他分栏草稿前，要求用户确认。
let confirmer: (msg: string) => boolean = (msg: string) =>
  typeof window !== "undefined" && typeof window.confirm === "function" ? window.confirm(msg) : true;


export function setConfirmer(fn: (msg: string) => boolean) {
  confirmer = fn;
}

export const composerStore = {
  state,
  get activePane(): DraftPane | null {
    return state.panes.find((p) => p.id === state.activePaneId) || state.panes[0] || null;
  },
  get activeDraft(): DraftTab | null {
    return ccore.getActiveDraft(state) as DraftTab | null;
  },

  addDraft(paneId?: string): string | undefined {
    const targetId = paneId || activePaneId();
    if (!targetId) return;
    const { state: next, draftId } = ccore.addDraft(state, targetId, { format: getDefaultDraftFormat() });
    commit(next);
    return draftId;
  },
  switchDraft(paneId: string, tabId: string) { commit(core.setActiveTabById(state, paneId, tabId)); },
  setActivePane(paneId: string) { commit(core.setActivePane(state, paneId)); },
  setDraftText(tabId: string, text: string) { commit(ccore.setDraftText(state, tabId, text)); },
  setDraftFormat(tabId: string, format: DraftFormat) { commit(ccore.setDraftFormat(state, tabId, format)); },
  clearWorkspaceConfirmed() {
    ccore.resetSeq();
    commit(ccore.createInitialComposer({ format: getDefaultDraftFormat() }));
  },
  isDraftNonEmpty(tabId: string) {
    const found = state.panes.flatMap((p) => p.tabs).find((t) => t.id === tabId);
    return ccore.isDraftNonEmpty(found);
  },
  countNonEmptyInPane(paneId: string) {
    return ccore.countNonEmpty(ccore.tabsInPane(state, paneId));
  },
  countNonEmptyOthersInPane(paneId: string, keepTabId: string) {
    return ccore.countNonEmpty(ccore.tabsInPane(state, paneId).filter((t: any) => t.id !== keepTabId));
  },
  countNonEmptyRightInPane(paneId: string, tabId: string) {
    const tabs = ccore.tabsInPane(state, paneId);
    const idx = tabs.findIndex((t: any) => t.id === tabId);
    return ccore.countNonEmpty(idx >= 0 ? tabs.slice(idx + 1) : []);
  },
  countNonEmptyLeftInPane(paneId: string, tabId: string) {
    const tabs = ccore.tabsInPane(state, paneId);
    const idx = tabs.findIndex((t: any) => t.id === tabId);
    return ccore.countNonEmpty(idx >= 0 ? tabs.slice(0, idx) : []);
  },
  removeDraftConfirmed(tabId: string) { commit(core.closeTab(state, tabId)); },
  closeOthersInPaneConfirmed(paneId: string, keepTabId: string) { commit(ccore.closeOtherTabsInPane(state, paneId, keepTabId)); },
  closeAllInPaneConfirmed(paneId: string) {
    commit(ccore.closeAllTabsInPane(state, paneId, { format: getDefaultDraftFormat() }));
  },
  closeRightInPaneConfirmed(paneId: string, tabId: string) { commit(ccore.closeTabsRightOf(state, paneId, tabId)); },
  closeLeftInPaneConfirmed(paneId: string, tabId: string) { commit(ccore.closeTabsLeftOf(state, paneId, tabId)); },
  removeDraft(tabId: string) {
    const found = state.panes.flatMap((p) => p.tabs).find((t) => t.id === tabId);
    if (found && ccore.isDraftNonEmpty(found)) {
      if (!confirmer("该草稿有内容，关闭后会丢失。确认关闭？")) return;
    }
    this.removeDraftConfirmed(tabId);
  },
  closeOthersInPane(paneId: string, keepTabId: string) {
    const tabs = ccore.tabsInPane(state, paneId);
    const toClose = tabs.filter((t: any) => t.id !== keepTabId);
    const nonEmpty = ccore.countNonEmpty(toClose);
    if (toClose.length > 0 && nonEmpty > 0) {
      if (!confirmer("将关闭其他 " + toClose.length + " 条草稿（含 " + nonEmpty + " 条非空）。确认？")) return;
    }
    this.closeOthersInPaneConfirmed(paneId, keepTabId);
  },
  closeAllInPane(paneId: string) {
    const tabs = ccore.tabsInPane(state, paneId);
    const nonEmpty = ccore.countNonEmpty(tabs);
    if (tabs.length > 0 && nonEmpty > 0) {
      if (!confirmer("将关闭本栏全部 " + tabs.length + " 条草稿（含 " + nonEmpty + " 条非空）。确认？")) return;
    }
    this.closeAllInPaneConfirmed(paneId);
  },
  closeRightInPane(paneId: string, tabId: string) {
    const tabs = ccore.tabsInPane(state, paneId);
    const idx = tabs.findIndex((t: any) => t.id === tabId);
    const toClose = idx >= 0 ? tabs.slice(idx + 1) : [];
    const nonEmpty = ccore.countNonEmpty(toClose);
    if (toClose.length > 0 && nonEmpty > 0) {
      if (!confirmer("将关闭右侧 " + toClose.length + " 条草稿（含 " + nonEmpty + " 条非空）。确认？")) return;
    }
    this.closeRightInPaneConfirmed(paneId, tabId);
  },
  closeLeftInPane(paneId: string, tabId: string) {
    const tabs = ccore.tabsInPane(state, paneId);
    const idx = tabs.findIndex((t: any) => t.id === tabId);
    const toClose = idx >= 0 ? tabs.slice(0, idx) : [];
    const nonEmpty = ccore.countNonEmpty(toClose);
    if (toClose.length > 0 && nonEmpty > 0) {
      if (!confirmer("将关闭左侧 " + toClose.length + " 条草稿（含 " + nonEmpty + " 条非空）。确认？")) return;
    }
    this.closeLeftInPaneConfirmed(paneId, tabId);
  },
  moveDraft(tabId: string, targetPaneId: string) { commit(core.moveTab(state, tabId, targetPaneId)); },
  dockTab(tabId: string, targetPaneId: string, zone: string) {
    const found = state.panes.flatMap((p) => p.tabs).find((t) => t.id === tabId);
    if (!found) return;
    const payload = core.createDragPayload({
      kind: "tab", sourceId: tabId, contentKind: found.kind,
      sourceRef: found.sourceRef, title: found.title, message: found.message,
    });
    commit(core.dockToPane(state, payload, targetPaneId, zone));
  },
  splitTab(tabId: string, zone: string) {
    const targetPaneId = state.activePaneId || state.panes[0]?.id || "";
    if (!targetPaneId) return;
    const next = core.copyTabToZone(state, tabId, targetPaneId, zone) as ComposerState;
    if ((zone === "right" || zone === "left") && next.layout === "horizontal" && next.panes.length >= 3) {
      next.layout = "three-column";
    }
    commit(next);
  },
  splitHorizontal() {
    const active = this.activeDraft;
    if (active?.id) {
      this.splitTab(active.id, "right");
      return;
    }
    commit(core.splitHorizontal(state));
  },
  splitVertical() {
    const active = this.activeDraft;
    if (active?.id) {
      this.splitTab(active.id, "bottom");
      return;
    }
    commit(core.splitVertical(state));
  },
  getCollapseLossCount(keepPaneId?: string) {
    const keep = keepPaneId || state.activePaneId || state.panes[0]?.id || "";
    return ccore.nonEmptyTabsOutsidePane(state, keep);
  },
  collapseConfirmed(keepPaneId?: string) {
    const keep = keepPaneId || state.activePaneId || state.panes[0]?.id || "";
    commit(core.collapseToSingle(state, keep));
  },
  collapse(keepPaneId?: string) {
    const keep = keepPaneId || state.activePaneId || state.panes[0]?.id || "";
    const losing = ccore.nonEmptyTabsOutsidePane(state, keep);
    if (losing > 0) {
      if (!confirmer("收起为单栏会丢弃其他分栏中的 " + losing + " 条草稿。确认收起？")) return;
    }
    this.collapseConfirmed(keep);
  },

  dockMessageAsDraft(message: any, targetPaneId: string, zone: string) {
    const { state: next } = ccore.dockMessageAsDraft(state, message, targetPaneId, zone);
    commit(next);
  },

  getActiveDraft() {
    const d = this.activeDraft;
    if (!d) return null;
    return { text: d.text, format: d.format, id: d.id };
  },
  clearActiveDraftAfterSend() { commit(ccore.clearActiveDraftAfterSend(state)); },

  async restore(): Promise<boolean> {
    const { state: restored, hadSavedState } = await restore.restoreAsync(() => true);
    if (!restored.panes.length) {
      commit(ccore.createInitialComposer());
    } else {
      if (!restored.panes[0].tabs.length) {
        const d = ccore.createDraft({});
        restored.panes[0].tabs.push(d);
        restored.panes[0].activeTabId = d.id;
      }
      commit(restored as ComposerState);
    }
    return hadSavedState;
  },
  flush() { persistence.saveImmediate(state); },
  syncFromStorage() {
    const raw = persistence.load();
    if (!raw) return;
    try {
      const next = JSON.parse(raw);
      state.panes = next.panes;
      state.layout = next.layout;
      state.paneOrder = next.paneOrder;
      state.activePaneId = next.activePaneId;
    } catch (e) { /* 损坏的存储，忽略 */ }
  },
};

export function useComposerStore() { return composerStore; }
