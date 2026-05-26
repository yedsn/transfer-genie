import assert from 'node:assert/strict';
import '../frontend/settings-ops-runtime.js';

const runtime = globalThis.transferGenieSettingsOpsRuntime;

function testDefaultState() {
  assert.deepEqual(runtime.createDefaultSettingsOpsState(), {
    backupLabel: '备份 WebDAV',
    backupRunning: false,
    restoreLabel: '恢复 WebDAV',
    restoreRunning: false,
  });
}

function testRunningAndIdleTransitions() {
  const startedBackup = runtime.withBackupRunning(runtime.createDefaultSettingsOpsState());
  assert.equal(startedBackup.backupRunning, true);
  assert.equal(startedBackup.backupLabel, '备份中...');

  const progressedBackup = runtime.withBackupRunning(startedBackup, '备份中 40%');
  assert.equal(progressedBackup.backupLabel, '备份中 40%');

  const idleBackup = runtime.withBackupIdle(progressedBackup);
  assert.equal(idleBackup.backupRunning, false);
  assert.equal(idleBackup.backupLabel, '备份 WebDAV');

  const startedRestore = runtime.withRestoreRunning(runtime.createDefaultSettingsOpsState());
  assert.equal(startedRestore.restoreRunning, true);
  assert.equal(startedRestore.restoreLabel, '恢复中...');

  const progressedRestore = runtime.withRestoreRunning(startedRestore, '恢复中 25%');
  assert.equal(progressedRestore.restoreLabel, '恢复中 25%');

  const idleRestore = runtime.withRestoreIdle(progressedRestore);
  assert.equal(idleRestore.restoreRunning, false);
  assert.equal(idleRestore.restoreLabel, '恢复 WebDAV');
}

function testProgressLabels() {
  assert.equal(runtime.getBackupProgressLabel({ state: 'finished' }), null);
  assert.equal(runtime.getBackupProgressLabel({ state: 'scanning' }), '扫描中...');
  assert.equal(
    runtime.getBackupProgressLabel({ state: 'downloading', current: 1, total: 4 }),
    '备份中 25%'
  );
  assert.equal(runtime.getBackupProgressLabel({ state: 'custom-state' }), 'custom-state');

  assert.equal(runtime.getRestoreProgressLabel({ state: 'finished' }), null);
  assert.equal(runtime.getRestoreProgressLabel({ state: 'scanning' }), '清理旧数据...');
  assert.equal(
    runtime.getRestoreProgressLabel({ state: 'uploading', current: 3, total: 4 }),
    '恢复中 75%'
  );
  assert.equal(runtime.getRestoreProgressLabel({ state: 'custom-state' }), 'custom-state');
}

testDefaultState();
testRunningAndIdleTransitions();
testProgressLabels();

console.log('settings-ops-runtime tests passed');
