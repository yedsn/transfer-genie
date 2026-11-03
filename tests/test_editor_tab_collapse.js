import assert from 'node:assert/strict';
import '../src-ui/src/workspace/workspace-core.js';
import '../src-ui/src/workspace/workspace-persistence.js';
import '../src-ui/src/workspace/workspace-restore.js';
import '../src-ui/src/workspace/composer-core.js';

const core = globalThis.transferGenieWorkspaceCore;
const composer = globalThis.transferGenieComposerCore;
const persistence = globalThis.transferGenieWorkspacePersistence;
const restore = globalThis.transferGenieWorkspaceRestore;
function fresh() {
  return core.createInitialState({ tabs: ['A', 'B', 'C', 'D'].map((title) => ({
    id: title, title, text: `正文 ${title}`, format: 'markdown', sourceRef: `${title}.md`,
    message: { filename: `${title}.md` },
  })) });
}
const visible = (state, index = 0) => state.panes[index].tabs.filter((tab) => !tab.collapsed).map((tab) => tab.id);
function assertVisibility(state) {
  for (const pane of state.panes) {
    if (!pane.tabs.length) continue;
    assert.ok(pane.tabs.some((tab) => !tab.collapsed));
    assert.ok(pane.tabs.some((tab) => tab.id === pane.activeTabId && !tab.collapsed));
  }
}

{
  const original = fresh();
  const before = structuredClone(original);
  let state = core.collapseTab(original, 'A');
  assert.deepEqual(original, before, '收起不修改输入状态');
  assert.deepEqual(visible(state), ['B', 'C', 'D']);
  assert.equal(state.panes[0].activeTabId, 'B');
  assert.deepEqual(state.panes[0].tabs.map(({ collapsed, ...tab }) => tab), before.panes[0].tabs.map(({ collapsed, ...tab }) => tab));
  state = core.setActiveTabById(state, state.activePaneId, 'D');
  state = core.collapseTab(state, 'D');
  assert.equal(state.panes[0].activeTabId, 'C', '最右标签收起后切到左侧');
  state = core.collapseTab(state, 'B');
  assert.deepEqual(core.collapseTab(state, 'C'), state, '不允许收起最后一个可见标签');
  state = core.setActiveTabById(state, state.activePaneId, 'A');
  assert.deepEqual(visible(state), ['A', 'C']);
  assert.equal(state.panes[0].activeTabId, 'A');
  const expanded = core.expandAllTabs(state, state.activePaneId);
  assert.deepEqual(visible(expanded), ['A', 'B', 'C', 'D']);
  assert.equal(expanded.panes[0].activeTabId, 'A');
  assertVisibility(expanded);
}

{
  let state = fresh();
  const paneId = state.activePaneId;
  state = core.splitHorizontal(state, { tabs: [{ id: 'E', title: 'E' }] });
  const otherPane = structuredClone(state.panes[1]);
  state = core.collapseOtherTabs(state, paneId, 'B');
  assert.deepEqual(visible(state), ['B']);
  assert.equal(state.activePaneId, paneId);
  assert.deepEqual(state.panes[1], otherPane, '收起仅影响本栏');
  const closed = core.closeTab(state, 'B');
  assertVisibility(closed);
  assert.equal(closed.panes[0].tabs.length, 3);
  const moved = core.moveTab(state, 'B', otherPane.id);
  assertVisibility(moved);
  assert.equal(moved.panes[0].tabs.length, 3);
  const docked = core.dockToPane(state, core.createDragPayload({ sourceId: 'B', kind: 'tab' }), paneId, 'bottom');
  assertVisibility(docked);
  const copied = core.copyTabToZone(state, 'A', paneId, 'right');
  assertVisibility(copied);
  for (const operation of [
    (s) => composer.closeTabsRightOf(s, paneId, 'A'),
    (s) => composer.closeTabsLeftOf(s, paneId, 'C'),
    (s) => composer.closeOtherTabsInPane(s, paneId, 'A'),
    (s) => composer.closeDraftWithBlankFallback(s, 'B'),
  ]) assertVisibility(operation(state));
}

{
  let state = fresh();
  state = core.collapseOtherTabs(state, state.activePaneId, 'C');
  const memory = new Map();
  globalThis.localStorage = {
    getItem: (key) => memory.get(key) || null,
    setItem: (key, value) => memory.set(key, value),
    removeItem: (key) => memory.delete(key),
  };
  persistence.saveImmediate(state);
  assert.deepEqual(restore.restoreSync().state, state);
  const legacy = fresh();
  legacy.panes[0].tabs.forEach((tab) => delete tab.collapsed);
  assert.deepEqual(visible(core.deserialize(JSON.stringify(legacy))), ['A', 'B', 'C', 'D']);
  state.panes[0].tabs.forEach((tab) => { tab.collapsed = true; });
  assertVisibility(core.deserialize(JSON.stringify(state)));
  delete globalThis.localStorage;
}

{
  let state = core.collapseTab(fresh(), 'B');
  const paneId = state.activePaneId;
  state = core.moveTabBefore(state, 'A', paneId, 'D');
  assert.deepEqual(state.panes[0].tabs.map((tab) => tab.id), ['B', 'C', 'A', 'D']);
  assert.deepEqual(visible(state), ['C', 'A', 'D']);
  state = core.moveTabBefore(state, 'D', paneId, 'C');
  assert.deepEqual(visible(state), ['D', 'C', 'A']);
  state = core.moveTabBefore(state, 'D', paneId, null);
  assert.deepEqual(visible(state), ['C', 'A', 'D']);
  state = core.splitHorizontal(state, { tabs: [{ id: 'X' }, { id: 'Y' }, { id: 'Z' }] });
  const targetId = state.activePaneId;
  state = core.collapseTab(state, 'Y');
  state = core.moveTabBefore(state, 'A', targetId, 'Z');
  assert.deepEqual(state.panes[1].tabs.map((tab) => tab.id), ['X', 'Y', 'A', 'Z']);
  assert.equal(core.findTab(state, 'B').tab.collapsed, true);
  assert.equal(core.findTab(state, 'Y').tab.collapsed, true);
  assertVisibility(state);
}
console.log('editor tab collapse tests passed');
