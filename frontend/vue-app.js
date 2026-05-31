(function bootstrapVueApp() {
  if (typeof window === 'undefined' || !window.Vue) {
    return;
  }
  var settingsRuntimeStatus = window.transferGenieSettingsRuntimeStatus || null;

  var DEFAULT_TAB = 'home';
  var VALID_TABS = ['home', 'marked', 'downloads', 'settings'];

  function cloneValue(value) {
    if (value == null) {
      return value;
    }
    return JSON.parse(JSON.stringify(value));
  }

  function normalizeTab(tab) {
    return VALID_TABS.indexOf(tab) >= 0 ? tab : DEFAULT_TAB;
  }

  var store = Vue.observable({
    activeTab: DEFAULT_TAB,
    settings: null,
    integrationModules: [],
    telegramBridgeStatus: null,
    localHttpApiStatus: null,
    homeFeed: {
      searchQuery: '',
      visibleCount: 0,
      hasMoreMessages: false,
      isLoadingMore: false,
      loadMoreHintText: '',
      emptyMessage: '',
      messageCards: [],
      useVueList: false,
    },
    markedPage: {
      useVueList: false,
      emptyMessage: '',
      currentPage: 1,
      totalPages: 1,
      selectionMode: false,
      selectionCount: 0,
      messages: [],
    },
    transferTasks: {
      useVuePanels: false,
      currentView: 'downloads',
      selectionMode: false,
      selectionCount: 0,
      downloadsCount: 0,
      uploadsCount: 0,
      downloadSummary: '',
      uploadSummary: '',
      downloadPage: 1,
      downloadTotalPages: 1,
      uploadPage: 1,
      uploadTotalPages: 1,
      downloadTasks: [],
      uploadTasks: [],
    },
    settingsOps: {
      backupLabel: '备份 WebDAV',
      backupRunning: false,
      restoreLabel: '恢复 WebDAV',
      restoreRunning: false,
    },
    settingsWebdav: {
      useVueList: false,
      emptyMessage: '',
      endpoints: [],
    },
    settingsForm: {
      senderName: '',
      refreshIntervalSecs: 5,
      downloadDir: '',
      autoStart: false,
      autoUpdateEnabled: false,
      globalHotkeyEnabled: true,
      globalHotkey: 'alt+t',
      localHttpApiEnabled: false,
      localHttpApiBindAddress: '127.0.0.1',
      localHttpApiBindPort: 6011,
      telegramAutoStart: false,
      telegramBotToken: '',
      telegramProxyEnabled: false,
      telegramProxyUrl: 'http://127.0.0.1:7890',
      telegramChatId: '',
      telegramSenderName: '',
      telegramPollIntervalSecs: 10,
    },
    settingsSnapshots: [],
    settingsSnapshotsLoading: false,
    settingsBackupArchives: [],
    settingsBackupArchivesLoading: false,
    settingsAutoBackup: {
      enabled: false,
      intervalMinutes: 5,
      retainCount: 1,
      directory: '',
      keepAllDays: 3,
      keepDailyDays: 7,
      hasActiveEndpoint: false,
      lastRunMs: null,
      lastSuccessMs: null,
      lastError: null,
      lastBackupPath: '',
    },
    appVersion: '',
    lastSettingsSavedAt: null,
  });
  var actions = {
    refreshSettingsSnapshots: null,
    restoreSettingsSnapshot: null,
    openMessagePreview: null,
    toggleMessageMarked: null,
    copyText: null,
    downloadTextMessageAsFile: null,
    openMessageFile: null,
    downloadMessageFile: null,
    saveMessageFileAs: null,
    deleteSingleMessage: null,
    changeMarkedPage: null,
    toggleMarkedMessageSelection: null,
    openMarkMessageModal: null,
    toggleMarkedMessagePin: null,
    toggleMarkedMessageExpanded: null,
    changeTransferTaskPage: null,
    toggleTransferTaskSelection: null,
    saveDownloadHistoryAs: null,
    redownloadDownloadHistory: null,
    openDownloadHistoryFile: null,
    openDownloadHistoryDir: null,
    deleteDownloadHistoryRecord: null,
    updateSettingsWebdavField: null,
    toggleSettingsWebdavEnabled: null,
    activateSettingsWebdavEndpoint: null,
    removeSettingsWebdavEndpoint: null,
    testSettingsWebdavEndpoint: null,
    refreshSettingsBackupArchives: null,
    restoreSettingsBackupArchive: null,
    createLocalDataBackup: null,
    updateSettingsAutoBackupField: null,
    updateSettingsFormField: null,
  };

  function syncActiveTab(tab) {
    store.activeTab = normalizeTab(tab);
  }

  function syncSettings(settings) {
    store.settings = cloneValue(settings);
    store.lastSettingsSavedAt = Date.now();
  }

  function syncIntegrationModules(modules) {
    store.integrationModules = Array.isArray(modules) ? cloneValue(modules) : [];
  }

  function syncTelegramBridgeStatus(status) {
    store.telegramBridgeStatus = cloneValue(status);
  }

  function syncLocalHttpApiStatus(status) {
    store.localHttpApiStatus = cloneValue(status);
  }

  function syncHomeFeed(feedState) {
    store.homeFeed = Object.assign(
      {
        searchQuery: '',
        visibleCount: 0,
        hasMoreMessages: false,
        isLoadingMore: false,
        loadMoreHintText: '',
        emptyMessage: '',
        messageCards: [],
        useVueList: false,
      },
      cloneValue(feedState) || {}
    );
  }

  function syncMarkedPage(markedState) {
    store.markedPage = Object.assign(
      {
        useVueList: false,
        emptyMessage: '',
        currentPage: 1,
        totalPages: 1,
        selectionMode: false,
        selectionCount: 0,
        messages: [],
      },
      cloneValue(markedState) || {}
    );
  }

  function syncTransferTasks(transferState) {
    store.transferTasks = Object.assign(
      {
        useVuePanels: false,
        currentView: 'downloads',
        selectionMode: false,
        selectionCount: 0,
        downloadsCount: 0,
        uploadsCount: 0,
        downloadSummary: '',
        uploadSummary: '',
        downloadPage: 1,
        downloadTotalPages: 1,
        uploadPage: 1,
        uploadTotalPages: 1,
        downloadTasks: [],
        uploadTasks: [],
      },
      cloneValue(transferState) || {}
    );
  }

  function syncSettingsOps(settingsOpsState) {
    store.settingsOps = Object.assign(
      {
        backupLabel: '备份 WebDAV',
        backupRunning: false,
        restoreLabel: '恢复 WebDAV',
        restoreRunning: false,
      },
      cloneValue(settingsOpsState) || {}
    );
  }

  function syncSettingsWebdav(webdavState) {
    store.settingsWebdav = Object.assign(
      {
        useVueList: false,
        emptyMessage: '',
        endpoints: [],
      },
      cloneValue(webdavState) || {}
    );
  }

  function syncSettingsForm(formState) {
    store.settingsForm = Object.assign(
      {
        senderName: '',
        refreshIntervalSecs: 5,
        downloadDir: '',
        autoStart: false,
        autoUpdateEnabled: false,
        globalHotkeyEnabled: true,
        globalHotkey: 'alt+t',
        localHttpApiEnabled: false,
        localHttpApiBindAddress: '127.0.0.1',
        localHttpApiBindPort: 6011,
        telegramAutoStart: false,
        telegramBotToken: '',
        telegramProxyEnabled: false,
        telegramProxyUrl: 'http://127.0.0.1:7890',
        telegramChatId: '',
        telegramSenderName: '',
        telegramPollIntervalSecs: 10,
      },
      cloneValue(formState) || {}
    );
  }

  function syncSettingsSnapshots(snapshots) {
    store.settingsSnapshots = Array.isArray(snapshots) ? cloneValue(snapshots) : [];
  }

  function syncSettingsSnapshotsLoading(isLoading) {
    store.settingsSnapshotsLoading = !!isLoading;
  }

  function syncSettingsBackupArchives(records) {
    store.settingsBackupArchives = Array.isArray(records) ? cloneValue(records) : [];
  }

  function syncSettingsBackupArchivesLoading(isLoading) {
    store.settingsBackupArchivesLoading = !!isLoading;
  }

  function syncSettingsAutoBackup(autoBackupState) {
    store.settingsAutoBackup = Object.assign(
      {
        enabled: false,
        intervalMinutes: 5,
        retainCount: 1,
        directory: '',
        keepAllDays: 3,
        keepDailyDays: 7,
        hasActiveEndpoint: false,
        lastRunMs: null,
        lastSuccessMs: null,
        lastError: null,
        lastBackupPath: '',
      },
      cloneValue(autoBackupState) || {}
    );
  }

  function syncAppVersion(version) {
    store.appVersion = typeof version === 'string' ? version : '';
  }

  function setActions(nextActions) {
    actions = Object.assign({}, actions, nextActions || {});
  }

  function activateTab(tab) {
    var nextTab = normalizeTab(tab);
    syncActiveTab(nextTab);
    if (typeof window.setActiveTab === 'function') {
      window.setActiveTab(nextTab, {
        scrollToBottom: nextTab === 'home',
        focusInput: nextTab === 'home',
      });
    }
  }

  function buildShellComponent(pageId) {
    return {
      computed: {
        ui: function () {
          return store;
        },
        isActive: function () {
          return store.activeTab === pageId;
        },
        runningModuleCount: function () {
          return (store.integrationModules || []).filter(function (module) {
            return !!module.running;
          }).length;
        },
      },
      methods: {
        formatRuntimeTime: function (timestamp) {
          if (!timestamp) {
            return '';
          }
          var date = new Date(timestamp);
          return date.toLocaleString();
        },
        formatBytes: function (value) {
          var size = Number(value || 0);
          if (!isFinite(size) || size <= 0) {
            return '0 B';
          }
          var units = ['B', 'KB', 'MB', 'GB', 'TB'];
          var unitIndex = Math.min(Math.floor(Math.log(size) / Math.log(1024)), units.length - 1);
          var normalized = size / Math.pow(1024, unitIndex);
          var decimals = unitIndex === 0 || normalized >= 100 ? 0 : (normalized >= 10 ? 1 : 2);
          return normalized.toFixed(decimals) + ' ' + units[unitIndex];
        },
        markedPageState: function () {
          return store.markedPage || {};
        },
        currentMarkedMessages: function () {
          return this.markedPageState().messages || [];
        },
        hasMarkedPagination: function () {
          return Number(this.markedPageState().totalPages || 1) > 1;
        },
        markedPageLabel: function () {
          var state = this.markedPageState();
          return Number(state.currentPage || 1) + ' / ' + Number(state.totalPages || 1);
        },
        markedMessageCardClasses: function (message) {
          return {
            'is-file': !!(message && message.isFile),
            'is-text': !!(message && message.isText),
            'is-pinned': !!(message && message.isPinned),
            'with-selection': !!(message && message.selectionMode),
            'is-selected': !!(message && message.isSelected),
          };
        },
        markedMessageBodyClasses: function (message) {
          return {
            'is-collapsible': !!(message && message.isCollapsible),
            'is-collapsed': !!(message && message.isCollapsible && message.isCollapsed),
          };
        },
        markedMessageBodyStyle: function (message) {
          var collapseHeight = (message && message.collapseHeight) || 130;
          return {
            '--message-collapse-height': String(collapseHeight) + 'px',
          };
        },
        changeMarkedPage: function (nextPage) {
          if (typeof actions.changeMarkedPage === 'function') {
            actions.changeMarkedPage(nextPage);
          }
        },
        toggleMarkedMessageSelection: function (message, checked) {
          if (typeof actions.toggleMarkedMessageSelection === 'function') {
            actions.toggleMarkedMessageSelection(message, checked);
          }
        },
        openMarkMessageModal: function (message) {
          if (typeof actions.openMarkMessageModal === 'function') {
            actions.openMarkMessageModal(message);
          }
        },
        toggleMarkedMessagePin: function (message) {
          if (typeof actions.toggleMarkedMessagePin === 'function') {
            actions.toggleMarkedMessagePin(message);
          }
        },
        toggleMarkedMessageExpanded: function (message) {
          if (typeof actions.toggleMarkedMessageExpanded === 'function') {
            actions.toggleMarkedMessageExpanded(message);
          }
        },
        settingsOpsState: function () {
          return store.settingsOps || {};
        },
        backupWebdavLabel: function () {
          return this.settingsOpsState().backupLabel || '备份 WebDAV';
        },
        restoreWebdavLabel: function () {
          return this.settingsOpsState().restoreLabel || '恢复 WebDAV';
        },
        settingsWebdavState: function () {
          return store.settingsWebdav || {};
        },
        settingsFormState: function () {
          return store.settingsForm || {};
        },
        currentSettingsWebdavEndpoints: function () {
          return this.settingsWebdavState().endpoints || [];
        },
        settingsWebdavCardClasses: function (endpoint) {
          return {
            'is-disabled': !!(endpoint && !endpoint.enabled),
          };
        },
        updateSettingsWebdavField: function (endpoint, field, value) {
          if (typeof actions.updateSettingsWebdavField === 'function') {
            actions.updateSettingsWebdavField(endpoint, field, value);
          }
        },
        toggleSettingsWebdavEnabled: function (endpoint, checked) {
          if (typeof actions.toggleSettingsWebdavEnabled === 'function') {
            actions.toggleSettingsWebdavEnabled(endpoint, checked);
          }
        },
        activateSettingsWebdavEndpoint: function (endpoint, checked) {
          if (typeof actions.activateSettingsWebdavEndpoint === 'function') {
            actions.activateSettingsWebdavEndpoint(endpoint, checked);
          }
        },
        removeSettingsWebdavEndpoint: function (endpoint) {
          if (typeof actions.removeSettingsWebdavEndpoint === 'function') {
            actions.removeSettingsWebdavEndpoint(endpoint);
          }
        },
        testSettingsWebdavEndpoint: function (endpoint) {
          if (typeof actions.testSettingsWebdavEndpoint === 'function') {
            actions.testSettingsWebdavEndpoint(endpoint);
          }
        },
        refreshSettingsBackupArchives: function () {
          if (typeof actions.refreshSettingsBackupArchives === 'function') {
            actions.refreshSettingsBackupArchives();
          }
        },
        restoreSettingsBackupArchive: function (record) {
          if (typeof actions.restoreSettingsBackupArchive === 'function') {
            actions.restoreSettingsBackupArchive(record);
          }
        },
        createLocalDataBackup: function () {
          if (typeof actions.createLocalDataBackup === 'function') {
            actions.createLocalDataBackup();
          }
        },
        updateSettingsFormField: function (field, value) {
          if (typeof actions.updateSettingsFormField === 'function') {
            actions.updateSettingsFormField(field, value);
          }
        },
        updateSettingsAutoBackupField: function (field, value) {
          if (typeof actions.updateSettingsAutoBackupField === 'function') {
            actions.updateSettingsAutoBackupField(field, value);
          }
        },
        settingsAutoBackupState: function () {
          return store.settingsAutoBackup || {};
        },
        autoBackupStateLabel: function () {
          var status = this.settingsAutoBackupState();
          if (!status.enabled) {
            return '已关闭';
          }
          if (!status.hasActiveEndpoint) {
            return '等待可用端点';
          }
          if (status.lastError) {
            return '最近运行失败';
          }
          if (status.lastSuccessMs) {
            return '已启用';
          }
          return '等待首次执行';
        },
        autoBackupLastRunText: function () {
          var status = this.settingsAutoBackupState();
          return status.lastRunMs ? this.formatRuntimeTime(status.lastRunMs) : '暂无';
        },
        autoBackupLastSuccessText: function () {
          var status = this.settingsAutoBackupState();
          return status.lastSuccessMs ? this.formatRuntimeTime(status.lastSuccessMs) : '暂无';
        },
        autoBackupLastErrorText: function () {
          var status = this.settingsAutoBackupState();
          return status.lastError || '无';
        },
        autoBackupLastPathText: function () {
          var status = this.settingsAutoBackupState();
          return status.lastBackupPath || '暂无';
        },
        transferTaskState: function () {
          return store.transferTasks || {};
        },
        currentTransferTaskList: function () {
          var state = this.transferTaskState();
          return state.currentView === 'uploads'
            ? (state.uploadTasks || [])
            : (state.downloadTasks || []);
        },
        currentTransferSummary: function () {
          var state = this.transferTaskState();
          return state.currentView === 'uploads'
            ? (state.uploadSummary || '')
            : (state.downloadSummary || '');
        },
        currentTransferPage: function () {
          var state = this.transferTaskState();
          return state.currentView === 'uploads'
            ? Number(state.uploadPage || 1)
            : Number(state.downloadPage || 1);
        },
        currentTransferTotalPages: function () {
          var state = this.transferTaskState();
          return state.currentView === 'uploads'
            ? Number(state.uploadTotalPages || 1)
            : Number(state.downloadTotalPages || 1);
        },
        hasTransferPagination: function () {
          return this.currentTransferTotalPages() > 1;
        },
        transferTaskPageLabel: function () {
          return this.currentTransferPage() + ' / ' + this.currentTransferTotalPages();
        },
        transferTaskRowClasses: function (task) {
          return {
            'is-active': !!(task && task.isActive),
            'is-complete': !!(task && task.isComplete),
            'is-error': !!(task && task.isError),
            'with-selection': !!(task && task.selectionMode),
            'is-selected': !!(task && task.isSelected),
          };
        },
        transferTaskProgressStyle: function (task) {
          return {
            width: String(task && task.progressPercent != null ? task.progressPercent : 0) + '%',
          };
        },
        transferTaskCanSelect: function (task) {
          return !!(task && task.selectionMode && task.selectable);
        },
        changeTransferTaskPage: function (nextPage) {
          var state = this.transferTaskState();
          if (typeof actions.changeTransferTaskPage === 'function') {
            actions.changeTransferTaskPage(state.currentView || 'downloads', nextPage);
          }
        },
        toggleTransferTaskSelection: function (task, checked) {
          if (typeof actions.toggleTransferTaskSelection === 'function') {
            actions.toggleTransferTaskSelection(task, checked);
          }
        },
        appVersionText: function () {
          return store.appVersion || '加载中...';
        },
        localHttpApiState: function () {
          return store.localHttpApiStatus || null;
        },
        localHttpApiStateLabel: function () {
          var status = this.localHttpApiState();
          if (settingsRuntimeStatus && settingsRuntimeStatus.getLocalHttpApiVisualState) {
            return settingsRuntimeStatus.getLocalHttpApiVisualState(status).stateLabel;
          }
          var state = status && status.state ? status.state : 'disabled';
          if (state === 'running') {
            return '运行中';
          }
          if (state === 'start_failed') {
            return '启动失败';
          }
          return '已关闭';
        },
        localHttpApiAddressText: function () {
          var status = this.localHttpApiState();
          if (settingsRuntimeStatus && settingsRuntimeStatus.getLocalHttpApiVisualState) {
            return settingsRuntimeStatus.getLocalHttpApiVisualState(status).addressText;
          }
          return (status && status.address) || '未配置';
        },
        localHttpApiLastErrorText: function () {
          var status = this.localHttpApiState();
          if (settingsRuntimeStatus && settingsRuntimeStatus.getLocalHttpApiVisualState) {
            return settingsRuntimeStatus.getLocalHttpApiVisualState(status).lastErrorText;
          }
          return (status && (status.lastError || status.last_error)) || '无';
        },
        telegramBridgeState: function () {
          return store.telegramBridgeStatus || null;
        },
        telegramBridgeStateLabel: function () {
          var status = this.telegramBridgeState();
          if (settingsRuntimeStatus && settingsRuntimeStatus.getTelegramBridgeVisualState) {
            return settingsRuntimeStatus.getTelegramBridgeVisualState(
              status,
              this.formatRuntimeTime.bind(this)
            ).stateLabel;
          }
          if (!status) {
            return '未获取';
          }
          if (status.running) {
            return status.last_started_ms
              ? '运行中 · ' + this.formatRuntimeTime(status.last_started_ms)
              : '运行中';
          }
          if (status.last_stopped_ms) {
            return '已停止 · ' + this.formatRuntimeTime(status.last_stopped_ms);
          }
          return '未运行';
        },
        telegramBridgeLastErrorText: function () {
          var status = this.telegramBridgeState();
          if (settingsRuntimeStatus && settingsRuntimeStatus.getTelegramBridgeVisualState) {
            return settingsRuntimeStatus.getTelegramBridgeVisualState(status).lastErrorText;
          }
          return (status && (status.lastError || status.last_error)) || '无';
        },
        moduleKindLabel: function (module) {
          return module && module.kind === 'bridge' ? 'Bridge Module' : 'Sync Module';
        },
        moduleStateLabel: function (module) {
          if (!module) {
            return 'Unknown';
          }
          if (module.running) {
            return 'Running';
          }
          if (module.enabled) {
            return 'Idle';
          }
          return 'Disabled';
        },
        moduleTimelineText: function (module) {
          if (!module) {
            return '暂无运行记录';
          }
          if (module.lastStartedMs) {
            return '最近启动：' + this.formatRuntimeTime(module.lastStartedMs);
          }
          if (module.lastStoppedMs) {
            return '最近停止：' + this.formatRuntimeTime(module.lastStoppedMs);
          }
          return '暂无运行记录';
        },
        refreshSettingsSnapshots: function () {
          if (typeof actions.refreshSettingsSnapshots === 'function') {
            actions.refreshSettingsSnapshots();
          }
        },
        restoreSettingsSnapshot: function (snapshot) {
          if (typeof actions.restoreSettingsSnapshot === 'function') {
            actions.restoreSettingsSnapshot(snapshot);
          }
        },
        openMessagePreview: function (message) {
          if (typeof actions.openMessagePreview === 'function') {
            actions.openMessagePreview(message);
          }
        },
        toggleMessageMarked: function (message) {
          if (typeof actions.toggleMessageMarked === 'function') {
            actions.toggleMessageMarked(message);
          }
        },
        copyText: function (message) {
          if (typeof actions.copyText === 'function') {
            actions.copyText(message);
          }
        },
        downloadTextMessageAsFile: function (message) {
          if (typeof actions.downloadTextMessageAsFile === 'function') {
            actions.downloadTextMessageAsFile(message);
          }
        },
        openMessageFile: function (message) {
          if (typeof actions.openMessageFile === 'function') {
            actions.openMessageFile(message);
          }
        },
        downloadMessageFile: function (message) {
          if (typeof actions.downloadMessageFile === 'function') {
            actions.downloadMessageFile(message);
          }
        },
        saveMessageFileAs: function (message) {
          if (typeof actions.saveMessageFileAs === 'function') {
            actions.saveMessageFileAs(message);
          }
        },
        deleteSingleMessage: function (message) {
          if (typeof actions.deleteSingleMessage === 'function') {
            actions.deleteSingleMessage(message);
          }
        },
        handleMarkedBodyClick: function (message) {
          if (!message || !message.isFile || message.selectionMode) {
            return;
          }
          if (typeof actions.openMessageFile === 'function') {
            actions.openMessageFile(message.message || message);
          }
        },
        handleMarkedCardDoubleClick: function (message) {
          if (!message || message.selectionMode) {
            return;
          }
          if (typeof actions.openMessagePreview === 'function') {
            actions.openMessagePreview(message.message || message);
          }
        },
        saveDownloadHistoryAs: function (task) {
          if (typeof actions.saveDownloadHistoryAs === 'function') {
            actions.saveDownloadHistoryAs(task);
          }
        },
        redownloadDownloadHistory: function (task) {
          if (typeof actions.redownloadDownloadHistory === 'function') {
            actions.redownloadDownloadHistory(task);
          }
        },
        openDownloadHistoryFile: function (task) {
          if (typeof actions.openDownloadHistoryFile === 'function') {
            actions.openDownloadHistoryFile(task);
          }
        },
        openDownloadHistoryDir: function (task) {
          if (typeof actions.openDownloadHistoryDir === 'function') {
            actions.openDownloadHistoryDir(task);
          }
        },
        deleteDownloadHistoryRecord: function (task) {
          if (typeof actions.deleteDownloadHistoryRecord === 'function') {
            actions.deleteDownloadHistoryRecord(task);
          }
        },
      },
    };
  }

  Vue.component('home-page-shell', buildShellComponent('home'));
  Vue.component('marked-page-shell', buildShellComponent('marked'));
  Vue.component('downloads-page-shell', buildShellComponent('downloads'));
  Vue.component('settings-page-shell', buildShellComponent('settings'));

  window.transferGenieVue = {
    isEnabled: true,
    store: store,
    activateTab: activateTab,
    syncActiveTab: syncActiveTab,
    syncSettings: syncSettings,
    syncIntegrationModules: syncIntegrationModules,
    syncTelegramBridgeStatus: syncTelegramBridgeStatus,
    syncLocalHttpApiStatus: syncLocalHttpApiStatus,
    syncHomeFeed: syncHomeFeed,
    syncMarkedPage: syncMarkedPage,
    syncTransferTasks: syncTransferTasks,
    syncSettingsOps: syncSettingsOps,
    syncSettingsWebdav: syncSettingsWebdav,
    syncSettingsForm: syncSettingsForm,
    syncSettingsSnapshots: syncSettingsSnapshots,
    syncSettingsSnapshotsLoading: syncSettingsSnapshotsLoading,
    syncSettingsBackupArchives: syncSettingsBackupArchives,
    syncSettingsBackupArchivesLoading: syncSettingsBackupArchivesLoading,
    syncSettingsAutoBackup: syncSettingsAutoBackup,
    syncAppVersion: syncAppVersion,
    setActions: setActions,
  };

  new Vue({
    el: '#app-shell',
    data: function () {
      return {
        ui: store,
      };
    },
    methods: {
      activateTab: activateTab,
    },
  });
})();
