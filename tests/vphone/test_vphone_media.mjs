#!/usr/bin/env node
// Read-only acceptance of dedicated existing fixtures. No install, delete or send.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { assertEmptyComposer, assertNoActiveEditing } from './draft-safety.mjs';

const cli = '/Applications/vphone-launchpad.app/Contents/MacOS/vphone-launchpad-cli';
const machine = process.env.VPHONE_MACHINE || 'Transfer-Genie-iOS-26';
const root = process.env.VPHONE_LIBRARY_ROOT || '/Volumes/VPhone/machines';
const artifacts = resolve(process.env.VPHONE_ARTIFACT_DIR || '/Volumes/VPhone/installers/vphone-media/' + Date.now());
const report = { classification: 'SUPPLEMENTAL_ONLY_NOT_JAM_ACCEPTANCE', startedAt: new Date().toISOString(), checks: [] };
mkdirSync(artifacts, { recursive: true });
function rpc(method, params = {}, timeout = 30000) {
  const result = spawnSync(cli, ['guest', 'rpc', machine, method, JSON.stringify(params), '--root', root], { encoding: 'utf8', timeout, maxBuffer: 8 * 1024 * 1024 });
  assert.equal(result.status, 0, method + ': ' + (result.error?.message || result.stderr));
  const response = JSON.parse(result.stdout);
  assert.equal(response.ok, true, method + ' refused');
  return response.result;
}
const tree = () => rpc('ui.tree', { max_elements: 400, visible_only: true });
const tap = (text) => {
  for (let attempt = 0; attempt < 15; attempt++) {
    const element = tree().elements.find(e => e.label === text);
    if (element && element.enabled !== false) return rpc('ui.tap_element', { text, match: 'exact' });
    spawnSync('sleep', ['1']);
  }
  throw new Error('Control not ready: ' + text);
};
const wait = (text, seconds = 20, match = 'exact') => rpc('ui.wait', { text, match, timeout: seconds }, (seconds + 10) * 1000);
function record(name) { report.checks.push({ name, ok: true }); console.log('[vphone media] PASS ' + name); }
function waitTree(predicate, description, seconds = 30) {
  for (let attempt = 0; attempt < seconds; attempt++) {
    const ui = tree();
    if (predicate(ui.elements)) return ui.elements;
    spawnSync('sleep', ['1']);
  }
  throw new Error('Timed out waiting for ' + description);
}
function screenshot(name) {
  const result = spawnSync(cli, ['guest', 'send', machine, JSON.stringify({ t: 'screenshot', path: join(artifacts, name + '.png') }), '--root', root], { encoding: 'utf8', timeout: 30000 });
  assert.equal(result.status, 0, 'Screenshot failed');
}
function search(name) {
  let ui = tree();
  if (ui.elements.some(e => e.label === '清除')) { tap('清除'); ui = tree(); }
  if (!ui.elements.some(e => e.label === '搜索文本、文件名')) tap('搜索消息');
  wait('搜索文本、文件名');
  tap('搜索文本、文件名');
  rpc('input.paste', { text: name });
  wait(name, 30, 'contains');
  rpc('input.key', { name: 'return' });
  wait('更多操作', 30);
  // VPhone reports HTML img as role=element. Require the loaded result and
  // allow JPEG decoding before a screenshot, then visually inspect the artifact.
  spawnSync('sleep', ['1']);
}
function openDetail() {
  tap('更多操作');
  wait('查看详情', 15, 'contains');
  rpc('ui.tap_element', { text: '查看详情', match: 'contains' });
  wait('关闭详情');
}
try {
  rpc('screen.unlock', { timeout: 10 });
  rpc('apps.launch', { bundle_id: 'com.transfergenie' });
  if (!tree().elements.some(e => e.label === '新消息')) {
    const current = tree().elements;
    assert(!current.some(e => e.label === '关闭新消息'), 'Refusing to navigate away from an active composer');
    if (current.some(e => e.label === '取消' && e.clickable)) tap('取消');
    if (tree().elements.some(e => e.label === '关闭详情' && e.clickable)) tap('关闭详情');
  }
  wait('新消息', 30);
  assertNoActiveEditing(tree());
  tap('新消息'); wait('消息内容'); assertEmptyComposer(tree()); tap('关闭新消息');
  record('idle app and empty draft verified');

  search('TG-IOS-PROBE-20261026-image.jpeg');
  screenshot('image-feed-thumbnail');
  openDetail(); wait('查看'); screenshot('image-detail-thumbnail');
  tap('查看'); wait('Done', 60); screenshot('image-original-quick-look');
  tap('Done'); wait('关闭详情');
  record('image detail original Quick Look and return');
  tap('分享');
  const shareElements = waitTree(elements =>
    elements.some(e => e.identifier === 'shareCell' || e.identifier === 'actionGroupCell' || ['AirDrop', 'Copy', '拷贝'].includes(e.label)),
  'system share actions');
  screenshot('image-share');
  const share = { elements: shareElements };
  const close = share.elements.find(e => ['Close', '关闭', 'Cancel', '取消'].includes(e.label) && e.clickable);
  if (close) tap(close.label);
  else {
    // This guest's compact activity sheet has no AX close button. Its dimmed
    // backdrop above the sheet safely cancels, verified against its screenshot.
    const screen = rpc('device.screen');
    // AX appears before UIKit finishes presenting; do not drag mid-transition.
    spawnSync('sleep', ['1']);
    rpc('input.tap', { x: screen.width / 2, y: screen.height * 0.48 });
  }
  waitTree(elements =>
    elements.some(e => e.label === '关闭详情') &&
    !elements.some(e => e.identifier === 'shareCell' || e.identifier === 'actionGroupCell'),
  'return from system share');
  tap('关闭详情');
  record('image system share opened and cancelled');

  search('TG-IOS-PROBE-20261026-video.mp4');
  screenshot('video-feed-poster');
  openDetail(); screenshot('video-detail-poster');
  tap('播放视频'); wait('已播放', 60, 'contains');
  const playing = tree();
  assert(playing.elements.some(e => e.label === '关闭详情'), 'Video left the detail');
  assert(!playing.elements.some(e => ['Done', '完成'].includes(e.label)), 'Unexpected separate system player');
  screenshot('video-inline-played');
  record('real inline video time advancement with detail retained');
  tap('更多'); wait('查看详情', 15, 'contains'); tap('取消'); wait('关闭详情');
  wait('已播放', 15, 'contains'); tap('关闭详情');
  tap('清除');
  record('nested actions retain video detail and return to feed');
  report.result = 'passed';
} catch (error) {
  report.result = 'failed'; report.error = String(error.stack || error);
  try { screenshot('failure'); } catch {}
  process.exitCode = 1;
} finally {
  report.finishedAt = new Date().toISOString();
  writeFileSync(join(artifacts, 'report.json'), JSON.stringify(report, null, 2));
  console.log('[vphone media] ' + report.result + ': ' + join(artifacts, 'report.json'));
}
