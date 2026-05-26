import assert from 'node:assert/strict';
import '../frontend/feed-state.js';

const feedState = globalThis.transferGenieFeedState;

function message(filename, timestamp_ms, extra = {}) {
  return {
    filename,
    timestamp_ms,
    kind: 'text',
    content: filename,
    original_name: filename,
    ...extra,
  };
}

function testSyncLoadedMessageBoundaries() {
  const boundaries = feedState.syncLoadedMessageBoundaries([
    message('001.txt', 100),
    message('002.txt', 200),
    message('003.txt', 300),
  ]);
  assert.deepEqual(boundaries.oldestLoadedMessageRef, {
    timestamp_ms: 100,
    filename: '001.txt',
  });
  assert.deepEqual(boundaries.newestLoadedMessageRef, {
    timestamp_ms: 300,
    filename: '003.txt',
  });
}

function testResetLoadedMessagesStateForEndpointSwitch() {
  const state = feedState.resetLoadedMessagesState();
  assert.deepEqual(state, {
    lastMessages: [],
    totalMessages: 0,
    hasMoreMessages: false,
    oldestLoadedMessageRef: null,
    newestLoadedMessageRef: null,
  });
}

function testPruneLoadedMessagesStateAfterDelete() {
  const result = feedState.pruneLoadedMessagesState(
    {
      lastMessages: [
        message('001.txt', 100),
        message('002.txt', 200),
        message('003.txt', 300),
      ],
      totalMessages: 5,
      hasMoreMessages: true,
      oldestLoadedMessageRef: { timestamp_ms: 100, filename: '001.txt' },
      newestLoadedMessageRef: { timestamp_ms: 300, filename: '003.txt' },
    },
    ['002.txt', 'missing.txt']
  );

  assert.equal(result.removedCount, 1);
  assert.deepEqual(
    result.state.lastMessages.map((item) => item.filename),
    ['001.txt', '003.txt']
  );
  assert.equal(result.state.totalMessages, 4);
  assert.equal(result.state.hasMoreMessages, true);
  assert.deepEqual(result.state.oldestLoadedMessageRef, {
    timestamp_ms: 100,
    filename: '001.txt',
  });
  assert.deepEqual(result.state.newestLoadedMessageRef, {
    timestamp_ms: 300,
    filename: '003.txt',
  });
}

function testResolveDeletedFilenames() {
  const resolved = feedState.resolveDeletedFilenames(
    ['001.txt', '002.txt', '003.txt'],
    [' 002.txt ']
  );
  assert.deepEqual(resolved, ['001.txt', '003.txt']);
}

function testFilterMessagesForSearch() {
  const result = feedState.filterMessagesForSearch(
    [
      message('alpha.txt', 100, { content: 'hello world' }),
      message('bravo.bin', 200, { kind: 'file', original_name: 'project-plan.pdf', content: null }),
      message('charlie.txt', 300, { content: 'totally unrelated' }),
    ],
    'plan'
  );

  assert.equal(result.searchState.rawQuery, 'plan');
  assert.equal(result.searchState.hasQuery, true);
  assert.deepEqual(
    result.messages.map((item) => item.filename),
    ['bravo.bin']
  );
}

function testSelectionModePausesRefresh() {
  assert.equal(feedState.isMessageSelectionRefreshPaused(true), true);
  assert.equal(feedState.isMessageSelectionRefreshPaused(false), false);
}

function testReconcileCheckNewStateAppendsNewMessagesAndUpdatesMetadata() {
  const result = feedState.reconcileCheckNewState(
    {
      lastMessages: [
        message('001.txt', 100, { marked: false, local_path: null, marked_tag_ids: [] }),
        message('002.txt', 200, { marked: false, local_path: null, marked_tag_ids: [] }),
      ],
      totalMessages: 2,
      hasMoreMessages: false,
    },
    [
      message('002.txt', 200, { marked: true, local_path: 'C:/tmp/002.txt', marked_tag_ids: ['tag-a'] }),
      message('003.txt', 300, { marked: false, local_path: null, marked_tag_ids: [] }),
    ],
    [
      message('002.txt', 200, { marked: true, local_path: 'C:/tmp/002.txt', marked_tag_ids: ['tag-a'] }),
      message('003.txt', 300, { marked: false, local_path: null, marked_tag_ids: [] }),
    ],
    3,
    false
  );

  assert.equal(result.shouldRender, true);
  assert.equal(result.appendedCount, 1);
  assert.equal(result.state.totalMessages, 3);
  assert.equal(result.state.lastMessages[1].marked, true);
  assert.equal(result.state.lastMessages[1].local_path, 'C:/tmp/002.txt');
  assert.deepEqual(result.state.lastMessages.map((item) => item.filename), [
    '001.txt',
    '002.txt',
    '003.txt',
  ]);
}

function testReconcileCheckNewStateHandlesMetadataOnlyRefresh() {
  const result = feedState.reconcileCheckNewState(
    {
      lastMessages: [
        message('001.txt', 100, { marked: false, local_path: null, marked_tag_ids: [] }),
      ],
      totalMessages: 1,
      hasMoreMessages: false,
    },
    [
      message('001.txt', 100, {
        marked: true,
        local_path: 'C:/tmp/001.txt',
        marked_pinned: true,
        marked_tag_ids: ['tag-a'],
      }),
    ],
    [],
    1,
    false
  );

  assert.equal(result.shouldRender, true);
  assert.equal(result.appendedCount, 0);
  assert.equal(result.state.lastMessages[0].marked, true);
  assert.equal(result.state.lastMessages[0].marked_pinned, true);
  assert.deepEqual(result.state.lastMessages[0].marked_tag_ids, ['tag-a']);
}

function testReconcileCheckNewStateUpdatesCountsWithoutRenderWhenOnlyTotalChanges() {
  const result = feedState.reconcileCheckNewState(
    {
      lastMessages: [
        message('001.txt', 100, { marked: false, local_path: null, marked_tag_ids: [] }),
      ],
      totalMessages: 2,
      hasMoreMessages: true,
    },
    [message('001.txt', 100, { marked: false, local_path: null, marked_tag_ids: [] })],
    [],
    1,
    false
  );

  assert.equal(result.shouldRender, false);
  assert.equal(result.state.totalMessages, 1);
  assert.equal(result.state.hasMoreMessages, false);
}

function testShouldAutoRefreshTick() {
  const paused = feedState.shouldAutoRefreshTick({
    isRefreshRunning: false,
    hasActiveEndpoint: true,
    hasSearchQuery: true,
    hasActiveTransfer: false,
    selectionPaused: false,
    activeTab: 'home',
    refreshCountdownSecs: 3,
    intervalSecs: 5,
  });
  assert.equal(paused.shouldRefresh, false);
  assert.equal(paused.nextCountdownSecs, 3);

  const running = feedState.shouldAutoRefreshTick({
    isRefreshRunning: false,
    hasActiveEndpoint: true,
    hasSearchQuery: false,
    hasActiveTransfer: false,
    selectionPaused: false,
    activeTab: 'home',
    refreshCountdownSecs: 1,
    intervalSecs: 5,
  });
  assert.equal(running.shouldRefresh, true);
  assert.equal(running.nextCountdownSecs, 5);

  const noEndpoint = feedState.shouldAutoRefreshTick({
    isRefreshRunning: false,
    hasActiveEndpoint: false,
    hasSearchQuery: false,
    hasActiveTransfer: false,
    selectionPaused: false,
    activeTab: 'home',
    refreshCountdownSecs: 2,
    intervalSecs: 5,
  });
  assert.equal(noEndpoint.shouldRefresh, false);
  assert.equal(noEndpoint.nextCountdownSecs, 5);
}

function run() {
  testSyncLoadedMessageBoundaries();
  testResetLoadedMessagesStateForEndpointSwitch();
  testPruneLoadedMessagesStateAfterDelete();
  testResolveDeletedFilenames();
  testFilterMessagesForSearch();
  testSelectionModePausesRefresh();
  testReconcileCheckNewStateAppendsNewMessagesAndUpdatesMetadata();
  testReconcileCheckNewStateHandlesMetadataOnlyRefresh();
  testReconcileCheckNewStateUpdatesCountsWithoutRenderWhenOnlyTotalChanges();
  testShouldAutoRefreshTick();
  console.log('feed-state tests passed');
}

run();
