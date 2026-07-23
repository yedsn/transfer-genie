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

function testHorizontalSplitThreeNoExpand() {
  const s = stateWithTabs();
  const h3 = core.splitHorizontal(core.splitHorizontal(s));
  const h4 = core.splitHorizontal(h3);
  assert.equal(h4.layout, 'three-column');
  assert.equal(h4.panes.length, 3, '三列不再扩展');
}

function testVerticalSplit() {
  const s = stateWithTabs();
  const v = core.splitVertical(s);
  assert.equal(v.layout, 'vertical');
  assert.equal(v.panes.length, 2);
  // 已有分栏时纵向不改布局
  const v2 = core.splitVertical(v);
  assert.equal(v2.layout, 'vertical');
  assert.equal(v2.panes.length, 2);
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
  testHorizontalSplitThreeNoExpand();
  testVerticalSplit();
  testCollapseToSingle();
  testPerPaneTabsAndActive();
  testCloseTabRemovesFromGroupNotSource();
  testMoveTabBetweenPanesPreservesState();
  testDockTabCenter();
  testDockTabRightCreatesHorizontal();
  testDockTabBottomCreatesVertical();
  testDockMessageCenter();
  testDetectDropZoneCenter();
  testDetectDropZoneRight();
  testDetectDropZoneBottom();
  testDetectDropZoneOutsidePaneDefaultsCenter();
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
