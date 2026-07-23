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

  // 中心区半径占比：距中心小于该比例时视为 center
  var CENTER_RATIO = 0.25;

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

    var cx = (paneRect.left + paneRect.right) / 2;
    var cy = (paneRect.top + paneRect.bottom) / 2;
    var halfW = (paneRect.right - paneRect.left) / 2;
    var halfH = (paneRect.bottom - paneRect.top) / 2;
    if (halfW <= 0 || halfH <= 0) return DROP_CENTER;

    var dx = (px - cx) / halfW; // -1..1
    var dy = (py - cy) / halfH; // -1..1

    // 中心圆区
    if (Math.sqrt(dx * dx + dy * dy) <= CENTER_RATIO) return DROP_CENTER;

    // 横向偏好大于纵向时取右半区，否则下半区
    if (Math.abs(dx) >= Math.abs(dy)) {
      return dx > 0 ? DROP_RIGHT : DROP_LEFT;
    }
    return dy > 0 ? DROP_BOTTOM : DROP_TOP;
  }

  /** DOM 适配：从事件与元素矩形判定投放区域。 */
  function detectDropZone(event, paneElement, mainWindowElement, options) {
    if (!event || !paneElement) return DROP_CENTER;
    var paneRect = paneElement.getBoundingClientRect();
    var mainWindowRect = mainWindowElement ? mainWindowElement.getBoundingClientRect() : null;
    var pointer = { x: event.clientX, y: event.clientY };
    return detectDropZoneFromRects(pointer, paneRect, mainWindowRect, options);
  }

  var api = {
    DROP_CENTER: DROP_CENTER,
    DROP_RIGHT: DROP_RIGHT,
    DROP_BOTTOM: DROP_BOTTOM,
    DROP_LEFT: DROP_LEFT,
    DROP_TOP: DROP_TOP,
    CENTER_RATIO: CENTER_RATIO,
    createTabDragPayload: createTabDragPayload,
    createMessageDragPayload: createMessageDragPayload,
    detectDropZoneFromRects: detectDropZoneFromRects,
    detectDropZone: detectDropZone,
  };

  globalScope.transferGenieWorkspaceDrag = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
