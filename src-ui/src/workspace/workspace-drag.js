/**
 * 工作区拖拽停靠：标签与消息共享同一套投放规则。
 *
 * 投放区域：
 * - center（中间）：加入目标分栏标签组
 * - right（右半区）：在目标分栏右侧新建横向分栏
 * - bottom（下半区）：在目标分栏下方新建纵向分栏
 *
 * 几何检测逻辑为纯函数（detectDropZoneFromRects），便于测试；
 * detectDropZone 为薄 DOM 适配层。
 */
(function bootstrapWorkspaceDrag(globalScope) {
  "use strict";
  if (!globalScope) return;

  var core = globalScope.transferGenieWorkspaceCore;
  var DROP_CENTER = "center";
  var DROP_RIGHT = "right";
  var DROP_BOTTOM = "bottom";
  var DROP_LEFT = "left";
  var DROP_TOP = "top";

  // VS Code 风格落区：四周 25% 为拆分区域，中间矩形加入当前分栏。
  var EDGE_RATIO = 0.25;

  /** 标签拖拽负载。 */
  function createTabDragPayload(tab, sourcePaneId) {
    if (!tab) return null;
    return core.createDragPayload({
      kind: "tab",
      sourceId: tab.id,
      sourcePaneId: sourcePaneId || null,
      contentKind: tab.kind,
      sourceRef: tab.sourceRef,
      message: tab.message,
      title: tab.title,
    });
  }

  /** 消息卡片拖拽负载。 */
  function createMessageDragPayload(message, title) {
    if (!message) return null;
    return core.createDragPayload({
      kind: "message",
      sourceId: null,
      sourcePaneId: null,
      contentKind: core.TAB_KIND_MESSAGE,
      sourceRef: message.filename || null,
      message: message,
      title: title || (message.sender ? String(message.sender) : "消息"),
    });
  }

  /**
   * 纯几何：根据指针坐标与目标分栏矩形、主窗口矩形判定投放区域。
   * 返回 'center' | 'left' | 'right' | 'top' | 'bottom'。
   */
  function detectDropZoneFromRects(pointer, paneRect, mainWindowRect, options) {
    options = options || {};
    var px = pointer.x;
    var py = pointer.y;
    // 指针不在分栏矩形内时，默认 center（由调用方保证目标分栏为悬停分栏）
    if (px < paneRect.left || px > paneRect.right || py < paneRect.top || py > paneRect.bottom) {
      return DROP_CENTER;
    }

    var width = paneRect.right - paneRect.left;
    var height = paneRect.bottom - paneRect.top;
    if (width <= 0 || height <= 0) return DROP_CENTER;

    var edgeX = width * EDGE_RATIO;
    var edgeY = height * EDGE_RATIO;
    var inCenterX = px >= paneRect.left + edgeX && px <= paneRect.right - edgeX;
    var inCenterY = py >= paneRect.top + edgeY && py <= paneRect.bottom - edgeY;
    if (inCenterX && inCenterY) return DROP_CENTER;

    var candidates = [];
    if (px < paneRect.left + edgeX) candidates.push({ zone: DROP_LEFT, score: (px - paneRect.left) / edgeX });
    if (px > paneRect.right - edgeX) candidates.push({ zone: DROP_RIGHT, score: (paneRect.right - px) / edgeX });
    if (py < paneRect.top + edgeY) candidates.push({ zone: DROP_TOP, score: (py - paneRect.top) / edgeY });
    if (py > paneRect.bottom - edgeY) candidates.push({ zone: DROP_BOTTOM, score: (paneRect.bottom - py) / edgeY });
    candidates.sort(function(a, b) { return a.score - b.score; });
    return candidates.length > 0 ? candidates[0].zone : DROP_CENTER;
  }

  /** DOM 适配：从事件与元素矩形判定投放区域。 */
  function detectDropZone(event, paneElement, mainWindowElement, options) {
    if (!event || !paneElement) return DROP_CENTER;
    var paneRect = paneElement.getBoundingClientRect();
    var mainWindowRect = mainWindowElement ? mainWindowElement.getBoundingClientRect() : null;
    var pointer = { x: event.clientX, y: event.clientY };
    return detectDropZoneFromRects(pointer, paneRect, mainWindowRect, options);
  }

  /** 把 SortableJS 的最终索引转换为 moveTab 使用的移动前插入索引。 */
  function getSortableInsertIndex(oldIndex, newIndex, samePane) {
    if (!Number.isInteger(oldIndex) || !Number.isInteger(newIndex) || newIndex < 0) return null;
    return samePane && newIndex > oldIndex ? newIndex + 1 : newIndex;
  }

  var api = {
    DROP_CENTER: DROP_CENTER,
    DROP_RIGHT: DROP_RIGHT,
    DROP_BOTTOM: DROP_BOTTOM,
    DROP_LEFT: DROP_LEFT,
    DROP_TOP: DROP_TOP,
    EDGE_RATIO: EDGE_RATIO,
    createTabDragPayload: createTabDragPayload,
    createMessageDragPayload: createMessageDragPayload,
    detectDropZoneFromRects: detectDropZoneFromRects,
    detectDropZone: detectDropZone,
    getSortableInsertIndex: getSortableInsertIndex,
  };

  globalScope.transferGenieWorkspaceDrag = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
