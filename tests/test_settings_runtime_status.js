import assert from 'node:assert/strict';
import '../frontend/settings-runtime-status.js';

const runtime = globalThis.transferGenieSettingsRuntimeStatus;

function testLocalHttpApiVisualState() {
  const running = runtime.getLocalHttpApiVisualState(
    {
      state: 'running',
      address: 'http://127.0.0.1:6011/api/send-file',
      lastError: null,
    },
    'http://127.0.0.1:6011/api/send-file'
  );
  assert.equal(running.running, true);
  assert.equal(running.stateLabel, '运行中');
  assert.equal(running.addressText, 'http://127.0.0.1:6011/api/send-file');
  assert.equal(running.lastErrorText, '无');
  assert.equal(running.summaryText, '状态：已启用（http://127.0.0.1:6011/api/send-file）');

  const pending = runtime.getLocalHttpApiVisualState(
    {
      state: 'pending',
      last_error: '',
    },
    'http://0.0.0.0:7001/api/send-file'
  );
  assert.equal(pending.pending, true);
  assert.equal(pending.stateLabel, '状态获取中');
  assert.equal(pending.addressText, 'http://0.0.0.0:7001/api/send-file');
  assert.equal(pending.summaryText, '状态：正在获取...');

  const failed = runtime.getLocalHttpApiVisualState(
    {
      state: 'start_failed',
      last_error: 'port in use',
    },
    ''
  );
  assert.equal(failed.failed, true);
  assert.equal(failed.stateLabel, '启动失败');
  assert.equal(failed.lastErrorText, 'port in use');
  assert.equal(failed.summaryText, '状态：启动失败（port in use）');
}

function testTelegramBridgeVisualState() {
  const running = runtime.getTelegramBridgeVisualState(
    {
      running: true,
      last_started_ms: 123,
      last_error: null,
    },
    (timestamp) => `time:${timestamp}`
  );
  assert.deepEqual(running, {
    running: true,
    stateLabel: '运行中 · time:123',
    lastErrorText: '无',
  });

  const stopped = runtime.getTelegramBridgeVisualState(
    {
      running: false,
      last_stopped_ms: 456,
      last_error: 'bridge crashed',
    },
    (timestamp) => `time:${timestamp}`
  );
  assert.deepEqual(stopped, {
    running: false,
    stateLabel: '已停止 · time:456',
    lastErrorText: 'bridge crashed',
  });

  const empty = runtime.getTelegramBridgeVisualState(null, (timestamp) => `time:${timestamp}`);
  assert.deepEqual(empty, {
    running: false,
    stateLabel: '未获取',
    lastErrorText: '无',
  });
}

function testTelegramControlState() {
  assert.deepEqual(
    runtime.getTelegramControlState({ running: false, isConfigured: false }),
    {
      startDisabled: true,
      startHidden: false,
      stopDisabled: true,
      stopHidden: true,
    }
  );

  assert.deepEqual(
    runtime.getTelegramControlState({ running: true, isConfigured: true }),
    {
      startDisabled: true,
      startHidden: true,
      stopDisabled: false,
      stopHidden: false,
    }
  );

  assert.deepEqual(
    runtime.getTelegramControlState({ running: false, isConfigured: true }),
    {
      startDisabled: false,
      startHidden: false,
      stopDisabled: true,
      stopHidden: true,
    }
  );
}

testLocalHttpApiVisualState();
testTelegramBridgeVisualState();
testTelegramControlState();

console.log('settings-runtime-status tests passed');
