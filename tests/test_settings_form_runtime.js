import assert from 'node:assert/strict';
import '../src-ui/src/utils/settings-form-runtime.js';

const runtime = globalThis.transferGenieSettingsFormRuntime;

function testNormalizeTelegramPollInterval() {
  assert.equal(runtime.normalizeTelegramPollInterval(undefined, 5), 5);
  assert.equal(runtime.normalizeTelegramPollInterval(3, 5), 5);
  assert.equal(runtime.normalizeTelegramPollInterval(12, 5), 12);
}

function testGetTelegramBridgeFormState() {
  const configured = runtime.getTelegramBridgeFormState(
    {
      telegramBotToken: ' 123:abc ',
      telegramChatId: ' -1001 ',
    },
    true
  );
  assert.deepEqual(configured, {
    botToken: '123:abc',
    chatId: '-1001',
    isConfigured: true,
  });

  const missingEndpoint = runtime.getTelegramBridgeFormState(
    {
      telegramBotToken: '123:abc',
      telegramChatId: '-1001',
    },
    false
  );
  assert.equal(missingEndpoint.isConfigured, false);

  const invalidChatId = runtime.getTelegramBridgeFormState(
    {
      telegramBotToken: '123:abc',
      telegramChatId: 'chat-id',
    },
    true
  );
  assert.equal(invalidChatId.isConfigured, false);
}

function testNormalizeLocalHttpApiBindPort() {
  assert.equal(runtime.normalizeLocalHttpApiBindPort(6011), 6011);
  assert.equal(runtime.normalizeLocalHttpApiBindPort('65535'), 65535);
  assert.equal(runtime.normalizeLocalHttpApiBindPort('0'), null);
  assert.equal(runtime.normalizeLocalHttpApiBindPort('70000'), null);
  assert.equal(runtime.normalizeLocalHttpApiBindPort('abc'), null);
}

function testGetLocalHttpApiConfiguredUrl() {
  const ipv4Url = runtime.getLocalHttpApiConfiguredUrl(
    {
      localHttpApiBindAddress: ' 0.0.0.0 ',
      localHttpApiBindPort: '7001',
    },
    {
      defaultBindAddress: '127.0.0.1',
      defaultBindPort: 6011,
    }
  );
  assert.equal(ipv4Url, 'http://0.0.0.0:7001/api/send-file');

  const ipv6Url = runtime.getLocalHttpApiConfiguredUrl(
    {
      localHttpApiBindAddress: '::1',
      localHttpApiBindPort: 'invalid',
    },
    {
      defaultBindAddress: '127.0.0.1',
      defaultBindPort: 6011,
    }
  );
  assert.equal(ipv6Url, 'http://[::1]:6011/api/send-file');
}

function testGetCurrentSenderName() {
  assert.equal(runtime.getCurrentSenderName({ senderName: ' alice ' }, 'legacy'), 'alice');
  assert.equal(runtime.getCurrentSenderName({ senderName: '   ' }, ' legacy '), 'legacy');
  assert.equal(runtime.getCurrentSenderName({}, ''), '');
}

function testSendSettingsPayload() {
  assert.deepEqual(runtime.getSendSettingsPayload({ copyAfterSend: true }), {
    copy_after_send: true,
  });
  assert.deepEqual(runtime.getSendSettingsPayload({}), {
    copy_after_send: false,
  });
}

function testManualBackupDialogState() {
  const opened = runtime.getManualBackupDialogState({}, {
    open: true,
    target: 'settings-snapshot',
    name: ' 升级前 ',
    note: '保留一份',
  });
  assert.deepEqual(opened, {
    open: true,
    target: 'settings-snapshot',
    title: '手动备份设置快照',
    name: ' 升级前 ',
    note: '保留一份',
    loading: false,
  });

  const fallback = runtime.getManualBackupDialogState(opened, {
    target: 'unknown',
    loading: true,
  });
  assert.equal(fallback.target, 'local-data');
  assert.equal(fallback.name, ' 升级前 ');
  assert.equal(fallback.note, '保留一份');
  assert.equal(fallback.loading, true);
}

testNormalizeTelegramPollInterval();
testGetTelegramBridgeFormState();
testNormalizeLocalHttpApiBindPort();
testGetLocalHttpApiConfiguredUrl();
testGetCurrentSenderName();
testSendSettingsPayload();
testManualBackupDialogState();

console.log('settings-form-runtime tests passed');
