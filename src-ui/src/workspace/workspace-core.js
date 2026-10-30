/**
 * transfer-genie 多分栏工作区核心状态模型与纯函数 reducer。
 *
 * 设计要点：
 * - 工作区状态显式、可序列化，不由 DOM 反推。
 * - 每个分栏拥有独立标签组与活动标签。
 * - 分栏布局使用可嵌套的 split tree，旧 layout / paneOrder 字段保留为兼容元数据。
 * - 标签与消息共享上、下、左、右及中间停靠规则。
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

  function createPaneNode(paneId) {
    return { type: "pane", paneId: paneId };
  }

  function createSplitNode(direction, children) {
    return {
      type: "split",
      direction: direction === "vertical" ? "vertical" : "horizontal",
      children: children || [],
    };
  }

  function collectLayoutPaneIds(node, result) {
    result = result || [];
    if (!node) return result;
    if (node.type === "pane") {
      if (node.paneId && result.indexOf(node.paneId) === -1) result.push(node.paneId);
      return result;
    }
    var children = Array.isArray(node.children) ? node.children : [];
    for (var i = 0; i < children.length; i++) collectLayoutPaneIds(children[i], result);
    return result;
  }

  function legacyLayoutTree(layout, paneOrder) {
    var ids = Array.isArray(paneOrder) ? paneOrder.filter(Boolean) : [];
    if (ids.length === 0) return null;
    if (ids.length === 1) return createPaneNode(ids[0]);
    return createSplitNode(layout === LAYOUT_VERTICAL ? "vertical" : "horizontal", ids.map(createPaneNode));
  }

  function normalizeLayoutNode(node, validPaneIds) {
    if (!node) return null;
    if (node.type === "pane") return validPaneIds.indexOf(node.paneId) >= 0 ? createPaneNode(node.paneId) : null;
    if (node.type !== "split") return null;
    var children = (Array.isArray(node.children) ? node.children : [])
      .map(function(child) { return normalizeLayoutNode(child, validPaneIds); })
      .filter(Boolean);
    if (children.length === 0) return null;
    if (children.length === 1) return children[0];
    return createSplitNode(node.direction, children);
  }

  function deriveLegacyLayout(tree) {
    if (!tree || tree.type === "pane") return LAYOUT_SINGLE;
    var directPanes = tree.children.every(function(child) { return child.type === "pane"; });
    if (directPanes && tree.direction === "vertical") return LAYOUT_VERTICAL;
    if (directPanes && tree.direction === "horizontal") return tree.children.length >= 3 ? LAYOUT_THREE_COLUMN : LAYOUT_HORIZONTAL;
    return "nested";
  }

  function syncLayoutMetadata(state) {
    var validIds = state.panes.map(function(pane) { return pane.id; });
    var tree = normalizeLayoutNode(state.layoutTree || legacyLayoutTree(state.layout, state.paneOrder || validIds), validIds);
    var included = collectLayoutPaneIds(tree);
    var missing = validIds.filter(function(id) { return included.indexOf(id) === -1; });
    if (missing.length > 0) {
      var extras = missing.map(createPaneNode);
      tree = tree ? createSplitNode("horizontal", [tree].concat(extras)) : (extras.length === 1 ? extras[0] : createSplitNode("horizontal", extras));
    }
    state.layoutTree = tree;
    state.paneOrder = collectLayoutPaneIds(tree);
    state.layout = deriveLegacyLayout(tree);
    if (!state.activePaneId || state.paneOrder.indexOf(state.activePaneId) === -1) state.activePaneId = state.paneOrder[0] || null;
    return state;
  }

  function insertPaneNode(node, targetPaneId, newPaneId, direction, before) {
    if (!node || node.type === "pane") {
      if (!node || node.paneId !== targetPaneId) return node;
      var leafChildren = before
        ? [createPaneNode(newPaneId), createPaneNode(targetPaneId)]
        : [createPaneNode(targetPaneId), createPaneNode(newPaneId)];
      return createSplitNode(direction, leafChildren);
    }
    var directIndex = node.direction === direction
      ? node.children.findIndex(function(child) { return child.type === "pane" && child.paneId === targetPaneId; })
      : -1;
    if (directIndex >= 0) {
      node.children.splice(before ? directIndex : directIndex + 1, 0, createPaneNode(newPaneId));
      return node;
    }
    node.children = node.children.map(function(child) {
      return insertPaneNode(child, targetPaneId, newPaneId, direction, before);
    });
    return node;
  }

  function splitPaneInLayout(state, targetPaneId, newPaneId, dropZone) {
    var existingIds = state.panes
      .map(function(pane) { return pane.id; })
      .filter(function(id) { return id !== newPaneId; });
    state.layoutTree = normalizeLayoutNode(
      state.layoutTree || legacyLayoutTree(state.layout, (state.paneOrder || existingIds).filter(function(id) { return id !== newPaneId; })),
      existingIds
    ) || createPaneNode(targetPaneId);
    var vertical = dropZone === DROP_TOP || dropZone === DROP_BOTTOM;
    var before = dropZone === DROP_LEFT || dropZone === DROP_TOP;
    state.layoutTree = insertPaneNode(state.layoutTree, targetPaneId, newPaneId, vertical ? "vertical" : "horizontal", before);
    syncLayoutMetadata(state);
  }

  /** 创建默认单栏工作区状态。可传入初始标签，用于把现有编辑器/消息引导进首个分栏。 */
  function createInitialState(spec) {
    spec = spec || {};
    var pane = createPane({ tabs: spec.tabs || [] });
    return {
      panes: [pane],
      layout: LAYOUT_SINGLE,
      paneOrder: [pane.id],
      layoutTree: createPaneNode(pane.id),
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
    var nonEmpty = state.panes.filter(function (p) { return p.tabs.length > 0; });
    if (nonEmpty.length === 0) {
      var placeholder = createPane({ tabs: [] });
      state.panes = [placeholder];
      state.layoutTree = createPaneNode(placeholder.id);
      state.activePaneId = placeholder.id;
      syncLayoutMetadata(state);
      return;
    }
    state.panes = nonEmpty;
    syncLayoutMetadata(state);
  }

  /** 在活动分栏右侧创建一个局部横向分栏。 */
  function splitHorizontal(state, options) {
    options = options || {};
    var next = clone(state);
    var targetId = options.targetPaneId || next.activePaneId || (next.panes[0] && next.panes[0].id);
    if (!targetId || !findPane(next, targetId)) return next;
    var newPane = createPane({ tabs: options.tabs || [] });
    next.panes.push(newPane);
    splitPaneInLayout(next, targetId, newPane.id, DROP_RIGHT);
    next.activePaneId = newPane.id;
    return next;
  }

  /** 在活动分栏下方创建一个局部纵向分栏。 */
  function splitVertical(state, options) {
    options = options || {};
    var next = clone(state);
    var targetId = options.targetPaneId || next.activePaneId || (next.panes[0] && next.panes[0].id);
    if (!targetId || !findPane(next, targetId)) return next;
    var newPane = createPane({ tabs: options.tabs || [] });
    next.panes.push(newPane);
    splitPaneInLayout(next, targetId, newPane.id, DROP_BOTTOM);
    next.activePaneId = newPane.id;
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
    next.layoutTree = createPaneNode(target.id);
    next.activePaneId = target.id;
    syncLayoutMetadata(next);
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

  /** 修改标签显示名称；空白名称或不存在的标签保持原状态。 */
  function renameTab(state, tabId, title) {
    var next = clone(state);
    var normalized = typeof title === "string" ? title.trim() : "";
    if (!normalized) return next;
    var found = findTab(next, tabId);
    if (found) found.tab.title = normalized;
    return next;
  }

  /**
   * 移动标签到指定分栏，并可插入到指定索引。
   * insertIndex 以移动操作开始前的目标标签数组为基准，因此同栏向后移动会先扣除源标签占位。
   */
  function moveTab(state, tabId, targetPaneId, options) {
    options = options || {};
    var next = clone(state);
    var found = findTab(next, tabId);
    if (!found) return next;
    var target = findPane(next, targetPaneId);
    if (!target) return next;

    var tab = found.tab;
    var samePane = found.pane.id === targetPaneId;
    var sourceIndex = found.tabIndex;
    var targetLengthBeforeMove = target.tabs.length;
    found.pane.tabs.splice(found.tabIndex, 1);
    if (found.pane.activeTabId === tabId) {
      setActiveTab(found.pane, found.pane.tabs.length > 0 ? found.pane.tabs[Math.max(0, found.tabIndex - 1)].id : null);
    }

    var insertIndex = target.tabs.length;
    if (options.insertIndex != null && isFinite(options.insertIndex)) {
      insertIndex = Math.max(0, Math.min(targetLengthBeforeMove, Math.floor(Number(options.insertIndex))));
      if (samePane && insertIndex > sourceIndex) insertIndex -= 1;
    }
    if (insertIndex >= target.tabs.length) {
      target.tabs.push(tab);
    } else {
      target.tabs.splice(insertIndex, 0, tab);
    }
    setActiveTab(target, tab.id);
    next.activePaneId = targetPaneId;
    if (!samePane) normalizeAfterPaneChange(next);
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

    var tab = null;
    if (payload.kind === "tab") {
      if (!payload.sourceId) return next;
      var found = findTab(next, payload.sourceId);
      // 标签拖动只能移动现有标签。源标签已失效时取消投放，绝不退化为复制。
      if (!found) return next;
      tab = found.tab;
      found.pane.tabs.splice(found.tabIndex, 1);
      if (found.pane.activeTabId === tab.id) {
        setActiveTab(found.pane, found.pane.tabs.length > 0 ? found.pane.tabs[Math.max(0, found.tabIndex - 1)].id : null);
      }
    } else {
      tab = createTab({
        kind: payload.contentKind,
        title: payload.title || "消息",
        sourceRef: payload.sourceRef,
        message: payload.message,
      });
    }

    if (dropZone === DROP_CENTER) {
      target.tabs.push(tab);
      setActiveTab(target, tab.id);
      next.activePaneId = targetPaneId;
    } else {
      var dockedPane = createPane({ tabs: [tab] });
      next.panes.push(dockedPane);
      splitPaneInLayout(next, targetPaneId, dockedPane.id, dropZone);
      next.activePaneId = dockedPane.id;
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

    // 深复制当前标签的完整快照，只替换 ID，确保两个标签后续完全独立。
    var tabCopy = clone(found.tab);
    tabCopy.id = nextId("tab");

    if (dropZone === DROP_CENTER) {
      target.tabs.push(tabCopy);
      setActiveTab(target, tabCopy.id);
      next.activePaneId = targetPaneId;
    } else {
      var copyPane = createPane({ tabs: [] });
      copyPane.tabs = [tabCopy];
      copyPane.activeTabId = tabCopy.id;
      next.panes.push(copyPane);
      splitPaneInLayout(next, targetPaneId, copyPane.id, dropZone);
      next.activePaneId = copyPane.id;
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
    if (!Array.isArray(state.paneOrder)) {
      state.paneOrder = state.panes.map(function (p) { return p.id; });
    }
    return syncLayoutMetadata(state);
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
    createPaneNode: createPaneNode,
    createSplitNode: createSplitNode,
    collectLayoutPaneIds: collectLayoutPaneIds,
    syncLayoutMetadata: syncLayoutMetadata,
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
    renameTab: renameTab,
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
