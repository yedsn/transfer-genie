import assert from 'node:assert/strict';
import '../src-ui/src/workspace/workspace-core.js';
import '../src-ui/src/workspace/workspace-persistence.js';
import '../src-ui/src/workspace/workspace-restore.js';
import '../src-ui/src/workspace/workspace-drag.js';

const core = globalThis.transferGenieWorkspaceCore;
const persistence = globalThis.transferGenieWorkspacePersistence;
const restore = globalThis.transferGenieWorkspaceRestore;
const drag = globalThis.transferGenieWorkspaceDrag;

function makeStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
  };
}

/**
 * 集成场景：模拟一次完整的工作区会话，覆盖布局、停靠、持久化与重启恢复。
 */
function testFullSessionLifecycle() {
  globalThis.localStorage = makeStorage();

  // 1. 起步：单栏，打开两个文档
  let s = core.createInitialState({
    tabs: [{ title: '方案A', kind: 'document', sourceRef: 'doc-a' }],
  });
  assert.equal(s.layout, 'single');

  // 2. 横向分栏 -> 双列；再横向 -> 三列
  s = core.splitHorizontal(s);
  assert.equal(s.layout, 'horizontal');
  s = core.splitHorizontal(s);
  assert.equal(s.layout, 'three-column');
  assert.equal(s.panes.length, 3);

  // 3. 给第二栏加一个消息标签
  const paneB = s.panes[1];
  s = core.addTabToPane(s, paneB.id, {
    kind: 'message', title: 'Alice', sourceRef: '001.txt',
    message: { filename: '001.txt', sender: 'Alice', content: 'hello', kind: 'text' },
  });
  assert.equal(core.getActiveTab(s.panes[1]).kind, 'message');

  // 4. 把第一栏的文档拖到第三栏中间（同栏标签）
  const docTab = s.panes[0].tabs[0];
  const targetPane = s.panes[2];
  const payload = drag.createTabDragPayload(docTab, s.panes[0].id);
  s = core.dockToPane(s, payload, targetPane.id, 'center');
  const docPane = s.panes.find(pp => pp.tabs.some(tt => tt.sourceRef === docTab.sourceRef));
  assert.ok(docPane, '文档已停靠到目标分栏');
  assert.equal(docPane.tabs.length, 1, '文档作为标签加入目标分栏');

  // 空栏在多栏布局下折叠：三列中只剩两个非空 -> 回到 horizontal
  assert.equal(s.layout, 'horizontal');

  // 5. 把消息标签拖到右半区 -> 新建右侧分栏
  const msgPane = s.panes.find(p => p.tabs.some(t => t.kind === 'message'));
  const msgTab = msgPane.tabs.find(t => t.kind === 'message');
  const msgPayload = drag.createTabDragPayload(msgTab, msgPane.id);
  s = core.dockToPane(s, msgPayload, msgPane.id, 'right');
  assert.equal(s.layout, 'horizontal');
  assert.ok(s.panes.length >= 2);

  // 6. 持久化
  persistence.saveImmediate(s);
  const raw = persistence.load();
  assert.ok(raw);

  // 7. 模拟重启：从持久化恢复，并校验内容（doc-a 仍在，doc-x 缺失）
  globalThis.localStorage = makeStorage();
  persistence.saveImmediate(s); // 重新写入新 storage
  const { state: restored, hadSavedState } = restore.restoreSync((tab) => {
    return tab.sourceRef !== 'doc-x';
  });
  assert.equal(hadSavedState, true);
  assert.ok(restored.panes.flatMap(p => p.tabs).some(t => t.sourceRef === 'doc-a'), '主工作区标签状态被恢复');

  // 8. 缺失内容恢复：构造一个引用已删文档的标签
  globalThis.localStorage = makeStorage();
  const missingState = core.createInitialState({
    tabs: [
      { title: '存在', kind: 'document', sourceRef: 'doc-a' },
      { title: '已删', kind: 'document', sourceRef: 'doc-x' },
    ],
  });
  persistence.saveImmediate(missingState);
  const { state: r2 } = restore.restoreSync((tab) => tab.sourceRef !== 'doc-x');
  assert.equal(r2.panes[0].tabs[0].missing, false, '存在的内容可用');
  assert.equal(r2.panes[0].tabs[1].missing, true, '缺失内容标记为可恢复状态而非删除');

  delete globalThis.localStorage;
}

/**
 * 集成场景：消息从消息流拖入分栏的完整规则（右/下/中）。
 */
function testMessageDockingRules() {
  let s = core.createInitialState({
    tabs: [{ title: '文档', kind: 'document', sourceRef: 'doc' }],
  });
  const message = { filename: '002.txt', sender: 'Bob', content: 'hi', kind: 'text' };

  // 中间 -> 当前分栏新标签，原消息源保留（消息快照独立）
  const pCenter = drag.createMessageDragPayload(message);
  s = core.dockToPane(s, pCenter, s.panes[0].id, 'center');
  const msgTab = s.panes[0].tabs.find(t => t.kind === 'message');
  assert.ok(msgTab, '消息作为标签加入当前分栏');
  assert.equal(msgTab.message.filename, '002.txt', '保留消息流内容');

  // 右半区 -> 右侧分栏
  const pRight = drag.createMessageDragPayload(message);
  s = core.dockToPane(s, pRight, s.panes[0].id, 'right');
  assert.equal(s.layout, 'horizontal');

  // 下半区 -> 下方分栏（从单栏状态）
  let sSingle = core.createInitialState({ tabs: [{ title: '文档', kind: 'document', sourceRef: 'doc' }] });
  const pBottom = drag.createMessageDragPayload(message);
  sSingle = core.dockToPane(sSingle, pBottom, sSingle.panes[0].id, 'bottom');
  assert.equal(sSingle.layout, 'vertical', '下半区 -> 纵向分栏');
}

/**
 * 集成场景：三列布局扩展上限与折叠规则。
 */
function testThreeColumnBoundsAndCollapse() {
  let s = core.createInitialState({ tabs: [{ title: 'A', kind: 'document', sourceRef: 'a' }] });
  s = core.splitHorizontal(s);
  s = core.splitHorizontal(s);
  assert.equal(s.layout, 'three-column');
  // 第四次横向不再扩展
  s = core.splitHorizontal(s);
  assert.equal(s.layout, 'three-column');
  assert.equal(s.panes.length, 3);
  // 关闭两个标签 -> 自动折叠回单栏
  for (const p of s.panes.slice()) {
    if (p.tabs[0]) s = core.closeTab(s, p.tabs[0].id);
  }
  assert.equal(s.layout, 'single');
}

function run() {
  testFullSessionLifecycle();
  testMessageDockingRules();
  testThreeColumnBoundsAndCollapse();
  console.log('workspace integration tests passed');
}

run();
