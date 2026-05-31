import assert from 'node:assert/strict';

var components = {};

function VueCtor(options) {
  return options;
}

VueCtor.observable = (obj) => obj;
VueCtor.component = (name, def) => {
  components[name] = def;
};

globalThis.window = globalThis;
globalThis.Vue = VueCtor;

await import('../frontend/vue-app.js');

const vueBridge = globalThis.transferGenieVue;
const settingsShell = components['settings-page-shell'];
const downloadsShell = components['downloads-page-shell'];
const markedShell = components['marked-page-shell'];
const methods = settingsShell.methods;
const downloadMethods = downloadsShell.methods;
const markedMethods = markedShell.methods;

function createSettingsContext() {
  return {
    formatRuntimeTime(timestamp) {
      return `time:${timestamp}`;
    },
    settingsOpsState() {
      return methods.settingsOpsState.call(this);
    },
    settingsWebdavState() {
      return methods.settingsWebdavState.call(this);
    },
    settingsFormState() {
      return methods.settingsFormState.call(this);
    },
    settingsAutoBackupState() {
      return methods.settingsAutoBackupState.call(this);
    },
    localHttpApiState() {
      return methods.localHttpApiState.call(this);
    },
    telegramBridgeState() {
      return methods.telegramBridgeState.call(this);
    },
  };
}

function createDownloadsContext() {
  return {
    transferTaskState() {
      return downloadMethods.transferTaskState.call(this);
    },
    currentTransferPage() {
      return downloadMethods.currentTransferPage.call(this);
    },
    currentTransferTotalPages() {
      return downloadMethods.currentTransferTotalPages.call(this);
    },
  };
}

function createMarkedContext() {
  return {
    markedPageState() {
      return markedMethods.markedPageState.call(this);
    },
  };
}

function testAppVersionText() {
  vueBridge.syncAppVersion('1.2.3');
  const ctx = createSettingsContext();
  assert.equal(methods.appVersionText.call(ctx), '1.2.3');
}

function testLocalHttpApiStateHelpers() {
  const ctx = createSettingsContext();

  vueBridge.syncLocalHttpApiStatus({
    state: 'running',
    address: 'http://127.0.0.1:6011/api/send-file',
    lastError: null,
  });
  assert.equal(methods.localHttpApiStateLabel.call(ctx), '运行中');
  assert.equal(
    methods.localHttpApiAddressText.call(ctx),
    'http://127.0.0.1:6011/api/send-file'
  );
  assert.equal(methods.localHttpApiLastErrorText.call(ctx), '无');

  vueBridge.syncLocalHttpApiStatus({
    state: 'start_failed',
    address: null,
    lastError: 'port in use',
  });
  assert.equal(methods.localHttpApiStateLabel.call(ctx), '启动失败');
  assert.equal(methods.localHttpApiAddressText.call(ctx), '未配置');
  assert.equal(methods.localHttpApiLastErrorText.call(ctx), 'port in use');
}

function testTelegramBridgeStateHelpers() {
  const ctx = createSettingsContext();

  vueBridge.syncTelegramBridgeStatus({
    running: true,
    last_started_ms: 123,
    last_error: null,
  });
  assert.equal(methods.telegramBridgeStateLabel.call(ctx), '运行中 · time:123');
  assert.equal(methods.telegramBridgeLastErrorText.call(ctx), '无');

  vueBridge.syncTelegramBridgeStatus({
    running: false,
    last_stopped_ms: 456,
    last_error: 'bridge crashed',
  });
  assert.equal(methods.telegramBridgeStateLabel.call(ctx), '已停止 · time:456');
  assert.equal(methods.telegramBridgeLastErrorText.call(ctx), 'bridge crashed');
}

function testIntegrationModuleHelpers() {
  const ctx = createSettingsContext();

  assert.equal(methods.moduleKindLabel.call(ctx, { kind: 'bridge' }), 'Bridge Module');
  assert.equal(methods.moduleKindLabel.call(ctx, { kind: 'sync' }), 'Sync Module');

  assert.equal(
    methods.moduleStateLabel.call(ctx, { running: true, enabled: true }),
    'Running'
  );
  assert.equal(
    methods.moduleStateLabel.call(ctx, { running: false, enabled: true }),
    'Idle'
  );
  assert.equal(
    methods.moduleStateLabel.call(ctx, { running: false, enabled: false }),
    'Disabled'
  );

  assert.equal(
    methods.moduleTimelineText.call(ctx, { lastStartedMs: 10 }),
    '最近启动：time:10'
  );
  assert.equal(
    methods.moduleTimelineText.call(ctx, { lastStoppedMs: 20 }),
    '最近停止：time:20'
  );
  assert.equal(
    methods.moduleTimelineText.call(ctx, {}),
    '暂无运行记录'
  );
}

function testSettingsOpsHelpers() {
  const ctx = createSettingsContext();
  vueBridge.syncSettingsOps({
    backupLabel: '备份中 40%',
    backupRunning: true,
    restoreLabel: '恢复中...',
    restoreRunning: true,
  });
  assert.equal(methods.backupWebdavLabel.call(ctx), '备份中 40%');
  assert.equal(methods.restoreWebdavLabel.call(ctx), '恢复中...');
}

function testSettingsWebdavHelpers() {
  const ctx = createSettingsContext();
  vueBridge.syncSettingsWebdav({
    useVueList: true,
    emptyMessage: 'empty',
    endpoints: [
      {
        id: 'ep-1',
        title: 'primary',
        name: 'primary',
        url: 'https://example.com/webdav/',
        username: 'user',
        password: 'secret',
        enabled: false,
        isActive: false,
        activeDisabled: true,
        speedTestDisabled: false,
        speedTestLabel: '测速',
        speedTestResult: {
          uploadText: '10.00 MB/s',
          downloadText: '20.00 MB/s',
        },
      },
    ],
  });
  assert.equal(methods.currentSettingsWebdavEndpoints.call(ctx).length, 1);
  assert.deepEqual(methods.settingsWebdavCardClasses.call(ctx, { enabled: false }), {
    'is-disabled': true,
  });
}

function testSettingsWebdavActionBridges() {
  const calls = [];
  const ctx = createSettingsContext();
  vueBridge.setActions({
    updateSettingsWebdavField(endpoint, field, value) {
      calls.push(['field', endpoint.id, field, value]);
    },
    toggleSettingsWebdavEnabled(endpoint, checked) {
      calls.push(['enabled', endpoint.id, checked]);
    },
    activateSettingsWebdavEndpoint(endpoint, checked) {
      calls.push(['active', endpoint.id, checked]);
    },
    removeSettingsWebdavEndpoint(endpoint) {
      calls.push(['remove', endpoint.id]);
    },
    testSettingsWebdavEndpoint(endpoint) {
      calls.push(['speed', endpoint.id]);
    },
  });
  const endpoint = { id: 'ep-1' };
  methods.updateSettingsWebdavField.call(ctx, endpoint, 'name', 'primary');
  methods.toggleSettingsWebdavEnabled.call(ctx, endpoint, true);
  methods.activateSettingsWebdavEndpoint.call(ctx, endpoint, true);
  methods.removeSettingsWebdavEndpoint.call(ctx, endpoint);
  methods.testSettingsWebdavEndpoint.call(ctx, endpoint);
  assert.deepEqual(calls, [
    ['field', 'ep-1', 'name', 'primary'],
    ['enabled', 'ep-1', true],
    ['active', 'ep-1', true],
    ['remove', 'ep-1'],
    ['speed', 'ep-1'],
  ]);
}

function testSettingsFormHelpers() {
  const ctx = createSettingsContext();
  vueBridge.syncSettingsForm({
    senderName: 'alice',
    refreshIntervalSecs: 10,
    downloadDir: 'E:/Downloads',
    autoStart: true,
    autoUpdateEnabled: false,
    globalHotkeyEnabled: true,
    globalHotkey: 'ctrl+alt+t',
    localHttpApiEnabled: true,
    localHttpApiBindAddress: '0.0.0.0',
    localHttpApiBindPort: 7001,
    telegramAutoStart: true,
    telegramBotToken: '123:abc',
    telegramProxyEnabled: true,
    telegramProxyUrl: 'http://127.0.0.1:7890',
    telegramChatId: '-1001',
    telegramSenderName: 'bot',
    telegramPollIntervalSecs: 15,
  });
  assert.equal(methods.settingsFormState.call(ctx).senderName, 'alice');
  assert.equal(methods.settingsFormState.call(ctx).refreshIntervalSecs, 10);
  assert.equal(methods.settingsFormState.call(ctx).downloadDir, 'E:/Downloads');
  assert.equal(methods.settingsFormState.call(ctx).localHttpApiBindPort, 7001);
  assert.equal(methods.settingsFormState.call(ctx).telegramChatId, '-1001');
}

function testSettingsFormActionBridges() {
  const calls = [];
  const ctx = createSettingsContext();
  vueBridge.setActions({
    updateSettingsFormField(field, value) {
      calls.push([field, value]);
    },
  });
  methods.updateSettingsFormField.call(ctx, 'senderName', 'alice');
  methods.updateSettingsFormField.call(ctx, 'autoStart', true);
  methods.updateSettingsFormField.call(ctx, 'globalHotkey', 'ctrl+alt+t');
  methods.updateSettingsFormField.call(ctx, 'localHttpApiEnabled', true);
  methods.updateSettingsFormField.call(ctx, 'telegramChatId', '-1001');
  assert.deepEqual(calls, [
    ['senderName', 'alice'],
    ['autoStart', true],
    ['globalHotkey', 'ctrl+alt+t'],
    ['localHttpApiEnabled', true],
    ['telegramChatId', '-1001'],
  ]);
}

function testSettingsBackupArchiveHelpers() {
  const ctx = createSettingsContext();
  vueBridge.syncSettingsBackupArchives([
    {
      endpointId: 'ep-1',
      backupPath: 'E:/archives/backup.zip',
      createdAtMs: 100,
      source: 'backup-webdav',
      fileName: 'backup.zip',
      sizeBytes: 1024,
      exists: true,
    },
  ]);
  vueBridge.syncSettingsBackupArchivesLoading(true);
  assert.equal(vueBridge.store.settingsBackupArchives.length, 1);
  assert.equal(vueBridge.store.settingsBackupArchivesLoading, true);
}

function testSettingsBackupArchiveActionBridges() {
  const calls = [];
  const ctx = createSettingsContext();
  vueBridge.setActions({
    refreshSettingsBackupArchives() {
      calls.push(['refresh']);
    },
    restoreSettingsBackupArchive(record) {
      calls.push(['restore', record.backupPath]);
    },
  });
  const record = { backupPath: 'E:/archives/backup.zip' };
  methods.refreshSettingsBackupArchives.call(ctx);
  methods.restoreSettingsBackupArchive.call(ctx, record);
  assert.deepEqual(calls, [
    ['refresh'],
    ['restore', 'E:/archives/backup.zip'],
  ]);
}

function testSettingsAutoBackupHelpers() {
  const ctx = createSettingsContext();
  vueBridge.syncSettingsAutoBackup({
    enabled: true,
    intervalMinutes: 15,
    retainCount: 3,
    directory: 'E:/TransferGenie/backup',
    keepAllDays: 3,
    keepDailyDays: 7,
    hasActiveEndpoint: true,
    lastRunMs: 100,
    lastSuccessMs: 90,
    lastError: null,
    lastBackupPath: 'E:/archives/auto.zip',
  });
  assert.equal(methods.autoBackupStateLabel.call(ctx), '已启用');
  assert.equal(methods.autoBackupLastRunText.call(ctx), 'time:100');
  assert.equal(methods.autoBackupLastSuccessText.call(ctx), 'time:90');
  assert.equal(methods.autoBackupLastErrorText.call(ctx), '无');
  assert.equal(methods.autoBackupLastPathText.call(ctx), 'E:/archives/auto.zip');

  vueBridge.syncSettingsAutoBackup({
    enabled: true,
    hasActiveEndpoint: false,
    lastError: 'backup failed',
  });
  assert.equal(methods.autoBackupStateLabel.call(ctx), '等待可用端点');

  vueBridge.syncSettingsAutoBackup({
    enabled: true,
    hasActiveEndpoint: true,
    lastError: 'backup failed',
  });
  assert.equal(methods.autoBackupStateLabel.call(ctx), '最近运行失败');

  vueBridge.syncSettingsAutoBackup({
    enabled: false,
  });
  assert.equal(methods.autoBackupStateLabel.call(ctx), '已关闭');
}

function testSettingsAutoBackupActionBridges() {
  const calls = [];
  const ctx = createSettingsContext();
  vueBridge.setActions({
    updateSettingsAutoBackupField(field, value) {
      calls.push([field, value]);
    },
    createLocalDataBackup() {
      calls.push(['createLocalDataBackup']);
    },
  });
  methods.updateSettingsAutoBackupField.call(ctx, 'enabled', true);
  methods.updateSettingsAutoBackupField.call(ctx, 'intervalMinutes', 15);
  methods.updateSettingsAutoBackupField.call(ctx, 'retainCount', 3);
  methods.updateSettingsAutoBackupField.call(ctx, 'directory', 'E:/backup');
  methods.updateSettingsAutoBackupField.call(ctx, 'keepAllDays', 3);
  methods.updateSettingsAutoBackupField.call(ctx, 'keepDailyDays', 7);
  assert.deepEqual(calls, [
    ['enabled', true],
    ['intervalMinutes', 15],
    ['retainCount', 3],
    ['directory', 'E:/backup'],
    ['keepAllDays', 3],
    ['keepDailyDays', 7],
  ]);
  calls.length = 0;
  methods.createLocalDataBackup.call(ctx);
  assert.deepEqual(calls, [['createLocalDataBackup']]);
}

function testTransferTaskHelpers() {
  const ctx = createDownloadsContext();
  vueBridge.syncTransferTasks({
    useVuePanels: true,
    currentView: 'downloads',
    selectionMode: true,
    selectionCount: 1,
    downloadSummary: 'download summary',
    uploadSummary: 'upload summary',
    downloadPage: 2,
    downloadTotalPages: 4,
    uploadPage: 1,
    uploadTotalPages: 1,
    downloadTasks: [
      {
        key: 'd1',
        title: 'report.pdf',
        stateLabel: 'done',
        metaText: 'endpoint · 2 MB',
        detailText: 'saved',
        updatedText: 'time:1',
        isComplete: true,
        selectionMode: true,
        selectable: true,
        isSelected: true,
        showProgress: false,
      },
    ],
    uploadTasks: [
      {
        key: 'u1',
        title: 'upload.zip',
        stateLabel: 'uploading',
        metaText: 'endpoint · 4 MB',
        detailText: '50%',
        updatedText: 'time:2',
        isActive: true,
        showProgress: true,
        progressPercent: 50,
      },
    ],
  });

  assert.equal(downloadMethods.currentTransferSummary.call(ctx), 'download summary');
  assert.equal(downloadMethods.currentTransferTaskList.call(ctx).length, 1);
  assert.equal(downloadMethods.currentTransferPage.call(ctx), 2);
  assert.equal(downloadMethods.currentTransferTotalPages.call(ctx), 4);
  assert.equal(downloadMethods.hasTransferPagination.call(ctx), true);
  assert.equal(downloadMethods.transferTaskPageLabel.call(ctx), '2 / 4');
  assert.deepEqual(
    downloadMethods.transferTaskRowClasses.call(ctx, {
      isActive: true,
      isComplete: false,
      isError: false,
      selectionMode: true,
      isSelected: true,
    }),
    {
      'is-active': true,
      'is-complete': false,
      'is-error': false,
      'with-selection': true,
      'is-selected': true,
    }
  );
  assert.deepEqual(
    downloadMethods.transferTaskProgressStyle.call(ctx, { progressPercent: 50 }),
    { width: '50%' }
  );
  assert.equal(
    downloadMethods.transferTaskCanSelect.call(ctx, { selectionMode: true, selectable: true }),
    true
  );
}

function testTransferTaskActionBridges() {
  const calls = [];
  const ctx = createDownloadsContext();
  vueBridge.setActions({
    changeTransferTaskPage(view, page) {
      calls.push(['page', view, page]);
    },
    toggleTransferTaskSelection(task, checked) {
      calls.push(['toggle', task.key, checked]);
    },
    saveDownloadHistoryAs(task) {
      calls.push(['save', task.key]);
    },
    redownloadDownloadHistory(task) {
      calls.push(['redownload', task.key]);
    },
    openDownloadHistoryFile(task) {
      calls.push(['file', task.key]);
    },
    openDownloadHistoryDir(task) {
      calls.push(['dir', task.key]);
    },
    deleteDownloadHistoryRecord(task) {
      calls.push(['delete', task.key]);
    },
  });
  vueBridge.syncTransferTasks({
    currentView: 'downloads',
    downloadPage: 1,
    downloadTotalPages: 3,
  });
  const task = { key: 'd1' };
  downloadMethods.changeTransferTaskPage.call(ctx, 2);
  downloadMethods.toggleTransferTaskSelection.call(ctx, task, true);
  downloadMethods.saveDownloadHistoryAs.call(ctx, task);
  downloadMethods.redownloadDownloadHistory.call(ctx, task);
  downloadMethods.openDownloadHistoryFile.call(ctx, task);
  downloadMethods.openDownloadHistoryDir.call(ctx, task);
  downloadMethods.deleteDownloadHistoryRecord.call(ctx, task);
  assert.deepEqual(calls, [
    ['page', 'downloads', 2],
    ['toggle', 'd1', true],
    ['save', 'd1'],
    ['redownload', 'd1'],
    ['file', 'd1'],
    ['dir', 'd1'],
    ['delete', 'd1'],
  ]);
}

function testMarkedPageHelpers() {
  const ctx = createMarkedContext();
  vueBridge.syncMarkedPage({
    useVueList: true,
    emptyMessage: 'empty',
    currentPage: 3,
    totalPages: 5,
    selectionMode: true,
    selectionCount: 1,
    messages: [
      {
        key: 'm1',
        filename: 'm1.txt',
        isFile: false,
        isText: true,
        isPinned: true,
        selectionMode: true,
        isSelected: true,
        isCollapsible: true,
        isCollapsed: true,
        collapseHeight: 130,
        tags: ['tag-a'],
        expandLabel: '展开全文',
      },
    ],
  });

  assert.equal(markedMethods.currentMarkedMessages.call(ctx).length, 1);
  assert.equal(markedMethods.hasMarkedPagination.call(ctx), true);
  assert.equal(markedMethods.markedPageLabel.call(ctx), '3 / 5');
  assert.deepEqual(
    markedMethods.markedMessageCardClasses.call(ctx, {
      isFile: false,
      isText: true,
      isPinned: true,
      selectionMode: true,
      isSelected: true,
    }),
    {
      'is-file': false,
      'is-text': true,
      'is-pinned': true,
      'with-selection': true,
      'is-selected': true,
    }
  );
  assert.deepEqual(
    markedMethods.markedMessageBodyClasses.call(ctx, {
      isCollapsible: true,
      isCollapsed: true,
    }),
    {
      'is-collapsible': true,
      'is-collapsed': true,
    }
  );
  assert.deepEqual(
    markedMethods.markedMessageBodyStyle.call(ctx, { collapseHeight: 130 }),
    { '--message-collapse-height': '130px' }
  );
}

function testMarkedPageActionBridges() {
  const calls = [];
  const ctx = createMarkedContext();
  vueBridge.setActions({
    changeMarkedPage(page) {
      calls.push(['page', page]);
    },
    toggleMarkedMessageSelection(message, checked) {
      calls.push(['select', message.filename, checked]);
    },
    openMarkMessageModal(message) {
      calls.push(['tag', message.filename]);
    },
    toggleMarkedMessagePin(message) {
      calls.push(['pin', message.filename]);
    },
    toggleMarkedMessageExpanded(message) {
      calls.push(['expand', message.filename]);
    },
    openMessageFile(message) {
      calls.push(['open-file', message.filename]);
    },
    openMessagePreview(message) {
      calls.push(['preview', message.filename]);
    },
  });

  const message = {
    filename: 'm1.txt',
    isFile: true,
    selectionMode: false,
    message: { filename: 'm1.txt' },
  };
  markedMethods.changeMarkedPage.call(ctx, 4);
  markedMethods.toggleMarkedMessageSelection.call(ctx, message, true);
  markedMethods.openMarkMessageModal.call(ctx, message);
  markedMethods.toggleMarkedMessagePin.call(ctx, message);
  markedMethods.toggleMarkedMessageExpanded.call(ctx, message);
  markedMethods.handleMarkedBodyClick.call(ctx, message);
  markedMethods.handleMarkedCardDoubleClick.call(ctx, message);

  assert.deepEqual(calls, [
    ['page', 4],
    ['select', 'm1.txt', true],
    ['tag', 'm1.txt'],
    ['pin', 'm1.txt'],
    ['expand', 'm1.txt'],
    ['open-file', 'm1.txt'],
    ['preview', 'm1.txt'],
  ]);
}

function run() {
  assert.ok(vueBridge);
  assert.ok(settingsShell);
  assert.ok(downloadsShell);
  assert.ok(markedShell);
  testAppVersionText();
  testLocalHttpApiStateHelpers();
  testTelegramBridgeStateHelpers();
  testIntegrationModuleHelpers();
  testSettingsOpsHelpers();
  testSettingsWebdavHelpers();
  testSettingsWebdavActionBridges();
  testSettingsFormHelpers();
  testSettingsFormActionBridges();
  testSettingsBackupArchiveHelpers();
  testSettingsBackupArchiveActionBridges();
  testSettingsAutoBackupHelpers();
  testSettingsAutoBackupActionBridges();
  testTransferTaskHelpers();
  testTransferTaskActionBridges();
  testMarkedPageHelpers();
  testMarkedPageActionBridges();
  console.log('vue-app tests passed');
}

run();
