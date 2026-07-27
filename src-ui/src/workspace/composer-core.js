/**
 * 输入框草稿工作区纯逻辑：草稿创建、消息转草稿停靠、发送后清空等。
 * 基于 workspace-core 的状态模型，为可测试性抽离为纯函数。
 */
(function bootstrapComposerCore(globalScope) {
  "use strict";
  if (!globalScope) return;

  var core = globalScope.transferGenieWorkspaceCore;
  var seq = 0;

  function clone(value) {
    if (value == null) return value;
    return JSON.parse(JSON.stringify(value));
  }

  function nextDraftTitle() { seq += 1; return "草稿 " + seq; }
  function resetSeq() { seq = 0; }

  function createDraft(spec) {
    spec = spec || {};
    return {
      id: core.nextId("draft"),
      kind: "draft",
      title: spec.title || nextDraftTitle(),
      sourceRef: spec.sourceRef || null,
      text: spec.text || "",
      format: spec.format || "text",
      message: spec.message ? clone(spec.message) : null,
      missing: false,
    };
  }

  /** 新建草稿并加入指定分栏，设为活动。返回 { state, draftId }。 */
  function addDraft(state, paneId, spec) {
    var next = clone(state);
    var pane = core.findPane(next, paneId);
    if (!pane) return { state: next, draftId: null };
    var d = createDraft(spec);
    pane.tabs.push(d);
    pane.activeTabId = d.id;
    next.activePaneId = paneId;
    return { state: next, draftId: d.id };
  }

  /** 直接修改草稿文本（高频输入路径）。返回新状态。 */
  function setDraftText(state, tabId, text) {
    var next = clone(state);
    var found = findDraft(next, tabId);
    if (found) found.tab.text = text;
    return next;
  }

  function setDraftFormat(state, tabId, format) {
    var next = clone(state);
    var found = findDraft(next, tabId);
    if (found) found.tab.format = format === "markdown" ? "markdown" : "text";
    return next;
  }

  function findDraft(state, tabId) {
    for (var i = 0; i < state.panes.length; i++) {
      for (var j = 0; j < state.panes[i].tabs.length; j++) {
        if (state.panes[i].tabs[j].id === tabId) {
          return { pane: state.panes[i], tab: state.panes[i].tabs[j] };
        }
      }
    }
    return null;
  }

  function activePane(state) {
    return core.findPane(state, state.activePaneId) || state.panes[0] || null;
  }

  function getActiveDraft(state) {
    var p = activePane(state);
    if (!p) return null;
    if (!p.activeTabId) return p.tabs[0] || null;
    for (var i = 0; i < p.tabs.length; i++) {
      if (p.tabs[i].id === p.activeTabId) return p.tabs[i];
    }
    return p.tabs[0] || null;
  }

  /**
   * 把消息作为草稿停靠到目标分栏（center/right/bottom）。
   * 复用 core.dockToPane 创建标签，再补上草稿字段 text/format。
   * 保留消息流内容（写入 text 与 message 快照）。
   * 返回 { state, draftId }。
   */
  function dockMessageAsDraft(state, message, targetPaneId, zone) {
    var prevIds = collectTabIds(state);
    var format = message && message.format === "markdown" ? "markdown" : "text";
    var payload = core.createDragPayload({
      kind: "message",
      contentKind: core.TAB_KIND_MESSAGE,
      sourceRef: (message && message.filename) || null,
      message: message,
      title: message && message.sender ? String(message.sender) : "消息草稿",
    });
    var next = core.dockToPane(state, payload, targetPaneId, zone);
    var newTab = findNewTab(next, prevIds);
    if (newTab) {
      newTab.kind = "draft";
      newTab.text = (message && message.content) || "";
      newTab.format = format;
      newTab.title = (message && message.sender) ? String(message.sender) : "消息草稿";
      newTab.sourceRef = (message && message.filename) || null;
      newTab.message = message ? clone(message) : null;
    }
    return { state: next, draftId: newTab ? newTab.id : null };
  }

  /** 发送成功后清空活动草稿文本（保留草稿标签）。返回新状态。 */
  function clearActiveDraftAfterSend(state) {
    var d = getActiveDraft(state);
    if (!d) return state;
    return setDraftText(state, d.id, "");
  }

  function collectTabIds(state) {
    var ids = {};
    for (var i = 0; i < state.panes.length; i++) {
      for (var j = 0; j < state.panes[i].tabs.length; j++) {
        ids[state.panes[i].tabs[j].id] = true;
      }
    }
    return ids;
  }
  function findNewTab(state, prevIds) {
    for (var i = 0; i < state.panes.length; i++) {
      for (var j = 0; j < state.panes[i].tabs.length; j++) {
        var t = state.panes[i].tabs[j];
        if (!prevIds[t.id]) return t;
      }
    }
    return null;
  }

  function createInitialComposer(spec) {
    var draft = createDraft(spec || {});
    var pane = { id: core.nextId("pane"), tabs: [draft], activeTabId: draft.id };
    return {
      panes: [pane],
      layout: core.LAYOUT_SINGLE,
      paneOrder: [pane.id],
      activePaneId: pane.id,
    };
  }

  // ============ 内容保护：判定是否会丢失草稿内容 ============
  function isDraftNonEmpty(draft) {
    return !!(draft && typeof draft.text === "string" && draft.text.trim().length > 0);
  }
  function tabsInPane(state, paneId) {
    var pane = core.findPane(state, paneId);
    return pane ? pane.tabs : [];
  }
  /** 关闭分栏内除 keepTabId 外的草稿。返回新状态。 */
  function closeOtherTabsInPane(state, paneId, keepTabId) {
    var next = clone(state);
    var pane = core.findPane(next, paneId);
    if (!pane) return next;
    pane.tabs = pane.tabs.filter(function (t) { return t.id === keepTabId; });
    pane.activeTabId = keepTabId;
    return next;
  }
  /** 关闭分栏内全部草稿，并留一条空草稿。返回新状态。 */
  function closeAllTabsInPane(state, paneId, spec) {
    var next = clone(state);
    var pane = core.findPane(next, paneId);
    if (!pane) return next;
    var d = createDraft(spec || {});
    pane.tabs = [d];
    pane.activeTabId = d.id;
    next.activePaneId = paneId;
    return next;
  }
  /** 关闭分栏内指定草稿右侧的草稿。返回新状态。 */
  function closeTabsRightOf(state, paneId, tabId) {
    var next = clone(state);
    var pane = core.findPane(next, paneId);
    if (!pane) return next;
    var idx = pane.tabs.findIndex(function (t) { return t.id === tabId; });
    if (idx < 0) return next;
    pane.tabs = pane.tabs.slice(0, idx + 1);
    return next;
  }
  /** 关闭分栏内指定草稿左侧的草稿。返回新状态。 */
  function closeTabsLeftOf(state, paneId, tabId) {
    var next = clone(state);
    var pane = core.findPane(next, paneId);
    if (!pane) return next;
    var idx = pane.tabs.findIndex(function (t) { return t.id === tabId; });
    if (idx < 0) return next;
    pane.tabs = pane.tabs.slice(idx);
    if (pane.activeTabId && pane.tabs.indexOf(pane.tabs.find(function (t) { return t.id === pane.activeTabId; })) < 0) {
      pane.activeTabId = tabId;
    }
    return next;
  }
  /** 计算一组草稿中非空的数量，供批量关闭前确认。 */
  function countNonEmpty(tabs) {
    return (Array.isArray(tabs) ? tabs : []).filter(isDraftNonEmpty).length;
  }
  function countNonEmptyTabs(state) {
    var n = 0;
    for (var i = 0; i < state.panes.length; i++) {
      for (var j = 0; j < state.panes[i].tabs.length; j++) {
        if (isDraftNonEmpty(state.panes[i].tabs[j])) n += 1;
      }
    }
    return n;
  }
  // 收起为单栏时，被丢弃分栏里的非空草稿数量
  function nonEmptyTabsOutsidePane(state, keepPaneId) {
    var n = 0;
    for (var i = 0; i < state.panes.length; i++) {
      if (state.panes[i].id === keepPaneId) continue;
      for (var j = 0; j < state.panes[i].tabs.length; j++) {
        if (isDraftNonEmpty(state.panes[i].tabs[j])) n += 1;
      }
    }
    return n;
  }

  var api = {
    createDraft: createDraft,
    addDraft: addDraft,
    setDraftText: setDraftText,
    setDraftFormat: setDraftFormat,
    findDraft: findDraft,
    getActiveDraft: getActiveDraft,
    activePane: activePane,
    dockMessageAsDraft: dockMessageAsDraft,
    clearActiveDraftAfterSend: clearActiveDraftAfterSend,
    createInitialComposer: createInitialComposer,
    tabsInPane: tabsInPane,
    closeOtherTabsInPane: closeOtherTabsInPane,
    closeAllTabsInPane: closeAllTabsInPane,
    closeTabsRightOf: closeTabsRightOf,
    closeTabsLeftOf: closeTabsLeftOf,
    countNonEmpty: countNonEmpty,
    isDraftNonEmpty: isDraftNonEmpty,
    countNonEmptyTabs: countNonEmptyTabs,
    nonEmptyTabsOutsidePane: nonEmptyTabsOutsidePane,
    resetSeq: resetSeq,
  };

  globalScope.transferGenieComposerCore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
