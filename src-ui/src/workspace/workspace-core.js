/**
 * transfer-genie 多分栏工作区核心状态模型与纯函数 reducer。
 *
 * 设计要点：
 * - 工作区状态显式、可序列化，不由 DOM 反推。
 * - 每个分栏拥有独立标签组与活动标签。
 * - 布局受限为 single / horizontal / vertical / three-column。
 * - 标签与消息共享同一套停靠规则（右半区、下半区、中间）。
 *
 * 该模块为纯逻辑（无 DOM、无 Vue、无 Tauri 依赖），
 * 便于在 Node 中通过 tests/test_workspace.js 直接测试。
 */
(function bootstrapWorkspaceCore(globalScope) {
  "use strict";
  if (!globalScope) return;

  var LAYOUT_SINGLE = "single";
  var LAYOUT_HORIZONTAL = "horizontal";
  var LAYOUT_VERTICAL = "vertical";
  var LAYOUT_THREE_COLUMN = "three-column";

  var TAB_KIND_DOCUMENT = "document";
  var TAB_KIND_MESSAGE = "message";
  var TAB_KIND_DIAGRAM = "diagram";
  var TAB_KIND_PREVIEW = "preview";

  var DROP_CENTER = "center";
  var DROP_RIGHT = "right";
  var DROP_BOTTOM = "bottom";
  var DROP_LEFT = "left";
  var DROP_TOP = "top";

  var idCounter = 0;
  function nextId(prefix) {
    idCounter += 1;
    return (prefix || "id") + "-" + Date.now().toString(36) + "-" + idCounter;
  }
  function resetIdCounter() {
    idCounter = 0;
  }

  function clone(value) {
    if (value == null) return value;
    return JSON.parse(JSON.stringify(value));
  }

  function createTab(spec) {
    spec = spec || {};
    // 先继承 spec 的全部字段（草稿标签的 text/format 等扩展字段随之保留），
    // 再覆盖已知字段，保证 id/kind/message 等归一化。
    return Object.assign({}, spec, {
      id: spec.id || nextId("tab"),
      kind: spec.kind || TAB_KIND_DOCUMENT,
      title: spec.title || "",
      sourceRef: spec.sourceRef || null,
      dirty: !!spec.dirty,
      // 消息类标签保留原始消息内容快照，避免依赖远端历史仍可用
      message: spec.message ? clone(spec.message) : null,
      missing: false,
    });
  }

  function createPane(spec) {
    spec = spec || {};
    var tabs = Array.isArray(spec.tabs) ? spec.tabs.map(createTab) : [];
    return {
      id: spec.id || nextId("pane"),
      tabs: tabs,
      activeTabId: spec.activeTabId || (tabs.length > 0 ? tabs[0].id : null),
    };
  }

  /** 创建默认单栏工作区状态。可传入初始标签，用于把现有编辑器/消息引导进首个分栏。 */
  function createInitialState(spec) {
    spec = spec || {};
    var pane = createPane({ tabs: spec.tabs || [] });
    return {
      panes: [pane],
      layout: LAYOUT_SINGLE,
      paneOrder: [pane.id],
      activePaneId: pane.id,
    };
  }

  function findPane(state, paneId) {
    for (var i = 0; i < state.panes.length; i++) {
      if (state.panes[i].id === paneId) return state.panes[i];
    }
    return null;
  }

  function findTab(state, tabId) {
    for (var i = 0; i < state.panes.length; i++) {
      var tabs = state.panes[i].tabs;
      for (var j = 0; j < tabs.length; j++) {
        if (tabs[j].id === tabId) return { pane: state.panes[i], tab: tabs[j], tabIndex: j };
      }
    }
    return null;
  }

  function setActiveTab(pane, tabId) {
    if (!pane) return;
    var exists = pane.tabs.some(function (t) { return t.id === tabId; });
    pane.activeTabId = exists ? tabId : (pane.tabs.length > 0 ? pane.tabs[0].id : null);
  }

  function getActiveTab(pane) {
    if (!pane || !pane.activeTabId) return null;
    for (var i = 0; i < pane.tabs.length; i++) {
      if (pane.tabs[i].id === pane.activeTabId) return pane.tabs[i];
    }
    return pane.tabs.length > 0 ? pane.tabs[0] : null;
  }

  function normalizeAfterPaneChange(state) {
    // 空分栏在多栏布局下自动折叠
    if (state.layout !== LAYOUT_SINGLE) {
      var nonEmpty = state.panes.filter(function (p) { return p.tabs.length > 0; });
      if (nonEmpty.length === 0) {
        var placeholder = createPane({ tabs: [] });
        state.panes = [placeholder];
        state.paneOrder = [placeholder.id];
        state.layout = LAYOUT_SINGLE;
        state.activePaneId = placeholder.id;
        return;
      }
      if (nonEmpty.length === 1 && state.layout !== LAYOUT_THREE_COLUMN) {
        state.panes = [nonEmpty[0]];
        state.paneOrder = [nonEmpty[0].id];
        state.layout = LAYOUT_SINGLE;
        state.activePaneId = nonEmpty[0].id;
        return;
      }
      if (state.layout === LAYOUT_THREE_COLUMN && nonEmpty.length <= 2) {
        state.panes = nonEmpty;
        state.paneOrder = nonEmpty.map(function (p) { return p.id; });
        state.layout = LAYOUT_HORIZONTAL;
        state.activePaneId = nonEmpty[0].id;
        return;
      }
      state.panes = nonEmpty;
      state.paneOrder = nonEmpty.map(function (p) { return p.id; });
      if (state.paneOrder.indexOf(state.activePaneId) === -1) {
        state.activePaneId = state.paneOrder[0] || null;
      }
    }
  }

  /** 横向分栏：单栏 -> 双列；双列 -> 三列；纵向或已达三列时不扩展。返回新状态。 */
  function splitHorizontal(state, options) {
    options = options || {};
    var next = clone(state);
    if (next.layout === LAYOUT_SINGLE) {
      var newPane = createPane({ tabs: options.tabs || [] });
      next.panes.push(newPane);
      next.paneOrder.push(newPane.id);
      next.layout = LAYOUT_HORIZONTAL;
      next.activePaneId = newPane.id;
      return next;
    }
    if (next.layout === LAYOUT_HORIZONTAL && next.panes.length === 2) {
      var thirdPane = createPane({ tabs: options.tabs || [] });
      next.panes.push(thirdPane);
      next.paneOrder.push(thirdPane.id);
      next.layout = LAYOUT_THREE_COLUMN;
      next.activePaneId = thirdPane.id;
      return next;
    }
    return next;
  }

  /** 纵向分栏：单栏 -> 上下双栏。已有分栏时不改布局。 */
  function splitVertical(state, options) {
    options = options || {};
    var next = clone(state);
    if (next.layout === LAYOUT_SINGLE) {
      var newPane = createPane({ tabs: options.tabs || [] });
      next.panes.push(newPane);
      next.paneOrder.push(newPane.id);
      next.layout = LAYOUT_VERTICAL;
      next.activePaneId = newPane.id;
      return next;
    }
    return next;
  }

  /** 收起为单栏，保留指定分栏（默认活动分栏）。 */
  function collapseToSingle(state, keepPaneId) {
    var next = clone(state);
    var target = keepPaneId
      ? findPane(next, keepPaneId)
      : (findPane(next, next.activePaneId) || next.panes[0]);
    if (!target) return createInitialState({});
    next.panes = [target];
    next.paneOrder = [target.id];
    next.layout = LAYOUT_SINGLE;
    next.activePaneId = target.id;
    return next;
  }

  function addTabToPane(state, paneId, tabSpec) {
    var next = clone(state);
    var pane = findPane(next, paneId);
    if (!pane) return next;
    var tab = createTab(tabSpec);
    pane.tabs.push(tab);
    setActiveTab(pane, tab.id);
    return next;
  }

  function closeTab(state, tabId) {
    var next = clone(state);
    var found = findTab(next, tabId);
    if (!found) return next;
    found.pane.tabs.splice(found.tabIndex, 1);
    if (found.pane.activeTabId === tabId) {
      setActiveTab(found.pane, found.pane.tabs.length > 0 ? found.pane.tabs[Math.max(0, found.tabIndex - 1)].id : null);
    }
    normalizeAfterPaneChange(next);
    return next;
  }

  function setActiveTabById(state, paneId, tabId) {
    var next = clone(state);
    var pane = findPane(next, paneId);
    if (!pane) return next;
    setActiveTab(pane, tabId);
    next.activePaneId = paneId;
    return next;
  }

  function setActivePane(state, paneId) {
    var next = clone(state);
    if (findPane(next, paneId)) next.activePaneId = paneId;
    return next;
  }

  /** 在分栏之间移动标签，保留标签状态（含消息快照）。 */
  function moveTab(state, tabId, targetPaneId, options) {
    options = options || {};
    var next = clone(state);
    var found = findTab(next, tabId);
    if (!found) return next;
    var target = findPane(next, targetPaneId);
    if (!target) return next;
    if (found.pane.id === targetPaneId) {
      setActiveTab(found.pane, tabId);
      next.activePaneId = targetPaneId;
      return next;
    }
    var tab = found.tab;
    found.pane.tabs.splice(found.tabIndex, 1);
    if (found.pane.activeTabId === tabId) {
      setActiveTab(found.pane, found.pane.tabs.length > 0 ? found.pane.tabs[Math.max(0, found.tabIndex - 1)].id : null);
    }
    if (options.insertIndex != null && options.insertIndex >= 0 && options.insertIndex <= target.tabs.length) {
      target.tabs.splice(options.insertIndex, 0, tab);
    } else {
      target.tabs.push(tab);
    }
    setActiveTab(target, tab.id);
    next.activePaneId = targetPaneId;
    normalizeAfterPaneChange(next);
    return next;
  }

  /** 归一化拖拽负载：标签与消息统一为统一结构。 */
  function createDragPayload(spec) {
    spec = spec || {};
    return {
      kind: spec.kind === "message" ? "message" : "tab",
      sourceId: spec.sourceId || null,
      sourcePaneId: spec.sourcePaneId || null,
      contentKind: spec.contentKind || TAB_KIND_DOCUMENT,
      sourceRef: spec.sourceRef || null,
      message: spec.message ? clone(spec.message) : null,
      title: spec.title || null,
    };
  }

  /**
  * 根据投放区域把拖拽负载应用到目标分栏。
  * - center: 加入目标分栏标签组
  * - right:  在目标分栏右侧新建分栏
  * - bottom: 在目标分栏下方新建分栏
  * - left:   在目标分栏左侧新建分栏
  * - top:    在目标分栏上方新建分栏
  */
  function dockToPane(state, payload, targetPaneId, dropZone) {
    if (!payload) return state;

    var next = clone(state);
    var target = findPane(next, targetPaneId);
    if (!target) return next;

    var movedTab = null;
    if (payload.kind === "tab" && payload.sourceId) {
      var found = findTab(next, payload.sourceId);
      if (found) {
        movedTab = found.tab;
        found.pane.tabs.splice(found.tabIndex, 1);
        if (found.pane.activeTabId === movedTab.id) {
          setActiveTab(found.pane, found.pane.tabs.length > 0 ? found.pane.tabs[Math.max(0, found.tabIndex - 1)].id : null);
        }
      }
    }

    var tab = movedTab || createTab({
      kind: payload.contentKind,
      title: payload.title || (payload.kind === "message" ? "消息" : ""),
      sourceRef: payload.sourceRef,
      message: payload.message,
    });

    if (dropZone === DROP_CENTER) {
      target.tabs.push(tab);
      setActiveTab(target, tab.id);
      next.activePaneId = targetPaneId;
    } else if (dropZone === DROP_RIGHT) {
      var rightPane = createPane({ tabs: [tab] });
      var rightPaneIndex = next.panes.findIndex(function(p) { return p.id === targetPaneId; });
      next.panes.splice(rightPaneIndex + 1, 0, rightPane);
      var orderIndex = next.paneOrder.indexOf(targetPaneId);
      next.paneOrder.splice(orderIndex + 1, 0, rightPane.id);
      if (next.layout === LAYOUT_SINGLE) next.layout = LAYOUT_HORIZONTAL;
      else if (next.layout === LAYOUT_VERTICAL) next.layout = LAYOUT_HORIZONTAL;
      next.activePaneId = rightPane.id;
    } else if (dropZone === DROP_LEFT) {
      var leftPane = createPane({ tabs: [tab] });
      var leftPaneIndex = next.panes.findIndex(function(p) { return p.id === targetPaneId; });
      next.panes.splice(leftPaneIndex, 0, leftPane);
      var leftOrderIndex = next.paneOrder.indexOf(targetPaneId);
      next.paneOrder.splice(leftOrderIndex, 0, leftPane.id);
      if (next.layout === LAYOUT_SINGLE) next.layout = LAYOUT_HORIZONTAL;
      else if (next.layout === LAYOUT_VERTICAL) next.layout = LAYOUT_HORIZONTAL;
      next.activePaneId = leftPane.id;
    } else if (dropZone === DROP_BOTTOM) {
      var bottomPane = createPane({ tabs: [tab] });
      var bottomPaneIndex = next.panes.findIndex(function(p) { return p.id === targetPaneId; });
      next.panes.splice(bottomPaneIndex + 1, 0, bottomPane);
      next.paneOrder.push(bottomPane.id);
      if (next.layout === LAYOUT_SINGLE) next.layout = LAYOUT_VERTICAL;
      next.activePaneId = bottomPane.id;
    } else if (dropZone === DROP_TOP) {
      var topPane = createPane({ tabs: [tab] });
      var topPaneIndex = next.panes.findIndex(function(p) { return p.id === targetPaneId; });
      next.panes.splice(topPaneIndex, 0, topPane);
      var topOrderIndex = next.paneOrder.indexOf(targetPaneId);
      next.paneOrder.splice(topOrderIndex, 0, topPane.id);
      if (next.layout === LAYOUT_SINGLE) next.layout = LAYOUT_VERTICAL;
      next.activePaneId = topPane.id;
    }

    normalizeAfterPaneChange(next);
    return next;
  }

  /**
  * 复制标签到指定方向的分栏（不移动源标签）。
  * - center: 复制到目标分栏标签组
  * - right:  复制并在目标分栏右侧新建分栏
  * - left:   复制并在目标分栏左侧新建分栏
  * - bottom: 复制并在目标分栏下方新建分栏
  * - top:    复制并在目标分栏上方新建分栏
  */
  function copyTabToZone(state, tabId, targetPaneId, dropZone) {
    var next = clone(state);
    var target = findPane(next, targetPaneId);
    if (!target) return next;

    var found = findTab(next, tabId);
    if (!found) return next;

    // 创建标签副本（新 ID，其余字段保留）
    var spec = clone(found.tab);
    delete spec.id;
    var tabCopy = createTab(spec);

    if (dropZone === DROP_CENTER) {
      target.tabs.push(tabCopy);
      setActiveTab(target, tabCopy.id);
      next.activePaneId = targetPaneId;
    } else if (dropZone === DROP_RIGHT) {
      var rightPane = createPane({ tabs: [tabCopy] });
      var rightIdx = next.panes.findIndex(function(p) { return p.id === targetPaneId; });
      next.panes.splice(rightIdx + 1, 0, rightPane);
      var ri = next.paneOrder.indexOf(targetPaneId);
      next.paneOrder.splice(ri + 1, 0, rightPane.id);
      if (next.layout === LAYOUT_SINGLE) next.layout = LAYOUT_HORIZONTAL;
      else if (next.layout === LAYOUT_VERTICAL) next.layout = LAYOUT_HORIZONTAL;
      next.activePaneId = rightPane.id;
    } else if (dropZone === DROP_LEFT) {
      var leftPane = createPane({ tabs: [tabCopy] });
      var leftIdx = next.panes.findIndex(function(p) { return p.id === targetPaneId; });
      next.panes.splice(leftIdx, 0, leftPane);
      var li = next.paneOrder.indexOf(targetPaneId);
      next.paneOrder.splice(li, 0, leftPane.id);
      if (next.layout === LAYOUT_SINGLE) next.layout = LAYOUT_HORIZONTAL;
      else if (next.layout === LAYOUT_VERTICAL) next.layout = LAYOUT_HORIZONTAL;
      next.activePaneId = leftPane.id;
    } else if (dropZone === DROP_BOTTOM) {
      var bottomPane = createPane({ tabs: [tabCopy] });
      var bottomIdx = next.panes.findIndex(function(p) { return p.id === targetPaneId; });
      next.panes.splice(bottomIdx + 1, 0, bottomPane);
      next.paneOrder.push(bottomPane.id);
      if (next.layout === LAYOUT_SINGLE) next.layout = LAYOUT_VERTICAL;
      next.activePaneId = bottomPane.id;
    } else if (dropZone === DROP_TOP) {
      var topPane = createPane({ tabs: [tabCopy] });
      var topIdx = next.panes.findIndex(function(p) { return p.id === targetPaneId; });
      next.panes.splice(topIdx, 0, topPane);
      var ti = next.paneOrder.indexOf(targetPaneId);
      next.paneOrder.splice(ti, 0, topPane.id);
      if (next.layout === LAYOUT_SINGLE) next.layout = LAYOUT_VERTICAL;
      next.activePaneId = topPane.id;
    }

    normalizeAfterPaneChange(next);
    return next;
  }


  function serialize(state) {
    return JSON.stringify(state);
  }

  function deserialize(json) {
    if (!json) return null;
    try {
      var parsed = JSON.parse(json);
      return normalizeRestoredState(parsed);
    } catch (e) {
      return null;
    }
  }

  function normalizeRestoredState(state) {
    if (!state || !Array.isArray(state.panes)) return createInitialState({});
    var validLayouts = [LAYOUT_SINGLE, LAYOUT_HORIZONTAL, LAYOUT_VERTICAL, LAYOUT_THREE_COLUMN];
    state.layout = validLayouts.indexOf(state.layout) >= 0 ? state.layout : LAYOUT_SINGLE;
    if (!Array.isArray(state.paneOrder)) {
      state.paneOrder = state.panes.map(function (p) { return p.id; });
    }
    if (!state.activePaneId || state.paneOrder.indexOf(state.activePaneId) === -1) {
      state.activePaneId = state.paneOrder[0] || null;
    }
    return state;
  }

  /**
   * 启动恢复：校验每个标签的内容可用性。
   * resolver(tab) 返回 true 表示可用，false 表示缺失。
   * 缺失标签被标记为 missing=true，并保留可恢复状态，而非删除。
   */
  function restoreWithValidation(state, resolver) {
    var next = clone(state);
    var fn = typeof resolver === "function" ? resolver : function () { return true; };
    function validateTabs(panes) {
      for (var i = 0; i < panes.length; i++) {
        for (var j = 0; j < panes[i].tabs.length; j++) {
          var t = panes[i].tabs[j];
          try {
            t.missing = !fn(t);
          } catch (e) {
            t.missing = true;
          }
        }
      }
    }
    validateTabs(next.panes);
    return next;
  }

  function getLayoutClasses(state) {
    var classes = {};
    classes["is-" + state.layout] = true;
    classes["pane-count-" + state.panes.length] = true;
    return classes;
  }

  function isThreeColumn(state) {
    return state.layout === LAYOUT_THREE_COLUMN;
  }

  var api = {
    LAYOUT_SINGLE: LAYOUT_SINGLE,
    LAYOUT_HORIZONTAL: LAYOUT_HORIZONTAL,
    LAYOUT_VERTICAL: LAYOUT_VERTICAL,
    LAYOUT_THREE_COLUMN: LAYOUT_THREE_COLUMN,
    TAB_KIND_DOCUMENT: TAB_KIND_DOCUMENT,
    TAB_KIND_MESSAGE: TAB_KIND_MESSAGE,
    TAB_KIND_DIAGRAM: TAB_KIND_DIAGRAM,
    TAB_KIND_PREVIEW: TAB_KIND_PREVIEW,
    DROP_CENTER: DROP_CENTER,
    DROP_RIGHT: DROP_RIGHT,
    DROP_BOTTOM: DROP_BOTTOM,
    DROP_LEFT: DROP_LEFT,
    DROP_TOP: DROP_TOP,
    nextId: nextId,
    resetIdCounter: resetIdCounter,
    createTab: createTab,
    createPane: createPane,
    createInitialState: createInitialState,
    findPane: findPane,
    findTab: findTab,
    getActiveTab: getActiveTab,
    setActiveTab: setActiveTab,
    splitHorizontal: splitHorizontal,
    splitVertical: splitVertical,
    collapseToSingle: collapseToSingle,
    addTabToPane: addTabToPane,
    closeTab: closeTab,
    setActiveTabById: setActiveTabById,
    setActivePane: setActivePane,
    moveTab: moveTab,
    createDragPayload: createDragPayload,
    dockToPane: dockToPane,
    copyTabToZone: copyTabToZone,
    serialize: serialize,
    deserialize: deserialize,
    normalizeRestoredState: normalizeRestoredState,
    restoreWithValidation: restoreWithValidation,
    getLayoutClasses: getLayoutClasses,
    isThreeColumn: isThreeColumn,
  };

  globalScope.transferGenieWorkspaceCore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
