// Downloads page component logic for Transfer Genie

(function(globalScope) {
  if (!globalScope) {
    return;
  }

  const vueBridge = globalScope.transferGenieVue || null;
  if (!vueBridge || !vueBridge.isEnabled) {
    return;
  }

  const downloadsPageActions = {
    // Transfer task page navigation
    changeTransferTaskPage: function(view, nextPage) {
      if (typeof globalScope.changeTransferTaskPage === 'function') {
        globalScope.changeTransferTaskPage(view, nextPage);
      }
    },

    // Task selection
    toggleTransferTaskSelection: function(task, checked) {
      if (typeof globalScope.toggleSelectedDownloadTask === 'function') {
        globalScope.toggleSelectedDownloadTask(task, checked);
      }
    },

    // Task actions
    saveDownloadHistoryAs: function(task) {
      if (typeof globalScope.saveDownloadHistoryAs === 'function') {
        globalScope.saveDownloadHistoryAs(task);
      }
    },

    redownloadDownloadHistory: function(task) {
      if (typeof globalScope.redownloadDownloadHistory === 'function') {
        globalScope.redownloadDownloadHistory(task);
      }
    },

    openDownloadHistoryFile: function(task) {
      if (typeof globalScope.openDownloadHistoryFile === 'function') {
        globalScope.openDownloadHistoryFile(task);
      }
    },

    openDownloadHistoryDir: function(task) {
      if (typeof globalScope.openDownloadHistoryDir === 'function') {
        globalScope.openDownloadHistoryDir(task);
      }
    },

    deleteDownloadHistoryRecord: function(task) {
      if (typeof globalScope.deleteDownloadHistoryRecord === 'function') {
        globalScope.deleteDownloadHistoryRecord(task);
      }
    },
  };

  const existingActions = vueBridge.actions || {};
  vueBridge.setActions(Object.assign({}, existingActions, downloadsPageActions));

  globalScope.transferGenieDownloadsPage = {
    actions: downloadsPageActions,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = downloadsPageActions;
  }
})(typeof window !== 'undefined' ? window : globalThis);
