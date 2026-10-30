import assert from 'node:assert/strict';
import '../src-ui/src/workspace/workspace-core.js';
import '../src-ui/src/workspace/workspace-persistence.js';
import '../src-ui/src/workspace/workspace-restore.js';
import '../src-ui/src/workspace/workspace-drag.js';

const core = globalThis.transferGenieWorkspaceCore;
const persistence = globalThis.transferGenieWorkspacePersistence;
const restore = globalThis.transferGenieWorkspaceRestore;
const drag = globalThis.transferGenieWorkspaceDrag;

// ---- 内存 localStorage 桩，供持久化测试 ----
function makeMemoryStorage() {
  const store = new Map();
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: (k) => { store.delete(k); },
    clear: () => store.clear(),
  };
}

function stateWithTabs() {
  return core.createInitialState({
    tabs: [
      { title: '文档A', kind: 'document', sourceRef: 'doc-a' },
      { title: '文档B', kind: 'document', sourceRef: 'doc-b' },
    ],
  });
}

function stateWithOrderedTabs() {
  return core.createInitialState({
    tabs: [
      { title: 'A', kind: 'document', sourceRef: 'doc-a' },
      { title: 'B', kind: 'document', sourceRef: 'doc-b' },
      { title: 'C', kind: 'document', sourceRef: 'doc-c' },
      { title: 'D', kind: 'document', sourceRef: 'doc-d' },
    ],
  });
}

function titlesInPane(state, paneId) {
  return core.findPane(state, paneId).tabs.map((tab) => tab.title);
}

// ============ 1.1 状态模型 ============
function testInitialState() {
  core.resetIdCounter();
  const s = stateWithTabs();
  assert.equal(s.layout, 'single');
  assert.equal(s.panes.length, 1);
  assert.equal(s.paneOrder.length, 1);
  assert.equal(s.activePaneId, s.panes[0].id);
  const tab = core.getActiveTab(s.panes[0]);
  assert.equal(tab.title, '文档A');
  assert.equal(tab.kind, 'document');
}

function testSerializationRoundTrip() {
  const s = stateWithTabs();
  const json = core.serialize(s);
  const back = core.deserialize(json);
  assert.equal(back.layout, s.layout);
  assert.equal(back.panes.length, 1);
  assert.equal(back.panes[0].tabs.length, 2);
  assert.equal(back.panes[0].tabs[0].title, '文档A');
  assert.deepEqual(back.layoutTree, s.layoutTree);
}

function testDeserializeInvalid() {
  assert.equal(core.deserialize(null), null);
  assert.equal(core.deserialize('not json'), null);
  // 非法结构回退为初始状态
  const fallback = core.deserialize('{}');
  assert.equal(fallback.layout, 'single');
  assert.equal(fallback.panes.length, 1);
}

// ============ 2.1/2.3 布局 ============
function testHorizontalSplitSingleToTwo() {
  const s = stateWithTabs();
  const h = core.splitHorizontal(s);
  assert.equal(h.layout, 'horizontal');
  assert.equal(h.panes.length, 2);
  assert.equal(h.paneOrder.length, 2);
}

function testHorizontalSplitTwoToThree() {
  const s = stateWithTabs();
  const h = core.splitHorizontal(s);
  const h3 = core.splitHorizontal(h);
  assert.equal(h3.layout, 'three-column');
  assert.equal(h3.panes.length, 3);
}

function testHorizontalSplitCanContinuePastThreePanes() {
  const s = stateWithTabs();
  const h3 = core.splitHorizontal(core.splitHorizontal(s));
  const h4 = core.splitHorizontal(h3);
  assert.equal(h4.layout, 'three-column');
  assert.equal(h4.panes.length, 4, 'VS Code 风格布局允许继续拆分');
  assert.equal(h4.layoutTree.type, 'split');
  assert.equal(h4.layoutTree.direction, 'horizontal');
  assert.equal(h4.layoutTree.children.length, 4);
}

function testVerticalSplit() {
  const s = stateWithTabs();
  const v = core.splitVertical(s);
  assert.equal(v.layout, 'vertical');
  assert.equal(v.panes.length, 2);
  // 已有分栏时继续拆分活动栏
  const v2 = core.splitVertical(v);
  assert.equal(v2.layout, 'vertical');
  assert.equal(v2.panes.length, 3);
  assert.equal(v2.layoutTree.children.length, 3);
}

function testNestedLeftVerticalRightWholeLayout() {
  let state = stateWithOrderedTabs();
  const leftPaneId = state.panes[0].id;
  state = core.splitHorizontal(state);
  const rightPaneId = state.activePaneId;
  state = core.addTabToPane(state, rightPaneId, { title: '拖动标签', kind: 'document' });
  state = core.addTabToPane(state, rightPaneId, { title: '右侧保留', kind: 'document' });
  const movedTab = core.findPane(state, rightPaneId).tabs[0];
  const payload = drag.createTabDragPayload(movedTab, rightPaneId);
  state = core.dockToPane(state, payload, leftPaneId, 'bottom');

  assert.equal(state.layout, 'nested');
  assert.equal(state.layoutTree.type, 'split');
  assert.equal(state.layoutTree.direction, 'horizontal');
  assert.equal(state.layoutTree.children.length, 2);
  assert.equal(state.layoutTree.children[0].type, 'split');
  assert.equal(state.layoutTree.children[0].direction, 'vertical');
  assert.equal(state.layoutTree.children[0].children[0].paneId, leftPaneId);
  assert.equal(state.layoutTree.children[1].paneId, rightPaneId);
  assert.equal(core.findPane(state, rightPaneId).tabs.length, 1, '右栏保留且不参与纵向拆分');
  assert.equal(state.layoutTree.children[0].children[1].paneId, state.activePaneId, '新栏位于左栏下方');
  const restored = core.deserialize(core.serialize(state));
  assert.deepEqual(restored.layoutTree, state.layoutTree, '嵌套布局可持久化恢复');
}

function testLegacyLayoutMigratesToTree() {
  const legacy = stateWithTabs();
  delete legacy.layoutTree;
  const restored = core.deserialize(JSON.stringify(legacy));
  assert.deepEqual(restored.layoutTree, { type: 'pane', paneId: restored.panes[0].id });
}

function testCollapseToSingle() {
  const s = stateWithTabs();
  const h = core.splitHorizontal(s);
  const collapsed = core.collapseToSingle(h, h.panes[0].id);
  assert.equal(collapsed.layout, 'single');
  assert.equal(collapsed.panes.length, 1);
  assert.equal(collapsed.panes[0].id, h.panes[0].id);
}

// ============ 3.1/3.2 标签组与移动 ============
function testPerPaneTabsAndActive() {
  const s = stateWithTabs();
  const paneId = s.panes[0].id;
  const next = core.addTabToPane(s, paneId, { title: '文档C', kind: 'document', sourceRef: 'doc-c' });
  assert.equal(next.panes[0].tabs.length, 3);
  assert.equal(core.getActiveTab(next.panes[0]).title, '文档C');
  // 切换活动标签只影响该分栏
  const switched = core.setActiveTabById(next, paneId, next.panes[0].tabs[0].id);
  assert.equal(core.getActiveTab(switched.panes[0]).title, '文档A');
}

function testRenameTab() {
  const s = stateWithTabs();
  const tabId = s.panes[0].tabs[0].id;
  const before = structuredClone(s.panes[0].tabs[0]);
  const renamed = core.renameTab(s, tabId, '  项目方案  ');
  assert.equal(renamed.panes[0].tabs[0].title, '项目方案');
  assert.deepEqual({ ...renamed.panes[0].tabs[0], title: before.title }, before, '仅修改标题字段');
  assert.equal(s.panes[0].tabs[0].title, '文档A', '不修改原状态');
  assert.deepEqual(core.renameTab(s, tabId, '   '), s, '空白名称保持状态');
  assert.deepEqual(core.renameTab(s, 'missing-tab', '名称'), s, '不存在的标签保持状态');
}

function testRenamedTabPersistsAndMoves() {
  const s = stateWithTabs();
  const tabId = s.panes[0].tabs[0].id;
  const renamed = core.renameTab(s, tabId, '持久名称');
  const restored = core.deserialize(core.serialize(renamed));
  const split = core.splitHorizontal(restored);
  const moved = core.moveTab(split, tabId, split.panes[1].id);
  assert.equal(core.findTab(moved, tabId).tab.title, '持久名称');
}

function testCloseTabRemovesFromGroupNotSource() {
  const s = stateWithTabs();
  const firstTabId = s.panes[0].tabs[0].id;
  const next = core.closeTab(s, firstTabId);
  assert.equal(next.panes[0].tabs.length, 1);
  // 关闭后活动标签回退到剩余标签
  assert.ok(core.getActiveTab(next.panes[0]));
}

function testMoveTabBetweenPanesPreservesState() {
  const s = stateWithTabs();
  const h = core.splitHorizontal(s);
  const srcPane = h.panes[0];
  const dstPane = h.panes[1];
  const tabToMove = srcPane.tabs[0];
  const moved = core.moveTab(h, tabToMove.id, dstPane.id);
  const newSrc = moved.panes.find((p) => p.id === srcPane.id);
  const newDst = moved.panes.find((p) => p.id === dstPane.id);
  assert.equal(newSrc.tabs.length, 1, '源分栏少一个');
  assert.equal(newDst.tabs.length, 1, '目标分栏多一个');
  assert.equal(newDst.tabs[0].sourceRef, tabToMove.sourceRef, '标签状态保留');
  assert.equal(moved.activePaneId, dstPane.id);
}

function testMoveTabForwardWithinPane() {
  const s = stateWithOrderedTabs();
  const paneId = s.panes[0].id;
  const tabA = s.panes[0].tabs[0];
  // 拖到 C 的右半区：原数组插入索引为 3
  const moved = core.moveTab(s, tabA.id, paneId, { insertIndex: 3 });
  assert.deepEqual(titlesInPane(moved, paneId), ['B', 'C', 'A', 'D']);
  assert.equal(core.getActiveTab(moved.panes[0]).title, 'A');
  assert.equal(moved.activePaneId, paneId);
}

function testMoveTabBackwardWithinPane() {
  const s = stateWithOrderedTabs();
  const paneId = s.panes[0].id;
  const tabD = s.panes[0].tabs[3];
  // 拖到 B 的左半区：原数组插入索引为 1
  const moved = core.moveTab(s, tabD.id, paneId, { insertIndex: 1 });
  assert.deepEqual(titlesInPane(moved, paneId), ['A', 'D', 'B', 'C']);
  assert.equal(core.getActiveTab(moved.panes[0]).title, 'D');
}

function testMoveTabSamePositionIsNoOp() {
  const s = stateWithOrderedTabs();
  const paneId = s.panes[0].id;
  const tabB = s.panes[0].tabs[1];
  const before = core.moveTab(s, tabB.id, paneId, { insertIndex: 1 });
  const after = core.moveTab(s, tabB.id, paneId, { insertIndex: 2 });
  assert.deepEqual(titlesInPane(before, paneId), ['A', 'B', 'C', 'D']);
  assert.deepEqual(titlesInPane(after, paneId), ['A', 'B', 'C', 'D']);
}

function testMoveTabAcrossPanesAtInsertIndex() {
  const s = stateWithOrderedTabs();
  const h = core.splitHorizontal(s);
  const sourcePaneId = h.panes[0].id;
  const targetPaneId = h.panes[1].id;
  const withTargetTabs = core.addTabToPane(
    core.addTabToPane(h, targetPaneId, { title: 'X', kind: 'document' }),
    targetPaneId,
    { title: 'Y', kind: 'document' }
  );
  const moved = core.moveTab(withTargetTabs, withTargetTabs.panes[0].tabs[1].id, targetPaneId, { insertIndex: 1 });
  assert.deepEqual(titlesInPane(moved, sourcePaneId), ['A', 'C', 'D']);
  assert.deepEqual(titlesInPane(moved, targetPaneId), ['X', 'B', 'Y']);
  assert.equal(core.getActiveTab(core.findPane(moved, targetPaneId)).title, 'B');
  assert.equal(moved.activePaneId, targetPaneId);
}

function testMoveTabClampsInsertIndex() {
  const s = stateWithOrderedTabs();
  const paneId = s.panes[0].id;
  const tabA = s.panes[0].tabs[0];
  const last = core.moveTab(s, tabA.id, paneId, { insertIndex: 99 });
  const first = core.moveTab(s, s.panes[0].tabs[3].id, paneId, { insertIndex: -10 });
  assert.deepEqual(titlesInPane(last, paneId), ['B', 'C', 'D', 'A']);
  assert.deepEqual(titlesInPane(first, paneId), ['D', 'A', 'B', 'C']);
}

function testReorderedTabsPersist() {
  const s = stateWithOrderedTabs();
  const paneId = s.panes[0].id;
  const moved = core.moveTab(s, s.panes[0].tabs[0].id, paneId, { insertIndex: 4 });
  const restored = core.deserialize(core.serialize(moved));
  assert.deepEqual(titlesInPane(restored, paneId), ['B', 'C', 'D', 'A']);
  assert.equal(core.getActiveTab(restored.panes[0]).title, 'A');
}

// ============ 3.3/4.2 拖拽停靠 ============
function testDockTabCenter() {
  const s = stateWithTabs();
  const h = core.splitHorizontal(s);
  const payload = drag.createTabDragPayload(h.panes[0].tabs[0], h.panes[0].id);
  const dstId = h.panes[1].id;
  const next = core.dockToPane(h, payload, dstId, 'center');
  const dst = next.panes.find((p) => p.id === dstId);
  assert.equal(dst.tabs.length, 1, 'center 加入目标分栏');
  const src = next.panes.find((p) => p.id === h.panes[0].id);
  assert.equal(src.tabs.length, 1, '源分栏移除该标签');
}

function testDockTabRightCreatesHorizontal() {
  const s = stateWithTabs();
  const payload = drag.createTabDragPayload(s.panes[0].tabs[0], s.panes[0].id);
  const next = core.dockToPane(s, payload, s.panes[0].id, 'right');
  assert.equal(next.layout, 'horizontal', '右半区 -> 横向分栏');
  assert.equal(next.panes.length, 2);
}

function testDockTabBottomCreatesVertical() {
  const s = stateWithTabs();
  const payload = drag.createTabDragPayload(s.panes[0].tabs[0], s.panes[0].id);
  const next = core.dockToPane(s, payload, s.panes[0].id, 'bottom');
  assert.equal(next.layout, 'vertical', '下半区 -> 纵向分栏');
  assert.equal(next.panes.length, 2);
}

function testDockMessageCenter() {
  const s = stateWithTabs();
  const message = { filename: '001.txt', sender: 'Alice', content: 'hello', kind: 'text' };
  const payload = drag.createMessageDragPayload(message);
  const paneId = s.panes[0].id;
  const next = core.dockToPane(s, payload, paneId, 'center');
  const tab = next.panes[0].tabs[next.panes[0].tabs.length - 1];
  assert.equal(tab.kind, 'message');
  assert.equal(tab.message.filename, '001.txt');
  assert.equal(tab.sourceRef, '001.txt');
}

// ============ 拖拽几何检测 ============
function testDetectDropZoneCenter() {
  const pane = { left: 0, top: 0, right: 100, bottom: 100 };
  const win = { left: 0, top: 0, right: 200, bottom: 200 };
  assert.equal(drag.detectDropZoneFromRects({ x: 50, y: 50 }, pane, win), 'center');
}

function testDetectDropZoneRight() {
  const pane = { left: 0, top: 0, right: 100, bottom: 100 };
  const win = { left: 0, top: 0, right: 200, bottom: 200 };
  assert.equal(drag.detectDropZoneFromRects({ x: 90, y: 50 }, pane, win), 'right');
}

function testDetectDropZoneBottom() {
  const pane = { left: 0, top: 0, right: 100, bottom: 100 };
  const win = { left: 0, top: 0, right: 200, bottom: 200 };
  assert.equal(drag.detectDropZoneFromRects({ x: 50, y: 90 }, pane, win), 'bottom');
}

function testDetectDropZoneOutsidePaneDefaultsCenter() {
  const pane = { left: 10, top: 10, right: 110, bottom: 110 };
  const win = { left: 0, top: 0, right: 100, bottom: 100 };
  assert.equal(drag.detectDropZoneFromRects({ x: 200, y: 200 }, pane, win), 'center');
}

function testMissingDraggedTabNeverCreatesCopy() {
  const s = stateWithTabs();
  const beforeIds = s.panes.flatMap((pane) => pane.tabs.map((tab) => tab.id));
  const stalePayload = core.createDragPayload({
    kind: 'tab',
    sourceId: 'missing-tab',
    contentKind: 'document',
    title: '不应复制',
  });
  const next = core.dockToPane(s, stalePayload, s.panes[0].id, 'right');
  assert.deepEqual(next.panes.flatMap((pane) => pane.tabs.map((tab) => tab.id)), beforeIds);
  assert.equal(next.panes.length, 1, '源标签失效时不创建新标签或新分栏');
}

function testRepeatedTabDropNeverDuplicatesTab() {
  const s = stateWithTabs();
  const tabId = s.panes[0].tabs[0].id;
  const payload = drag.createTabDragPayload(s.panes[0].tabs[0], s.panes[0].id);
  const first = core.dockToPane(s, payload, s.panes[0].id, 'right');
  const targetPaneId = first.activePaneId;
  const second = core.dockToPane(first, payload, targetPaneId, 'center');
  const ids = second.panes.flatMap((pane) => pane.tabs.map((tab) => tab.id));
  assert.equal(ids.filter((id) => id === tabId).length, 1);
  assert.equal(ids.length, new Set(ids).size, '重复结束事件后所有标签 ID 仍唯一');
  assert.equal(ids.length, s.panes.flatMap((pane) => pane.tabs).length, '标签总数不增加');
}

function testDetectDropZoneLeft() {
  const pane = { left: 0, top: 0, right: 100, bottom: 100 };
  const win = { left: 0, top: 0, right: 200, bottom: 200 };
  assert.equal(drag.detectDropZoneFromRects({ x: 10, y: 50 }, pane, win), 'left');
}

function testDetectDropZoneTop() {
  const pane = { left: 0, top: 0, right: 100, bottom: 100 };
  const win = { left: 0, top: 0, right: 200, bottom: 200 };
  assert.equal(drag.detectDropZoneFromRects({ x: 50, y: 10 }, pane, win), 'top');
}

function testDetectDropZoneUsesRectangularCenter() {
  const pane = { left: 0, top: 0, right: 100, bottom: 100 };
  const win = { left: 0, top: 0, right: 200, bottom: 200 };
  assert.equal(drag.EDGE_RATIO, 0.25);
  assert.equal(drag.detectDropZoneFromRects({ x: 26, y: 74 }, pane, win), 'center');
  assert.equal(drag.detectDropZoneFromRects({ x: 24, y: 50 }, pane, win), 'left');
}

function testSortableInsertIndexConversion() {
  assert.equal(drag.getSortableInsertIndex(0, 2, true), 3, '同栏向后移动转换为移动前插入索引');
  assert.equal(drag.getSortableInsertIndex(2, 0, true), 0, '同栏向前移动保持最终索引');
  assert.equal(drag.getSortableInsertIndex(0, 1, false), 1, '跨栏移动直接使用目标索引');
  assert.equal(drag.getSortableInsertIndex(undefined, 1, false), null, '缺少索引时拒绝提交');
}

// ============ 1.2 持久化 ============
function testPersistenceRoundTrip() {
  globalThis.localStorage = makeMemoryStorage();
  const s = stateWithTabs();
  assert.equal(persistence.saveImmediate(s), true);
  const raw = persistence.load();
  assert.ok(raw, '已写入');
  const back = core.deserialize(raw);
  assert.equal(back.panes[0].tabs.length, 2);
  persistence.clear();
  assert.equal(persistence.load(), null);
  delete globalThis.localStorage;
}

function testPersistenceNoWebdav() {
  // 持久化只使用 localStorage，不触碰 WebDAV：键名固定且独立
  assert.equal(persistence.STORAGE_KEY, 'transfer-genie:workspace-state');
}

// ============ 1.3 启动恢复 ============
function testRestoreSyncWithSavedState() {
  globalThis.localStorage = makeMemoryStorage();
  const s = core.splitHorizontal(stateWithTabs());
  persistence.saveImmediate(s);
  const { state, hadSavedState } = restore.restoreSync(function (tab) {
    return tab.sourceRef === 'doc-a' || tab.sourceRef === 'doc-b';
  });
  assert.equal(hadSavedState, true);
  assert.equal(state.layout, 'horizontal');
  delete globalThis.localStorage;
}

function testRestoreMissingContentFlagged() {
  globalThis.localStorage = makeMemoryStorage();
  const s = stateWithTabs();
  persistence.saveImmediate(s);
  // doc-b 已缺失
  const { state } = restore.restoreSync(function (tab) {
    return tab.sourceRef !== 'doc-b';
  });
  const tabs = state.panes[0].tabs;
  assert.equal(tabs[0].missing, false);
  assert.equal(tabs[1].missing, true, '缺失内容标记为 missing 而非删除');
  delete globalThis.localStorage;
}

function testRestoreNoSavedState() {
  globalThis.localStorage = makeMemoryStorage();
  const { state, hadSavedState } = restore.restoreSync();
  assert.equal(hadSavedState, false);
  assert.equal(state.layout, 'single');
  delete globalThis.localStorage;
}

async function testRestoreAsync() {
  globalThis.localStorage = makeMemoryStorage();
  const s = stateWithTabs();
  persistence.saveImmediate(s);
  const { state, hadSavedState } = await restore.restoreAsync(async (tab) => tab.sourceRef === 'doc-a');
  assert.equal(hadSavedState, true);
  assert.equal(state.panes[0].tabs[0].missing, false);
  assert.equal(state.panes[0].tabs[1].missing, true);
  delete globalThis.localStorage;
}

// ============ 运行 ============
function run() {
  testInitialState();
  testSerializationRoundTrip();
  testDeserializeInvalid();
  testHorizontalSplitSingleToTwo();
  testHorizontalSplitTwoToThree();
  testHorizontalSplitCanContinuePastThreePanes();
  testVerticalSplit();
  testNestedLeftVerticalRightWholeLayout();
  testLegacyLayoutMigratesToTree();
  testCollapseToSingle();
  testPerPaneTabsAndActive();
  testRenameTab();
  testRenamedTabPersistsAndMoves();
  testCloseTabRemovesFromGroupNotSource();
  testMoveTabBetweenPanesPreservesState();
  testMoveTabForwardWithinPane();
  testMoveTabBackwardWithinPane();
  testMoveTabSamePositionIsNoOp();
  testMoveTabAcrossPanesAtInsertIndex();
  testMoveTabClampsInsertIndex();
  testReorderedTabsPersist();
  testDockTabCenter();
  testDockTabRightCreatesHorizontal();
  testDockTabBottomCreatesVertical();
  testMissingDraggedTabNeverCreatesCopy();
  testRepeatedTabDropNeverDuplicatesTab();
  testDockMessageCenter();
  testDetectDropZoneCenter();
  testDetectDropZoneRight();
  testDetectDropZoneBottom();
  testDetectDropZoneLeft();
  testDetectDropZoneTop();
  testDetectDropZoneUsesRectangularCenter();
  testDetectDropZoneOutsidePaneDefaultsCenter();
  testSortableInsertIndexConversion();
  testPersistenceRoundTrip();
  testPersistenceNoWebdav();
  testRestoreSyncWithSavedState();
  testRestoreMissingContentFlagged();
  testRestoreNoSavedState();
  console.log('workspace-core/persistence/restore/drag tests passed (sync)');
}

run();
await testRestoreAsync();
console.log('workspace restoreAsync tests passed');
