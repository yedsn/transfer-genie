import assert from 'node:assert/strict';
import '../src-ui/src/workspace/workspace-core.js';
import '../src-ui/src/workspace/workspace-persistence.js';
import '../src-ui/src/workspace/workspace-restore.js';
import '../src-ui/src/workspace/workspace-drag.js';
import '../src-ui/src/workspace/composer-core.js';

const core = globalThis.transferGenieWorkspaceCore;
const ccore = globalThis.transferGenieComposerCore;
const persistence = globalThis.transferGenieWorkspacePersistence;
const restore = globalThis.transferGenieWorkspaceRestore;

function makeStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: (k) => { m.delete(k); } };
}

function fresh() { ccore.resetSeq(); return ccore.createInitialComposer(); }

// ============ 草稿模型 ============
function testInitialComposer() {
  ccore.resetSeq();
  const s = ccore.createInitialComposer();
  assert.equal(s.layout, 'single');
  assert.equal(s.panes.length, 1);
  assert.equal(s.panes[0].tabs.length, 1);
  const d = ccore.getActiveDraft(s);
  assert.ok(d, '存在活动草稿');
  assert.equal(d.text, '');
  assert.equal(d.format, 'text');
}

function testAddDraftToPane() {
  let s = fresh();
  const paneId = s.panes[0].id;
  const r = ccore.addDraft(s, paneId, { text: '第二条', format: 'markdown' });
  s = r.state;
  assert.equal(s.panes[0].tabs.length, 2);
  assert.equal(s.panes[0].activeTabId, r.draftId);
  assert.equal(ccore.getActiveDraft(s).text, '第二条');
  assert.equal(ccore.getActiveDraft(s).format, 'markdown');
}

function testSetDraftTextAndFormat() {
  let s = fresh();
  const d = ccore.getActiveDraft(s);
  s = ccore.setDraftText(s, d.id, 'hello world');
  assert.equal(ccore.getActiveDraft(s).text, 'hello world');
  s = ccore.setDraftFormat(s, d.id, 'markdown');
  assert.equal(ccore.getActiveDraft(s).format, 'markdown');
}

// ============ 分栏草稿 ============
function testSplitCreatesSecondPaneWithDrafts() {
  let s = fresh();
  const paneA = s.panes[0].id;
  s = ccore.addDraft(s, paneA, { text: 'A1' }).state;
  s = core.splitHorizontal(s);
  assert.equal(s.layout, 'horizontal');
  assert.equal(s.panes.length, 2);
  // 第二栏可独立加草稿
  const paneB = s.panes[1].id;
  s = ccore.addDraft(s, paneB, { text: 'B1' }).state;
  const bDrafts = s.panes.find(p => p.id === paneB).tabs;
  assert.equal(bDrafts.length, 1);
  assert.equal(bDrafts[0].text, 'B1');
}

function testMoveDraftBetweenPanes() {
  let s = fresh();
  const paneA = s.panes[0].id;
  const r = ccore.addDraft(s, paneA, { text: '可移动' });
  s = r.state;
  const draftId = r.draftId;
  s = core.splitHorizontal(s);
  const paneB = s.panes[1].id;
  s = core.moveTab(s, draftId, paneB);
  const inB = s.panes.find(p => p.id === paneB).tabs.some(t => t.id === draftId);
  assert.ok(inB, '草稿移动到第二栏');
  const moved = s.panes.find(p => p.id === paneB).tabs.find(t => t.id === draftId);
  assert.equal(moved.text, '可移动', '草稿内容保留');
}

// ============ 消息转草稿停靠 ============
function testDockMessageCenterAsDraft() {
  let s = fresh();
  const paneId = s.panes[0].id;
  const message = { filename: '001.txt', sender: 'Alice', content: '你好', kind: 'text', format: 'text' };
  const { state: next, draftId } = ccore.dockMessageAsDraft(s, message, paneId, 'center');
  s = next;
  assert.ok(draftId);
  const d = ccore.findDraft(s, draftId).tab;
  assert.equal(d.kind, 'draft');
  assert.equal(d.text, '你好', '消息内容写入草稿');
  assert.equal(d.sourceRef, '001.txt', '保留消息来源引用');
  assert.equal(d.message.filename, '001.txt', '保留消息快照');
}

function testDockMessageRightCreatesPane() {
  let s = fresh();
  const paneId = s.panes[0].id;
  const message = { filename: '002.md', sender: 'Bob', content: '# hi', format: 'markdown' };
  const { state: next } = ccore.dockMessageAsDraft(s, message, paneId, 'right');
  assert.equal(next.layout, 'horizontal', '右半区 -> 横向分栏');
  const mdDraft = next.panes.flatMap(p => p.tabs).find(t => t.sourceRef === '002.md');
  assert.ok(mdDraft);
  assert.equal(mdDraft.format, 'markdown', 'markdown 消息草稿格式');
  assert.equal(mdDraft.text, '# hi');
}

function testDockMessageBottomCreatesVertical() {
  let s = fresh();
  const paneId = s.panes[0].id;
  const message = { filename: '003.txt', sender: 'C', content: '下' };
  const { state: next } = ccore.dockMessageAsDraft(s, message, paneId, 'bottom');
  assert.equal(next.layout, 'vertical', '下半区 -> 纵向分栏');
}

// ============ 发送后清空 ============
function testClearActiveDraftAfterSend() {
  let s = fresh();
  const paneId = s.panes[0].id;
  s = ccore.setDraftText(s, ccore.getActiveDraft(s).id, '待发送内容');
  assert.equal(ccore.getActiveDraft(s).text, '待发送内容');
  s = ccore.clearActiveDraftAfterSend(s);
  assert.equal(ccore.getActiveDraft(s).text, '', '发送后清空活动草稿');
  // 草稿标签保留，可继续输入
  assert.equal(s.panes[0].tabs.length, 1);
}

// ============ 持久化与恢复 ============
function testPersistAndRestoreDrafts() {
  globalThis.localStorage = makeStorage();
  let s = fresh();
  s = ccore.setDraftText(s, ccore.getActiveDraft(s).id, '持久化草稿');
  s = core.splitHorizontal(s);
  persistence.saveImmediate(s);
  const { state: restored, hadSavedState } = restore.restoreSync(() => true);
  assert.equal(hadSavedState, true);
  assert.equal(restored.layout, 'horizontal');
  assert.ok(restored.panes.flatMap(p => p.tabs).some(t => t.text === '持久化草稿'), '草稿内容被恢复');
  delete globalThis.localStorage;
}

// ============ 完整会话 ============
function testFullDraftSession() {
  globalThis.localStorage = makeStorage();
  let s = fresh();
  // 多条草稿
  const paneId = s.panes[0].id;
  s = ccore.addDraft(s, paneId, { text: '草稿A', format: 'markdown' }).state;
  s = ccore.addDraft(s, paneId, { text: '草稿B' }).state;
  assert.equal(s.panes[0].tabs.length, 3);
  // 分栏并移动草稿
  s = core.splitHorizontal(s);
  const paneB = s.panes[1].id;
  const draftB = s.panes[0].tabs[2];
  s = core.moveTab(s, draftB.id, paneB);
  // 拖消息进来作为新草稿
  const msg = { filename: 'feed.txt', sender: 'Feed', content: '从消息流来' };
  s = ccore.dockMessageAsDraft(s, msg, paneB, 'center').state;
  // 发送活动草稿后清空
  s = ccore.clearActiveDraftAfterSend(s);
  assert.equal(ccore.getActiveDraft(s).text, '');
  // 持久化并重启恢复
  persistence.saveImmediate(s);
  const { state: r } = restore.restoreSync(() => true);
  assert.ok(r.panes.flatMap(p => p.tabs).length >= 2, '多草稿被恢复');
  delete globalThis.localStorage;
}


// ============ 内容保护 ============
function testNonEmptyDetection() {
  ccore.resetSeq();
  assert.equal(ccore.isDraftNonEmpty({ text: '' }), false);
  assert.equal(ccore.isDraftNonEmpty({ text: '   \n  ' }), false);
  assert.equal(ccore.isDraftNonEmpty({ text: '有内容' }), true);
}

function testCountNonEmptyTabs() {
  let s = ccore.createInitialComposer(); // 1 空草稿
  assert.equal(ccore.countNonEmptyTabs(s), 0);
  const paneId = s.panes[0].id;
  s = ccore.addDraft(s, paneId, { text: '有内容' }).state;
  s = ccore.addDraft(s, paneId, { text: '  ' }).state;
  assert.equal(ccore.countNonEmptyTabs(s), 1);
}

function testNonEmptyTabsOutsidePane() {
  let s = ccore.createInitialComposer();
  const paneA = s.panes[0].id;
  s = ccore.addDraft(s, paneA, { text: 'A 内容' }).state;
  s = core.splitHorizontal(s);
  const paneB = s.panes[1].id;
  s = ccore.addDraft(s, paneB, { text: 'B 内容' }).state;
  // 收起保留 paneA 时，paneB 有 1 条非空草稿会被丢弃
  assert.equal(ccore.nonEmptyTabsOutsidePane(s, paneA), 1);
  assert.equal(ccore.nonEmptyTabsOutsidePane(s, paneB), 1);
  // 保留 paneA 不丢弃 paneA 自身
  s = ccore.addDraft(s, paneA, { text: '' }).state; // paneA 再加空草稿
  assert.equal(ccore.nonEmptyTabsOutsidePane(s, paneA), 1, '仅统计其他分栏');
}


// ============ 右键菜单批量关闭 ============
function testCloseOtherTabsInPane() {
  let s = fresh();
  const paneId = s.panes[0].id;
  const keep = ccore.getActiveDraft(s).id;
  s = ccore.addDraft(s, paneId, { text: '其他1' }).state;
  s = ccore.addDraft(s, paneId, { text: '其他2' }).state;
  assert.equal(s.panes[0].tabs.length, 3);
  s = ccore.closeOtherTabsInPane(s, paneId, keep);
  assert.equal(s.panes[0].tabs.length, 1, '关闭其他后只剩 1 条');
  assert.equal(s.panes[0].tabs[0].id, keep, '保留指定草稿');
  assert.equal(s.panes[0].activeTabId, keep, '活动草稿设为保留项');
}

function testCloseAllTabsInPane() {
  let s = fresh();
  const paneId = s.panes[0].id;
  s = ccore.addDraft(s, paneId, { text: 'A' }).state;
  s = ccore.addDraft(s, paneId, { text: 'B' }).state;
  assert.equal(s.panes[0].tabs.length, 3);
  s = ccore.closeAllTabsInPane(s, paneId);
  assert.equal(s.panes[0].tabs.length, 1, '关闭全部后留 1 条空草稿');
  assert.equal(s.panes[0].tabs[0].text, '', '空草稿');
  assert.equal(s.panes[0].activeTabId, s.panes[0].tabs[0].id, '活动草稿指向新空草稿');
}

function testCloseTabsRightOf() {
  let s = fresh();
  const paneId = s.panes[0].id;
  // tabs: [d0, d1, d2, d3]
  const d0 = s.panes[0].tabs[0].id;
  const r1 = ccore.addDraft(s, paneId, { text: 'd1' });
  s = r1.state;
  const d1 = r1.draftId;
  const r2 = ccore.addDraft(s, paneId, { text: 'd2' });
  s = r2.state;
  const d2 = r2.draftId;
  const r3 = ccore.addDraft(s, paneId, { text: 'd3' });
  s = r3.state;
  const d3 = r3.draftId;
  assert.equal(s.panes[0].tabs.length, 4);
  // 以 d1 为基准关闭右侧 -> 保留 [d0, d1]
  s = ccore.closeTabsRightOf(s, paneId, d1);
  const ids = s.panes[0].tabs.map(t => t.id);
  assert.deepEqual(ids, [d0, d1], '关闭右侧只保留基准及左侧');
  assert.ok(!ids.includes(d2) && !ids.includes(d3));
}

function testCloseTabsLeftOf() {
  let s = fresh();
  const paneId = s.panes[0].id;
  const d0 = s.panes[0].tabs[0].id;
  const r1 = ccore.addDraft(s, paneId, { text: 'd1' });
  s = r1.state;
  const d1 = r1.draftId;
  const r2 = ccore.addDraft(s, paneId, { text: 'd2' });
  s = r2.state;
  const d2 = r2.draftId;
  // 以 d2 为基准关闭左侧 -> 保留 [d2]
  s = ccore.closeTabsLeftOf(s, paneId, d2);
  const ids = s.panes[0].tabs.map(t => t.id);
  assert.deepEqual(ids, [d2], '关闭左侧只保留基准及右侧');
  assert.ok(!ids.includes(d0) && !ids.includes(d1));
  assert.equal(s.panes[0].activeTabId, d2, '活动草稿修正到基准');
}

function testCountNonEmptyBatch() {
  const tabs = [{ text: '' }, { text: 'a' }, { text: '  ' }, { text: 'b' }];
  assert.equal(ccore.countNonEmpty(tabs), 2, '非空计数');
  assert.equal(ccore.countNonEmpty([]), 0);
}

function run() {
  testInitialComposer();
  testAddDraftToPane();
  testSetDraftTextAndFormat();
  testSplitCreatesSecondPaneWithDrafts();
  testMoveDraftBetweenPanes();
  testDockMessageCenterAsDraft();
  testDockMessageRightCreatesPane();
  testDockMessageBottomCreatesVertical();
  testClearActiveDraftAfterSend();
  testPersistAndRestoreDrafts();
  testFullDraftSession();
  testNonEmptyDetection();
  testCountNonEmptyTabs();
  testNonEmptyTabsOutsidePane();
  testCloseOtherTabsInPane();
  testCloseAllTabsInPane();
  testCloseTabsRightOf();
  testCloseTabsLeftOf();
  testCountNonEmptyBatch();
  console.log('composer draft tests passed');
}

run();
