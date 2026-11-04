import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import '../src-ui/src/utils/download-progress-runtime.js';

const runtime = globalThis.transferGenieDownloadProgressRuntime;
assert.ok(runtime, 'download progress runtime is installed');

function formatBytes(value) {
  const number = Number(value) || 0;
  if (number >= 1024 * 1024) {
    return `${(number / (1024 * 1024)).toFixed(1)} MB`;
  }
  if (number >= 1024) {
    return `${(number / 1024).toFixed(1)} KB`;
  }
  return `${number} B`;
}

function testSegmentedProgressUsesAggregateBytes() {
  const task = {
    received: 21 * 1024 * 1024,
    total: 42 * 1024 * 1024,
    segments: 4,
    transferMode: 'resumed',
  };
  assert.equal(runtime.computeProgressPercent(task.received, task.total), 50);
  assert.equal(runtime.getChannelLabel(task.segments), '4 段并发');
  const text = runtime.formatProgressText(task, { formatBytes, includeChannel: true, speed: 0 });
  assert.match(text, /^4 段并发 \| 继续下载 \| 50% · 21\.0 MB \/ 42\.0 MB$/);
  assert.doesNotMatch(text, /当前区间|当前从/, '多段下载不应展示整文件区间');
}

function testSegmentCountFallsBackToSingleConnection() {
  assert.equal(runtime.getChannelLabel(0), '单连接');
  assert.equal(runtime.getChannelLabel(undefined), '单连接');
  assert.equal(runtime.getChannelLabel(1), '单连接');
}

function testSingleStreamFullRangeIsHidden() {
  const text = runtime.formatProgressText(
    {
      received: 1024,
      total: 4096,
      segments: 1,
      transferMode: 'fresh',
      rangeStart: 0,
      rangeEnd: 4095,
    },
    { formatBytes, includeChannel: true, speed: 0 },
  );
  assert.equal(text, '单连接 | 新下载 | 25% · 1.0 KB / 4.0 KB');
}

function testResumedStreamShowsRemainingWindow() {
  const text = runtime.formatProgressText(
    {
      received: 1024 * 1024,
      total: 4 * 1024 * 1024,
      segments: 1,
      transferMode: 'resumed',
      rangeStart: 1024 * 1024,
      rangeEnd: 4 * 1024 * 1024 - 1,
    },
    { formatBytes, includeChannel: true, speed: 2048 },
  );
  assert.equal(
    text,
    '单连接 | 继续下载 | 当前区段 1.0 MB - 4.0 MB | 25% · 1.0 MB / 4.0 MB · 2.0 KB/s',
  );
}

function testProgressPercentClampsAndHandlesUnknownTotal() {
  assert.equal(runtime.computeProgressPercent(0, 0), null);
  assert.equal(runtime.computeProgressPercent(-5, 100), 0);
  assert.equal(runtime.computeProgressPercent(400, 100), 100);
  assert.equal(runtime.computeProgressPercent(1, 3), 33);
}

function testTransferPageBindsProgressFields() {
  const legacySource = readFileSync(new URL('../src-ui/src/legacy-main.js', import.meta.url), 'utf8');
  const vueSource = readFileSync(new URL('../src-ui/src/main.ts', import.meta.url), 'utf8');
  const cssSource = readFileSync(new URL('../src-ui/src/styles.css', import.meta.url), 'utf8');
  const expectSource = (source, pattern, message) => {
    assert.ok(pattern.test(source), message);
  };
  expectSource(
    legacySource,
    /showProgress: isActive,\s*progress: progressPercent,/,
    '传输页视图模型需要同时提供 progress 字段',
  );
  expectSource(
    legacySource,
    /const segments =\s+Number\.isFinite\(incomingSegments\) && incomingSegments > 0/,
    '实时进度事件需要把并发分段数写入任务',
  );
  expectSource(
    vueSource,
    /task\.progress != null \? task\.progress : task\.progressPercent/,
    '传输页进度条必须读取任务进度字段',
  );
  expectSource(vueSource, /"is-complete": !!\(task && task\.isComplete\)/, '完成态样式类名需要匹配 CSS');
  expectSource(vueSource, /"is-error": !!\(task && task\.isError\)/, '失败态样式类名需要匹配 CSS');
  expectSource(
    cssSource,
    /\.download-task-progress-fill \{[^}]*width: var\(--task-progress, 0%\)/,
    '进度条样式需要消费 --task-progress 变量',
  );
}

testSegmentedProgressUsesAggregateBytes();
testSegmentCountFallsBackToSingleConnection();
testSingleStreamFullRangeIsHidden();
testResumedStreamShowsRemainingWindow();
testProgressPercentClampsAndHandlesUnknownTotal();
testTransferPageBindsProgressFields();

console.log('Download progress view model tests passed');
