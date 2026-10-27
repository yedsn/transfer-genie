#!/usr/bin/env node
// Supplemental installed-guest UI acceptance, never a Jam release gate.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { assertEmptyComposer, assertNoActiveEditing } from './draft-safety.mjs';

const cli = '/Applications/vphone-launchpad.app/Contents/MacOS/vphone-launchpad-cli';
const machine = 'Transfer-Genie-iOS-26';
const root = '/Volumes/VPhone/machines';
const bundle = 'com.transfergenie';
const artifacts = resolve(process.env.VPHONE_ARTIFACT_DIR || `/Volumes/VPhone/installers/vphone-composer/${Date.now()}`);
const report = { classification: 'SUPPLEMENTAL_ONLY_NOT_JAM_ACCEPTANCE', startedAt: new Date().toISOString(), checks: [] };
mkdirSync(artifacts, { recursive: true });
const marker = process.env.VPHONE_RESUME_FIXTURE || `TG-VPHONE-WYSIWYG-${randomUUID()}`;
assert(/^TG-VPHONE-WYSIWYG-[0-9a-f-]{36}$/.test(marker), 'Invalid fixture identifier');
report.fixtureMarker = marker;

function rpc(method, params = {}, timeout = 30000) {
  const result = spawnSync(cli, ['guest', 'rpc', machine, method, JSON.stringify(params), '--root', root], { encoding: 'utf8', timeout, maxBuffer: 8 * 1024 * 1024 });
  assert.equal(result.status, 0, `${method}: ${result.error?.message || result.stderr}`);
  const value = JSON.parse(result.stdout);
  assert.equal(value.ok, true, `${method} refused`);
  return value.result;
}
const tree = () => rpc('ui.tree', { max_elements: 400, visible_only: true });
const labels = () => tree().elements.map(e => e.label || '');
const tap = (text) => rpc('ui.tap_element', { text, match: 'exact' });
const wait = (text, seconds = 15, match = 'exact') => rpc('ui.wait', { text, match, timeout: seconds }, (seconds + 10) * 1000);
const absent = (text) => assert(!labels().includes(text), `Unexpected control: ${text}`);
const record = (name) => { report.checks.push({ name, ok: true }); console.log(`[vphone composer] PASS ${name}`); };
function screenshot(name) {
  const result = spawnSync(cli, ['guest', 'send', machine, JSON.stringify({ t: 'screenshot', path: join(artifacts, `${name}.png`) }), '--root', root], { encoding: 'utf8', timeout: 30000 });
  assert.equal(result.status, 0, `screenshot: ${result.stderr}`);
}
function editorValue() {
  const element = tree().elements.find(e => e.label === '消息内容');
  assert.equal(typeof element?.value, 'string', 'Cannot verify composer value');
  return element.value;
}
function synced() { wait('存储空间，已同步', 60, 'contains'); }
function coldLaunch() {
  rpc('apps.terminate', { bundle_id: bundle });
  rpc('screen.unlock', { timeout: 10 });
  rpc('apps.launch', { bundle_id: bundle });
  wait('新消息', 30);
  synced();
}

try {
  assert.equal(process.env.VPHONE_ALLOW_SUPABASE_WRITES, '1', 'Explicit fixture-write opt-in required');
  rpc('screen.unlock', { timeout: 10 });
  rpc('apps.launch', { bundle_id: bundle });
  const existingEditor = tree().elements.some(e => e.label === '关闭新消息');
  if (!existingEditor) {
    wait('新消息', 30);
    assertNoActiveEditing(tree());
    tap('新消息');
  } else {
    assert(process.env.VPHONE_RESUME_FIXTURE, 'Existing editor requires exact fixture resume');
  }
  wait('消息内容');
  tap('文字');
  let source;
  if (process.env.VPHONE_RESUME_FIXTURE) {
    source = editorValue();
    const verifiedTree = tree();
    const exactDraft = /^TG-VPHONE-WYSIWYG-[0-9a-f-]{36}\n+\*\*bold\*\* tail\n+[-*] list END\n?$/;
    assert(source.split('\n')[0] === marker && exactDraft.test(source), 'Resume only the exact known fixture, never a user draft');
    assert(!verifiedTree.elements.some(e => e.label.includes('移除附件') || e.label.startsWith('已标记') || e.label.includes('草稿自动保存失败')), 'Fixture metadata or persistence cannot be verified');
    record('exact protected fixture resumed without clearing or rewriting');
  } else {
  assertEmptyComposer(tree());
  record('protected empty draft verified');

  tap('标记');
  wait('保存标记');
  absent('发送时标记');
  absent('取消标记');
  screenshot('mark-settings-no-checkbox');
  tap('保存标记');
  wait('已标记 ·', 15, 'contains');
  tap('标记');
  tap('取消标记');
  wait('确认取消标记');
  tap('保留标记');
  wait('已标记 ·', 15, 'contains');
  tap('标记');
  tap('取消标记');
  tap('确认取消标记');
  wait('关闭新消息');
  assertEmptyComposer(tree());
  record('save means marked; cancel preserves; confirmed unmark clears metadata');

  tap('Markdown');
  wait('粗体');
  const controls = tree().elements;
  for (const name of ['粗体', '斜体', '标题', '无序列表', '增加缩进', '减少缩进']) {
    const tool = controls.find(e => e.label === name);
    assert(tool && tool.frame.width >= 44 && tool.frame.height >= 44, `Missing touch target: ${name}`);
  }
  assert.equal(controls.find(e => e.label === '粗体').frame.x, 0, 'Toolbar leading gutter');
  absent('预览');
  tap('消息内容');
  rpc('input.type', { text: `${marker}\n`, delay_ms: 10 });
  tap('粗体');
  rpc('input.type', { text: 'bold', delay_ms: 30 });
  tap('粗体');
  rpc('input.type', { text: ' tail\n', delay_ms: 30 });
  tap('无序列表');
  rpc('input.type', { text: 'list END', delay_ms: 30 });
  screenshot('wysiwyg-keyboard-toolbar');
  tap('标记');
  wait('保存标记');
  assert(!tree().elements.some(e => e.label === '关闭新消息' && e.clickable), 'Underlying composer exposed');
  tap('关闭编辑标记');
  wait('粗体');
  tap('文字');
  source = editorValue();
  assert(source.includes(marker) && source.includes('**bold**') && /[-*] list END/.test(source), 'Rich editing did not serialize final content');
  }
  tap('关闭新消息');
  wait('新消息');
  coldLaunch();
  tap('新消息');
  wait('消息内容');
  tap('文字');
  assert.equal(editorValue(), source, 'Persisted fixture draft changed after restart');
  record('WYSIWYG formatting, retained mark overlay and durable draft restart');

  tap('Markdown');
  wait('粗体');
  tap('发送');
  wait('新消息', 30);
  synced();
  coldLaunch();
  tap('搜索消息');
  wait('搜索文本、文件名');
  tap('搜索文本、文件名');
  rpc('input.type', { text: marker, delay_ms: 10 });
  wait(marker, 30);
  assert.equal(tree().elements.filter(e => e.label === '更多操作').length, 1, 'Fixture result must be unique');
  screenshot('rich-message-restored');
  record('real Markdown send converged and restored once after restart');
  // Only the unique UUID fixture from this run may be removed.
  tap('更多操作');
  wait('删除消息（同步到云端）', 15, 'contains');
  rpc('ui.tap_element', { text: '删除消息（同步到云端）', match: 'contains' });
  wait('确认删除');
  tap('确认删除');
  wait('没有找到相关内容', 30);
  synced();
  tap('清除');
  record('only exact fixture deleted through confirmed synchronized action');

  tap('添加附件');
  wait('关闭附件菜单');
  wait('照片与视频', 10, 'contains');
  wait('文件', 10, 'contains');
  absent('关闭新消息');
  screenshot('independent-attachment-menu');
  tap('关闭附件菜单');
  tap('新消息');
  wait('消息内容');
  tap('文字');
  assertEmptyComposer(tree());
  tap('关闭新消息');
  record('independent feed attachment menu and final empty draft');
  report.ok = true;
} catch (error) {
  report.ok = false;
  report.error = String(error.message);
  console.error(`[vphone composer] FAIL ${report.error}`);
  // Preserve any unverified draft/message after failure; never blanket-clean.
  process.exitCode = 1;
} finally {
  report.finishedAt = new Date().toISOString();
  writeFileSync(join(artifacts, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(`[vphone composer] artifacts: ${artifacts}`);
}
