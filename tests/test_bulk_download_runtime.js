import assert from 'node:assert/strict';
import { createBulkSelectionStore, createBulkDownloadQueue, rectanglesIntersect, isBulkGridView, bulkViewStorageKey } from '../src-ui/src/utils/bulk-download-runtime.js';

function resource(key, size = 1) { return { key, size, filename: key, originalName: key }; }

function testSelectionPersistsAcrossDifferentPagesAndFilters() {
  const store = createBulkSelectionStore();
  store.setMany([resource('image-a', 10), resource('image-b', 20)]);
  store.set(resource('video-a', 30));
  assert.deepEqual(store.summary(), { count: 3, size: 60 });
  store.setMany([resource('image-a'), resource('image-b')], false);
  assert.deepEqual(store.values().map((item) => item.key), ['video-a']);
}

async function testQueueHonorsConcurrencyAndContinuesAfterFailure() {
  let active = 0; let peak = 0; const order = [];
  const queue = createBulkDownloadQueue(async (item) => {
    active += 1; peak = Math.max(peak, active); order.push(`start:${item.key}`);
    await new Promise((resolve) => setTimeout(resolve, item.delay));
    active -= 1; order.push(`end:${item.key}`);
    if (item.fail) throw new Error('failed');
    return item.key;
  }, { concurrency: 3 });
  const results = await Promise.allSettled([
    queue.enqueue({ key: 'a', delay: 20 }), queue.enqueue({ key: 'b', delay: 20, fail: true }),
    queue.enqueue({ key: 'c', delay: 20 }), queue.enqueue({ key: 'd', delay: 1 }),
  ]);
  assert.equal(peak, 3);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 3);
  assert.equal(results.filter((result) => result.status === 'rejected').length, 1);
  assert.ok(order.indexOf('start:d') > order.indexOf('start:c'));
  assert.deepEqual(queue.stats(), { active: 0, pending: 0, concurrency: 3 });
}

function testMarqueeHelpersAndViewPreferences() {
  assert.equal(rectanglesIntersect({ left: 0, top: 0, right: 20, bottom: 20 }, { left: 10, top: 10, right: 30, bottom: 30 }), true);
  assert.equal(rectanglesIntersect({ left: 0, top: 0, right: 5, bottom: 5 }, { left: 10, top: 10, right: 20, bottom: 20 }), false);
  assert.equal(isBulkGridView('tiles'), true);
  assert.equal(isBulkGridView('large-icons'), true);
  assert.equal(isBulkGridView('details'), false);
  assert.match(bulkViewStorageKey('image'), /image$/);
}

testSelectionPersistsAcrossDifferentPagesAndFilters();
await testQueueHonorsConcurrencyAndContinuesAfterFailure();
testMarqueeHelpersAndViewPreferences();
console.log('bulk-download runtime tests passed');
